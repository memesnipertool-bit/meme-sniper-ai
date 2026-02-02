/**
 * Route Validator
 * Pre-trade validation that ensures a swap route exists on Jupiter OR Raydium
 * before any trade decision is made.
 */

import { fetchJupiterQuote } from './jupiterQuote';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const DEFAULT_TIMEOUT_MS = 8000;

export interface RouteValidationResult {
  hasRoute: boolean;
  jupiter: boolean;
  raydium: boolean;
  source: 'jupiter' | 'raydium' | 'none';
  error?: string;
}

/**
 * Check if a valid swap route exists on Raydium
 */
async function checkRaydiumRoute(
  tokenMint: string,
  amount: string = '1000000', // 0.001 SOL in lamports
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<{ hasRoute: boolean; error?: string }> {
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
        return { hasRoute: false, error: 'Raydium rate limited' };
      }
      return { hasRoute: false, error: `Raydium HTTP ${response.status}` };
    }
    
    const data = await response.json();
    
    // Raydium returns success: true if route exists
    if (data?.success === true && data?.data) {
      return { hasRoute: true };
    }
    
    return { hasRoute: false, error: data?.msg || 'No Raydium route' };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { hasRoute: false, error: 'Raydium timeout' };
    }
    return { hasRoute: false, error: err.message || 'Raydium network error' };
  }
}

/**
 * Check if a valid swap route exists on Jupiter
 */
async function checkJupiterRoute(
  tokenMint: string,
  amount: string = '1000000', // 0.001 SOL in lamports
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<{ hasRoute: boolean; error?: string }> {
  try {
    const result = await fetchJupiterQuote({
      inputMint: SOL_MINT,
      outputMint: tokenMint,
      amount,
      slippageBps: 100,
      timeoutMs,
    });
    
    if (result.ok === true) {
      return { hasRoute: true };
    }
    
    // result.ok is false - access error properties
    const errorResult = result as { ok: false; kind: string; message: string };
    
    // Check for specific error types
    if (errorResult.kind === 'NO_ROUTE') {
      return { hasRoute: false, error: 'No Jupiter route' };
    }
    
    if (errorResult.kind === 'RATE_LIMITED') {
      return { hasRoute: false, error: 'Jupiter rate limited' };
    }
    
    return { hasRoute: false, error: errorResult.message || 'Jupiter error' };
  } catch (err: any) {
    return { hasRoute: false, error: err.message || 'Jupiter network error' };
  }
}

/**
 * Validate that a swap route exists on either Jupiter OR Raydium
 * This MUST be called before any trade decision.
 * 
 * @param tokenMint - The token mint address to validate
 * @param options - Optional configuration
 * @returns RouteValidationResult with route availability status
 */
export async function validateSwapRoute(
  tokenMint: string,
  options?: {
    amount?: string;
    timeoutMs?: number;
    checkBothParallel?: boolean; // If true, check both simultaneously
  }
): Promise<RouteValidationResult> {
  const { 
    amount = '1000000', 
    timeoutMs = DEFAULT_TIMEOUT_MS,
    checkBothParallel = true 
  } = options || {};
  
  if (!tokenMint || tokenMint.length < 26) {
    return {
      hasRoute: false,
      jupiter: false,
      raydium: false,
      source: 'none',
      error: 'Invalid token address',
    };
  }
  
  // Check both Jupiter and Raydium in parallel for speed
  if (checkBothParallel) {
    const [jupiterResult, raydiumResult] = await Promise.all([
      checkJupiterRoute(tokenMint, amount, timeoutMs),
      checkRaydiumRoute(tokenMint, amount, timeoutMs),
    ]);
    
    const jupiterHasRoute = jupiterResult.hasRoute;
    const raydiumHasRoute = raydiumResult.hasRoute;
    
    // Return success if either has a route
    if (jupiterHasRoute || raydiumHasRoute) {
      return {
        hasRoute: true,
        jupiter: jupiterHasRoute,
        raydium: raydiumHasRoute,
        source: jupiterHasRoute ? 'jupiter' : 'raydium',
      };
    }
    
    // Both failed - return combined error
    return {
      hasRoute: false,
      jupiter: false,
      raydium: false,
      source: 'none',
      error: `No route: Jupiter (${jupiterResult.error}), Raydium (${raydiumResult.error})`,
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
    };
  }
  
  return {
    hasRoute: false,
    jupiter: false,
    raydium: false,
    source: 'none',
    error: `No route: Jupiter (${jupiterResult.error}), Raydium (${raydiumResult.error})`,
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
  });
  return result.hasRoute;
}
