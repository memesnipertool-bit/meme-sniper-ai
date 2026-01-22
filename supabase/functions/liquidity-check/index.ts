import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SOL_MINT = 'So11111111111111111111111111111111111111112';

interface LiquidityCheckRequest {
  tokenAddress: string;
  minLiquidity?: number;
  poolAddress?: string; // Optional: if known, use for DexScreener enrichment
}

// Token lifecycle stages
type TokenStage = 'BONDING' | 'LP_LIVE' | 'INDEXING' | 'LISTED';

interface LiquidityCheckResponse {
  status: 'TRADABLE' | 'DISCARDED';
  source?: 'pump_fun' | 'jupiter' | 'raydium' | 'orca';
  dexId?: string;
  poolAddress?: string;
  baseMint?: string;
  quoteMint?: string;
  liquidity?: number;
  tokenName?: string;
  tokenSymbol?: string;
  reason?: string;
  // NEW: Structured status
  tokenStatus?: {
    tradable: boolean;
    stage: TokenStage;
    dexScreener: {
      pairFound: boolean;
      retryAt?: number;
    };
  };
}

// DexScreener cache to prevent spam
interface DexScreenerCache {
  [poolAddress: string]: {
    pairFound: boolean;
    timestamp: number;
    retryCount: number;
    retryAt?: number;
  };
}

const dexScreenerCache: DexScreenerCache = {};
const CACHE_TTL = 60000; // 60 seconds
const MAX_RETRIES = 3;
const RETRY_DELAY = 30000; // 30 seconds

/**
 * Server-side liquidity check - bypasses CORS issues
 * 
 * FIXED PIPELINE:
 * 1. Pump.fun bonding curve check → BONDING stage
 * 2. Raydium pool validation (ALL conditions) → LP_LIVE stage
 * 3. Swap simulation verification
 * 4. DexScreener enrichment (ONLY by pool address, ONLY after validation)
 * 
 * NEVER query DexScreener by token mint - only by verified pool address
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tokenAddress, minLiquidity = 5, poolAddress }: LiquidityCheckRequest = await req.json();

    if (!tokenAddress) {
      return new Response(
        JSON.stringify({ error: 'tokenAddress is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[LiquidityCheck] Checking ${tokenAddress.slice(0, 8)}...`);

    // PRIORITY 1: Check Pump.fun bonding curve (still on curve = BONDING stage)
    const pumpResult = await checkPumpFun(tokenAddress);
    if (pumpResult.status === 'TRADABLE') {
      console.log(`[LiquidityCheck] ✅ Found on Pump.fun bonding curve (BONDING)`);
      return new Response(
        JSON.stringify({
          ...pumpResult,
          tokenStatus: {
            tradable: true,
            stage: 'BONDING',
            dexScreener: { pairFound: false },
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // PRIORITY 2: Validate Raydium pool with ALL conditions
    const raydiumResult = await validateRaydiumPool(tokenAddress, minLiquidity);
    
    if (raydiumResult.status !== 'TRADABLE' || !raydiumResult.poolAddress) {
      // No valid Raydium pool - DISCARDED
      console.log(`[LiquidityCheck] ❌ No valid Raydium pool: ${raydiumResult.reason}`);
      return new Response(
        JSON.stringify({
          status: 'DISCARDED',
          reason: raydiumResult.reason || 'No tradeable pool found',
          tokenStatus: {
            tradable: false,
            stage: 'LP_LIVE',
            dexScreener: { pairFound: false },
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // PRIORITY 3: Simulate swap to confirm tradability
    const swapResult = await simulateSwap(tokenAddress);
    
    if (!swapResult.success) {
      console.log(`[LiquidityCheck] ❌ Swap simulation failed: ${swapResult.reason}`);
      return new Response(
        JSON.stringify({
          status: 'DISCARDED',
          reason: swapResult.reason || 'Swap simulation failed',
          tokenStatus: {
            tradable: false,
            stage: 'LP_LIVE',
            dexScreener: { pairFound: false },
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // PRIORITY 4: Token is TRADABLE - now enrich with DexScreener (by pool address ONLY)
    const finalPoolAddress = raydiumResult.poolAddress;
    const dexEnrichment = await enrichWithDexScreener(finalPoolAddress);

    // Determine stage based on DexScreener result
    const stage: TokenStage = dexEnrichment.pairFound ? 'LISTED' : 'INDEXING';

    console.log(`[LiquidityCheck] ✅ Tradable via Raydium (${stage})`);
    
    return new Response(
      JSON.stringify({
        status: 'TRADABLE',
        source: 'raydium',
        dexId: 'raydium',
        poolAddress: finalPoolAddress,
        baseMint: SOL_MINT,
        quoteMint: tokenAddress,
        liquidity: raydiumResult.liquidity,
        tokenStatus: {
          tradable: true,
          stage,
          dexScreener: {
            pairFound: dexEnrichment.pairFound,
            retryAt: dexEnrichment.retryAt,
          },
        },
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
 * Validate Raydium pool with ALL required conditions:
 * 1. Pool exists with SOL pairing
 * 2. Pool status = initialized
 * 3. open_time <= current_block_time
 * 4. Vault balances > 0
 * 5. Minimum liquidity met
 */
async function validateRaydiumPool(
  tokenAddress: string, 
  minLiquidity: number
): Promise<LiquidityCheckResponse & { poolAddress?: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    // Raydium API v3 - search for pools by token mint
    const response = await fetch(
      `https://api-v3.raydium.io/pools/info/mint?mint1=${tokenAddress}&mint2=${SOL_MINT}&poolType=standard&poolSortField=liquidity&sortType=desc&page_size=10`,
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

    // Find best pool that passes ALL conditions
    for (const pool of data.data.data) {
      const mintA = pool.mintA?.address || pool.mintA;
      const mintB = pool.mintB?.address || pool.mintB;
      
      // CONDITION 1: Must have SOL pairing
      const hasSol = mintA === SOL_MINT || mintB === SOL_MINT;
      if (!hasSol) continue;

      // CONDITION 2: Pool status check (if available)
      // Most pools don't expose status directly, so we rely on other checks
      
      // CONDITION 3: Check open_time <= current_block_time
      const openTime = pool.openTime || 0;
      const currentTime = Math.floor(Date.now() / 1000);
      if (openTime > currentTime) {
        console.log(`[Raydium] Pool not yet open: opens at ${openTime}`);
        continue;
      }

      // CONDITION 4: Vault balances > 0
      const vaultBalanceA = pool.mintAmountA || 0;
      const vaultBalanceB = pool.mintAmountB || 0;
      if (vaultBalanceA <= 0 || vaultBalanceB <= 0) {
        console.log(`[Raydium] Empty vaults: A=${vaultBalanceA}, B=${vaultBalanceB}`);
        continue;
      }

      // CONDITION 5: Calculate SOL liquidity
      let liquiditySol = 0;
      if (mintA === SOL_MINT) {
        liquiditySol = vaultBalanceA;
      } else if (mintB === SOL_MINT) {
        liquiditySol = vaultBalanceB;
      }

      if (liquiditySol < minLiquidity) {
        continue;
      }

      const poolAddress = pool.id || pool.poolId || pool.ammId;

      return {
        status: 'TRADABLE',
        source: 'raydium',
        dexId: 'raydium',
        poolAddress,
        baseMint: SOL_MINT,
        quoteMint: tokenAddress,
        liquidity: liquiditySol,
      };
    }

    return { status: 'DISCARDED', reason: 'No suitable Raydium pool (failed validation checks)' };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.log('[LiquidityCheck] Raydium error:', message);
    return { status: 'DISCARDED', reason: `Raydium error: ${message}` };
  }
}

/**
 * Simulate swap via Jupiter to confirm tradability
 */
async function simulateSwap(tokenAddress: string): Promise<{ success: boolean; reason?: string }> {
  try {
    const params = new URLSearchParams({
      inputMint: SOL_MINT,
      outputMint: tokenAddress,
      amount: '1000000', // 0.001 SOL
      slippageBps: '1500',
    });

    const endpoints = [
      `https://quote-api.jup.ag/v6/quote?${params}`,
      `https://lite-api.jup.ag/v6/quote?${params}`,
    ];

    for (const endpoint of endpoints) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const response = await fetch(endpoint, {
          signal: controller.signal,
          headers: { 'Accept': 'application/json' },
        });
        clearTimeout(timeout);

        if (response.ok) {
          const data = await response.json();
          if (data.outAmount && parseInt(data.outAmount) > 0) {
            return { success: true };
          }
        }
      } catch (e) {
        // Try next endpoint
        continue;
      }
    }

    return { success: false, reason: 'No valid swap route found' };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, reason: `Swap error: ${message}` };
  }
}

/**
 * Enrich token with DexScreener data - ONLY by pool address
 * 
 * IMPORTANT:
 * - NEVER query by token mint
 * - Uses caching to prevent spam
 * - "No pairs found" is NOT an error - it's indexing delay
 * - Max 3 retries with 30-60 second delays
 */
async function enrichWithDexScreener(poolAddress: string): Promise<{
  pairFound: boolean;
  priceUsd?: number;
  volume24h?: number;
  liquidity?: number;
  retryAt?: number;
}> {
  const now = Date.now();
  
  // Check cache first
  const cached = dexScreenerCache[poolAddress];
  if (cached) {
    // Return cached if still valid
    if (now - cached.timestamp < CACHE_TTL) {
      return { pairFound: cached.pairFound, retryAt: cached.retryAt };
    }
    
    // Check retry limit for negative results
    if (!cached.pairFound && cached.retryCount >= MAX_RETRIES) {
      return { pairFound: false };
    }
    
    // Check if we should wait before retrying
    if (cached.retryAt && now < cached.retryAt) {
      return { pairFound: false, retryAt: cached.retryAt };
    }
  }

  try {
    // Query by POOL ADDRESS only
    const endpoint = `https://api.dexscreener.com/latest/dex/pairs/solana/${poolAddress}`;
    console.log(`[DexScreener] Enriching pool: ${poolAddress.slice(0, 8)}...`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(endpoint, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'MemeSniper/2.0',
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      // Cache negative result
      dexScreenerCache[poolAddress] = {
        pairFound: false,
        timestamp: now,
        retryCount: (cached?.retryCount || 0) + 1,
        retryAt: now + RETRY_DELAY,
      };
      return { pairFound: false, retryAt: now + RETRY_DELAY };
    }

    const data = await response.json();

    // Check if pair exists
    if (!data.pair && (!data.pairs || data.pairs.length === 0)) {
      // "No pairs found" = INDEXING, not error
      console.log(`[DexScreener] INDEXING: Pool ${poolAddress.slice(0, 8)} not yet indexed`);
      
      dexScreenerCache[poolAddress] = {
        pairFound: false,
        timestamp: now,
        retryCount: (cached?.retryCount || 0) + 1,
        retryAt: now + RETRY_DELAY,
      };
      
      return { pairFound: false, retryAt: now + RETRY_DELAY };
    }

    // Extract pair data
    const pair = data.pair || data.pairs?.[0];
    
    // Cache positive result
    dexScreenerCache[poolAddress] = {
      pairFound: true,
      timestamp: now,
      retryCount: 0,
    };

    console.log(`[DexScreener] LISTED: Pool ${poolAddress.slice(0, 8)} found`);

    return {
      pairFound: true,
      priceUsd: parseFloat(pair.priceUsd || 0),
      volume24h: parseFloat(pair.volume?.h24 || 0),
      liquidity: parseFloat(pair.liquidity?.usd || 0),
    };

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.log(`[DexScreener] Error enriching ${poolAddress.slice(0, 8)}:`, message);

    // Cache error result
    dexScreenerCache[poolAddress] = {
      pairFound: false,
      timestamp: now,
      retryCount: (cached?.retryCount || 0) + 1,
      retryAt: now + RETRY_DELAY,
    };

    return { pairFound: false, retryAt: now + RETRY_DELAY };
  }
}
