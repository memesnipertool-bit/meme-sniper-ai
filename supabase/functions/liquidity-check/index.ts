import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SOL_MINT = 'So11111111111111111111111111111111111111112';

interface LiquidityCheckRequest {
  tokenAddress: string;
  minLiquidity?: number;
}

interface LiquidityCheckResponse {
  status: 'TRADABLE' | 'DISCARDED';
  source?: 'pump_fun' | 'jupiter' | 'raydium';
  poolAddress?: string;
  baseMint?: string;
  quoteMint?: string;
  liquidity?: number;
  tokenName?: string;
  tokenSymbol?: string;
  reason?: string;
}

/**
 * Server-side liquidity check - bypasses CORS issues
 * Checks: Pump.fun → Jupiter → Raydium (in priority order)
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tokenAddress, minLiquidity = 5 }: LiquidityCheckRequest = await req.json();

    if (!tokenAddress) {
      return new Response(
        JSON.stringify({ error: 'tokenAddress is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[LiquidityCheck] Checking ${tokenAddress.slice(0, 8)}...`);

    // PRIORITY 1: Check Pump.fun bonding curve
    const pumpResult = await checkPumpFun(tokenAddress);
    if (pumpResult.status === 'TRADABLE') {
      console.log(`[LiquidityCheck] ✅ Found on Pump.fun`);
      return new Response(
        JSON.stringify(pumpResult),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // PRIORITY 2: Check Jupiter routes
    const jupiterResult = await checkJupiter(tokenAddress, minLiquidity);
    if (jupiterResult.status === 'TRADABLE') {
      console.log(`[LiquidityCheck] ✅ Found Jupiter route`);
      return new Response(
        JSON.stringify(jupiterResult),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // PRIORITY 3: Check Raydium directly
    const raydiumResult = await checkRaydium(tokenAddress, minLiquidity);
    if (raydiumResult.status === 'TRADABLE') {
      console.log(`[LiquidityCheck] ✅ Found Raydium pool`);
      return new Response(
        JSON.stringify(raydiumResult),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // No tradeable pool found
    console.log(`[LiquidityCheck] ❌ No tradeable pool found`);
    return new Response(
      JSON.stringify({
        status: 'DISCARDED',
        reason: jupiterResult.reason || raydiumResult.reason || 'No tradeable route found',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal error';
    console.error('[LiquidityCheck] Error:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Check if token is on Pump.fun bonding curve
 */
async function checkPumpFun(tokenAddress: string): Promise<LiquidityCheckResponse> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(
      `https://frontend-api.pump.fun/coins/${tokenAddress}`,
      {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'MemeSniper/2.0',
        },
      }
    );
    clearTimeout(timeout);

    if (!response.ok) {
      return { status: 'DISCARDED', reason: `Pump.fun: ${response.status}` };
    }

    const data = await response.json();

    if (data && data.mint === tokenAddress) {
      if (data.complete === false) {
        // Still on bonding curve - tradeable via Pump.fun
        const virtualSolReserves = data.virtual_sol_reserves || 0;
        const liquidityInSol = virtualSolReserves / 1e9;

        return {
          status: 'TRADABLE',
          source: 'pump_fun',
          poolAddress: 'pumpfun_bonding_curve',
          baseMint: SOL_MINT,
          quoteMint: tokenAddress,
          liquidity: liquidityInSol > 0 ? liquidityInSol : 30,
          tokenName: data.name,
          tokenSymbol: data.symbol,
        };
      }
    }

    return { status: 'DISCARDED', reason: 'Not on Pump.fun bonding curve' };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.log('[LiquidityCheck] Pump.fun error:', message);
    return { status: 'DISCARDED', reason: `Pump.fun error: ${message}` };
  }
}

/**
 * Check Jupiter for available routes
 *
 * NOTE: In some edge regions, DNS resolution can fail for specific hostnames.
 * We therefore try multiple Jupiter endpoints before declaring Jupiter unavailable.
 */
async function checkJupiter(tokenAddress: string, minLiquidity: number): Promise<LiquidityCheckResponse> {
  const amountLamports = 100000000; // 0.1 SOL

  const endpoints = [
    {
      // Free, keyless endpoint
      name: 'lite.swap.v1',
      url:
        `https://lite-api.jup.ag/swap/v1/quote?` +
        `inputMint=${SOL_MINT}&` +
        `outputMint=${tokenAddress}&` +
        `amount=${amountLamports}&` +
        `slippageBps=1500`,
    },
  ] as const;

  let lastReason: string | undefined;

  for (const ep of endpoints) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(ep.url, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        lastReason = `Jupiter(${ep.name}): ${response.status}`;
        continue;
      }

      const data = await response.json();

      if (data?.error || !data?.outAmount || parseInt(data.outAmount) <= 0) {
        lastReason = `Jupiter(${ep.name}): ${data?.error || 'No route'}`;
        continue;
      }

      // Estimate liquidity from route info
      const routeInfo = data.routePlan?.[0];
      const ammKey = routeInfo?.swapInfo?.ammKey;

      // Check if route goes through known DEXes
      const labels = (data.routePlan || [])
        .map((r: any) => r?.swapInfo?.label || '')
        .filter(Boolean);
      const hasRaydium = labels.some((l: string) => l.toLowerCase().includes('raydium'));
      const hasPumpFun = labels.some((l: string) => l.toLowerCase().includes('pump'));

      // Rough liquidity estimate based on price impact
      const priceImpact = parseFloat(data.priceImpactPct || '0');
      let estimatedLiquidity = 50; // Default estimate
      if (priceImpact > 10) estimatedLiquidity = 5;
      else if (priceImpact > 5) estimatedLiquidity = 15;
      else if (priceImpact > 2) estimatedLiquidity = 30;

      // (Optional) enforce minLiquidity using our rough estimate
      if (estimatedLiquidity < minLiquidity) {
        return {
          status: 'DISCARDED',
          reason: `Insufficient liquidity via Jupiter: ~${estimatedLiquidity} SOL`,
        };
      }

      return {
        status: 'TRADABLE',
        source: hasPumpFun ? 'pump_fun' : hasRaydium ? 'raydium' : 'jupiter',
        poolAddress: ammKey || 'jupiter_route',
        baseMint: SOL_MINT,
        quoteMint: tokenAddress,
        liquidity: estimatedLiquidity,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      lastReason = `Jupiter(${ep.name}) error: ${message}`;
      // try next endpoint
    }
  }

  console.log('[LiquidityCheck] Jupiter error:', lastReason || 'Jupiter unavailable');
  return { status: 'DISCARDED', reason: lastReason || 'Jupiter unavailable' };
}


/**
 * Check Raydium pools directly
 */
async function checkRaydium(tokenAddress: string, minLiquidity: number): Promise<LiquidityCheckResponse> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    // Fixed: Use page_size instead of pageSize (Raydium API v3 parameter name)
    const response = await fetch(
      `https://api-v3.raydium.io/pools/info/mint?mint1=${tokenAddress}&poolType=standard&poolSortField=liquidity&sortType=desc&page_size=10`,
      {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'MemeSniper/2.0',
        },
      }
    );
    clearTimeout(timeout);

    if (!response.ok) {
      return { status: 'DISCARDED', reason: `Raydium: ${response.status}` };
    }

    const data = await response.json();

    if (!data.success || !data.data?.data || data.data.data.length === 0) {
      return { status: 'DISCARDED', reason: 'No Raydium pools found' };
    }

    // Find best pool with SOL base
    for (const pool of data.data.data) {
      const mintA = pool.mintA?.address || pool.mintA;
      const mintB = pool.mintB?.address || pool.mintB;
      
      // Check if one side is SOL
      const hasSol = mintA === SOL_MINT || mintB === SOL_MINT;
      if (!hasSol) continue;

      const liquiditySol = pool.tvl ? pool.tvl / 150 : // Rough USD to SOL conversion
                          (mintA === SOL_MINT ? pool.mintAmountA : pool.mintAmountB) || 0;

      if (liquiditySol >= minLiquidity) {
        return {
          status: 'TRADABLE',
          source: 'raydium',
          poolAddress: pool.id || pool.poolId,
          baseMint: SOL_MINT,
          quoteMint: tokenAddress,
          liquidity: liquiditySol,
        };
      }
    }

    return { status: 'DISCARDED', reason: 'No suitable Raydium pool' };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.log('[LiquidityCheck] Raydium error:', message);
    return { status: 'DISCARDED', reason: `Raydium error: ${message}` };
  }
}
