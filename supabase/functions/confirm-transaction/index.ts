import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ConfirmRequest {
  signature: string;
  positionId?: string;
  action: "buy" | "sell";
}

async function confirmTransaction(
  rpcUrl: string,
  signature: string,
  maxRetries: number = 30
): Promise<{ confirmed: boolean; slot?: number; error?: string }> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getSignatureStatuses",
          params: [[signature], { searchTransactionHistory: true }],
        }),
      });

      if (!response.ok) {
        console.error(`[Confirm] RPC error: ${response.status}`);
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }

      const data = await response.json();
      const status = data.result?.value?.[0];

      if (status) {
        if (status.err) {
          console.error(`[Confirm] Transaction failed:`, status.err);
          return { confirmed: false, error: JSON.stringify(status.err) };
        }

        if (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized") {
          console.log(`[Confirm] Transaction confirmed at slot ${status.slot}`);
          return { confirmed: true, slot: status.slot };
        }
      }

      // Wait before next poll
      await new Promise((r) => setTimeout(r, 500));
    } catch (error: any) {
      console.error(`[Confirm] Polling error:`, error);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  return { confirmed: false, error: "Confirmation timeout" };
}

async function getTransactionDetails(rpcUrl: string, signature: string): Promise<any> {
  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTransaction",
        params: [signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }],
      }),
    });

    if (response.ok) {
      const data = await response.json();
      return data.result;
    }
  } catch (error) {
    console.error("[Confirm] Failed to get transaction details:", error);
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: ConfirmRequest = await req.json();
    console.log(`[Confirm] Checking signature: ${body.signature.slice(0, 16)}...`);

    const rpcUrl = Deno.env.get("SOLANA_RPC_URL") || "https://api.mainnet-beta.solana.com";
    console.log(`[Confirm] Using RPC: ${rpcUrl.slice(0, 40)}...`);

    // Confirm the transaction
    const result = await confirmTransaction(rpcUrl, body.signature);

    if (result.confirmed && body.positionId) {
      // Update position status
      if (body.action === "buy") {
        await supabase
          .from("positions")
          .update({
            status: "open",
            updated_at: new Date().toISOString(),
          })
          .eq("id", body.positionId)
          .eq("user_id", user.id);

        console.log(`[Confirm] Position ${body.positionId} marked as open`);
      } else if (body.action === "sell") {
        // Get transaction details to extract actual exit price
        const txDetails = await getTransactionDetails(rpcUrl, body.signature);
        
        await supabase
          .from("positions")
          .update({
            status: "closed",
            exit_tx_id: body.signature,
            closed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", body.positionId)
          .eq("user_id", user.id);

        console.log(`[Confirm] Position ${body.positionId} closed`);
      }
    } else if (!result.confirmed && body.positionId) {
      // Mark position as failed/delete
      await supabase
        .from("positions")
        .delete()
        .eq("id", body.positionId)
        .eq("user_id", user.id)
        .eq("status", "pending");

      console.log(`[Confirm] Removed pending position ${body.positionId}`);
    }

    // Log the transaction
    await supabase.from("system_logs").insert({
      user_id: user.id,
      event_type: "transaction_confirmation",
      event_category: "trading",
      severity: result.confirmed ? "info" : "error",
      message: result.confirmed
        ? `Transaction confirmed: ${body.signature.slice(0, 16)}...`
        : `Transaction failed: ${result.error}`,
      metadata: {
        signature: body.signature,
        positionId: body.positionId,
        action: body.action,
        slot: result.slot,
        error: result.error,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        confirmed: result.confirmed,
        signature: body.signature,
        slot: result.slot,
        error: result.error,
        explorerUrl: `https://solscan.io/tx/${body.signature}`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[Confirm] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
