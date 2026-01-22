/**
 * Stage 1: Liquidity Detection (RPC-ONLY)
 * 
 * ZERO Raydium HTTP API dependencies
 * Uses edge function for tradability check (Jupiter-based)
 * 
 * TRADABLE CRITERIA:
 * 1. Pump.fun bonding curve active (stage: BONDING)
 * 2. Jupiter has valid route (stage: LP_LIVE/INDEXING)
 * 3. DexScreener has pair data (stage: LISTED)
 */

import type {
  TradingConfig,
  LiquidityInfo,
  LiquidityDetectionResult,
  RiskAssessment,
  TradingEventCallback,
} from './types';
import { API_ENDPOINTS, SOL_MINT, USDC_MINT } from './config';

// ============================================
// TYPES
// ============================================

export interface TradablePoolResult {
  status: 'TRADABLE' | 'DISCARDED';
  poolAddress?: string;
  baseMint?: string;
  quoteMint?: string;
  liquidity?: number;
  poolType?: 'raydium_v4' | 'raydium_clmm';
  dexId?: string;
  detectedAt?: number;
  reason?: string;
  tokenStatus?: {
    tradable: boolean;
    stage: 'BONDING' | 'LP_LIVE' | 'INDEXING' | 'LISTED';
  };
}

// ============================================
// MAIN DETECTION FUNCTION
// ============================================

/**
 * Detect a tradable pool for the given token
 * Uses server-side edge function (Jupiter-based, NO Raydium HTTP)
 */
export async function detectTradablePool(
  tokenAddress: string,
  config: TradingConfig,
  onEvent?: TradingEventCallback
): Promise<TradablePoolResult> {
  const startTime = Date.now();
  
  try {
    console.log(`[LiquidityDetector] Checking ${tokenAddress.slice(0, 8)} via edge function...`);
    
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    
    const response = await fetch(
      `${supabaseUrl}/functions/v1/liquidity-check`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
        },
        body: JSON.stringify({
          tokenAddress,
          minLiquidity: config.minLiquidity,
        }),
        signal: AbortSignal.timeout(15000),
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`[LiquidityDetector] Edge function error: ${response.status}`);
      return {
        status: 'DISCARDED',
        reason: `Check failed: ${response.status}`,
      };
    }
    
    const data = await response.json();
    
    if (data.status === 'TRADABLE') {
      // Determine pool type from source/dexId
      const dexId = data.dexId || data.source || '';
      let poolType: 'pump_fun' | 'raydium' | 'orca' | 'unknown' = 'unknown';
      
      if (data.source === 'pump_fun' || dexId === 'pumpfun') {
        poolType = 'pump_fun';
      } else if (dexId.includes('raydium') || data.source === 'raydium') {
        poolType = 'raydium';
      } else if (dexId.includes('orca') || data.source === 'orca') {
        poolType = 'orca';
      }
      
      console.log(`[LiquidityDetector] ✅ Tradeable via ${dexId || data.source}: ${data.liquidity?.toFixed(1)} SOL`);
      
      onEvent?.({
        type: 'LIQUIDITY_DETECTED',
        data: {
          tokenAddress,
          tokenName: data.tokenName || 'Unknown',
          tokenSymbol: data.tokenSymbol || 'UNKNOWN',
          poolAddress: data.poolAddress || '',
          poolType,
          baseMint: data.baseMint || SOL_MINT,
          quoteMint: tokenAddress,
          liquidityAmount: data.liquidity || 0,
          lpTokenMint: null,
          timestamp: startTime,
          blockHeight: 0,
        },
      });
      
      return {
        status: 'TRADABLE',
        poolAddress: data.poolAddress,
        baseMint: data.baseMint || SOL_MINT,
        quoteMint: tokenAddress,
        liquidity: data.liquidity || 50,
        poolType: 'raydium_v4', // Default for swap compatibility
        detectedAt: startTime,
        dexId: dexId,
        tokenStatus: data.tokenStatus,
      } as TradablePoolResult;
    }
    
    // Not tradeable
    console.log(`[LiquidityDetector] ❌ Not tradeable: ${data.reason}`);
    return {
      status: 'DISCARDED',
      reason: data.reason || 'No tradeable route found',
    };
    
  } catch (error) {
    console.error('[LiquidityDetector] Error:', error);
    return {
      status: 'DISCARDED',
      reason: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================
// LEGACY WRAPPER - detectLiquidity
// ============================================

export async function detectLiquidity(
  tokenAddress: string,
  config: TradingConfig,
  onEvent?: TradingEventCallback
): Promise<LiquidityDetectionResult> {
  const startTime = Date.now();
  
  // Use new detection (Jupiter-based, NO Raydium HTTP)
  const poolResult = await detectTradablePool(tokenAddress, config, onEvent);
  
  if (poolResult.status === 'TRADABLE') {
    // Skip risk assessment if token was pre-verified (from scanner)
    // This prevents double-checking tokens that already passed auto-sniper evaluation
    if (config.skipRiskCheck) {
      console.log(`[LiquidityDetector] Skipping risk check for pre-verified token ${tokenAddress.slice(0, 8)}`);
      
      const passedRiskAssessment: RiskAssessment = {
        overallScore: 30,
        isRugPull: false,
        isHoneypot: false,
        hasMintAuthority: false,
        hasFreezeAuthority: false,
        holderCount: 100,
        topHolderPercent: 10,
        passed: true,
        reasons: ['Pre-verified by scanner'],
      };
      
      onEvent?.({ type: 'RISK_CHECK_PASSED', data: passedRiskAssessment });
      
      return {
        status: 'LP_READY',
        liquidityInfo: {
          tokenAddress,
          tokenName: 'Unknown',
          tokenSymbol: 'UNKNOWN',
          poolAddress: poolResult.poolAddress || '',
          poolType: 'raydium',
          baseMint: poolResult.baseMint || SOL_MINT,
          quoteMint: tokenAddress,
          liquidityAmount: poolResult.liquidity || 0,
          lpTokenMint: null,
          timestamp: startTime,
          blockHeight: 0,
        },
        riskAssessment: passedRiskAssessment,
        detectedAt: startTime,
      };
    }
    
    // Run risk assessment on tradable pools (for manual trades)
    const riskAssessment = await assessRisk(tokenAddress, config);
    
    if (!riskAssessment.passed) {
      onEvent?.({ type: 'RISK_CHECK_FAILED', data: riskAssessment });
      return {
        status: 'RISK_FAILED',
        liquidityInfo: {
          tokenAddress,
          tokenName: 'Unknown',
          tokenSymbol: 'UNKNOWN',
          poolAddress: poolResult.poolAddress || '',
          poolType: 'raydium',
          baseMint: poolResult.baseMint || SOL_MINT,
          quoteMint: tokenAddress,
          liquidityAmount: poolResult.liquidity || 0,
          lpTokenMint: null,
          timestamp: startTime,
          blockHeight: 0,
        },
        riskAssessment,
        error: `Risk check failed: ${riskAssessment.reasons.join(', ')}`,
        detectedAt: startTime,
      };
    }
    
    onEvent?.({ type: 'RISK_CHECK_PASSED', data: riskAssessment });
    
    return {
      status: 'LP_READY',
      liquidityInfo: {
        tokenAddress,
        tokenName: 'Unknown',
        tokenSymbol: 'UNKNOWN',
        poolAddress: poolResult.poolAddress || '',
        poolType: 'raydium',
        baseMint: poolResult.baseMint || SOL_MINT,
        quoteMint: tokenAddress,
        liquidityAmount: poolResult.liquidity || 0,
        lpTokenMint: null,
        timestamp: startTime,
        blockHeight: 0,
      },
      riskAssessment,
      detectedAt: startTime,
    };
  }
  
  // Pool not found or discarded
  return {
    status: 'LP_NOT_FOUND',
    liquidityInfo: null,
    riskAssessment: null,
    error: poolResult.reason || 'No tradable pool found',
    detectedAt: startTime,
  };
}

// ============================================
// RISK ASSESSMENT
// ============================================

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
      
      overallScore = data.score || 0;
      
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
    reasons.push('Could not verify token safety (RugCheck unavailable)');
    overallScore = 50;
  }
  
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

// ============================================
// MONITORING FUNCTION
// ============================================

export async function monitorLiquidity(
  tokenAddress: string,
  config: TradingConfig,
  timeoutMs: number = 300000,
  onEvent?: TradingEventCallback
): Promise<LiquidityDetectionResult> {
  const startTime = Date.now();
  const pollInterval = 3000; // Poll every 3 seconds
  
  while (Date.now() - startTime < timeoutMs) {
    const result = await detectLiquidity(tokenAddress, config, onEvent);
    
    if (result.status === 'LP_READY') {
      return result;
    }
    
    if (result.status === 'RISK_FAILED') {
      return result;
    }
    
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
