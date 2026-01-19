/**
 * Stage 1: Liquidity Detection
 * Monitors for new pool creation and validates token safety
 */

import { supabase } from '@/integrations/supabase/client';
import type {
  TradingConfig,
  LiquidityInfo,
  LiquidityDetectionResult,
  RiskAssessment,
  TradingEventCallback,
} from './types';
import { API_ENDPOINTS, SOL_MINT } from './config';

// Endpoints with fallbacks for reliability
const DEXSCREENER_ENDPOINTS = [
  'https://api.dexscreener.com/latest/dex/tokens',
  'https://api.dexscreener.com/latest/dex/pairs/solana', // Fallback using pair lookup
];

const PUMPFUN_ENDPOINTS = [
  'https://frontend-api.pump.fun/coins',
  'https://client-api-2-74b1891ee9f9.herokuapp.com/coins', // Fallback
];

const RAYDIUM_ENDPOINTS = [
  'https://api-v3.raydium.io/pools/info/mint',
  'https://api-v3.raydium.io/main/pairs', // Fallback
];

/**
 * Fetch with retry and fallback support
 */
async function fetchWithFallback(
  endpoints: string[],
  buildPath: (endpoint: string) => string,
  timeoutMs: number = 8000
): Promise<Response | null> {
  for (const endpoint of endpoints) {
    try {
      const url = buildPath(endpoint);
      const response = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'MemeSniper/1.0',
        },
      });
      
      if (response.ok) {
        return response;
      }
      
      // 5xx errors - try next endpoint
      if (response.status >= 500) {
        console.log(`[LiquidityDetector] ${endpoint} returned ${response.status}, trying fallback...`);
        continue;
      }
      
      // 4xx errors might be valid "not found" - return null
      if (response.status === 404) {
        return null;
      }
    } catch (e: any) {
      const isDnsError = e?.message?.includes('dns') || e?.message?.includes('ENOTFOUND');
      console.log(`[LiquidityDetector] Fetch error from ${endpoint}: ${isDnsError ? 'DNS error' : e?.message}`);
      continue;
    }
  }
  return null;
}

/**
 * Detect liquidity for a token address
 * Checks DexScreener FIRST (most reliable), then Pump.fun, then Raydium
 */
export async function detectLiquidity(
  tokenAddress: string,
  config: TradingConfig,
  onEvent?: TradingEventCallback
): Promise<LiquidityDetectionResult> {
  const startTime = Date.now();
  
  try {
    // Run ALL checks in PARALLEL for speed - DexScreener is most reliable
    const [dexScreenerResult, pumpFunResult, raydiumResult] = await Promise.allSettled([
      checkDexScreenerLiquidity(tokenAddress),
      checkPumpFunLiquidity(tokenAddress),
      checkRaydiumLiquidity(tokenAddress),
    ]);

    // Extract results, preferring higher liquidity sources
    const dexLiquidity = dexScreenerResult.status === 'fulfilled' ? dexScreenerResult.value : null;
    const pumpLiquidity = pumpFunResult.status === 'fulfilled' ? pumpFunResult.value : null;
    const raydiumLiquidity = raydiumResult.status === 'fulfilled' ? raydiumResult.value : null;

    // Choose the best liquidity source (highest liquidity amount)
    const liquiditySources = [dexLiquidity, pumpLiquidity, raydiumLiquidity].filter(Boolean) as LiquidityInfo[];
    
    if (liquiditySources.length === 0) {
      // No liquidity found from any source
      return {
        status: 'LP_NOT_FOUND',
        liquidityInfo: null,
        riskAssessment: null,
        error: 'No liquidity pool found on Pump.fun, Raydium, or DexScreener',
        detectedAt: startTime,
      };
    }

    // Pick the source with highest liquidity
    const bestSource = liquiditySources.reduce((best, current) => 
      current.liquidityAmount > best.liquidityAmount ? current : best
    );

    onEvent?.({ type: 'LIQUIDITY_DETECTED', data: bestSource });
    
    // Validate liquidity amount - use lower threshold for Pump.fun tokens
    const effectiveMinLiquidity = bestSource.poolType === 'pump_fun' 
      ? Math.min(config.minLiquidity, 0.5) // Very low minimum for Pump.fun
      : config.minLiquidity;
    
    if (bestSource.liquidityAmount < effectiveMinLiquidity) {
      return {
        status: 'LP_INSUFFICIENT',
        liquidityInfo: bestSource,
        riskAssessment: null,
        error: `Liquidity ${bestSource.liquidityAmount.toFixed(2)} SOL below minimum ${effectiveMinLiquidity} SOL`,
        detectedAt: startTime,
      };
    }
    
    // Run risk assessment (but don't block on it for Pump.fun tokens)
    const riskAssessment = await assessRisk(tokenAddress, config);
    
    // For Pump.fun bonding curve tokens, be more lenient on risk
    const isPumpFunBonding = bestSource.poolType === 'pump_fun';
    
    if (!riskAssessment.passed && !isPumpFunBonding) {
      onEvent?.({ type: 'RISK_CHECK_FAILED', data: riskAssessment });
      return {
        status: 'RISK_FAILED',
        liquidityInfo: bestSource,
        riskAssessment,
        error: `Risk check failed: ${riskAssessment.reasons.join(', ')}`,
        detectedAt: startTime,
      };
    }
    
    onEvent?.({ type: 'RISK_CHECK_PASSED', data: riskAssessment });
    
    return {
      status: 'LP_READY',
      liquidityInfo: bestSource,
      riskAssessment,
      detectedAt: startTime,
    };
    
  } catch (error) {
    console.error('[LiquidityDetector] Unexpected error:', error);
    return {
      status: 'ERROR',
      liquidityInfo: null,
      riskAssessment: null,
      error: error instanceof Error ? error.message : 'Unknown error during liquidity detection',
      detectedAt: startTime,
    };
  }
}

/**
 * Check Pump.fun for token liquidity with fallback support
 */
async function checkPumpFunLiquidity(tokenAddress: string): Promise<LiquidityInfo | null> {
  try {
    // Use fallback-aware fetch
    const response = await fetchWithFallback(
      PUMPFUN_ENDPOINTS,
      (endpoint) => `${endpoint}/${tokenAddress}`,
      10000
    );
    
    if (!response) return null;
    
    const data = await response.json();
    
    if (!data || !data.mint) return null;
    
    // Calculate liquidity from virtual reserves
    const virtualSolReserves = data.virtual_sol_reserves || 0;
    const liquidityInSol = virtualSolReserves / 1e9; // Convert lamports to SOL
    
    return {
      tokenAddress: data.mint,
      tokenName: data.name || 'Unknown',
      tokenSymbol: data.symbol || 'UNKNOWN',
      poolAddress: data.bonding_curve || '',
      poolType: data.complete ? 'raydium' : 'pump_fun', // Graduated tokens use Raydium
      baseMint: SOL_MINT,
      quoteMint: data.mint,
      liquidityAmount: liquidityInSol,
      lpTokenMint: null,
      timestamp: Date.now(),
      blockHeight: 0,
    };
  } catch (e) {
    console.log('[LiquidityDetector] Pump.fun check failed:', e);
    return null;
  }
}

/**
 * Check Raydium for token liquidity with fallback support
 */
async function checkRaydiumLiquidity(tokenAddress: string): Promise<LiquidityInfo | null> {
  try {
    // Try the mint info endpoint first
    const response = await fetchWithFallback(
      RAYDIUM_ENDPOINTS,
      (endpoint) => {
        if (endpoint.includes('/mint')) {
          return `${endpoint}?mint1=${tokenAddress}&mint2=${SOL_MINT}`;
        }
        return `${endpoint}?baseMint=${tokenAddress}`;
      },
      10000
    );
    
    if (!response) return null;
    
    const data = await response.json();
    
    // Handle different response formats
    let pools = [];
    if (data.data && Array.isArray(data.data)) {
      pools = data.data;
    } else if (data.data?.data && Array.isArray(data.data.data)) {
      pools = data.data.data;
    } else if (Array.isArray(data)) {
      pools = data;
    }
    
    if (pools.length === 0) return null;
    
    // Find pools containing our token
    const relevantPools = pools.filter((p: any) => 
      p.mintA === tokenAddress || p.mintB === tokenAddress ||
      p.baseMint === tokenAddress || p.quoteMint === tokenAddress
    );
    
    if (relevantPools.length === 0) return null;
    
    // Get the highest liquidity pool
    const bestPool = relevantPools.reduce((best: any, current: any) => 
      (current.tvl || current.liquidity || 0) > (best.tvl || best.liquidity || 0) ? current : best
    );
    
    const isBaseSol = bestPool.mintA === SOL_MINT || bestPool.baseMint === SOL_MINT;
    const tvl = bestPool.tvl || bestPool.liquidity || 0;
    
    return {
      tokenAddress,
      tokenName: bestPool.name || 'Unknown',
      tokenSymbol: bestPool.symbol || 'UNKNOWN',
      poolAddress: bestPool.id || bestPool.poolId || '',
      poolType: 'raydium',
      baseMint: isBaseSol ? SOL_MINT : (bestPool.mintA || bestPool.baseMint),
      quoteMint: isBaseSol ? (bestPool.mintB || bestPool.quoteMint) : tokenAddress,
      liquidityAmount: tvl / 2, // Approximate SOL side
      lpTokenMint: bestPool.lpMint || null,
      timestamp: Date.now(),
      blockHeight: 0,
    };
  } catch (e) {
    console.log('[LiquidityDetector] Raydium check failed:', e);
    return null;
  }
}

/**
 * Check DexScreener for any DEX listing with fallback support
 */
async function checkDexScreenerLiquidity(tokenAddress: string): Promise<LiquidityInfo | null> {
  try {
    // Use fallback-aware fetch
    const response = await fetchWithFallback(
      DEXSCREENER_ENDPOINTS,
      (endpoint) => {
        if (endpoint.includes('/pairs/')) {
          // This endpoint needs pair address, use token search instead
          return `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`;
        }
        return `${endpoint}/${tokenAddress}`;
      },
      10000
    );
    
    if (!response) return null;
    
    const data = await response.json();
    
    if (!data.pairs || data.pairs.length === 0) return null;
    
    // Filter for Solana pairs only
    const solanaPairs = data.pairs.filter((p: any) => p.chainId === 'solana');
    
    if (solanaPairs.length === 0) return null;
    
    // Get the highest liquidity pair
    const bestPair = solanaPairs.reduce((best: any, current: any) => 
      (current.liquidity?.usd || 0) > (best.liquidity?.usd || 0) ? current : best
    );
    
    // Get SOL price from the pair data if available, otherwise estimate
    let solPrice = 150; // Default fallback
    const nativePrice = bestPair.priceNative ? parseFloat(bestPair.priceNative) : null;
    const usdPrice = bestPair.priceUsd ? parseFloat(bestPair.priceUsd) : null;
    
    if (nativePrice && usdPrice && nativePrice > 0) {
      // SOL price = USD price / native price (tokens per SOL)
      solPrice = usdPrice / nativePrice;
    } else if (bestPair.quoteToken?.symbol === 'SOL' && bestPair.quoteToken?.priceUsd) {
      solPrice = parseFloat(bestPair.quoteToken.priceUsd);
    }
    
    // Estimate SOL liquidity
    const liquidityUsd = bestPair.liquidity?.usd || 0;
    const liquidityInSol = solPrice > 0 ? liquidityUsd / solPrice / 2 : 0;
    
    // Determine pool type from DEX ID
    let poolType: LiquidityInfo['poolType'] = 'unknown';
    const dexId = bestPair.dexId?.toLowerCase() || '';
    if (dexId.includes('pump') || dexId === 'pumpfun') poolType = 'pump_fun';
    else if (dexId.includes('raydium')) poolType = 'raydium';
    else if (dexId.includes('orca')) poolType = 'orca';
    
    return {
      tokenAddress,
      tokenName: bestPair.baseToken?.name || 'Unknown',
      tokenSymbol: bestPair.baseToken?.symbol || 'UNKNOWN',
      poolAddress: bestPair.pairAddress,
      poolType,
      baseMint: bestPair.quoteToken?.address || SOL_MINT,
      quoteMint: tokenAddress,
      liquidityAmount: liquidityInSol,
      lpTokenMint: null,
      timestamp: Date.now(),
      blockHeight: 0,
    };
  } catch (e) {
    console.log('[LiquidityDetector] DexScreener check failed:', e);
    return null;
  }
}

/**
 * Assess token risk using RugCheck and other validators
 */
async function assessRisk(
  tokenAddress: string,
  config: TradingConfig
): Promise<RiskAssessment> {
  const reasons: string[] = [];
  let overallScore = 0;
  let isRugPull = false;
  let isHoneypot = false;
  let hasMintAuthority = false;
  let hasFreezeAuthority = false;
  let holderCount = 0;
  let topHolderPercent = 0;
  
  try {
    // Check RugCheck API
    const response = await fetch(`${API_ENDPOINTS.rugCheck}/${tokenAddress}/report`, {
      signal: AbortSignal.timeout(10000),
    });
    
    if (response.ok) {
      const data = await response.json();
      
      // Extract risk data
      overallScore = data.score || 0;
      
      // Check for specific risks
      if (data.risks) {
        for (const risk of data.risks) {
          const riskName = risk.name?.toLowerCase() || '';
          const riskLevel = risk.level?.toLowerCase() || '';
          
          if (riskName.includes('rug') || riskName.includes('scam')) {
            isRugPull = true;
            reasons.push(`Rug pull risk: ${risk.description || riskName}`);
          }
          
          if (riskName.includes('honeypot') || riskName.includes('sell')) {
            isHoneypot = true;
            reasons.push(`Honeypot risk: ${risk.description || riskName}`);
          }
          
          if (riskName.includes('mint') && riskLevel !== 'none') {
            hasMintAuthority = true;
            if (config.riskFilters.checkMintAuthority) {
              reasons.push('Mint authority not revoked');
            }
          }
          
          if (riskName.includes('freeze') && riskLevel !== 'none') {
            hasFreezeAuthority = true;
            if (config.riskFilters.checkFreezeAuthority) {
              reasons.push('Freeze authority not revoked');
            }
          }
        }
      }
      
      // Check holder distribution
      if (data.topHolders) {
        holderCount = data.totalHolders || data.topHolders.length;
        topHolderPercent = data.topHolders[0]?.pct || 0;
        
        if (holderCount < config.riskFilters.minHolders) {
          reasons.push(`Only ${holderCount} holders (min: ${config.riskFilters.minHolders})`);
        }
        
        if (topHolderPercent > config.riskFilters.maxOwnershipPercent) {
          reasons.push(`Top holder owns ${topHolderPercent.toFixed(1)}% (max: ${config.riskFilters.maxOwnershipPercent}%)`);
        }
      }
    }
  } catch {
    // If RugCheck fails, add a warning but don't fail
    reasons.push('Could not verify token safety (RugCheck unavailable)');
    overallScore = 50; // Neutral score
  }
  
  // Determine if risk check passed
  const passed = 
    overallScore <= config.maxRiskScore &&
    (!config.riskFilters.checkRugPull || !isRugPull) &&
    (!config.riskFilters.checkHoneypot || !isHoneypot) &&
    (!config.riskFilters.checkMintAuthority || !hasMintAuthority) &&
    (!config.riskFilters.checkFreezeAuthority || !hasFreezeAuthority) &&
    holderCount >= config.riskFilters.minHolders &&
    topHolderPercent <= config.riskFilters.maxOwnershipPercent;
  
  return {
    overallScore,
    isRugPull,
    isHoneypot,
    hasMintAuthority,
    hasFreezeAuthority,
    holderCount,
    topHolderPercent,
    passed,
    reasons,
  };
}

/**
 * Monitor for new liquidity events (polling-based)
 * Returns when liquidity is detected or timeout
 */
export async function monitorLiquidity(
  tokenAddress: string,
  config: TradingConfig,
  timeoutMs: number = 300000, // 5 minutes default
  onEvent?: TradingEventCallback
): Promise<LiquidityDetectionResult> {
  const startTime = Date.now();
  const pollInterval = 2000; // Poll every 2 seconds
  
  while (Date.now() - startTime < timeoutMs) {
    const result = await detectLiquidity(tokenAddress, config, onEvent);
    
    if (result.status === 'LP_READY') {
      return result;
    }
    
    if (result.status === 'RISK_FAILED') {
      return result; // Don't retry on risk failure
    }
    
    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
  
  return {
    status: 'LP_NOT_FOUND',
    liquidityInfo: null,
    riskAssessment: null,
    error: 'Liquidity monitoring timed out',
    detectedAt: startTime,
  };
}
