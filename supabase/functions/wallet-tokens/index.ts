import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SOL_MINT = "So11111111111111111111111111111111111111112";
const JUPITER_PRICE_API = "https://lite-api.jup.ag/price/v2";

interface WalletToken {
  mint: string;
  symbol: string | null;
  name: string | null;
  balance: number;
  decimals: number;
  priceUsd: number | null;
  valueUsd: number | null;
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

async function getTokenMetadata(mint: string): Promise<{ symbol: string | null; name: string | null }> {
  try {
    // Try Jupiter token list first
    const response = await fetch(`https://lite-api.jup.ag/tokens/v1/${mint}`, {
      signal: AbortSignal.timeout(5000),
    });
    
    if (response.ok) {
      const data = await response.json();
      return {
        symbol: data.symbol || null,
        name: data.name || null,
      };
    }
  } catch {
    // Ignore errors, return nulls
  }
  
  return { symbol: null, name: null };
}

async function getTokenPrices(mints: string[]): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  
  if (mints.length === 0) return prices;
  
  try {
    const mintList = mints.join(",");
    const response = await fetch(`${JUPITER_PRICE_API}?ids=${mintList}`, {
      signal: AbortSignal.timeout(10000),
    });
    
    if (response.ok) {
      const data = await response.json();
      for (const [mint, priceData] of Object.entries(data.data || {})) {
        const price = (priceData as any)?.price;
        if (typeof price === "number" && price > 0) {
          prices.set(mint, price);
        }
      }
    }
  } catch (e) {
    console.error("[wallet-tokens] Price fetch error:", e);
  }
  
  return prices;
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

    const body = await req.json().catch(() => ({}));
    const owner = body?.owner;
    const minValueUsd = body?.minValueUsd ?? 0.01; // Default: exclude dust tokens < $0.01
    
    if (!owner || typeof owner !== "string") {
      return new Response(JSON.stringify({ error: "Missing required field: owner" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rpcUrl = Deno.env.get("SOLANA_RPC_URL") || "https://api.mainnet-beta.solana.com";

    // Fetch all SPL token accounts for the owner
    const result = await rpcRequest(rpcUrl, "getTokenAccountsByOwner", [
      owner,
      { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
      { encoding: "jsonParsed" },
    ]);

    const accounts = result?.value || [];
    if (!Array.isArray(accounts)) {
      return new Response(
        JSON.stringify({ success: true, tokens: [], count: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse token accounts
    const rawTokens: { mint: string; balance: number; decimals: number }[] = [];
    
    for (const account of accounts) {
      const info = account?.account?.data?.parsed?.info;
      const tokenAmount = info?.tokenAmount;
      const mint = info?.mint;
      
      if (!mint || mint === SOL_MINT) continue;
      
      const uiAmount = tokenAmount?.uiAmount;
      const decimals = tokenAmount?.decimals ?? 0;
      
      if (typeof uiAmount === "number" && uiAmount > 0) {
        rawTokens.push({ mint, balance: uiAmount, decimals });
      }
    }

    if (rawTokens.length === 0) {
      return new Response(
        JSON.stringify({ success: true, tokens: [], count: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch prices for all tokens
    const mints = rawTokens.map(t => t.mint);
    const prices = await getTokenPrices(mints);

    // Build token list with metadata and prices
    const tokens: WalletToken[] = [];
    
    for (const t of rawTokens) {
      const priceUsd = prices.get(t.mint) ?? null;
      const valueUsd = priceUsd !== null ? priceUsd * t.balance : null;
      
      // Skip dust tokens
      if (valueUsd !== null && valueUsd < minValueUsd) continue;
      
      // Get metadata (symbol, name) - do in parallel for efficiency but limit concurrency
      const metadata = await getTokenMetadata(t.mint);
      
      tokens.push({
        mint: t.mint,
        symbol: metadata.symbol,
        name: metadata.name,
        balance: t.balance,
        decimals: t.decimals,
        priceUsd,
        valueUsd,
      });
    }

    // Sort by value descending (nulls last)
    tokens.sort((a, b) => {
      if (a.valueUsd === null && b.valueUsd === null) return 0;
      if (a.valueUsd === null) return 1;
      if (b.valueUsd === null) return -1;
      return b.valueUsd - a.valueUsd;
    });

    return new Response(
      JSON.stringify({
        success: true,
        owner,
        tokens,
        count: tokens.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[wallet-tokens] Error:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
