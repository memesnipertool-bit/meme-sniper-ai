/**
 * Route Validator
 * Pre-trade validation that ensures a swap route exists on Jupiter OR Raydium
 * before any trade decision is made.
 * Also detects tokens awaiting indexing on DEX aggregators.
 */

import { fetchJupiterQuote } from './jupiterQuote';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const DEFAULT_TIMEOUT_MS = 8000;

// Common responses indicating token is not yet indexed
const INDEXING_ERROR_PATTERNS = [
  'token not found',
  'not indexed',
  'unknown token',
  'token does not exist',
  'unrecognized token',
  'awaiting indexing',
  'not supported',
  'invalid mint',
];

export interface RouteValidationResult {
  hasRoute: boolean;
  jupiter: boolean;
  raydium: boolean;
  source: 'jupiter' | 'raydium' | 'none';
  isAwaitingIndexing: boolean;
  error?: string;
}

/**
 * Check if error message indicates token is awaiting indexing
 */
function isIndexingError(errorMsg: string): boolean {
  if (!errorMsg) return false;
  const lowerError = errorMsg.toLowerCase();
  return INDEXING_ERROR_PATTERNS.some(pattern => lowerError.includes(pattern));
}

interface RouteCheckResult {
  hasRoute: boolean;
  isAwaitingIndexing: boolean;
  error?: string;
}

/**
 * Check if a valid swap route exists on Raydium
 */
async function checkRaydiumRoute(
  tokenMint: string,
  amount: string = '1000000', // 0.001 SOL in lamports
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<RouteCheckResult> {
  try {
    const url = `https://transaction-v1.raydium.io/compute/swap-base-in?inputMint=${SOL_MINT}&outputMint=${tokenMint}&amount=${amount}&slippageBps=100&txVersion=V0`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      if (response.status === 429) {
        return { hasRoute: false, isAwaitingIndexing: false, error: 'Raydium rate limited' };
      }
      // 404 often indicates token not indexed
      if (response.status === 404) {
        return { hasRoute: false, isAwaitingIndexing: true, error: 'Token not indexed on Raydium' };
      }
      return { hasRoute: false, isAwaitingIndexing: false, error: `Raydium HTTP ${response.status}` };
    }
    
    const data = await response.json();
    
    // Raydium returns success: true if route exists
    if (data?.success === true && data?.data) {
      return { hasRoute: true, isAwaitingIndexing: false };
    }
    
    // Check if error indicates indexing issue
    const errorMsg = data?.msg || 'No Raydium route';
    const awaitingIndexing = isIndexingError(errorMsg);
    
    return { hasRoute: false, isAwaitingIndexing: awaitingIndexing, error: errorMsg };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { hasRoute: false, isAwaitingIndexing: false, error: 'Raydium timeout' };
    }
    return { hasRoute: false, isAwaitingIndexing: false, error: err.message || 'Raydium network error' };
  }
}

/**
 * Check if a valid swap route exists on Jupiter
 */
async function checkJupiterRoute(
  tokenMint: string,
  amount: string = '1000000', // 0.001 SOL in lamports
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<RouteCheckResult> {
  try {
    const result = await fetchJupiterQuote({
      inputMint: SOL_MINT,
      outputMint: tokenMint,
      amount,
      slippageBps: 100,
      timeoutMs,
    });
    
    if (result.ok === true) {
      return { hasRoute: true, isAwaitingIndexing: false };
    }
    
    // result.ok is false - access error properties
    const errorResult = result as { ok: false; kind: string; message: string };
    
    // Check for specific error types
    if (errorResult.kind === 'NO_ROUTE') {
      // Check if the error message suggests indexing issue
      const awaitingIndexing = isIndexingError(errorResult.message);
      return { hasRoute: false, isAwaitingIndexing: awaitingIndexing, error: 'No Jupiter route' };
    }
    
    if (errorResult.kind === 'RATE_LIMITED') {
      return { hasRoute: false, isAwaitingIndexing: false, error: 'Jupiter rate limited' };
    }
    
    // Check error message for indexing patterns
    const awaitingIndexing = isIndexingError(errorResult.message);
    return { hasRoute: false, isAwaitingIndexing: awaitingIndexing, error: errorResult.message || 'Jupiter error' };
  } catch (err: any) {
    return { hasRoute: false, isAwaitingIndexing: false, error: err.message || 'Jupiter network error' };
  }
}

/**
 * Check if token is indexed on Jupiter's strict token list
 * Tokens not on this list are likely too new or awaiting indexing
 */
async function checkJupiterTokenIndex(tokenMint: string, timeoutMs: number): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    // Check Jupiter's token info endpoint
    const response = await fetch(`https://tokens.jup.ag/token/${tokenMint}`, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      // 404 means token not indexed
      return false;
    }
    
    const data = await response.json();
    // Token is indexed if we get valid data back
    return !!data?.address;
  } catch {
    // Network error - can't determine, assume not indexed to be safe
    return false;
  }
}

/**
 * Validate that a swap route exists on either Jupiter OR Raydium
 * Also checks if token is awaiting indexing on DEX aggregators.
 * This MUST be called before any trade decision.
 * 
 * @param tokenMint - The token mint address to validate
 * @param options - Optional configuration
 * @returns RouteValidationResult with route availability and indexing status
 */
export async function validateSwapRoute(
  tokenMint: string,
  options?: {
    amount?: string;
    timeoutMs?: number;
    checkBothParallel?: boolean; // If true, check both simultaneously
    checkIndexing?: boolean; // If true, also check if token is indexed
  }
): Promise<RouteValidationResult> {
  const { 
    amount = '1000000', 
    timeoutMs = DEFAULT_TIMEOUT_MS,
    checkBothParallel = true,
    checkIndexing = true,
  } = options || {};
  
  if (!tokenMint || tokenMint.length < 26) {
    return {
      hasRoute: false,
      jupiter: false,
      raydium: false,
      source: 'none',
      isAwaitingIndexing: false,
      error: 'Invalid token address',
    };
  }
  
  // Check both Jupiter and Raydium in parallel for speed
  // Also check Jupiter token index if enabled
  if (checkBothParallel) {
    const checks: Promise<any>[] = [
      checkJupiterRoute(tokenMint, amount, timeoutMs),
      checkRaydiumRoute(tokenMint, amount, timeoutMs),
    ];
    
    if (checkIndexing) {
      checks.push(checkJupiterTokenIndex(tokenMint, timeoutMs));
    }
    
    const results = await Promise.all(checks);
    const jupiterResult = results[0] as RouteCheckResult;
    const raydiumResult = results[1] as RouteCheckResult;
    const isIndexed = checkIndexing ? (results[2] as boolean) : true;
    
    const jupiterHasRoute = jupiterResult.hasRoute;
    const raydiumHasRoute = raydiumResult.hasRoute;
    
    // Determine if token is awaiting indexing
    const isAwaitingIndexing = !isIndexed || 
      jupiterResult.isAwaitingIndexing || 
      raydiumResult.isAwaitingIndexing;
    
    // Block tokens awaiting indexing even if a route might exist
    if (isAwaitingIndexing && !jupiterHasRoute && !raydiumHasRoute) {
      return {
        hasRoute: false,
        jupiter: false,
        raydium: false,
        source: 'none',
        isAwaitingIndexing: true,
        error: 'Token awaiting indexing on DEX aggregators',
      };
    }
    
    // Return success if either has a route and token is indexed
    if (jupiterHasRoute || raydiumHasRoute) {
      return {
        hasRoute: true,
        jupiter: jupiterHasRoute,
        raydium: raydiumHasRoute,
        source: jupiterHasRoute ? 'jupiter' : 'raydium',
        isAwaitingIndexing: false,
      };
    }
    
    // Both failed - return combined error
    return {
      hasRoute: false,
      jupiter: false,
      raydium: false,
      source: 'none',
      isAwaitingIndexing,
      error: isAwaitingIndexing 
        ? 'Token awaiting indexing on DEX aggregators'
        : `No route: Jupiter (${jupiterResult.error}), Raydium (${raydiumResult.error})`,
    };
  }
  
  // Sequential check: Jupiter first, then Raydium as fallback
  const jupiterResult = await checkJupiterRoute(tokenMint, amount, timeoutMs);
  
  if (jupiterResult.hasRoute) {
    return {
      hasRoute: true,
      jupiter: true,
      raydium: false,
      source: 'jupiter',
      isAwaitingIndexing: false,
    };
  }
  
  // Jupiter failed, try Raydium
  const raydiumResult = await checkRaydiumRoute(tokenMint, amount, timeoutMs);
  
  if (raydiumResult.hasRoute) {
    return {
      hasRoute: true,
      jupiter: false,
      raydium: true,
      source: 'raydium',
      isAwaitingIndexing: false,
    };
  }
  
  const isAwaitingIndexing = jupiterResult.isAwaitingIndexing || raydiumResult.isAwaitingIndexing;
  
  return {
    hasRoute: false,
    jupiter: false,
    raydium: false,
    source: 'none',
    isAwaitingIndexing,
    error: isAwaitingIndexing
      ? 'Token awaiting indexing on DEX aggregators'
      : `No route: Jupiter (${jupiterResult.error}), Raydium (${raydiumResult.error})`,
  };
}

/**
 * Quick route check - returns boolean only
 * Use for fast filtering in scan loops
 */
export async function hasValidRoute(tokenMint: string): Promise<boolean> {
  const result = await validateSwapRoute(tokenMint, {
    timeoutMs: 5000, // Shorter timeout for quick checks
    checkBothParallel: true,
    checkIndexing: true,
  });
  return result.hasRoute && !result.isAwaitingIndexing;
}

/**
 * Check if token is awaiting indexing
 * Use to filter out tokens that are too new
 */
export async function isTokenAwaitingIndexing(tokenMint: string): Promise<boolean> {
  const result = await validateSwapRoute(tokenMint, {
    timeoutMs: 5000,
    checkBothParallel: true,
    checkIndexing: true,
  });
  return result.isAwaitingIndexing;
}
