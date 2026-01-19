/**
 * Trading Engine Module
 * Modular 3-stage Solana sniping engine
 * 
 * Usage:
 * ```typescript
 * import { 
 *   runTradingFlow, 
 *   quickSnipe, 
 *   checkTokenStatus,
 *   createTradingConfig 
 * } from '@/lib/trading-engine';
 * 
 * // Quick snipe a token
 * const result = await quickSnipe('TokenAddress...', {
 *   walletAddress: 'YourWallet...',
 *   signTransaction: async (tx) => wallet.signAndSend(tx),
 *   config: { buyAmount: 0.5, slippage: 0.1 },
 * });
 * 
 * // Check token status without trading
 * const { liquidity, jupiterStatus } = await checkTokenStatus('TokenAddress...');
 * ```
 */

// Types
export type {
  // Configuration
  TradingConfig,
  RiskFilters,
  
  // Stage 1: Liquidity Detection
  LiquidityInfo,
  LiquidityDetectionResult,
  RiskAssessment,
  
  // Stage 2: Raydium Sniping
  RaydiumSnipeParams,
  RaydiumSnipeResult,
  
  // Stage 3: Jupiter Trading
  TradeMode,
  JupiterTradeParams,
  JupiterTradeResult,
  JupiterIndexStatus,
  
  // Controller
  TradingFlowResult,
  PositionInfo,
  
  // Events
  TradingEvent,
  TradingEventCallback,
  
  // Transactions
  UnsignedTransaction,
  SignedTransactionResult,
} from './types';

// Configuration
export {
  DEFAULT_TRADING_CONFIG,
  DEFAULT_RISK_FILTERS,
  createTradingConfig,
  validateConfig,
  SOL_MINT,
  USDC_MINT,
  API_ENDPOINTS,
  PROGRAM_IDS,
} from './config';

// Stage 1: Liquidity Detection
export {
  detectLiquidity,
  monitorLiquidity,
} from './liquidity-detector';

// Stage 2: Raydium Sniping
export {
  executeRaydiumSnipe,
  getRaydiumPrice,
  buildRaydiumSwapTransaction,
} from './raydium-sniper';

// Stage 3: Jupiter Trading
export {
  executeJupiterTrade,
  checkJupiterIndex,
  waitForJupiterIndex,
  getJupiterPrice,
  getJupiterRouteInfo,
} from './jupiter-trader';

// Controller (Main Entry Points)
export {
  runTradingFlow,
  quickSnipe,
  monitorAndSnipe,
  checkTokenStatus,
  executeExit,
} from './controller';
export type { TradingFlowOptions } from './controller';
