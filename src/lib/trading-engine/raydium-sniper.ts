/**
 * Stage 2: Raydium Sniping
 * Direct AMM swap for pre-Jupiter token purchases
 */

// Note: supabase import removed - no longer using Pump.fun via edge function
import type {
  TradingConfig,
  LiquidityInfo,
  RaydiumSnipeParams,
  RaydiumSnipeResult,
  UnsignedTransaction,
  TradingEventCallback,
} from './types';
import { API_ENDPOINTS, SOL_MINT } from './config';

/**
 * Execute a Raydium snipe transaction
 * Swaps SOL for the target token using Raydium AMM ONLY
 * 
 * IMPORTANT: This function now ONLY supports Raydium pools.
 * Pump.fun bonding curve tokens are rejected at Stage 1.
 */
export async function executeRaydiumSnipe(
  params: RaydiumSnipeParams,
  walletAddress: string,
  signTransaction: (tx: UnsignedTransaction) => Promise<{ signature: string; error?: string }>,
  config: TradingConfig,
  onEvent?: TradingEventCallback
): Promise<RaydiumSnipeResult> {
  const { liquidityInfo, buyAmount, slippage, priorityFee } = params;
  const startTime = Date.now();
  let attempts = 0;
  
  onEvent?.({ type: 'SNIPE_STARTED', data: { tokenAddress: liquidityInfo.tokenAddress } });
  
  // STRICT: Only allow Raydium pools
  if (liquidityInfo.poolType !== 'raydium') {
    console.log(`[RaydiumSniper] Rejected non-Raydium pool type: ${liquidityInfo.poolType}`);
    return {
      status: 'FAILED',
      txHash: null,
      entryPrice: null,
      tokenAmount: null,
      solSpent: null,
      attempts: 0,
      error: `Only Raydium pools are supported. Got: ${liquidityInfo.poolType}`,
      snipedAt: startTime,
    };
  }
  
  // Use exponential backoff with minimum 2-block delays
  // NO tight retry loops (<1 second) allowed
  const MIN_RETRY_DELAY_MS = 1000; // Minimum 1 second between retries
  
  while (attempts < config.maxRetries) {
    attempts++;
    
    try {
      // Execute Raydium swap via Jupiter (primary) or Raydium HTTP (fallback with 500 tolerance)
      return await executeRaydiumSwap(
        liquidityInfo,
        buyAmount,
        slippage,
        priorityFee,
        walletAddress,
        signTransaction,
        startTime,
        attempts,
        onEvent
      );
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Log but DON'T abort on Raydium HTTP 500 errors
      if (errorMessage.includes('500') || errorMessage.includes('502') || errorMessage.includes('503')) {
        console.warn(`[RaydiumSniper] Raydium HTTP ${errorMessage} - continuing with fallback`);
        onEvent?.({ type: 'SNIPE_FAILED', data: { error: `Raydium API error (retrying): ${errorMessage}`, attempts } });
      } else {
        onEvent?.({ type: 'SNIPE_FAILED', data: { error: errorMessage, attempts } });
      }
      
      if (attempts >= config.maxRetries) {
        return {
          status: 'FAILED',
          txHash: null,
          entryPrice: null,
          tokenAmount: null,
          solSpent: null,
          attempts,
          error: `Failed after ${attempts} attempts: ${errorMessage}`,
          snipedAt: startTime,
        };
      }
      
      // Exponential backoff: 1s, 2s, 4s (capped at ~4 blocks)
      const backoffMs = Math.max(MIN_RETRY_DELAY_MS, config.retryDelayMs * Math.pow(2, attempts - 1));
      const cappedBackoff = Math.min(backoffMs, 4000); // Cap at 4 seconds
      console.log(`[RaydiumSniper] Retry ${attempts}/${config.maxRetries} in ${cappedBackoff}ms`);
      await new Promise(resolve => setTimeout(resolve, cappedBackoff));
    }
  }
  
  return {
    status: 'FAILED',
    txHash: null,
    entryPrice: null,
    tokenAmount: null,
    solSpent: null,
    attempts,
    error: 'Max retries exceeded',
    snipedAt: startTime,
  };
}

// NOTE: executePumpFunBuy has been REMOVED
// All trading now goes through Raydium only
// Pump.fun bonding curve tokens are rejected at Stage 1

/**
 * Execute swap via Jupiter (primary) with Raydium HTTP fallback
 * 
 * STRATEGY:
 * 1. Try Jupiter first (most reliable, aggregates all routes)
 * 2. If Jupiter fails, try Raydium HTTP (tolerate 500 errors)
 * 3. Raydium HTTP 500 errors are logged but DON'T block the trade
 */
async function executeRaydiumSwap(
  liquidityInfo: LiquidityInfo,
  buyAmount: number,
  slippage: number,
  priorityFee: number,
  walletAddress: string,
  signTransaction: (tx: UnsignedTransaction) => Promise<{ signature: string; error?: string }>,
  startTime: number,
  attempts: number,
  onEvent?: TradingEventCallback
): Promise<RaydiumSnipeResult> {
  const amountInLamports = Math.floor(buyAmount * 1e9);
  const slippageBps = Math.floor(slippage * 10000);
  
  // TRY JUPITER FIRST (primary - most reliable)
  try {
    const jupiterResult = await executeViaJupiter(
      liquidityInfo.tokenAddress,
      amountInLamports,
      slippageBps,
      priorityFee,
      walletAddress,
      signTransaction,
      startTime,
      attempts,
      onEvent
    );
    
    if (jupiterResult.status === 'SNIPED') {
      return jupiterResult;
    }
    
    console.log(`[RaydiumSniper] Jupiter failed: ${jupiterResult.error}, trying Raydium HTTP...`);
  } catch (jupiterError) {
    console.log(`[RaydiumSniper] Jupiter error: ${jupiterError}, trying Raydium HTTP...`);
  }
  
  // FALLBACK TO RAYDIUM HTTP (with 500 tolerance)
  try {
    return await executeViaRaydiumHttp(
      liquidityInfo.tokenAddress,
      amountInLamports,
      slippageBps,
      priorityFee,
      walletAddress,
      signTransaction,
      startTime,
      attempts,
      onEvent
    );
  } catch (raydiumError) {
    const errorMsg = raydiumError instanceof Error ? raydiumError.message : 'Unknown error';
    
    // Check if this is an HTTP 500-level error - log but don't treat as fatal
    if (errorMsg.includes('500') || errorMsg.includes('502') || errorMsg.includes('503')) {
      console.warn(`[RaydiumSniper] Raydium HTTP ${errorMsg} - API unavailable`);
      throw new Error(`Raydium API temporarily unavailable: ${errorMsg}`);
    }
    
    throw raydiumError;
  }
}

/**
 * Execute via Jupiter aggregator (primary route)
 */
async function executeViaJupiter(
  tokenAddress: string,
  amountInLamports: number,
  slippageBps: number,
  priorityFee: number,
  walletAddress: string,
  signTransaction: (tx: UnsignedTransaction) => Promise<{ signature: string; error?: string }>,
  startTime: number,
  attempts: number,
  onEvent?: TradingEventCallback
): Promise<RaydiumSnipeResult> {
  // Get Jupiter quote
  const quoteResponse = await fetch(
    `https://quote-api.jup.ag/v6/quote?` +
    `inputMint=${SOL_MINT}&` +
    `outputMint=${tokenAddress}&` +
    `amount=${amountInLamports}&` +
    `slippageBps=${slippageBps}`,
    { signal: AbortSignal.timeout(10000) }
  );
  
  if (!quoteResponse.ok) {
    throw new Error(`Jupiter quote failed: ${quoteResponse.status}`);
  }
  
  const quoteData = await quoteResponse.json();
  
  if (quoteData.error || !quoteData.outAmount) {
    throw new Error(quoteData.error || 'No Jupiter route available');
  }
  
  // Build swap transaction
  const swapResponse = await fetch('https://quote-api.jup.ag/v6/swap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse: quoteData,
      userPublicKey: walletAddress,
      wrapAndUnwrapSol: true,
      prioritizationFeeLamports: priorityFee,
      dynamicComputeUnitLimit: true,
    }),
    signal: AbortSignal.timeout(15000),
  });
  
  if (!swapResponse.ok) {
    throw new Error(`Jupiter swap build failed: ${swapResponse.status}`);
  }
  
  const swapData = await swapResponse.json();
  
  if (!swapData.swapTransaction) {
    throw new Error('No transaction in Jupiter response');
  }
  
  // Sign the transaction
  const signResult = await signTransaction({
    serializedTransaction: swapData.swapTransaction,
    blockhash: swapData.blockhash || '',
    lastValidBlockHeight: swapData.lastValidBlockHeight || 0,
    feePayer: walletAddress,
  });
  
  if (signResult.error) {
    throw new Error(`Transaction signing failed: ${signResult.error}`);
  }
  
  // Calculate entry price
  const outputAmount = parseInt(quoteData.outAmount, 10) || 0;
  const buyAmount = amountInLamports / 1e9;
  const tokenAmount = outputAmount / Math.pow(10, quoteData.outputMint?.decimals || 9);
  const entryPrice = tokenAmount > 0 ? buyAmount / tokenAmount : 0;
  
  const result: RaydiumSnipeResult = {
    status: 'SNIPED',
    txHash: signResult.signature,
    entryPrice,
    tokenAmount,
    solSpent: buyAmount,
    attempts,
    snipedAt: startTime,
  };
  
  onEvent?.({ type: 'SNIPE_SUCCESS', data: result });
  
  return result;
}

/**
 * Execute via Raydium HTTP API (fallback)
 * Tolerates 500 errors by NOT aborting on them
 */
async function executeViaRaydiumHttp(
  tokenAddress: string,
  amountInLamports: number,
  slippageBps: number,
  priorityFee: number,
  walletAddress: string,
  signTransaction: (tx: UnsignedTransaction) => Promise<{ signature: string; error?: string }>,
  startTime: number,
  attempts: number,
  onEvent?: TradingEventCallback
): Promise<RaydiumSnipeResult> {
  const buyAmount = amountInLamports / 1e9;
  
  // Get quote from Raydium (single attempt - NO aggressive retries)
  const quoteResponse = await fetch(
    `${API_ENDPOINTS.raydiumSwap}/compute/swap-base-in?` +
    `inputMint=${SOL_MINT}&` +
    `outputMint=${tokenAddress}&` +
    `amount=${amountInLamports}&` +
    `slippageBps=${slippageBps}`,
    { signal: AbortSignal.timeout(15000) }
  );
  
  if (!quoteResponse.ok) {
    throw new Error(`Raydium quote failed: ${quoteResponse.status}`);
  }
  
  const quoteData = await quoteResponse.json();
  
  if (!quoteData.success || !quoteData.data) {
    throw new Error(quoteData.msg || 'No route found on Raydium');
  }
  
  // Build the swap transaction (single attempt)
  const swapResponse = await fetch(`${API_ENDPOINTS.raydiumSwap}/transaction/swap-base-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      computeUnitPriceMicroLamports: priorityFee,
      swapResponse: quoteData,
      wallet: walletAddress,
      wrapSol: true,
      unwrapSol: false,
    }),
    signal: AbortSignal.timeout(15000),
  });
  
  if (!swapResponse.ok) {
    throw new Error(`Raydium swap build failed: ${swapResponse.status}`);
  }
  
  const swapData = await swapResponse.json();
  
  if (!swapData.success || !swapData.data) {
    throw new Error(swapData.msg || 'Failed to build Raydium swap');
  }
  
  // Get the transaction to sign
  const transactions = swapData.data;
  const mainTx = Array.isArray(transactions) ? transactions[0] : transactions;
  
  if (!mainTx?.transaction) {
    throw new Error('No transaction in Raydium response');
  }
  
  // Sign the transaction
  const signResult = await signTransaction({
    serializedTransaction: mainTx.transaction,
    blockhash: mainTx.blockhash || '',
    lastValidBlockHeight: mainTx.lastValidBlockHeight || 0,
    feePayer: walletAddress,
  });
  
  if (signResult.error) {
    throw new Error(`Transaction signing failed: ${signResult.error}`);
  }
  
  // Calculate entry price
  const outputAmount = quoteData.data.outputAmount || 0;
  const tokenAmount = outputAmount / Math.pow(10, quoteData.data.outputDecimals || 9);
  const entryPrice = tokenAmount > 0 ? buyAmount / tokenAmount : 0;
  
  const result: RaydiumSnipeResult = {
    status: 'SNIPED',
    txHash: signResult.signature,
    entryPrice,
    tokenAmount,
    solSpent: buyAmount,
    attempts,
    snipedAt: startTime,
  };
  
  onEvent?.({ type: 'SNIPE_SUCCESS', data: result });
  
  return result;
}

/**
 * Get current price from Raydium for a token
 */
export async function getRaydiumPrice(tokenAddress: string): Promise<number | null> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.raydiumMint}?mints=${tokenAddress}`,
      { signal: AbortSignal.timeout(10000) }
    );
    
    if (!response.ok) return null;
    
    const data = await response.json();
    
    if (!data.data || !data.data[tokenAddress]) return null;
    
    return data.data[tokenAddress];
  } catch {
    return null;
  }
}

/**
 * Build a Raydium swap transaction without signing
 * Returns the transaction for external signing
 */
export async function buildRaydiumSwapTransaction(
  inputMint: string,
  outputMint: string,
  amountIn: number,
  slippage: number,
  priorityFee: number,
  walletAddress: string
): Promise<UnsignedTransaction | null> {
  try {
    // Get quote
    const amountInLamports = Math.floor(amountIn * 1e9);
    
    const quoteResponse = await fetch(
      `${API_ENDPOINTS.raydiumSwap}/compute/swap-base-in?` +
      `inputMint=${inputMint}&` +
      `outputMint=${outputMint}&` +
      `amount=${amountInLamports}&` +
      `slippageBps=${Math.floor(slippage * 10000)}`,
      { signal: AbortSignal.timeout(15000) }
    );
    
    if (!quoteResponse.ok) return null;
    
    const quoteData = await quoteResponse.json();
    if (!quoteData.success) return null;
    
    // Build transaction
    const swapResponse = await fetch(`${API_ENDPOINTS.raydiumSwap}/transaction/swap-base-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        computeUnitPriceMicroLamports: priorityFee,
        swapResponse: quoteData,
        wallet: walletAddress,
        wrapSol: inputMint === SOL_MINT,
        unwrapSol: outputMint === SOL_MINT,
      }),
      signal: AbortSignal.timeout(15000),
    });
    
    if (!swapResponse.ok) return null;
    
    const swapData = await swapResponse.json();
    if (!swapData.success || !swapData.data) return null;
    
    const mainTx = Array.isArray(swapData.data) ? swapData.data[0] : swapData.data;
    
    return {
      serializedTransaction: mainTx.transaction,
      blockhash: mainTx.blockhash || '',
      lastValidBlockHeight: mainTx.lastValidBlockHeight || 0,
      feePayer: walletAddress,
    };
  } catch {
    return null;
  }
}
