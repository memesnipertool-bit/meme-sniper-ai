/**
 * Trading Engine Type Definitions
 * Modular 3-stage Solana sniping engine
 */

// Configuration types
export interface TradingConfig {
  // Liquidity detection
  minLiquidity: number; // Minimum liquidity in SOL
  maxRiskScore: number; // Maximum acceptable risk score (0-100)
  
  // Trading parameters
  buyAmount: number; // Amount in SOL to spend
  slippage: number; // Slippage tolerance (e.g., 0.05 for 5%)
  priorityFee: number; // Priority fee in lamports
  
  // Retry configuration
  maxRetries: number;
  retryDelayMs: number;
  
  // Polling configuration
  jupiterPollIntervalMs: number;
  jupiterMaxPollAttempts: number;
  
  // Risk filters
  riskFilters: RiskFilters;
}

export interface RiskFilters {
  checkRugPull: boolean;
  checkHoneypot: boolean;
  checkMintAuthority: boolean;
  checkFreezeAuthority: boolean;
  minHolders: number;
  maxOwnershipPercent: number;
}

// Stage 1: Liquidity Detection
export interface LiquidityInfo {
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  poolAddress: string;
  poolType: 'pump_fun' | 'raydium' | 'orca' | 'unknown';
  baseMint: string; // SOL or USDC
  quoteMint: string; // The token
  liquidityAmount: number; // In SOL equivalent
  lpTokenMint: string | null;
  timestamp: number;
  blockHeight: number;
}

export interface LiquidityDetectionResult {
  status: 'LP_READY' | 'LP_INSUFFICIENT' | 'LP_NOT_FOUND' | 'RISK_FAILED' | 'ERROR';
  liquidityInfo: LiquidityInfo | null;
  riskAssessment: RiskAssessment | null;
  error?: string;
  detectedAt: number;
}

export interface RiskAssessment {
  overallScore: number; // 0-100, lower is safer
  isRugPull: boolean;
  isHoneypot: boolean;
  hasMintAuthority: boolean;
  hasFreezeAuthority: boolean;
  holderCount: number;
  topHolderPercent: number;
  passed: boolean;
  reasons: string[];
}

// Stage 2: Raydium Sniping
export interface RaydiumSnipeParams {
  liquidityInfo: LiquidityInfo;
  buyAmount: number;
  slippage: number;
  priorityFee: number;
}

export interface RaydiumSnipeResult {
  status: 'SNIPED' | 'FAILED' | 'TIMEOUT' | 'INSUFFICIENT_BALANCE' | 'ERROR';
  txHash: string | null;
  entryPrice: number | null;
  tokenAmount: number | null;
  solSpent: number | null;
  attempts: number;
  error?: string;
  snipedAt: number;
}

// Stage 3: Jupiter Trading
export type TradeMode = 'BUY' | 'SELL';

export interface JupiterTradeParams {
  tokenAddress: string;
  mode: TradeMode;
  amount: number; // SOL for BUY, token amount for SELL
  slippage: number;
  priorityFee: number;
}

export interface JupiterTradeResult {
  status: 'TRADE_COMPLETE' | 'TOKEN_NOT_INDEXED' | 'NO_ROUTE' | 'FAILED' | 'ERROR';
  txHash: string | null;
  price: number | null;
  inputAmount: number | null;
  outputAmount: number | null;
  priceImpact: number | null;
  route: string | null;
  error?: string;
  tradedAt: number;
}

export interface JupiterIndexStatus {
  isIndexed: boolean;
  hasRoutes: boolean;
  availableDexes: string[];
  bestPrice: number | null;
}

// Controller types
export interface TradingFlowResult {
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'ABORTED';
  stages: {
    liquidityDetection: LiquidityDetectionResult | null;
    raydiumSnipe: RaydiumSnipeResult | null;
    jupiterReady: boolean;
  };
  position: PositionInfo | null;
  error?: string;
  startedAt: number;
  completedAt: number;
}

export interface PositionInfo {
  tokenAddress: string;
  tokenSymbol: string;
  entryPrice: number;
  tokenAmount: number;
  solSpent: number;
  entryTxHash: string;
  status: 'OPEN' | 'CLOSED' | 'PENDING_EXIT';
  jupiterEnabled: boolean;
}

// Event types for callbacks
export type TradingEvent = 
  | { type: 'LIQUIDITY_DETECTED'; data: LiquidityInfo }
  | { type: 'RISK_CHECK_PASSED'; data: RiskAssessment }
  | { type: 'RISK_CHECK_FAILED'; data: RiskAssessment }
  | { type: 'SNIPE_STARTED'; data: { tokenAddress: string } }
  | { type: 'SNIPE_SUCCESS'; data: RaydiumSnipeResult }
  | { type: 'SNIPE_FAILED'; data: { error: string; attempts: number } }
  | { type: 'JUPITER_POLLING'; data: { attempt: number; maxAttempts: number } }
  | { type: 'JUPITER_READY'; data: JupiterIndexStatus }
  | { type: 'TRADE_EXECUTED'; data: JupiterTradeResult }
  | { type: 'FLOW_COMPLETE'; data: TradingFlowResult }
  | { type: 'ERROR'; data: { stage: string; error: string } };

export type TradingEventCallback = (event: TradingEvent) => void;

// Transaction building types (for signing externally)
export interface UnsignedTransaction {
  serializedTransaction: string; // Base64 encoded
  blockhash: string;
  lastValidBlockHeight: number;
  feePayer: string;
}

export interface SignedTransactionResult {
  signature: string;
  confirmed: boolean;
  slot?: number;
  error?: string;
}
