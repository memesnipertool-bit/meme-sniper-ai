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

/**
 * Detect liquidity for a token address
 * Checks Pump.fun, Raydium, and other DEXes
 */
export async function detectLiquidity(
  tokenAddress: string,
  config: TradingConfig,
  onEvent?: TradingEventCallback
): Promise<LiquidityDetectionResult> {
  const startTime = Date.now();
  
  try {
    // Step 1: Check Pump.fun first (fastest for new tokens)
    const pumpFunResult = await checkPumpFunLiquidity(tokenAddress);
    
    if (pumpFunResult) {
      onEvent?.({ type: 'LIQUIDITY_DETECTED', data: pumpFunResult });
      
      // Validate liquidity amount
      if (pumpFunResult.liquidityAmount < config.minLiquidity) {
        return {
          status: 'LP_INSUFFICIENT',
          liquidityInfo: pumpFunResult,
          riskAssessment: null,
          error: `Liquidity ${pumpFunResult.liquidityAmount} SOL below minimum ${config.minLiquidity} SOL`,
          detectedAt: startTime,
        };
      }
      
      // Run risk assessment
      const riskAssessment = await assessRisk(tokenAddress, config);
      
      if (!riskAssessment.passed) {
        onEvent?.({ type: 'RISK_CHECK_FAILED', data: riskAssessment });
        return {
          status: 'RISK_FAILED',
          liquidityInfo: pumpFunResult,
          riskAssessment,
          error: `Risk check failed: ${riskAssessment.reasons.join(', ')}`,
          detectedAt: startTime,
        };
      }
      
      onEvent?.({ type: 'RISK_CHECK_PASSED', data: riskAssessment });
      
      return {
        status: 'LP_READY',
        liquidityInfo: pumpFunResult,
        riskAssessment,
        detectedAt: startTime,
      };
    }
    
    // Step 2: Check Raydium pools
    const raydiumResult = await checkRaydiumLiquidity(tokenAddress);
    
    if (raydiumResult) {
      onEvent?.({ type: 'LIQUIDITY_DETECTED', data: raydiumResult });
      
      if (raydiumResult.liquidityAmount < config.minLiquidity) {
        return {
          status: 'LP_INSUFFICIENT',
          liquidityInfo: raydiumResult,
          riskAssessment: null,
          error: `Liquidity ${raydiumResult.liquidityAmount} SOL below minimum ${config.minLiquidity} SOL`,
          detectedAt: startTime,
        };
      }
      
      const riskAssessment = await assessRisk(tokenAddress, config);
      
      if (!riskAssessment.passed) {
        onEvent?.({ type: 'RISK_CHECK_FAILED', data: riskAssessment });
        return {
          status: 'RISK_FAILED',
          liquidityInfo: raydiumResult,
          riskAssessment,
          error: `Risk check failed: ${riskAssessment.reasons.join(', ')}`,
          detectedAt: startTime,
        };
      }
      
      onEvent?.({ type: 'RISK_CHECK_PASSED', data: riskAssessment });
      
      return {
        status: 'LP_READY',
        liquidityInfo: raydiumResult,
        riskAssessment,
        detectedAt: startTime,
      };
    }
    
    // Step 3: Check DexScreener for any DEX listing
    const dexScreenerResult = await checkDexScreenerLiquidity(tokenAddress);
    
    if (dexScreenerResult) {
      onEvent?.({ type: 'LIQUIDITY_DETECTED', data: dexScreenerResult });
      
      if (dexScreenerResult.liquidityAmount < config.minLiquidity) {
        return {
          status: 'LP_INSUFFICIENT',
          liquidityInfo: dexScreenerResult,
          riskAssessment: null,
          error: `Liquidity ${dexScreenerResult.liquidityAmount} SOL below minimum ${config.minLiquidity} SOL`,
          detectedAt: startTime,
        };
      }
      
      const riskAssessment = await assessRisk(tokenAddress, config);
      
      if (!riskAssessment.passed) {
        onEvent?.({ type: 'RISK_CHECK_FAILED', data: riskAssessment });
        return {
          status: 'RISK_FAILED',
          liquidityInfo: dexScreenerResult,
          riskAssessment,
          error: `Risk check failed: ${riskAssessment.reasons.join(', ')}`,
          detectedAt: startTime,
        };
      }
      
      onEvent?.({ type: 'RISK_CHECK_PASSED', data: riskAssessment });
      
      return {
        status: 'LP_READY',
        liquidityInfo: dexScreenerResult,
        riskAssessment,
        detectedAt: startTime,
      };
    }
    
    // No liquidity found
    return {
      status: 'LP_NOT_FOUND',
      liquidityInfo: null,
      riskAssessment: null,
      error: 'No liquidity pool found for token',
      detectedAt: startTime,
    };
    
  } catch (error) {
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
 * Check Pump.fun for token liquidity
 */
async function checkPumpFunLiquidity(tokenAddress: string): Promise<LiquidityInfo | null> {
  try {
    const response = await fetch(`${API_ENDPOINTS.pumpFunToken}/${tokenAddress}`, {
      signal: AbortSignal.timeout(10000),
    });
    
    if (!response.ok) return null;
    
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
      poolType: 'pump_fun',
      baseMint: SOL_MINT,
      quoteMint: data.mint,
      liquidityAmount: liquidityInSol,
      lpTokenMint: null,
      timestamp: Date.now(),
      blockHeight: 0,
    };
  } catch {
    return null;
  }
}

/**
 * Check Raydium for token liquidity
 */
async function checkRaydiumLiquidity(tokenAddress: string): Promise<LiquidityInfo | null> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.raydiumPools}?mint=${tokenAddress}`,
      { signal: AbortSignal.timeout(10000) }
    );
    
    if (!response.ok) return null;
    
    const data = await response.json();
    
    if (!data.data || data.data.length === 0) return null;
    
    // Find the best pool (highest liquidity)
    const pools = data.data.filter((p: any) => 
      p.mintA === tokenAddress || p.mintB === tokenAddress
    );
    
    if (pools.length === 0) return null;
    
    const bestPool = pools.reduce((best: any, current: any) => 
      (current.tvl || 0) > (best.tvl || 0) ? current : best
    );
    
    const isBaseSol = bestPool.mintA === SOL_MINT;
    
    return {
      tokenAddress,
      tokenName: bestPool.name || 'Unknown',
      tokenSymbol: bestPool.symbol || 'UNKNOWN',
      poolAddress: bestPool.id,
      poolType: 'raydium',
      baseMint: isBaseSol ? SOL_MINT : bestPool.mintA,
      quoteMint: isBaseSol ? bestPool.mintB : tokenAddress,
      liquidityAmount: (bestPool.tvl || 0) / 2, // Approximate SOL side
      lpTokenMint: bestPool.lpMint || null,
      timestamp: Date.now(),
      blockHeight: 0,
    };
  } catch {
    return null;
  }
}

/**
 * Check DexScreener for any DEX listing
 */
async function checkDexScreenerLiquidity(tokenAddress: string): Promise<LiquidityInfo | null> {
  try {
    const response = await fetch(`${API_ENDPOINTS.dexScreener}/${tokenAddress}`, {
      signal: AbortSignal.timeout(10000),
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    
    if (!data.pairs || data.pairs.length === 0) return null;
    
    // Filter for Solana pairs only
    const solanaPairs = data.pairs.filter((p: any) => p.chainId === 'solana');
    
    if (solanaPairs.length === 0) return null;
    
    // Get the highest liquidity pair
    const bestPair = solanaPairs.reduce((best: any, current: any) => 
      (current.liquidity?.usd || 0) > (best.liquidity?.usd || 0) ? current : best
    );
    
    // Estimate SOL liquidity (rough conversion)
    const liquidityUsd = bestPair.liquidity?.usd || 0;
    const solPrice = 150; // Approximate, should fetch dynamically
    const liquidityInSol = liquidityUsd / solPrice / 2;
    
    // Determine pool type
    let poolType: LiquidityInfo['poolType'] = 'unknown';
    const dexId = bestPair.dexId?.toLowerCase() || '';
    if (dexId.includes('raydium')) poolType = 'raydium';
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
  } catch {
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
