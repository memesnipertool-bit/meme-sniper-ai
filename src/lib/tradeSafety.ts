/**
 * Trade Safety Module
 * Handles pre-trade validation, dynamic slippage, and honeypot detection
 */

// Position statuses used across the application
export type PositionStatus = 
  | 'open'
  | 'closed'
  | 'pending'
  | 'waiting_for_liquidity'
  | 'swap_failed';

// Safety check result types
export type SafetyCheckResult = 
  | { safe: true; warnings: string[] }
  | { safe: false; reason: SafetyBlockReason; message: string };

export type SafetyBlockReason = 
  | 'ILLIQUID'        // No swap route exists
  | 'HONEYPOT'        // Sell simulation failed or high sell tax
  | 'HIGH_TAX'        // Sell tax >= 50%
  | 'FREEZE_AUTHORITY' // Token can be frozen
  | 'NO_ROUTE'        // No Jupiter or Raydium route

// Trade warning types for UI display
export interface TradeWarning {
  type: 'illiquid' | 'honeypot_suspected' | 'slippage_retry' | 'high_impact' | 'low_liquidity';
  message: string;
  severity: 'warning' | 'error' | 'info';
}

// Slippage configuration based on conditions
export interface DynamicSlippageResult {
  slippageBps: number;
  reason: string;
}

// Liquidity check result
export interface LiquidityCheckResult {
  hasRoute: boolean;
  source: 'jupiter' | 'raydium' | 'pumpfun' | 'none';
  priceImpact?: number;
  liquidity?: number;
  error?: string;
}

// Sell simulation result
export interface SellSimulationResult {
  canSell: boolean;
  estimatedTax?: number;
  priceImpact?: number;
  error?: string;
}

// Pre-buy validation result
export interface PreBuyValidationResult {
  approved: boolean;
  liquidityCheck: LiquidityCheckResult;
  sellSimulation?: SellSimulationResult;
  warnings: TradeWarning[];
  blockReason?: SafetyBlockReason;
  blockMessage?: string;
}

// Constants
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const SELL_TAX_THRESHOLD = 50; // Block if >= 50%
const LOW_LIQUIDITY_THRESHOLD = 1000; // $1000 USD
const HIGH_PRICE_IMPACT_THRESHOLD = 5; // 5%
const VERY_HIGH_PRICE_IMPACT_THRESHOLD = 10; // 10%

/**
 * Calculate dynamic slippage based on liquidity and price impact
 */
export function calculateDynamicSlippage(params: {
  liquidity?: number;
  priceImpact?: number;
  isSell?: boolean;
  isRetry?: boolean;
  retryCount?: number;
}): DynamicSlippageResult {
  const { liquidity, priceImpact = 0, isSell = false, isRetry = false, retryCount = 0 } = params;
  
  let baseBps = isSell ? 150 : 100; // Higher base for sells
  let reason = 'Default slippage';
  
  // Adjust for liquidity
  if (liquidity !== undefined) {
    if (liquidity < 500) {
      baseBps = Math.max(baseBps, 2000); // 20% for very low liquidity
      reason = 'Very low liquidity (<$500)';
    } else if (liquidity < LOW_LIQUIDITY_THRESHOLD) {
      baseBps = Math.max(baseBps, 1500); // 15% for low liquidity
      reason = 'Low liquidity (<$1000)';
    } else if (liquidity < 5000) {
      baseBps = Math.max(baseBps, 1000); // 10% for moderate liquidity
      reason = 'Moderate liquidity (<$5000)';
    } else if (liquidity < 10000) {
      baseBps = Math.max(baseBps, 500); // 5% for decent liquidity
      reason = 'Decent liquidity (<$10000)';
    }
  }
  
  // Adjust for price impact
  if (priceImpact >= VERY_HIGH_PRICE_IMPACT_THRESHOLD) {
    baseBps = Math.max(baseBps, 2000); // 20% for very high impact
    reason = `Very high price impact (${priceImpact.toFixed(1)}%)`;
  } else if (priceImpact >= HIGH_PRICE_IMPACT_THRESHOLD) {
    baseBps = Math.max(baseBps, 1500); // 15% for high impact
    reason = `High price impact (${priceImpact.toFixed(1)}%)`;
  }
  
  // Increase on retry (for slippage errors)
  if (isRetry && retryCount > 0) {
    const retryMultiplier = 1 + (retryCount * 0.5); // 50% increase per retry
    baseBps = Math.min(Math.floor(baseBps * retryMultiplier), 5000); // Cap at 50%
    reason = `Retry ${retryCount}: Increased slippage`;
  }
  
  return { slippageBps: baseBps, reason };
}

/**
 * Check if a slippage error is retryable
 */
export function isSlippageError(error: string): boolean {
  const slippagePatterns = [
    'Custom:6024',           // Jupiter slippage error
    'slippage tolerance',
    'SlippageToleranceExceeded',
    'ExceededSlippageTolerance',
    'Slippage exceeded',
    '0x1771',               // Raydium slippage error
  ];
  
  return slippagePatterns.some(pattern => 
    error.toLowerCase().includes(pattern.toLowerCase())
  );
}

/**
 * Check if an error indicates no route available
 */
export function isNoRouteError(error: string): boolean {
  const noRoutePatterns = [
    'NO_ROUTE',
    'No route',
    'ROUTE_NOT_FOUND',
    'No routes found',
    'insufficient liquidity',
    'not tradeable',
    'TOKEN_NOT_TRADABLE',
  ];
  
  return noRoutePatterns.some(pattern => 
    error.toLowerCase().includes(pattern.toLowerCase())
  );
}

/**
 * Get position status badge info for UI
 */
export function getPositionStatusBadge(status: string): {
  label: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  className?: string;
} {
  switch (status) {
    case 'open':
      return { label: 'Open', variant: 'default', className: 'bg-success/20 text-success' };
    case 'closed':
      return { label: 'Closed', variant: 'secondary' };
    case 'pending':
      return { label: 'Pending', variant: 'outline', className: 'bg-warning/20 text-warning' };
    case 'waiting_for_liquidity':
      return { label: 'Illiquid', variant: 'destructive', className: 'bg-orange-500/20 text-orange-400' };
    case 'swap_failed':
      return { label: 'Swap Failed', variant: 'destructive' };
    default:
      return { label: status, variant: 'outline' };
  }
}

/**
 * Get warning badge info for UI
 */
export function getWarningBadge(warning: TradeWarning): {
  icon: string;
  className: string;
} {
  switch (warning.type) {
    case 'illiquid':
      return { icon: '💧', className: 'text-orange-400' };
    case 'honeypot_suspected':
      return { icon: '🍯', className: 'text-red-400' };
    case 'slippage_retry':
      return { icon: '🔄', className: 'text-yellow-400' };
    case 'high_impact':
      return { icon: '📉', className: 'text-amber-400' };
    case 'low_liquidity':
      return { icon: '⚠️', className: 'text-orange-400' };
    default:
      return { icon: '⚠️', className: 'text-muted-foreground' };
  }
}

/**
 * Create warning from trade conditions
 */
export function createTradeWarnings(params: {
  priceImpact?: number;
  liquidity?: number;
  hasRoute: boolean;
  sellSimulationFailed?: boolean;
  isRetrying?: boolean;
}): TradeWarning[] {
  const warnings: TradeWarning[] = [];
  
  if (!params.hasRoute) {
    warnings.push({
      type: 'illiquid',
      message: 'No swap route available - token may be illiquid',
      severity: 'error',
    });
  }
  
  if (params.sellSimulationFailed) {
    warnings.push({
      type: 'honeypot_suspected',
      message: 'Sell simulation failed - possible honeypot',
      severity: 'error',
    });
  }
  
  if (params.priceImpact !== undefined && params.priceImpact >= HIGH_PRICE_IMPACT_THRESHOLD) {
    warnings.push({
      type: 'high_impact',
      message: `High price impact: ${params.priceImpact.toFixed(1)}%`,
      severity: params.priceImpact >= VERY_HIGH_PRICE_IMPACT_THRESHOLD ? 'error' : 'warning',
    });
  }
  
  if (params.liquidity !== undefined && params.liquidity < LOW_LIQUIDITY_THRESHOLD) {
    warnings.push({
      type: 'low_liquidity',
      message: `Low liquidity: $${params.liquidity.toFixed(0)}`,
      severity: params.liquidity < 500 ? 'error' : 'warning',
    });
  }
  
  if (params.isRetrying) {
    warnings.push({
      type: 'slippage_retry',
      message: 'Retrying with higher slippage...',
      severity: 'info',
    });
  }
  
  return warnings;
}

/**
 * Retry configuration for slippage errors
 */
export const SLIPPAGE_RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 500,
  maxDelayMs: 2000,
};

/**
 * Calculate retry delay with exponential backoff
 */
export function getRetryDelay(attempt: number): number {
  const delay = SLIPPAGE_RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt);
  return Math.min(delay, SLIPPAGE_RETRY_CONFIG.maxDelayMs);
}
