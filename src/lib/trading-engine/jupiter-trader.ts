/**
 * Stage 3: Jupiter Trading
 * Optimized routing for post-listing buy/sell operations
 */

import { supabase } from '@/integrations/supabase/client';
import type {
  TradingConfig,
  TradeMode,
  JupiterTradeParams,
  JupiterTradeResult,
  JupiterIndexStatus,
  UnsignedTransaction,
  TradingEventCallback,
} from './types';
import { API_ENDPOINTS, SOL_MINT } from './config';

/**
 * Fetch token decimals from Jupiter API or fallback to common defaults
 */
async function getTokenDecimals(tokenMint: string): Promise<number> {
  // Known token decimals
  if (tokenMint === SOL_MINT) return 9;
  
  try {
    // Try Jupiter token list first (most reliable for tradable tokens)
    const response = await fetch(
      `https://lite-api.jup.ag/tokens/v1/${tokenMint}`,
      { signal: AbortSignal.timeout(5000) }
    );
    
    if (response.ok) {
      const data = await response.json();
      if (typeof data.decimals === 'number') {
        console.log(`[Jupiter] Token ${tokenMint.slice(0, 8)}... has ${data.decimals} decimals`);
        return data.decimals;
      }
    }
  } catch (e) {
    console.log('[Jupiter] Failed to fetch token decimals from Jupiter API');
  }
  
  try {
    // Fallback: Try DexScreener
    const dexRes = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`,
      { signal: AbortSignal.timeout(5000) }
    );
    
    if (dexRes.ok) {
      const dexData = await dexRes.json();
      const pair = dexData.pairs?.find((p: { chainId: string }) => p.chainId === 'solana');
      // DexScreener doesn't always have decimals, but baseToken info might help
      if (pair?.baseToken?.address === tokenMint) {
        // Most SPL tokens are 6 or 9 decimals
        // Check if price suggests 6 decimals (typical for meme coins)
        console.log('[Jupiter] Using DexScreener fallback, assuming 6 decimals for meme token');
        return 6;
      }
    }
  } catch (e) {
    console.log('[Jupiter] DexScreener fallback also failed');
  }
  
  // Default to 6 decimals (most common for SPL tokens / meme coins)
  console.log('[Jupiter] Defaulting to 6 decimals');
  return 6;
}

/**
 * Convert amount to smallest unit based on decimals
 */
function toSmallestUnit(amount: number, decimals: number): number {
  return Math.floor(amount * Math.pow(10, decimals));
}

/**
 * Convert from smallest unit to decimal based on decimals
 */
function fromSmallestUnit(amount: number | string, decimals: number): number {
  const numAmount = typeof amount === 'string' ? parseInt(amount) : amount;
  return numAmount / Math.pow(10, decimals);
}

/**
 * Execute a Jupiter trade (buy or sell)
 */
export async function executeJupiterTrade(
  params: JupiterTradeParams,
  walletAddress: string,
  signTransaction: (tx: UnsignedTransaction) => Promise<{ signature: string; error?: string }>,
  config: TradingConfig,
  onEvent?: TradingEventCallback
): Promise<JupiterTradeResult> {
  const { tokenAddress, mode, amount, slippage, priorityFee } = params;
  const startTime = Date.now();
  
  try {
    // Determine input/output mints based on mode
    const inputMint = mode === 'BUY' ? SOL_MINT : tokenAddress;
    const outputMint = mode === 'BUY' ? tokenAddress : SOL_MINT;
    
    // CRITICAL FIX: Get correct decimals for the input token
    // For BUY: input is SOL (9 decimals)
    // For SELL: input is the token (variable decimals - fetch from API)
    const inputDecimals = mode === 'BUY' ? 9 : await getTokenDecimals(tokenAddress);
    const outputDecimals = mode === 'BUY' ? await getTokenDecimals(tokenAddress) : 9;
    
    console.log(`[Jupiter] ${mode} ${amount} tokens with ${inputDecimals} input decimals`);
    
    // Convert amount to smallest unit using correct decimals
    const amountInSmallestUnit = toSmallestUnit(amount, inputDecimals);
    
    console.log(`[Jupiter] Amount in smallest unit: ${amountInSmallestUnit}`);
    
    // Get quote from Jupiter
    const quote = await getJupiterQuote(
      inputMint,
      outputMint,
      amountInSmallestUnit,
      slippage
    );
    
    if (!quote) {
      return {
        status: 'NO_ROUTE',
        txHash: null,
        price: null,
        inputAmount: null,
        outputAmount: null,
        priceImpact: null,
        route: null,
        error: 'No route available on Jupiter',
        tradedAt: startTime,
      };
    }
    
    // Build the swap transaction
    const swapTransaction = await buildJupiterSwap(quote, walletAddress, priorityFee);
    
    if (!swapTransaction) {
      return {
        status: 'FAILED',
        txHash: null,
        price: null,
        inputAmount: null,
        outputAmount: null,
        priceImpact: null,
        route: null,
        error: 'Failed to build Jupiter swap transaction',
        tradedAt: startTime,
      };
    }
    
    // Sign the transaction externally
    const signResult = await signTransaction({
      serializedTransaction: swapTransaction.transaction,
      blockhash: swapTransaction.blockhash || '',
      lastValidBlockHeight: swapTransaction.lastValidBlockHeight || 0,
      feePayer: walletAddress,
    });
    
    if (signResult.error) {
      return {
        status: 'FAILED',
        txHash: null,
        price: null,
        inputAmount: null,
        outputAmount: null,
        priceImpact: null,
        route: null,
        error: `Transaction signing failed: ${signResult.error}`,
        tradedAt: startTime,
      };
    }
    
    // Calculate amounts using correct decimals
    const inAmount = fromSmallestUnit(quote.inAmount, inputDecimals);
    const outAmount = fromSmallestUnit(quote.outAmount, outputDecimals);
    const price = mode === 'BUY' ? inAmount / outAmount : outAmount / inAmount;
    
    const result: JupiterTradeResult = {
      status: 'TRADE_COMPLETE',
      txHash: signResult.signature,
      price,
      inputAmount: inAmount,
      outputAmount: outAmount,
      priceImpact: parseFloat(quote.priceImpactPct || '0'),
      route: quote.routePlan?.map((r: any) => r.swapInfo?.label).join(' → ') || null,
      tradedAt: startTime,
    };
    
    onEvent?.({ type: 'TRADE_EXECUTED', data: result });
    
    return result;
    
  } catch (error) {
    return {
      status: 'ERROR',
      txHash: null,
      price: null,
      inputAmount: null,
      outputAmount: null,
      priceImpact: null,
      route: null,
      error: error instanceof Error ? error.message : 'Unknown error',
      tradedAt: startTime,
    };
  }
}

/**
 * Check if a token is indexed on Jupiter
 */
export async function checkJupiterIndex(tokenAddress: string): Promise<JupiterIndexStatus> {
  try {
    // Try to get a quote for a small amount
    const testAmount = 1000000; // 0.001 SOL
    
    const quoteUrl = new URL(API_ENDPOINTS.jupiterQuote);
    quoteUrl.searchParams.set('inputMint', SOL_MINT);
    quoteUrl.searchParams.set('outputMint', tokenAddress);
    quoteUrl.searchParams.set('amount', testAmount.toString());
    quoteUrl.searchParams.set('slippageBps', '500');
    
    const response = await fetch(quoteUrl.toString(), {
      signal: AbortSignal.timeout(10000),
    });
    
    if (!response.ok) {
      return {
        isIndexed: false,
        hasRoutes: false,
        availableDexes: [],
        bestPrice: null,
      };
    }
    
    const quote = await response.json();
    
    if (!quote || quote.error) {
      return {
        isIndexed: false,
        hasRoutes: false,
        availableDexes: [],
        bestPrice: null,
      };
    }
    
    // Extract DEXes from route plan
    const dexes: string[] = [];
    if (quote.routePlan) {
      for (const step of quote.routePlan) {
        const label = step.swapInfo?.label;
        if (label && !dexes.includes(label)) {
          dexes.push(label);
        }
      }
    }
    
    // Calculate price
    const inAmount = parseInt(quote.inAmount) / 1e9;
    const outAmount = parseInt(quote.outAmount) / 1e9;
    const price = outAmount > 0 ? inAmount / outAmount : null;
    
    return {
      isIndexed: true,
      hasRoutes: true,
      availableDexes: dexes,
      bestPrice: price,
    };
  } catch {
    return {
      isIndexed: false,
      hasRoutes: false,
      availableDexes: [],
      bestPrice: null,
    };
  }
}

/**
 * Poll Jupiter until token is indexed
 */
export async function waitForJupiterIndex(
  tokenAddress: string,
  config: TradingConfig,
  onEvent?: TradingEventCallback
): Promise<JupiterIndexStatus> {
  let attempts = 0;
  
  while (attempts < config.jupiterMaxPollAttempts) {
    attempts++;
    
    onEvent?.({ 
      type: 'JUPITER_POLLING', 
      data: { attempt: attempts, maxAttempts: config.jupiterMaxPollAttempts } 
    });
    
    const status = await checkJupiterIndex(tokenAddress);
    
    if (status.isIndexed && status.hasRoutes) {
      onEvent?.({ type: 'JUPITER_READY', data: status });
      return status;
    }
    
    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, config.jupiterPollIntervalMs));
  }
  
  // Return final status even if not indexed
  return {
    isIndexed: false,
    hasRoutes: false,
    availableDexes: [],
    bestPrice: null,
  };
}

/**
 * Get a quote from Jupiter
 */
async function getJupiterQuote(
  inputMint: string,
  outputMint: string,
  amount: number,
  slippage: number
): Promise<any | null> {
  try {
    const slippageBps = Math.floor(slippage * 10000);
    
    const quoteUrl = new URL(API_ENDPOINTS.jupiterQuote);
    quoteUrl.searchParams.set('inputMint', inputMint);
    quoteUrl.searchParams.set('outputMint', outputMint);
    quoteUrl.searchParams.set('amount', amount.toString());
    quoteUrl.searchParams.set('slippageBps', slippageBps.toString());
    quoteUrl.searchParams.set('onlyDirectRoutes', 'false');
    quoteUrl.searchParams.set('asLegacyTransaction', 'false');
    
    const response = await fetch(quoteUrl.toString(), {
      signal: AbortSignal.timeout(15000),
    });
    
    if (!response.ok) {
      console.error('Jupiter quote failed:', response.status);
      return null;
    }
    
    const quote = await response.json();
    
    if (quote.error) {
      console.error('Jupiter quote error:', quote.error);
      return null;
    }
    
    return quote;
  } catch (error) {
    console.error('Jupiter quote exception:', error);
    return null;
  }
}

/**
 * Build a swap transaction from a Jupiter quote
 */
async function buildJupiterSwap(
  quote: any,
  walletAddress: string,
  priorityFee: number
): Promise<{ transaction: string; blockhash?: string; lastValidBlockHeight?: number } | null> {
  try {
    const response = await fetch(API_ENDPOINTS.jupiterSwap, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: walletAddress,
        wrapAndUnwrapSol: true,
        prioritizationFeeLamports: priorityFee,
        dynamicComputeUnitLimit: true,
      }),
      signal: AbortSignal.timeout(20000),
    });
    
    if (!response.ok) {
      console.error('Jupiter swap build failed:', response.status);
      return null;
    }
    
    const swapData = await response.json();
    
    if (swapData.error) {
      console.error('Jupiter swap error:', swapData.error);
      return null;
    }
    
    return {
      transaction: swapData.swapTransaction,
      blockhash: swapData.blockhash,
      lastValidBlockHeight: swapData.lastValidBlockHeight,
    };
  } catch (error) {
    console.error('Jupiter swap exception:', error);
    return null;
  }
}

/**
 * Get current price from Jupiter
 */
export async function getJupiterPrice(tokenAddress: string): Promise<number | null> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.jupiterPrice}?ids=${tokenAddress}`,
      { signal: AbortSignal.timeout(10000) }
    );
    
    if (!response.ok) return null;
    
    const data = await response.json();
    
    if (!data.data || !data.data[tokenAddress]) return null;
    
    return data.data[tokenAddress].price;
  } catch {
    return null;
  }
}

/**
 * Get best route information without executing
 */
export async function getJupiterRouteInfo(
  inputMint: string,
  outputMint: string,
  amount: number,
  slippage: number
): Promise<{
  route: string | null;
  priceImpact: number | null;
  expectedOutput: number | null;
  dexes: string[];
} | null> {
  const amountInSmallestUnit = Math.floor(amount * 1e9);
  const quote = await getJupiterQuote(inputMint, outputMint, amountInSmallestUnit, slippage);
  
  if (!quote) return null;
  
  const dexes: string[] = [];
  if (quote.routePlan) {
    for (const step of quote.routePlan) {
      const label = step.swapInfo?.label;
      if (label && !dexes.includes(label)) {
        dexes.push(label);
      }
    }
  }
  
  return {
    route: dexes.join(' → '),
    priceImpact: parseFloat(quote.priceImpactPct || '0'),
    expectedOutput: parseInt(quote.outAmount) / 1e9,
    dexes,
  };
}
