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
  source?: 'pump_fun' | 'jupiter' | 'raydium' | 'orca' | 'dexscreener';
  dexId?: string; // raydium, orca, etc.
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
 * NEW PRIORITY: Pump.fun → DexScreener (finds Raydium/Orca pools) → Raydium API fallback
 * 
 * DexScreener tells us EXACTLY which DEX has liquidity, so we can route directly.
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

    // PRIORITY 1: Check Pump.fun bonding curve (still on curve = trade via Pump.fun)
    const pumpResult = await checkPumpFun(tokenAddress);
    if (pumpResult.status === 'TRADABLE') {
      console.log(`[LiquidityCheck] ✅ Found on Pump.fun bonding curve`);
      return new Response(
        JSON.stringify(pumpResult),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // PRIORITY 2: Use DexScreener to find exact DEX and pool
    const dexResult = await checkDexScreener(tokenAddress, minLiquidity);
    if (dexResult.status === 'TRADABLE') {
      console.log(`[LiquidityCheck] ✅ Found via DexScreener: ${dexResult.dexId} pool`);
      return new Response(
        JSON.stringify(dexResult),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // PRIORITY 3: Direct Raydium API check (fallback)
    const raydiumResult = await checkRaydium(tokenAddress, minLiquidity);
    if (raydiumResult.status === 'TRADABLE') {
      console.log(`[LiquidityCheck] ✅ Found Raydium pool (direct API)`);
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
        reason: dexResult.reason || raydiumResult.reason || 'No tradeable pool found',
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
          dexId: 'pumpfun',
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
 * Use DexScreener to find exactly which DEX has the liquidity pool
 * This tells us the exact dexId (raydium, orca, meteora, etc.) and pool address
 */
async function checkDexScreener(tokenAddress: string, minLiquidity: number): Promise<LiquidityCheckResponse> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    // DexScreener API - search for token on Solana
    const response = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
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
      return { status: 'DISCARDED', reason: `DexScreener: HTTP ${response.status}` };
    }

    const data = await response.json();

    if (!data.pairs || data.pairs.length === 0) {
      return { status: 'DISCARDED', reason: 'No pairs found on DexScreener' };
    }

    // Filter for Solana pairs only and sort by liquidity
    const solanaPairs = data.pairs
      .filter((p: any) => p.chainId === 'solana')
      .sort((a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));

    if (solanaPairs.length === 0) {
      return { status: 'DISCARDED', reason: 'No Solana pairs on DexScreener' };
    }

    // Find best pair with SOL as quote/base and sufficient liquidity
    for (const pair of solanaPairs) {
      const dexId = pair.dexId?.toLowerCase() || '';
      const pairAddress = pair.pairAddress;
      const liquidityUsd = pair.liquidity?.usd || 0;
      
      // Rough conversion: $150 per SOL
      const liquiditySol = liquidityUsd / 150;

      // Check if this is a SOL pair
      const baseTokenAddress = pair.baseToken?.address;
      const quoteTokenAddress = pair.quoteToken?.address;
      const hasSol = baseTokenAddress === SOL_MINT || quoteTokenAddress === SOL_MINT ||
                     pair.quoteToken?.symbol === 'SOL' || pair.baseToken?.symbol === 'SOL';

      if (!hasSol) continue;

      // Check minimum liquidity (in SOL equivalent)
      if (liquiditySol < minLiquidity) {
        continue;
      }

      // Determine source based on DEX ID
      let source: LiquidityCheckResponse['source'] = 'dexscreener';
      if (dexId.includes('raydium')) {
        source = 'raydium';
      } else if (dexId.includes('orca')) {
        source = 'orca';
      }

      console.log(`[LiquidityCheck] DexScreener found: ${dexId} pool ${pairAddress?.slice(0, 8)} with $${liquidityUsd.toFixed(0)} liquidity`);

      return {
        status: 'TRADABLE',
        source,
        dexId,
        poolAddress: pairAddress,
        baseMint: SOL_MINT,
        quoteMint: tokenAddress,
        liquidity: liquiditySol,
        tokenName: pair.baseToken?.name || pair.quoteToken?.name,
        tokenSymbol: pair.baseToken?.symbol || pair.quoteToken?.symbol,
      };
    }

    // Found pairs but none met criteria
    const bestPair = solanaPairs[0];
    const bestLiquidity = (bestPair.liquidity?.usd || 0) / 150;
    return { 
      status: 'DISCARDED', 
      reason: `Best pool has ${bestLiquidity.toFixed(1)} SOL liquidity (need ${minLiquidity}+)` 
    };

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.log('[LiquidityCheck] DexScreener error:', message);
    return { status: 'DISCARDED', reason: `DexScreener error: ${message}` };
  }
}

/**
 * Direct Raydium API check (fallback if DexScreener doesn't have the pool yet)
 */
async function checkRaydium(tokenAddress: string, minLiquidity: number): Promise<LiquidityCheckResponse> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    // Raydium API v3 - search for pools by token mint
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
      return { status: 'DISCARDED', reason: `Raydium API: HTTP ${response.status}` };
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
          dexId: 'raydium',
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
