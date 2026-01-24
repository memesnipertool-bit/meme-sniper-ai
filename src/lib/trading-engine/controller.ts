/**
 * Trading Flow Controller
 * Orchestrates the 3-stage trading process
 */

import type {
  TradingConfig,
  TradingFlowResult,
  PositionInfo,
  LiquidityDetectionResult,
  RaydiumSnipeResult,
  JupiterIndexStatus,
  UnsignedTransaction,
  TradingEventCallback,
} from './types';
import { DEFAULT_TRADING_CONFIG, createTradingConfig, validateConfig } from './config';
import { detectLiquidity, monitorLiquidity } from './liquidity-detector';
import { executeRaydiumSnipe } from './raydium-sniper';
import { waitForJupiterIndex, executeJupiterTrade, checkJupiterIndex } from './jupiter-trader';

export interface TradingFlowOptions {
  config?: Partial<TradingConfig>;
  walletAddress: string;
  signTransaction: (tx: UnsignedTransaction) => Promise<{ signature: string; error?: string }>;
  onEvent?: TradingEventCallback;
  
  // Flow control
  skipLiquidityCheck?: boolean; // Skip if already verified
  monitorLiquidity?: boolean; // Wait for liquidity if not found
  monitorTimeoutMs?: number; // Timeout for liquidity monitoring
  executeSnipe?: boolean; // Whether to execute the snipe
  waitForJupiter?: boolean; // Whether to poll for Jupiter indexing
  abortSignal?: AbortSignal; // For cancellation
}

/**
 * Run the complete trading flow
 * Stage 1: Detect liquidity → Stage 2: Snipe → Stage 3: Enable Jupiter
 */
export async function runTradingFlow(
  tokenAddress: string,
  options: TradingFlowOptions
): Promise<TradingFlowResult> {
  const startTime = Date.now();
  const config = createTradingConfig(options.config);
  
  // Validate configuration
  const validation = validateConfig(config);
  if (!validation.valid) {
    return {
      status: 'FAILED',
      stages: {
        liquidityDetection: null,
        raydiumSnipe: null,
        jupiterReady: false,
      },
      position: null,
      error: `Invalid configuration: ${validation.errors.join(', ')}`,
      startedAt: startTime,
      completedAt: Date.now(),
    };
  }
  
  let liquidityResult: LiquidityDetectionResult | null = null;
  let snipeResult: RaydiumSnipeResult | null = null;
  let jupiterReady = false;
  let position: PositionInfo | null = null;
  
  try {
    // Check for abort
    if (options.abortSignal?.aborted) {
      return createAbortedResult(startTime, liquidityResult, snipeResult, jupiterReady);
    }
    
    // ==========================================
    // STAGE 1: LIQUIDITY DETECTION
    // ==========================================
    
    if (!options.skipLiquidityCheck) {
      if (options.monitorLiquidity) {
        // Wait for liquidity to appear
        liquidityResult = await monitorLiquidity(
          tokenAddress,
          config,
          options.monitorTimeoutMs || 300000,
          options.onEvent
        );
      } else {
        // Single check
        liquidityResult = await detectLiquidity(tokenAddress, config, options.onEvent);
      }
      
      // Check if liquidity detection passed
      if (liquidityResult.status !== 'LP_READY') {
        return {
          status: 'FAILED',
          stages: {
            liquidityDetection: liquidityResult,
            raydiumSnipe: null,
            jupiterReady: false,
          },
          position: null,
          error: liquidityResult.error || 'Liquidity detection failed',
          startedAt: startTime,
          completedAt: Date.now(),
        };
      }
    }
    
    // Check for abort
    if (options.abortSignal?.aborted) {
      return createAbortedResult(startTime, liquidityResult, snipeResult, jupiterReady);
    }
    
    // ==========================================
    // STAGE 2: RAYDIUM SNIPE
    // ==========================================
    
    if (options.executeSnipe && liquidityResult?.liquidityInfo) {
      try {
        snipeResult = await executeRaydiumSnipe(
          {
            liquidityInfo: liquidityResult.liquidityInfo,
            buyAmount: config.buyAmount,
            slippage: config.slippage,
            priorityFee: config.priorityFee,
          },
          options.walletAddress,
          options.signTransaction,
          config,
          options.onEvent
        );
        
        // Check if snipe succeeded
        if (snipeResult.status === 'SNIPED' && snipeResult.txHash) {
          position = {
            tokenAddress,
            tokenSymbol: liquidityResult.liquidityInfo.tokenSymbol,
            tokenName: liquidityResult.liquidityInfo.tokenName,
            entryPrice: snipeResult.entryPrice || 0,
            tokenAmount: snipeResult.tokenAmount || 0,
            solSpent: snipeResult.solSpent || 0,
            entryTxHash: snipeResult.txHash,
            status: 'OPEN',
            jupiterEnabled: false,
          };
        } else {
          // Snipe failed but not fatal - continue to check Jupiter
          options.onEvent?.({
            type: 'ERROR',
            data: { stage: 'raydium_snipe', error: snipeResult.error || 'Snipe failed' },
          });
        }
      } catch (snipeError) {
        const errorMsg = snipeError instanceof Error ? snipeError.message : 'Snipe execution failed';
        options.onEvent?.({
          type: 'ERROR',
          data: { stage: 'raydium_snipe', error: errorMsg },
        });
        snipeResult = {
          status: 'FAILED',
          txHash: null,
          entryPrice: null,
          tokenAmount: null,
          solSpent: null,
          error: errorMsg,
          attempts: 1,
          snipedAt: Date.now(),
        };
      }
    }
    
    // Check for abort
    if (options.abortSignal?.aborted) {
      return createAbortedResult(startTime, liquidityResult, snipeResult, jupiterReady);
    }
    
    // ==========================================
    // STAGE 3: JUPITER AVAILABILITY
    // ==========================================
    
    if (options.waitForJupiter) {
      const jupiterStatus = await waitForJupiterIndex(tokenAddress, config, options.onEvent);
      jupiterReady = jupiterStatus.isIndexed && jupiterStatus.hasRoutes;
      
      if (position) {
        position.jupiterEnabled = jupiterReady;
      }
    } else {
      // Just check current status
      const jupiterStatus = await checkJupiterIndex(tokenAddress);
      jupiterReady = jupiterStatus.isIndexed && jupiterStatus.hasRoutes;
      
      if (position) {
        position.jupiterEnabled = jupiterReady;
      }
    }
    
    // Determine overall status
    const status = determineFlowStatus(liquidityResult, snipeResult, options.executeSnipe);
    
    const result: TradingFlowResult = {
      status,
      stages: {
        liquidityDetection: liquidityResult,
        raydiumSnipe: snipeResult,
        jupiterReady,
      },
      position,
      startedAt: startTime,
      completedAt: Date.now(),
    };
    
    options.onEvent?.({ type: 'FLOW_COMPLETE', data: result });
    
    return result;
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    options.onEvent?.({
      type: 'ERROR',
      data: { stage: 'controller', error: errorMessage },
    });
    
    return {
      status: 'FAILED',
      stages: {
        liquidityDetection: liquidityResult,
        raydiumSnipe: snipeResult,
        jupiterReady,
      },
      position,
      error: errorMessage,
      startedAt: startTime,
      completedAt: Date.now(),
    };
  }
}

/**
 * Quick snipe - skip monitoring, execute immediately if liquidity exists
 */
export async function quickSnipe(
  tokenAddress: string,
  options: Omit<TradingFlowOptions, 'monitorLiquidity' | 'executeSnipe'>
): Promise<TradingFlowResult> {
  return runTradingFlow(tokenAddress, {
    ...options,
    monitorLiquidity: false,
    executeSnipe: true,
    waitForJupiter: false,
  });
}

/**
 * Monitor and snipe - wait for liquidity then execute
 */
export async function monitorAndSnipe(
  tokenAddress: string,
  timeoutMs: number,
  options: Omit<TradingFlowOptions, 'monitorLiquidity' | 'monitorTimeoutMs' | 'executeSnipe'>
): Promise<TradingFlowResult> {
  return runTradingFlow(tokenAddress, {
    ...options,
    monitorLiquidity: true,
    monitorTimeoutMs: timeoutMs,
    executeSnipe: true,
    waitForJupiter: true,
  });
}

/**
 * Check only - no execution, just gather information
 */
export async function checkTokenStatus(
  tokenAddress: string,
  config?: Partial<TradingConfig>,
  onEvent?: TradingEventCallback
): Promise<{
  liquidity: LiquidityDetectionResult;
  jupiterStatus: JupiterIndexStatus;
}> {
  const fullConfig = createTradingConfig(config);
  
  const [liquidity, jupiterStatus] = await Promise.all([
    detectLiquidity(tokenAddress, fullConfig, onEvent),
    checkJupiterIndex(tokenAddress),
  ]);
  
  return { liquidity, jupiterStatus };
}

/**
 * Execute exit trade via Jupiter
 */
export async function executeExit(
  tokenAddress: string,
  tokenAmount: number,
  options: Pick<TradingFlowOptions, 'config' | 'walletAddress' | 'signTransaction' | 'onEvent'>
): Promise<{
  success: boolean;
  txHash: string | null;
  solReceived: number | null;
  error?: string;
}> {
  const config = createTradingConfig(options.config);
  
  const result = await executeJupiterTrade(
    {
      tokenAddress,
      mode: 'SELL',
      amount: tokenAmount,
      slippage: config.slippage,
      priorityFee: config.priorityFee,
    },
    options.walletAddress,
    options.signTransaction,
    config,
    options.onEvent
  );
  
  return {
    success: result.status === 'TRADE_COMPLETE',
    txHash: result.txHash,
    solReceived: result.outputAmount,
    error: result.error,
  };
}

// Helper functions

function createAbortedResult(
  startTime: number,
  liquidityResult: LiquidityDetectionResult | null,
  snipeResult: RaydiumSnipeResult | null,
  jupiterReady: boolean
): TradingFlowResult {
  return {
    status: 'ABORTED',
    stages: {
      liquidityDetection: liquidityResult,
      raydiumSnipe: snipeResult,
      jupiterReady,
    },
    position: null,
    error: 'Flow aborted by user',
    startedAt: startTime,
    completedAt: Date.now(),
  };
}

function determineFlowStatus(
  liquidityResult: LiquidityDetectionResult | null,
  snipeResult: RaydiumSnipeResult | null,
  executeSnipe?: boolean
): TradingFlowResult['status'] {
  // If we weren't supposed to snipe, success is based on liquidity detection
  if (!executeSnipe) {
    return liquidityResult?.status === 'LP_READY' ? 'SUCCESS' : 'FAILED';
  }
  
  // If snipe was requested
  if (snipeResult?.status === 'SNIPED') {
    return 'SUCCESS';
  }
  
  // Partial success if liquidity was found but snipe failed
  if (liquidityResult?.status === 'LP_READY' && snipeResult) {
    return 'PARTIAL';
  }
  
  return 'FAILED';
}
