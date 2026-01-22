import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SOL_MINT = 'So11111111111111111111111111111111111111112';

interface LiquidityCheckRequest {
  tokenAddress: string;
  minLiquidity?: number;
  poolAddress?: string;
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
  tokenStatus?: {
    tradable: boolean;
    stage: TokenStage;
    dexScreener: {
      pairFound: boolean;
      retryAt?: number;
    };
  };
}

// DexScreener cache - PERMANENT
interface DexScreenerCache {
  [poolAddress: string]: {
    pairFound: boolean;
    timestamp: number;
    queryCount: number;
    lastQueryAt: number;
  };
}

const dexScreenerCache: DexScreenerCache = {};

const DEXSCREENER_MIN_COOLDOWN = 60000;
const DEXSCREENER_MAX_COOLDOWN = 120000;
const DEXSCREENER_MAX_QUERIES_PER_POOL = 1;

/**
 * Server-side liquidity check - RPC-BASED VALIDATION
 * 
 * ZERO Raydium HTTP API dependencies
 * 
 * PIPELINE:
 * 1. Pump.fun bonding curve check → BONDING stage
 * 2. Jupiter swap simulation (authoritative tradability) → LP_LIVE/INDEXING
 * 3. DexScreener enrichment (ONLY by pool address, ONLY after validation)
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

    // PRIORITY 2: Jupiter swap simulation (AUTHORITATIVE for tradability)
    // This confirms token is indexed and has a route - NO Raydium HTTP
    const jupiterResult = await checkJupiterTradability(tokenAddress, minLiquidity);
    
    if (jupiterResult.status !== 'TRADABLE') {
      console.log(`[LiquidityCheck] ❌ Not tradeable: ${jupiterResult.reason}`);
      return new Response(
        JSON.stringify({
          status: 'DISCARDED',
          reason: jupiterResult.reason || 'No tradeable route found',
          tokenStatus: {
            tradable: false,
            stage: 'LP_LIVE',
            dexScreener: { pairFound: false },
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Token is TRADABLE via Jupiter
    // Enrich with DexScreener if we have a pool address
    const finalPoolAddress = jupiterResult.poolAddress || poolAddress || 'jupiter_route';
    const dexEnrichment = finalPoolAddress && finalPoolAddress !== 'jupiter_route' 
      ? await enrichWithDexScreener(finalPoolAddress)
      : { pairFound: false };

    // Determine stage
    const stage: TokenStage = dexEnrichment.pairFound ? 'LISTED' : 'INDEXING';

    console.log(`[LiquidityCheck] ✅ Tradable via Jupiter (${stage})`);
    
    return new Response(
      JSON.stringify({
        status: 'TRADABLE',
        source: jupiterResult.source || 'jupiter',
        dexId: jupiterResult.dexId || 'jupiter',
        poolAddress: finalPoolAddress,
        baseMint: SOL_MINT,
        quoteMint: tokenAddress,
        liquidity: jupiterResult.liquidity,
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
    console.log('[LiquidityCheck] Pump.fun check error:', message);
    return { status: 'DISCARDED', reason: 'Pump.fun unavailable' };
  }
}

/**
 * Check tradability via Jupiter - AUTHORITATIVE SOURCE
 * 
 * Jupiter indexes tokens within seconds of LP creation
 * If Jupiter has a route → token is tradeable
 * NO Raydium HTTP API calls
 */
async function checkJupiterTradability(
  tokenAddress: string, 
  minLiquidity: number
): Promise<LiquidityCheckResponse & { poolAddress?: string }> {
  try {
    // Try multiple quote amounts for reliability
    const quoteAmounts = [
      100000000, // 0.1 SOL
      10000000,  // 0.01 SOL
      1000000,   // 0.001 SOL
    ];

    for (const amount of quoteAmounts) {
      const params = new URLSearchParams({
        inputMint: SOL_MINT,
        outputMint: tokenAddress,
        amount: amount.toString(),
        slippageBps: '1500',
      });

      // Try main Jupiter endpoint
      const endpoints = [
        `https://quote-api.jup.ag/v6/quote?${params}`,
        `https://lite-api.jup.ag/swap/v1/quote?${params}`,
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

          if (!response.ok) {
            // 400/404 = token not indexed (expected for new tokens)
            if (response.status === 400 || response.status === 404) {
              continue;
            }
            continue;
          }

          const data = await response.json();

          if (data.error) {
            continue;
          }

          // Valid quote - token is tradeable
          if (data.outAmount && parseInt(data.outAmount) > 0) {
            // Extract route info for DEX identification
            const routePlan = data.routePlan || [];
            const firstRoute = routePlan[0]?.swapInfo || {};
            const ammKey = firstRoute.ammKey || '';
            const label = firstRoute.label || '';

            // Estimate liquidity from quote
            const inputSol = amount / 1e9;
            const priceImpact = parseFloat(data.priceImpactPct || '0');
            
            // Rough liquidity estimate: if 0.1 SOL has <5% impact, liquidity ~2 SOL
            // Better estimate: liquidity = inputAmount / priceImpact * 100
            let estimatedLiquidity = 10;
            if (priceImpact > 0 && priceImpact < 100) {
              estimatedLiquidity = Math.max(inputSol / (priceImpact / 100), 5);
            }

            // Identify source DEX
            let source: 'jupiter' | 'raydium' | 'orca' = 'jupiter';
            let dexId = 'jupiter';
            
            if (label.toLowerCase().includes('raydium')) {
              source = 'raydium';
              dexId = 'raydium';
            } else if (label.toLowerCase().includes('orca')) {
              source = 'orca';
              dexId = 'orca';
            }

            return {
              status: 'TRADABLE',
              source,
              dexId,
              poolAddress: ammKey || 'jupiter_route',
              baseMint: SOL_MINT,
              quoteMint: tokenAddress,
              liquidity: estimatedLiquidity,
            };
          }
        } catch (e) {
          // Try next endpoint
          continue;
        }
      }
    }

    return { status: 'DISCARDED', reason: 'No route available' };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.log('[LiquidityCheck] Jupiter check error:', message);
    return { status: 'DISCARDED', reason: 'Route check unavailable' };
  }
}

/**
 * Enrich token with DexScreener data - NON-BLOCKING
 */
async function enrichWithDexScreener(poolAddress: string): Promise<{
  pairFound: boolean;
  priceUsd?: number;
  volume24h?: number;
  liquidity?: number;
  retryAt?: number;
}> {
  const now = Date.now();
  
  const cached = dexScreenerCache[poolAddress];
  
  if (cached) {
    if (cached.queryCount >= DEXSCREENER_MAX_QUERIES_PER_POOL) {
      return { pairFound: cached.pairFound };
    }
    
    const timeSinceLastQuery = now - cached.lastQueryAt;
    if (timeSinceLastQuery < DEXSCREENER_MIN_COOLDOWN) {
      return { pairFound: cached.pairFound };
    }
  }

  try {
    const endpoint = `https://api.dexscreener.com/latest/dex/pairs/solana/${poolAddress}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(endpoint, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'MemeSniper/2.0',
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      dexScreenerCache[poolAddress] = {
        pairFound: false,
        timestamp: now,
        queryCount: (cached?.queryCount || 0) + 1,
        lastQueryAt: now,
      };
      return { pairFound: false, retryAt: now + DEXSCREENER_MAX_COOLDOWN };
    }

    const data = await response.json();

    if (!data.pair && (!data.pairs || data.pairs.length === 0)) {
      dexScreenerCache[poolAddress] = {
        pairFound: false,
        timestamp: now,
        queryCount: (cached?.queryCount || 0) + 1,
        lastQueryAt: now,
      };
      return { pairFound: false, retryAt: now + DEXSCREENER_MAX_COOLDOWN };
    }

    const pair = data.pair || data.pairs?.[0];
    
    dexScreenerCache[poolAddress] = {
      pairFound: true,
      timestamp: now,
      queryCount: (cached?.queryCount || 0) + 1,
      lastQueryAt: now,
    };

    return {
      pairFound: true,
      priceUsd: parseFloat(pair.priceUsd || 0),
      volume24h: parseFloat(pair.volume?.h24 || 0),
      liquidity: parseFloat(pair.liquidity?.usd || 0),
    };

  } catch (error: unknown) {
    dexScreenerCache[poolAddress] = {
      pairFound: false,
      timestamp: now,
      queryCount: (cached?.queryCount || 0) + 1,
      lastQueryAt: now,
    };

    return { pairFound: false, retryAt: now + DEXSCREENER_MAX_COOLDOWN };
  }
}
