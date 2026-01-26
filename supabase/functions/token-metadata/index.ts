import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SOL_MINT = "So11111111111111111111111111111111111111112";

interface TokenMetadataRequest {
  mint: string;
  owner?: string;
}

function base64ToBytes(base64: string): Uint8Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function rpcRequest(rpcUrl: string, method: string, params: unknown[]): Promise<any> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`RPC error ${res.status}: ${text.slice(0, 160)}`);
  }
  const data = await res.json();
  if (data?.error) throw new Error(data.error?.message || "RPC returned an error");
  return data?.result;
}

// SPL Token Mint layout (spl-token)
// offset 44 = decimals (u8)
async function getMintDecimals(rpcUrl: string, mint: string): Promise<number> {
  if (mint === SOL_MINT) return 9;

  const result = await rpcRequest(rpcUrl, "getAccountInfo", [mint, { encoding: "base64" }]);
  const value = result?.value;
  const data = value?.data;
  const base64 = Array.isArray(data) ? data[0] : null;
  if (!base64 || typeof base64 !== "string") {
    throw new Error("Mint account not found or has no data");
  }

  const bytes = base64ToBytes(base64);
  if (bytes.length < 45) throw new Error(`Invalid mint data length: ${bytes.length}`);

  const decimals = bytes[44];
  if (!Number.isFinite(decimals) || decimals > 18) throw new Error(`Invalid decimals: ${decimals}`);
  return decimals;
}

async function getOwnerTokenBalanceUi(
  rpcUrl: string,
  owner: string,
  mint: string
): Promise<{ balanceUi: number; decimals: number } | null> {
  const result = await rpcRequest(rpcUrl, "getTokenAccountsByOwner", [
    owner,
    { mint },
    { encoding: "jsonParsed" },
  ]);

  const accounts = result?.value || [];
  if (!Array.isArray(accounts) || accounts.length === 0) return null;

  let total = 0;
  let decimals: number | null = null;

  for (const account of accounts) {
    const tokenAmount = account?.account?.data?.parsed?.info?.tokenAmount;
    const uiAmount = tokenAmount?.uiAmount;
    const d = tokenAmount?.decimals;
    if (typeof d === "number" && decimals === null) decimals = d;
    if (typeof uiAmount === "number" && Number.isFinite(uiAmount)) total += uiAmount;
  }

  if (!Number.isFinite(total)) total = 0;
  return { balanceUi: total, decimals: decimals ?? 0 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Authorization required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data, error: authError } = await supabase.auth.getClaims(token);
    if (authError || !data?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Invalid authentication" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: TokenMetadataRequest = await req.json().catch(() => ({ mint: "" }));
    if (!body?.mint || typeof body.mint !== "string") {
      return new Response(JSON.stringify({ error: "Missing required field: mint" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rpcUrl = Deno.env.get("SOLANA_RPC_URL") || "https://api.mainnet-beta.solana.com";
    const decimals = await getMintDecimals(rpcUrl, body.mint);

    let balanceUi: number | null = null;
    let ownerDecimals: number | null = null;

    if (body.owner && typeof body.owner === "string") {
      const bal = await getOwnerTokenBalanceUi(rpcUrl, body.owner, body.mint);
      if (bal) {
        balanceUi = bal.balanceUi;
        ownerDecimals = bal.decimals;
      } else {
        balanceUi = 0;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        mint: body.mint,
        decimals,
        owner: body.owner ?? null,
        balanceUi,
        ownerReportedDecimals: ownerDecimals,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[token-metadata] Error:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
