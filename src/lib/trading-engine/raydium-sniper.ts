/**
 * Stage 2: Raydium Sniping
 * Direct AMM swap for pre-Jupiter token purchases
 */

import { supabase } from '@/integrations/supabase/client';
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
 * Swaps SOL for the target token using Raydium AMM
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
  
  while (attempts < config.maxRetries) {
    attempts++;
    
    try {
      // If it's a Pump.fun token, use Pump.fun API
      if (liquidityInfo.poolType === 'pump_fun') {
        return await executePumpFunBuy(
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
      }
      
      // Otherwise use Raydium
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
      
      onEvent?.({ type: 'SNIPE_FAILED', data: { error: errorMessage, attempts } });
      
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
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, config.retryDelayMs));
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

/**
 * Execute buy via Pump.fun bonding curve
 */
async function executePumpFunBuy(
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
  // Call our edge function to build the Pump.fun transaction
  const { data, error } = await supabase.functions.invoke('trade-execution', {
    body: {
      action: 'buy',
      tokenAddress: liquidityInfo.tokenAddress,
      amount: buyAmount,
      slippage,
      priorityFee,
      walletAddress,
      dex: 'pump_fun',
      buildOnly: true, // Return unsigned transaction
    },
  });
  
  if (error || !data?.success) {
    throw new Error(data?.error || error?.message || 'Failed to build Pump.fun transaction');
  }
  
  if (!data.transaction) {
    throw new Error('No transaction returned from Pump.fun');
  }
  
  // Sign the transaction externally
  const signResult = await signTransaction({
    serializedTransaction: data.transaction,
    blockhash: data.blockhash,
    lastValidBlockHeight: data.lastValidBlockHeight,
    feePayer: walletAddress,
  });
  
  if (signResult.error) {
    throw new Error(`Transaction signing failed: ${signResult.error}`);
  }
  
  // Calculate entry price
  const tokenAmount = data.expectedOutput || 0;
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
 * Execute swap via Raydium AMM
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
  // First, get a quote from Raydium
  const amountInLamports = Math.floor(buyAmount * 1e9);
  
  const quoteResponse = await fetch(
    `${API_ENDPOINTS.raydiumSwap}/compute/swap-base-in?` +
    `inputMint=${SOL_MINT}&` +
    `outputMint=${liquidityInfo.tokenAddress}&` +
    `amount=${amountInLamports}&` +
    `slippageBps=${Math.floor(slippage * 10000)}`,
    { signal: AbortSignal.timeout(15000) }
  );
  
  if (!quoteResponse.ok) {
    throw new Error(`Raydium quote failed: ${quoteResponse.status}`);
  }
  
  const quoteData = await quoteResponse.json();
  
  if (!quoteData.success || !quoteData.data) {
    throw new Error(quoteData.msg || 'No route found on Raydium');
  }
  
  // Build the swap transaction
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
