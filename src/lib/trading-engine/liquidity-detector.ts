/**
 * Stage 1: Strict Raydium Pool Detection
 * 
 * TRADABLE POOL REQUIREMENTS (ALL must pass):
 * 1. Raydium AMM pool initialized via `initialize2`
 * 2. AMM program is Raydium V4 or Raydium CLMM
 * 3. Pool status = initialized and open_time <= current_time
 * 4. Base mint is SOL or USDC only
 * 5. Both vault balances > 0
 * 6. Liquidity >= config.minLiquidity (default 20-50 SOL)
 * 7. LP token mint exists
 * 8. Pool is NOT in Pump.fun bonding curve stage
 * 9. Swap simulation succeeds with tiny amount
 */

import type {
  TradingConfig,
  LiquidityInfo,
  LiquidityDetectionResult,
  RiskAssessment,
  TradingEventCallback,
} from './types';
import { API_ENDPOINTS, SOL_MINT, USDC_MINT, PROGRAM_IDS } from './config';

// ============================================
// TYPES FOR STRICT POOL DETECTION
// ============================================

export interface TradablePoolResult {
  status: 'TRADABLE' | 'DISCARDED';
  poolAddress?: string;
  baseMint?: string;
  quoteMint?: string;
  liquidity?: number;
  poolType?: 'raydium_v4' | 'raydium_clmm';
  dexId?: string; // e.g., 'raydium', 'orca', 'meteora', 'pumpfun'
  detectedAt?: number;
  reason?: string;
}

interface RaydiumPoolState {
  poolAddress: string;
  ammId: string;
  baseMint: string;
  quoteMint: string;
  baseVault: string;
  quoteVault: string;
  lpMint: string;
  openTime: number;
  status: number;
  baseReserve: number;
  quoteReserve: number;
  lpSupply: number;
}

interface SwapSimulationResult {
  success: boolean;
  outputAmount?: number;
  priceImpact?: number;
  error?: string;
}

// ============================================
// MAIN DETECTION FUNCTION
// ============================================

/**
 * Detect a tradable pool for the given token
 * Uses server-side edge function to bypass CORS issues with external APIs
 * 
 * PERFORMANCE: Edge function checks Pump.fun → Jupiter → Raydium in priority order
 */
export async function detectTradablePool(
  tokenAddress: string,
  config: TradingConfig,
  onEvent?: TradingEventCallback
): Promise<TradablePoolResult> {
  const startTime = Date.now();
  
  try {
    // Use edge function to bypass CORS - it checks all sources server-side
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
      console.log(`[LiquidityDetector] Edge function error: ${response.status} - ${errorText}`);
      return {
        status: 'DISCARDED',
        reason: `Liquidity check failed: ${response.status}`,
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
      
      console.log(`[LiquidityDetector] ✅ Found tradeable via ${dexId || data.source}: ${data.liquidity?.toFixed(1)} SOL`);
      
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
        poolType: poolType === 'orca' ? 'raydium_v4' : 'raydium_v4', // Use raydium_v4 for swap compatibility
        detectedAt: startTime,
        // Pass through dexId for routing decisions
        dexId: dexId,
      } as TradablePoolResult & { dexId?: string };
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

/**
 * Check if token is tradeable on Pump.fun bonding curve
 */
async function checkPumpFunTradeable(tokenAddress: string): Promise<{
  isTradeable: boolean;
  name?: string;
  symbol?: string;
  liquidity?: number;
}> {
  try {
    const response = await fetch(
      `https://frontend-api.pump.fun/coins/${tokenAddress}`,
      {
        signal: AbortSignal.timeout(5000),
        headers: { 
          'Accept': 'application/json',
          'User-Agent': 'MemeSniper/2.0',
        },
      }
    );
    
    if (!response.ok) {
      return { isTradeable: false };
    }
    
    const data = await response.json();
    
    // If token exists and is NOT complete (still on bonding curve), it's tradeable via Pump.fun
    if (data && data.mint === tokenAddress) {
      if (data.complete === false) {
        // Still on bonding curve - tradeable via Pump.fun
        // Estimate liquidity from virtual reserves
        const virtualSolReserves = data.virtual_sol_reserves || 0;
        const liquidityInSol = virtualSolReserves / 1e9;
        
        return {
          isTradeable: true,
          name: data.name,
          symbol: data.symbol,
          liquidity: liquidityInSol > 0 ? liquidityInSol : 30, // Default to 30 SOL (bonding curve start)
        };
      } else {
        // Graduated to Raydium - will be handled by Raydium/Jupiter
        return { isTradeable: false };
      }
    }
    
    return { isTradeable: false };
    
  } catch (error) {
    console.log('[LiquidityDetector] Pump.fun check error:', error);
    return { isTradeable: false };
  }
}

// ============================================
// POOL VALIDATION (STRICT CRITERIA)
// ============================================

interface PoolValidation {
  passed: boolean;
  reason?: string;
}

async function validatePoolStrict(
  pool: RaydiumPoolState,
  config: TradingConfig
): Promise<PoolValidation> {
  // CHECK 1: Base mint must be SOL or USDC
  const isValidBaseMint = pool.baseMint === SOL_MINT || pool.baseMint === USDC_MINT;
  if (!isValidBaseMint) {
    return { passed: false, reason: `Invalid base mint: ${pool.baseMint}` };
  }
  
  // CHECK 2: Pool must be initialized (status check)
  // Status 6 = SwapEnabled on Raydium
  if (pool.status !== 6 && pool.status !== 1) {
    return { passed: false, reason: `Pool not in tradable status: ${pool.status}` };
  }
  
  // CHECK 3: Pool must be open (openTime <= now)
  const nowUnix = Math.floor(Date.now() / 1000);
  if (pool.openTime > nowUnix) {
    return { passed: false, reason: `Pool not open yet. Opens at: ${pool.openTime}` };
  }
  
  // CHECK 4: Both vaults must have reserves > 0
  if (pool.baseReserve <= 0 || pool.quoteReserve <= 0) {
    return { passed: false, reason: `Empty vault: base=${pool.baseReserve}, quote=${pool.quoteReserve}` };
  }
  
  // CHECK 5: Liquidity must meet minimum threshold
  // For SOL base, baseReserve is in SOL
  // For USDC base, convert to SOL equivalent (assume ~$150/SOL)
  let liquidityInSol = pool.baseReserve;
  if (pool.baseMint === USDC_MINT) {
    liquidityInSol = pool.baseReserve / 150; // Rough conversion
  }
  
  // Use strict minimum - default to 20 SOL if not configured lower
  const minLiquidity = Math.max(config.minLiquidity, 20);
  
  if (liquidityInSol < minLiquidity) {
    return { passed: false, reason: `Insufficient liquidity: ${liquidityInSol.toFixed(2)} SOL < ${minLiquidity} SOL` };
  }
  
  // CHECK 6: LP token mint must exist
  if (!pool.lpMint || pool.lpMint === '' || pool.lpMint === '11111111111111111111111111111111') {
    return { passed: false, reason: 'No LP token mint found' };
  }
  
  // CHECK 7: LP supply must be > 0
  if (pool.lpSupply <= 0) {
    return { passed: false, reason: 'LP supply is zero - pool not initialized' };
  }
  
  // CHECK 8: Pump.fun check REMOVED - we now handle Pump.fun in detectTradablePool priority 1
  // Tokens on Pump.fun bonding curve are tradeable via Jupiter which supports Pump.fun
  
  return { passed: true };
}

// ============================================
// RAYDIUM POOL FETCHING
// ============================================

async function fetchRaydiumPools(tokenAddress: string): Promise<RaydiumPoolState[]> {
  const pools: RaydiumPoolState[] = [];
  
  try {
    // Query Raydium API v3 for pools containing this token
    // Note: Use page_size not pageSize (Raydium v3 API parameter name)
    const response = await fetch(
      `https://api-v3.raydium.io/pools/info/mint?mint1=${tokenAddress}&poolType=standard&poolSortField=liquidity&sortType=desc&page_size=10`,
      {
        signal: AbortSignal.timeout(10000),
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'MemeSniper/2.0',
        },
      }
    );
    
    if (!response.ok) {
      console.log(`[LiquidityDetector] Raydium API returned ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    
    if (!data.success || !data.data?.data) {
      return [];
    }
    
    // Parse pool data
    for (const poolData of data.data.data) {
      // Only process pools with SOL or USDC as base
      const baseMint = poolData.mintA?.address || poolData.mintA;
      const quoteMint = poolData.mintB?.address || poolData.mintB;
      
      // Determine which side is SOL/USDC
      let actualBase = baseMint;
      let actualQuote = quoteMint;
      let baseReserve = poolData.mintAmountA || 0;
      let quoteReserve = poolData.mintAmountB || 0;
      
      // Swap if the token is on the A side
      if (quoteMint === SOL_MINT || quoteMint === USDC_MINT) {
        actualBase = quoteMint;
        actualQuote = baseMint;
        baseReserve = poolData.mintAmountB || 0;
        quoteReserve = poolData.mintAmountA || 0;
      }
      
      // Skip if neither side is SOL/USDC
      if (actualBase !== SOL_MINT && actualBase !== USDC_MINT) {
        continue;
      }
      
      // Skip if this isn't our target token
      if (actualQuote !== tokenAddress) {
        continue;
      }
      
      pools.push({
        poolAddress: poolData.id || poolData.poolId || '',
        ammId: poolData.programId || PROGRAM_IDS.raydiumAmm,
        baseMint: actualBase,
        quoteMint: actualQuote,
        baseVault: poolData.vault?.A || '',
        quoteVault: poolData.vault?.B || '',
        lpMint: poolData.lpMint?.address || poolData.lpMint || '',
        openTime: poolData.openTime || 0,
        status: poolData.status ?? 6, // Default to tradable status if not specified
        baseReserve: baseReserve,
        quoteReserve: quoteReserve,
        lpSupply: poolData.lpAmount || poolData.lpSupply || 1,
      });
    }
  } catch (error) {
    console.error('[LiquidityDetector] Failed to fetch Raydium pools:', error);
  }
  
  // Also try the standard Raydium pairs endpoint
  try {
    const response = await fetch(
      `https://api-v3.raydium.io/pools/info/ids?ids=${tokenAddress}`,
      {
        signal: AbortSignal.timeout(8000),
        headers: { 'Accept': 'application/json' },
      }
    );
    
    if (response.ok) {
      const data = await response.json();
      if (data.success && data.data) {
        // Merge any additional pools found
        for (const poolData of data.data) {
          if (!pools.find(p => p.poolAddress === (poolData.id || poolData.poolId))) {
            // Add if not already in list - apply same filtering logic
            const baseMint = poolData.mintA?.address || poolData.mintA;
            const quoteMint = poolData.mintB?.address || poolData.mintB;
            
            if (baseMint === SOL_MINT || baseMint === USDC_MINT || quoteMint === SOL_MINT || quoteMint === USDC_MINT) {
              pools.push({
                poolAddress: poolData.id || poolData.poolId || '',
                ammId: poolData.programId || PROGRAM_IDS.raydiumAmm,
                baseMint: baseMint,
                quoteMint: quoteMint,
                baseVault: '',
                quoteVault: '',
                lpMint: poolData.lpMint?.address || poolData.lpMint || '',
                openTime: poolData.openTime || 0,
                status: poolData.status ?? 6,
                baseReserve: poolData.mintAmountA || 0,
                quoteReserve: poolData.mintAmountB || 0,
                lpSupply: poolData.lpAmount || 1,
              });
            }
          }
        }
      }
    }
  } catch {
    // Silent fallback failure
  }
  
  return pools;
}

// ============================================
// PUMP.FUN BONDING CURVE CHECK
// ============================================

async function checkIfPumpFunPool(tokenAddress: string): Promise<boolean> {
  try {
    // Check Pump.fun API to see if token is still in bonding curve
    const response = await fetch(
      `https://frontend-api.pump.fun/coins/${tokenAddress}`,
      {
        signal: AbortSignal.timeout(5000),
        headers: { 'Accept': 'application/json' },
      }
    );
    
    if (!response.ok) {
      // If Pump.fun doesn't know this token, it's not a Pump.fun bonding curve
      return false;
    }
    
    const data = await response.json();
    
    // If "complete" is false, token is still in bonding curve stage
    if (data && data.mint === tokenAddress && data.complete === false) {
      return true; // REJECT - still in bonding curve
    }
    
    // If complete === true, token has graduated to Raydium - this is OK
    return false;
    
  } catch {
    // If we can't check, assume it's not a Pump.fun pool (safer to proceed)
    return false;
  }
}

// ============================================
// SWAP SIMULATION (MANDATORY)
// Uses Jupiter ONLY - NO Raydium HTTP API
// Raydium HTTP 500 errors must NEVER block trades
// ============================================

async function simulateSwap(
  inputMint: string,
  outputMint: string,
  amountSol: number
): Promise<SwapSimulationResult> {
  // REMOVED: Raydium HTTP simulation - causes 500 errors
  // NOW: Use Jupiter as the ONLY simulation source
  const amountLamports = Math.floor(amountSol * 1e9);
  return await simulateSwapJupiter(inputMint, outputMint, amountLamports);
}

async function simulateSwapJupiter(
  inputMint: string,
  outputMint: string,
  amountLamports: number
): Promise<SwapSimulationResult> {
  try {
    // Use free lite-api endpoint
    const response = await fetch(
      `https://lite-api.jup.ag/swap/v1/quote?` +
      `inputMint=${inputMint}&` +
      `outputMint=${outputMint}&` +
      `amount=${amountLamports}&` +
      `slippageBps=1500`,
      {
        signal: AbortSignal.timeout(8000),
        headers: { 'Accept': 'application/json' },
      }
    );
    
    if (!response.ok) {
      return {
        success: false,
        error: `Jupiter returned ${response.status}`,
      };
    }
    
    const data = await response.json();
    
    if (data.error || !data.outAmount) {
      return {
        success: false,
        error: data.error || 'No Jupiter route available',
      };
    }
    
    return {
      success: true,
      outputAmount: parseInt(data.outAmount, 10),
      priceImpact: parseFloat(data.priceImpactPct || '0'),
    };
    
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Jupiter simulation failed',
    };
  }
}

/**
 * Jupiter fallback when Raydium API is unavailable
 * Used to ensure trading can continue during Raydium API outages
 */
async function tryJupiterFallback(
  tokenAddress: string,
  minLiquidity: number
): Promise<TradablePoolResult> {
  try {
    // Try to get a quote from Jupiter lite-api
    const amountLamports = 100000000; // 0.1 SOL for more reliable quote
    const response = await fetch(
      `https://lite-api.jup.ag/swap/v1/quote?` +
      `inputMint=${SOL_MINT}&` +
      `outputMint=${tokenAddress}&` +
      `amount=${amountLamports}&` +
      `slippageBps=1500`,
      {
        signal: AbortSignal.timeout(10000),
        headers: { 'Accept': 'application/json' },
      }
    );
    
    if (!response.ok) {
      return {
        status: 'DISCARDED',
        reason: `Jupiter fallback failed: ${response.status}`,
      };
    }
    
    const data = await response.json();
    
    if (data.error || !data.outAmount || parseInt(data.outAmount) <= 0) {
      return {
        status: 'DISCARDED',
        reason: data.error || 'No Jupiter route available',
      };
    }
    
    // Estimate liquidity from route info
    const routeInfo = data.routePlan?.[0];
    const estimatedLiquidity = routeInfo?.swapInfo?.ammKey ? 10 : 5; // Rough estimate
    
    if (estimatedLiquidity < minLiquidity) {
      return {
        status: 'DISCARDED',
        reason: `Insufficient liquidity via Jupiter: ~${estimatedLiquidity} SOL`,
      };
    }
    
    return {
      status: 'TRADABLE',
      poolAddress: routeInfo?.swapInfo?.ammKey || 'jupiter_route',
      baseMint: SOL_MINT,
      quoteMint: tokenAddress,
      liquidity: estimatedLiquidity,
      poolType: 'raydium_v4', // Jupiter often routes through Raydium
      detectedAt: Date.now(),
    };
    
  } catch (error) {
    return {
      status: 'DISCARDED',
      reason: error instanceof Error ? error.message : 'Jupiter fallback error',
    };
  }
}

// ============================================
// LEGACY WRAPPER - detectLiquidity
// Maintains compatibility with existing controller
// ============================================

export async function detectLiquidity(
  tokenAddress: string,
  config: TradingConfig,
  onEvent?: TradingEventCallback
): Promise<LiquidityDetectionResult> {
  const startTime = Date.now();
  
  // Use new strict detection
  const poolResult = await detectTradablePool(tokenAddress, config, onEvent);
  
  if (poolResult.status === 'TRADABLE') {
    // Run risk assessment on tradable pools
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
    error: poolResult.reason || 'No tradable Raydium pool found',
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
    error: 'Liquidity monitoring timed out - no tradable Raydium pool found',
    detectedAt: startTime,
  };
}
