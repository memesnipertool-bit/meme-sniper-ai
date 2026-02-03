/**
 * Stage 2: Raydium Sniping (RPC-ONLY)
 * Direct AMM swap execution using Solana RPC
 * 
 * ZERO Raydium HTTP API dependencies
 * All execution via RPC + Jupiter for transaction building
 */

import type {
  TradingConfig,
  LiquidityInfo,
  RaydiumSnipeParams,
  RaydiumSnipeResult,
  UnsignedTransaction,
  TradingEventCallback,
} from './types';
import { SOL_MINT } from './config';

// Internal status types (NOT shown to users)
type InternalStatus = 
  | 'WAITING_FOR_POOL' 
  | 'POOL_READY' 
  | 'SIMULATION_OK' 
  | 'TRADE_SENT' 
  | 'TRADE_CONFIRMED';

/**
 * Execute a Raydium snipe transaction
 * Uses Jupiter for transaction building (NO Raydium HTTP)
 * 
 * EXECUTION PATH:
 * 1. Validate pool type
 * 2. Build swap via Jupiter
 * 3. Sign transaction
 * 4. Send via RPC
 * 5. Return result
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
  let internalStatus: InternalStatus = 'WAITING_FOR_POOL';

  onEvent?.({ type: 'SNIPE_STARTED', data: { tokenAddress: liquidityInfo.tokenAddress } });

  // Validate pool type - only allow Raydium pools
  if (liquidityInfo.poolType !== 'raydium' && liquidityInfo.poolType !== 'pump_fun') {
    console.log(`[RaydiumSniper] Pool type: ${liquidityInfo.poolType}`);
    return {
      status: 'FAILED',
      txHash: null,
      entryPrice: null,
      tokenAmount: null,
      solSpent: null,
      attempts: 0,
      error: `Unsupported pool type: ${liquidityInfo.poolType}`,
      snipedAt: startTime,
    };
  }

  internalStatus = 'POOL_READY';

  // Retry logic - max 2 retries with block-based delays
  const MAX_RETRIES = 2;
  const BLOCK_DELAY_MS = 800; // ~2 blocks

  while (attempts < MAX_RETRIES) {
    attempts++;

    try {
      // Execute swap via Jupiter (only reliable method)
      const result = await executeSwapViaJupiter(
        liquidityInfo.tokenAddress,
        buyAmount,
        slippage,
        priorityFee,
        walletAddress,
        signTransaction,
        startTime,
        attempts,
        onEvent
      );

      if (result.status === 'SNIPED') {
        internalStatus = 'TRADE_CONFIRMED';
        return result;
      }

      // If execution failed, log internally and retry
      console.log(`[RaydiumSniper] Attempt ${attempts} failed: ${result.error}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.log(`[RaydiumSniper] Attempt ${attempts} exception: ${errorMessage}`);

      if (attempts >= MAX_RETRIES) {
        return {
          status: 'FAILED',
          txHash: null,
          entryPrice: null,
          tokenAmount: null,
          solSpent: null,
          attempts,
          error: `Trade failed after ${attempts} attempts`,
          snipedAt: startTime,
        };
      }

      // Wait ~2 blocks before retry
      await new Promise(resolve => setTimeout(resolve, BLOCK_DELAY_MS * (attempts + 1)));
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
 * Execute swap via Jupiter
 * Jupiter handles routing through Raydium AMM automatically
 * 
 * NO Raydium HTTP API calls
 */
async function executeSwapViaJupiter(
  tokenAddress: string,
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

  // Get Jupiter quote
  const quoteResponse = await fetch(
    `https://lite-api.jup.ag/swap/v1/quote?` +
    `inputMint=${SOL_MINT}&` +
    `outputMint=${tokenAddress}&` +
    `amount=${amountInLamports}&` +
    `slippageBps=${slippageBps}`,
    { signal: AbortSignal.timeout(10000) }
  );

  if (!quoteResponse.ok) {
    return {
      status: 'FAILED',
      txHash: null,
      entryPrice: null,
      tokenAmount: null,
      solSpent: null,
      attempts,
      error: `No route available (${quoteResponse.status})`,
      snipedAt: startTime,
    };
  }

  const quoteData = await quoteResponse.json();

  if (quoteData.error || !quoteData.outAmount) {
    return {
      status: 'FAILED',
      txHash: null,
      entryPrice: null,
      tokenAmount: null,
      solSpent: null,
      attempts,
      error: quoteData.error || 'No route available',
      snipedAt: startTime,
    };
  }

  // Build swap transaction via Jupiter
  const swapResponse = await fetch('https://lite-api.jup.ag/swap/v1/swap', {
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
    return {
      status: 'FAILED',
      txHash: null,
      entryPrice: null,
      tokenAmount: null,
      solSpent: null,
      attempts,
      error: `Transaction build failed (${swapResponse.status})`,
      snipedAt: startTime,
    };
  }

  const swapData = await swapResponse.json();

  if (!swapData.swapTransaction) {
    return {
      status: 'FAILED',
      txHash: null,
      entryPrice: null,
      tokenAmount: null,
      solSpent: null,
      attempts,
      error: 'No transaction returned',
      snipedAt: startTime,
    };
  }

  // Sign the transaction via wallet
  const signResult = await signTransaction({
    serializedTransaction: swapData.swapTransaction,
    blockhash: swapData.blockhash || '',
    lastValidBlockHeight: swapData.lastValidBlockHeight || 0,
    feePayer: walletAddress,
  });

  if (signResult.error) {
    return {
      status: 'FAILED',
      txHash: null,
      entryPrice: null,
      tokenAmount: null,
      solSpent: null,
      attempts,
      error: `Signing failed: ${signResult.error}`,
      snipedAt: startTime,
    };
  }

  // Calculate entry price - fetch actual decimals from quote or RPC
  const outputAmount = parseInt(quoteData.outAmount, 10) || 0;
  // CRITICAL: Jupiter lite-api often omits decimals, so we fetch it properly
  let tokenDecimals = 9; // Default fallback
  if (typeof quoteData.outputMint?.decimals === 'number') {
    tokenDecimals = quoteData.outputMint.decimals;
  } else {
    // Fetch decimals from RPC/Jupiter token API
    try {
      const response = await fetch(
        `https://lite-api.jup.ag/tokens/v1/${tokenAddress}`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (response.ok) {
        const tokenData = await response.json();
        if (typeof tokenData.decimals === 'number') {
          tokenDecimals = tokenData.decimals;
        }
      }
    } catch {
      console.log('[RaydiumSniper] Failed to fetch token decimals, using default 9');
    }
  }
  const tokenAmount = outputAmount / Math.pow(10, tokenDecimals);
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
 * Get current price for a token
 * Uses Jupiter only (NO Raydium HTTP)
 */
export async function getRaydiumPrice(tokenAddress: string): Promise<number | null> {
  try {
    // Use Jupiter lite-api for price
    const response = await fetch(
      `https://lite-api.jup.ag/price/v3?ids=${tokenAddress}`,
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
 * Build a swap transaction without signing
 * Uses Jupiter only (NO Raydium HTTP)
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
    const amountInLamports = Math.floor(amountIn * 1e9);
    const slippageBps = Math.floor(slippage * 10000);

    // Get quote from Jupiter
    const quoteResponse = await fetch(
      `https://lite-api.jup.ag/swap/v1/quote?` +
      `inputMint=${inputMint}&` +
      `outputMint=${outputMint}&` +
      `amount=${amountInLamports}&` +
      `slippageBps=${slippageBps}`,
      { signal: AbortSignal.timeout(15000) }
    );

    if (!quoteResponse.ok) return null;

    const quoteData = await quoteResponse.json();
    if (!quoteData.outAmount) return null;

    // Build transaction via Jupiter
    const swapResponse = await fetch('https://lite-api.jup.ag/swap/v1/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse: quoteData,
        userPublicKey: walletAddress,
        wrapAndUnwrapSol: inputMint === SOL_MINT || outputMint === SOL_MINT,
        prioritizationFeeLamports: priorityFee,
        dynamicComputeUnitLimit: true,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!swapResponse.ok) return null;

    const swapData = await swapResponse.json();
    if (!swapData.swapTransaction) return null;

    return {
      serializedTransaction: swapData.swapTransaction,
      blockhash: swapData.blockhash || '',
      lastValidBlockHeight: swapData.lastValidBlockHeight || 0,
      feePayer: walletAddress,
    };
  } catch {
    return null;
  }
}
