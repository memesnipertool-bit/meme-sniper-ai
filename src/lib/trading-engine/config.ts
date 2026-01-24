/**
 * Trading Engine Configuration
 * Default settings and configuration management
 * 
 * RPC-ONLY execution - No Raydium HTTP API
 * 
 * IMPORTANT: These are SYSTEM DEFAULTS, not user settings!
 * User-configurable values should come from useSniperSettings.
 * These defaults are used only when user settings are not available.
 */

import type { TradingConfig, RiskFilters } from './types';

// Default risk filters - SYSTEM DEFAULTS (can be overridden by user settings)
export const DEFAULT_RISK_FILTERS: RiskFilters = {
  checkRugPull: true,
  checkHoneypot: true,
  checkMintAuthority: true,
  checkFreezeAuthority: true,
  minHolders: 5, // Minimum holders before trading
  maxOwnershipPercent: 50, // Max single holder ownership
};

/**
 * Default trading configuration - SYSTEM DEFAULTS
 * 
 * User-configurable settings should be passed from useSniperSettings:
 * - buyAmount -> settings.trade_amount
 * - slippage -> settings.slippage_tolerance / 100
 * - profitTakePercent -> settings.profit_take_percentage
 * - stopLossPercent -> settings.stop_loss_percentage
 * - minLiquidity -> settings.min_liquidity
 */
export const DEFAULT_TRADING_CONFIG: TradingConfig = {
  // Liquidity detection - user-configurable via settings
  minLiquidity: 300, // 300 SOL minimum (override with settings.min_liquidity)
  maxRiskScore: 70, // Max 70/100 risk score (override with settings.max_risk_score)
  
  // Trading parameters - user-configurable via settings
  buyAmount: 0.1, // 0.1 SOL default (override with settings.trade_amount)
  slippage: 0.15, // 15% slippage (override with settings.slippage_tolerance / 100)
  priorityFee: 100000, // 0.0001 SOL (override based on settings.priority)
  
  // Retry configuration - SYSTEM LIMITS (not user-configurable)
  maxRetries: 2, // Max retry attempts
  retryDelayMs: 800, // ~2 blocks between retries
  
  // Polling configuration - SYSTEM LIMITS (not user-configurable)
  jupiterPollIntervalMs: 5000, // Poll every 5 seconds
  jupiterMaxPollAttempts: 60, // Poll for up to 5 minutes
  
  // Risk filters - SYSTEM DEFAULTS
  riskFilters: DEFAULT_RISK_FILTERS,
  
  // Skip risk check (false by default - manual trades should check)
  skipRiskCheck: false,
  
  // Position management - user-configurable via settings
  profitTakePercent: 100, // 100% TP default (override with settings.profit_take_percentage)
  stopLossPercent: 20, // 20% SL default (override with settings.stop_loss_percentage)
};

// SOL mint address
export const SOL_MINT = 'So11111111111111111111111111111111111111112';
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// API endpoints - JUPITER ONLY for trading
// Raydium HTTP APIs have been REMOVED
export const API_ENDPOINTS = {
  // Jupiter - using free lite-api (no API key required)
  jupiterQuote: 'https://lite-api.jup.ag/swap/v1/quote',
  jupiterSwap: 'https://lite-api.jup.ag/swap/v1/swap',
  jupiterPrice: 'https://lite-api.jup.ag/price/v3',
  jupiterTokens: 'https://tokens.jup.ag/tokens?tags=verified',
  
  // Pump.fun
  pumpFunTrade: 'https://pumpportal.fun/api/trade',
  pumpFunToken: 'https://frontend-api.pump.fun/coins',
  
  // Safety checks
  rugCheck: 'https://api.rugcheck.xyz/v1/tokens',
  
  // Token info (enrichment only)
  dexScreener: 'https://api.dexscreener.com/latest/dex/tokens',
};

// Pool detection program IDs (for RPC validation)
export const PROGRAM_IDS = {
  pumpFun: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
  raydiumAmm: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
  raydiumClmm: 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK',
  orca: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
};

/**
 * Create a trading config with custom overrides
 */
export function createTradingConfig(
  overrides: Partial<TradingConfig> = {}
): TradingConfig {
  return {
    ...DEFAULT_TRADING_CONFIG,
    ...overrides,
    riskFilters: {
      ...DEFAULT_TRADING_CONFIG.riskFilters,
      ...overrides.riskFilters,
    },
  };
}

/**
 * Validate trading configuration
 */
export function validateConfig(config: TradingConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (config.minLiquidity < 0) {
    errors.push('minLiquidity must be non-negative');
  }
  
  if (config.maxRiskScore < 0 || config.maxRiskScore > 100) {
    errors.push('maxRiskScore must be between 0 and 100');
  }
  
  if (config.buyAmount <= 0) {
    errors.push('buyAmount must be positive');
  }
  
  if (config.slippage < 0 || config.slippage > 1) {
    errors.push('slippage must be between 0 and 1');
  }
  
  if (config.priorityFee < 0) {
    errors.push('priorityFee must be non-negative');
  }
  
  if (config.maxRetries < 1) {
    errors.push('maxRetries must be at least 1');
  }
  
  if (config.jupiterPollIntervalMs < 1000) {
    errors.push('jupiterPollIntervalMs must be at least 1000ms');
  }
  
  return { valid: errors.length === 0, errors };
}
