/**
 * Validation utilities for form inputs and trading parameters
 */

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

// Trading parameter constraints
export const TRADING_LIMITS = {
  MIN_LIQUIDITY: { min: 10, max: 100000, default: 300 },
  TRADE_AMOUNT: { min: 0.001, max: 10, default: 0.1 }, // Updated: Min 0.001 SOL, Max 10 SOL
  TAKE_PROFIT: { min: 5, max: 1000, default: 100 },
  STOP_LOSS: { min: 1, max: 95, default: 20 },
  MAX_CONCURRENT_TRADES: { min: 1, max: 20, default: 3 },
} as const;

/**
 * Validate a number is within range
 */
export function validateRange(
  value: number,
  min: number,
  max: number,
  fieldName: string
): ValidationResult {
  if (typeof value !== 'number' || isNaN(value)) {
    return { isValid: false, error: `${fieldName} must be a valid number` };
  }
  if (value < min) {
    return { isValid: false, error: `${fieldName} must be at least ${min}` };
  }
  if (value > max) {
    return { isValid: false, error: `${fieldName} must be at most ${max}` };
  }
  return { isValid: true };
}

/**
 * Validate minimum liquidity setting
 */
export function validateMinLiquidity(value: number): ValidationResult {
  return validateRange(
    value,
    TRADING_LIMITS.MIN_LIQUIDITY.min,
    TRADING_LIMITS.MIN_LIQUIDITY.max,
    'Minimum liquidity'
  );
}

/**
 * Validate trade amount
 */
export function validateTradeAmount(value: number): ValidationResult {
  return validateRange(
    value,
    TRADING_LIMITS.TRADE_AMOUNT.min,
    TRADING_LIMITS.TRADE_AMOUNT.max,
    'Trade amount'
  );
}

/**
 * Validate take profit percentage
 */
export function validateTakeProfit(value: number): ValidationResult {
  return validateRange(
    value,
    TRADING_LIMITS.TAKE_PROFIT.min,
    TRADING_LIMITS.TAKE_PROFIT.max,
    'Take profit'
  );
}

/**
 * Validate stop loss percentage
 */
export function validateStopLoss(value: number): ValidationResult {
  return validateRange(
    value,
    TRADING_LIMITS.STOP_LOSS.min,
    TRADING_LIMITS.STOP_LOSS.max,
    'Stop loss'
  );
}

/**
 * Validate all sniper settings
 */
export function validateSniperSettings(settings: {
  min_liquidity: number;
  trade_amount: number;
  profit_take_percentage: number;
  stop_loss_percentage: number;
  max_concurrent_trades: number;
}): ValidationResult {
  const validations = [
    validateMinLiquidity(settings.min_liquidity),
    validateTradeAmount(settings.trade_amount),
    validateTakeProfit(settings.profit_take_percentage),
    validateStopLoss(settings.stop_loss_percentage),
    validateRange(
      settings.max_concurrent_trades,
      TRADING_LIMITS.MAX_CONCURRENT_TRADES.min,
      TRADING_LIMITS.MAX_CONCURRENT_TRADES.max,
      'Max concurrent trades'
    ),
  ];

  const firstError = validations.find((v) => !v.isValid);
  if (firstError) {
    return firstError;
  }

  return { isValid: true };
}

/**
 * Validate wallet address format (basic check)
 */
export function validateWalletAddress(address: string): ValidationResult {
  if (!address || typeof address !== 'string') {
    return { isValid: false, error: 'Wallet address is required' };
  }
  
  // Solana addresses are base58 encoded, typically 32-44 characters
  if (address.length < 32 || address.length > 44) {
    return { isValid: false, error: 'Invalid wallet address format' };
  }
  
  // Basic base58 character check
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
  if (!base58Regex.test(address)) {
    return { isValid: false, error: 'Invalid wallet address characters' };
  }
  
  return { isValid: true };
}

/**
 * Clamp a number to a valid range
 */
export function clampValue(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Sanitize a string input (remove dangerous characters)
 */
export function sanitizeString(input: string): string {
  if (!input) return '';
  return input
    .trim()
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/[<>'"]/g, ''); // Remove potentially dangerous characters
}
