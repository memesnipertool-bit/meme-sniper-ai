/**
 * Trading Engine Configuration
 * Default settings and configuration management
 */

import type { TradingConfig, RiskFilters } from './types';

// Default risk filters
export const DEFAULT_RISK_FILTERS: RiskFilters = {
  checkRugPull: true,
  checkHoneypot: true,
  checkMintAuthority: true,
  checkFreezeAuthority: true,
  minHolders: 10,
  maxOwnershipPercent: 50,
};

// Default trading configuration - with fallback support
export const DEFAULT_TRADING_CONFIG: TradingConfig = {
  // Liquidity detection - balanced thresholds
  minLiquidity: 5, // 5 SOL minimum - allows new tokens while filtering dust
  maxRiskScore: 65, // Max 65/100 risk score - moderate filtering
  
  // Trading parameters
  buyAmount: 0.1, // 0.1 SOL default
  slippage: 0.15, // 15% slippage for new tokens
  priorityFee: 100000, // 0.0001 SOL priority fee
  
  // Retry configuration
  maxRetries: 3,
  retryDelayMs: 1000,
  
  // Polling configuration
  jupiterPollIntervalMs: 5000, // Poll every 5 seconds
  jupiterMaxPollAttempts: 60, // Poll for up to 5 minutes
  
  // Risk filters
  riskFilters: DEFAULT_RISK_FILTERS,
};

// SOL mint address
export const SOL_MINT = 'So11111111111111111111111111111111111111112';
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// API endpoints
export const API_ENDPOINTS = {
  // Jupiter
  jupiterQuote: 'https://quote-api.jup.ag/v6/quote',
  jupiterSwap: 'https://quote-api.jup.ag/v6/swap',
  jupiterPrice: 'https://price.jup.ag/v6/price',
  jupiterTokens: 'https://token.jup.ag/all',
  
  // Raydium
  raydiumSwap: 'https://api-v3.raydium.io/swap',
  raydiumPools: 'https://api-v3.raydium.io/pools/info/list',
  raydiumMint: 'https://api-v3.raydium.io/mint/price',
  
  // Pump.fun
  pumpFunTrade: 'https://pumpportal.fun/api/trade',
  pumpFunToken: 'https://frontend-api.pump.fun/coins',
  
  // Safety checks
  rugCheck: 'https://api.rugcheck.xyz/v1/tokens',
  
  // Token info
  dexScreener: 'https://api.dexscreener.com/latest/dex/tokens',
};

// Pool detection program IDs
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
