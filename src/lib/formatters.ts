/**
 * Unified formatting utilities for P&L, percentages, and currency values
 * Use these throughout the app for consistent display
 */

/**
 * Format percentage value with consistent 2 decimal places and +/- sign
 * @param value - The percentage value
 * @param showSign - Whether to show +/- sign (default true)
 * @returns Formatted string like "+12.34%" or "-5.00%"
 */
export function formatPercentage(value: number | null | undefined, showSign = true): string {
  const num = value ?? 0;
  const sign = showSign && num >= 0 ? '+' : '';
  return `${sign}${num.toFixed(2)}%`;
}

/**
 * Format currency value with appropriate precision
 * Enhanced for accurate small value display in P&L
 * @param value - The dollar value
 * @param showSign - Whether to show +/- sign (default true)
 * @returns Formatted string like "+$12.34" or "-$5.00"
 */
export function formatCurrency(value: number | null | undefined, showSign = true): string {
  const num = value ?? 0;
  const sign = showSign && num >= 0 ? '+' : '';
  const absValue = Math.abs(num);
  
  if (absValue >= 1000000) {
    return `${sign}$${(num / 1000000).toFixed(2)}M`;
  }
  if (absValue >= 1000) {
    return `${sign}$${(num / 1000).toFixed(2)}K`;
  }
  if (absValue >= 100) {
    return `${sign}$${num.toFixed(2)}`;
  }
  if (absValue >= 1) {
    return `${sign}$${num.toFixed(3)}`;
  }
  if (absValue >= 0.01) {
    return `${sign}$${num.toFixed(4)}`;
  }
  if (absValue >= 0.001) {
    return `${sign}$${num.toFixed(5)}`;
  }
  if (absValue >= 0.0001) {
    return `${sign}$${num.toFixed(6)}`;
  }
  if (absValue > 0.0000001) {
    // Show up to 8 decimals for very small values
    return `${sign}$${num.toFixed(8)}`;
  }
  if (absValue > 0) {
    // Scientific notation for extremely small values
    return `${sign}$${num.toExponential(2)}`;
  }
  return showSign ? '+$0.00' : '$0.00';
}

/**
 * Format P&L dollar value, ensuring proper calculation if entry_value is missing
 * @param entryValue - The entry value (SOL invested)
 * @param profitLossPercent - The P&L percentage
 * @param fallbackEntryPrice - Fallback entry price if entry_value is null
 * @param amount - Token amount for fallback calculation
 * @returns The calculated P&L dollar value
 */
export function calculatePnLValue(
  entryValue: number | null | undefined,
  profitLossPercent: number | null | undefined,
  fallbackEntryPrice?: number | null,
  amount?: number | null
): number {
  const pnlPercent = profitLossPercent ?? 0;
  
  // Use entry_value if available
  if (entryValue && entryValue > 0) {
    return entryValue * (pnlPercent / 100);
  }
  
  // Fallback: calculate from entry_price * amount
  if (fallbackEntryPrice && amount && fallbackEntryPrice > 0 && amount > 0) {
    const calculatedEntryValue = fallbackEntryPrice * amount;
    return calculatedEntryValue * (pnlPercent / 100);
  }
  
  return 0;
}

/**
 * Format price with appropriate precision based on magnitude
 * Enhanced for high-precision display of small token prices
 * @param value - The price value
 * @returns Formatted string like "$0.00012345" or "$123.45"
 */
export function formatPrice(value: number | null | undefined): string {
  const num = value ?? 0;
  if (num === 0) return '$0.00';
  if (num < 0.0000001) return `$${num.toExponential(2)}`;
  if (num < 0.00001) return `$${num.toFixed(8)}`;
  if (num < 0.001) return `$${num.toFixed(6)}`;
  if (num < 0.01) return `$${num.toFixed(5)}`;
  if (num < 1) return `$${num.toFixed(4)}`;
  if (num < 100) return `$${num.toFixed(3)}`;
  return `$${num.toFixed(2)}`;
}

/**
 * Determine if P&L is positive for styling purposes
 * @param value - The P&L percentage or value
 * @returns true if value >= 0
 */
export function isPositivePnL(value: number | null | undefined): boolean {
  return (value ?? 0) >= 0;
}

/**
 * Get a short address format for display
 * @param address - The full address
 * @returns Short format like "4Abc...1Xyz"
 */
export function shortAddress(address: string | null | undefined): string {
  if (!address || address.length < 10) return address || 'TOKEN';
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/**
 * Check if a token name/symbol is a placeholder that should be replaced
 * @param value - The token name or symbol
 * @returns true if it's a placeholder
 */
export function isPlaceholderText(value: string | null | undefined): boolean {
  if (!value) return true;
  const v = value.trim();
  if (!v) return true;
  
  const lower = v.toLowerCase();
  
  // Check for common placeholder patterns
  if (/^(unknown|unknown token|token|\?\?\?|n\/a|null|undefined)$/i.test(lower)) return true;
  
  // Check if it starts with "Token " followed by address-like pattern (with regular dots, ellipsis, or any separator)
  if (/^token\s+[a-z0-9]{4}[….\-_][a-z0-9]{4}$/i.test(v)) return true;
  if (/^token\s+[a-z0-9]{4}/i.test(v) && v.length < 20) return true;
  
  // Check if it's just an address shorthand like "8Jx8…pump" or "27G8…idD4"
  if (/^[a-z0-9]{4}[….\-_][a-z0-9]{4}$/i.test(v)) return true;
  
  // Check if it looks like a Solana address (32-44 chars of base58)
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/i.test(v)) return true;
  
  // Check if it ends with common suffixes like "pump" after an ellipsis
  if (/^[a-z0-9]{2,6}[….\-_](pump|sol|token)$/i.test(v)) return true;
  
  return false;
}

/**
 * Get display name for a token, using actual name or fallback to formatted address
 * @param tokenName - The token name from database
 * @param tokenAddress - The token address for fallback
 * @returns The display name
 */
export function getTokenDisplayName(
  tokenName: string | null | undefined, 
  tokenAddress: string
): string {
  if (tokenName && !isPlaceholderText(tokenName)) {
    return tokenName;
  }
  return shortAddress(tokenAddress);
}

/**
 * Get display symbol for a token, using actual symbol or fallback to formatted address
 * @param tokenSymbol - The token symbol from database
 * @param tokenAddress - The token address for fallback
 * @returns The display symbol
 */
export function getTokenDisplaySymbol(
  tokenSymbol: string | null | undefined, 
  tokenAddress: string
): string {
  if (tokenSymbol && !isPlaceholderText(tokenSymbol)) {
    return tokenSymbol;
  }
  return shortAddress(tokenAddress);
}
