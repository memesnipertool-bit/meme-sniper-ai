import { useState, useCallback, useRef } from 'react';
import { VersionedTransaction } from '@solana/web3.js';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAppMode } from '@/contexts/AppModeContext';
import {
  calculateDynamicSlippage,
  isSlippageError,
  SLIPPAGE_RETRY_CONFIG,
  getRetryDelay,
} from '@/lib/tradeSafety';
import { acquireSellLock, releaseSellLock, isSellLocked } from '@/lib/sellLock';

// Common token addresses
export const SOL_MINT = 'So11111111111111111111111111111111111111112';
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

export type TransactionStatus = 
  | 'idle' 
  | 'fetching_quote' 
  | 'building_tx' 
  | 'awaiting_signature' 
  | 'broadcasting' 
  | 'confirming' 
  | 'confirmed' 
  | 'failed'
  | 'retrying'; // New status for slippage retries

export type PriorityLevel = 'low' | 'medium' | 'high' | 'veryHigh';

export interface TradeQuote {
  inputAmount: number;
  outputAmount: number;
  inputAmountDecimal: number;
  outputAmountDecimal: number;
  priceImpactPct: number;
  slippageBps: number;
  route?: string;
}

export interface TradeParams {
  inputMint: string;
  outputMint: string;
  amount: string; // in lamports/smallest unit
  slippageBps?: number;
  priorityLevel?: PriorityLevel;
  tokenSymbol?: string;
  tokenName?: string;
  profitTakePercent?: number;
  stopLossPercent?: number;
}

export interface TradeResult {
  success: boolean;
  signature?: string;
  positionId?: string;
  quote?: TradeQuote;
  error?: string;
  explorerUrl?: string;
  retryCount?: number; // Track retry attempts
}

interface SignAndSendResult {
  signature: string;
  success: boolean;
  error?: string;
}

function base64ToBytes(base64: string): Uint8Array {
  // Browser-safe base64 decode (avoids Node's Buffer)
  const bin = globalThis.atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function useTradeExecution() {
  const [status, setStatus] = useState<TransactionStatus>('idle');
  const [currentQuote, setCurrentQuote] = useState<TradeQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const { toast } = useToast();
  const { mode } = useAppMode();

  const isDemo = mode === 'demo';

  // Get a quote without building transaction
  const getQuote = useCallback(async (params: Omit<TradeParams, 'priorityLevel'>): Promise<TradeQuote | null> => {
    if (isDemo) {
      // Return simulated quote in demo mode
      const mockQuote: TradeQuote = {
        inputAmount: parseInt(params.amount),
        outputAmount: Math.floor(parseInt(params.amount) * 0.95),
        inputAmountDecimal: parseInt(params.amount) / 1e9,
        outputAmountDecimal: (parseInt(params.amount) * 0.95) / 1e6,
        priceImpactPct: 0.12,
        slippageBps: params.slippageBps || 100,
        route: 'SOL → USDC (Simulated)',
      };
      setCurrentQuote(mockQuote);
      return mockQuote;
    }

    setStatus('fetching_quote');
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Please sign in to trade');
      }

      const { data, error: fnError } = await supabase.functions.invoke('trade-execution', {
        body: {
          action: 'quote',
          inputMint: params.inputMint,
          outputMint: params.outputMint,
          amount: params.amount,
          slippageBps: params.slippageBps || 100,
        },
      });

      if (fnError) throw fnError;
      if (data.error) throw new Error(data.error);

      const quote = data.quote as TradeQuote;
      setCurrentQuote(quote);
      setStatus('idle');
      return quote;
    } catch (err: any) {
      const message = err.message || 'Failed to get quote';
      setError(message);
      setStatus('failed');
      toast({
        title: 'Quote Error',
        description: message,
        variant: 'destructive',
      });
      return null;
    }
  }, [isDemo, toast]);

  // Execute a full trade (quote -> swap -> sign -> confirm)
  const executeTrade = useCallback(async (
    params: TradeParams,
    walletAddress: string,
    signAndSend: (transaction: VersionedTransaction) => Promise<SignAndSendResult>
  ): Promise<TradeResult> => {
    // Demo mode simulation
    if (isDemo) {
      setStatus('fetching_quote');
      await new Promise(r => setTimeout(r, 500));
      
      setStatus('building_tx');
      await new Promise(r => setTimeout(r, 300));
      
      setStatus('awaiting_signature');
      await new Promise(r => setTimeout(r, 1000));
      
      setStatus('broadcasting');
      await new Promise(r => setTimeout(r, 500));
      
      setStatus('confirming');
      await new Promise(r => setTimeout(r, 1500));
      
      const mockSignature = 'demo_' + Math.random().toString(36).substring(7);
      setTxSignature(mockSignature);
      setStatus('confirmed');

      toast({
        title: '🎉 Demo Trade Executed!',
        description: `Simulated swap of ${params.tokenSymbol || 'token'}`,
      });

      return {
        success: true,
        signature: mockSignature,
        positionId: 'demo_position_' + Date.now(),
        quote: {
          inputAmount: parseInt(params.amount),
          outputAmount: Math.floor(parseInt(params.amount) * 0.95),
          inputAmountDecimal: parseInt(params.amount) / 1e9,
          outputAmountDecimal: (parseInt(params.amount) * 0.95) / 1e6,
          priceImpactPct: 0.12,
          slippageBps: params.slippageBps || 100,
        },
      };
    }

    setStatus('fetching_quote');
    setError(null);
    setTxSignature(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Please sign in to trade');
      }

      // Step 1: Get quote and build transaction
      setStatus('building_tx');
      
      const { data, error: fnError } = await supabase.functions.invoke('trade-execution', {
        body: {
          action: 'execute',
          inputMint: params.inputMint,
          outputMint: params.outputMint,
          amount: params.amount,
          slippageBps: params.slippageBps || 100,
          userPublicKey: walletAddress,
          priorityLevel: params.priorityLevel || 'medium',
          tokenSymbol: params.tokenSymbol,
          tokenName: params.tokenName,
          profitTakePercent: params.profitTakePercent,
          stopLossPercent: params.stopLossPercent,
        },
      });

      if (fnError) throw fnError;
      if (data.error) throw new Error(data.error);

      const quote = data.quote as TradeQuote;
      setCurrentQuote(quote);

      // Step 2: Deserialize and sign transaction
      setStatus('awaiting_signature');
      
      const swapTransactionBytes = base64ToBytes(data.swapTransaction);
      const transaction = VersionedTransaction.deserialize(swapTransactionBytes);

      // Step 3: Sign and send
      setStatus('broadcasting');
      const signResult = await signAndSend(transaction);

      if (!signResult.success) {
        throw new Error(signResult.error || 'Transaction rejected');
      }

      setTxSignature(signResult.signature);
      setStatus('confirming');

      // Step 4: Confirm transaction
      const { data: confirmData, error: confirmError } = await supabase.functions.invoke('confirm-transaction', {
        body: {
          signature: signResult.signature,
          positionId: data.positionId,
          action: 'buy',
        },
      });

      if (confirmError) {
        console.error('Confirmation error:', confirmError);
      }

      const confirmed = confirmData?.confirmed ?? false;
      
      if (confirmed) {
        setStatus('confirmed');
        toast({
          title: '🎉 Trade Executed!',
          description: `Successfully swapped ${params.tokenSymbol || 'token'}`,
        });

        return {
          success: true,
          signature: signResult.signature,
          positionId: data.positionId,
          quote,
          explorerUrl: `https://solscan.io/tx/${signResult.signature}`,
        };
      } else {
        setStatus('failed');
        const failError = confirmData?.error || 'Transaction failed to confirm';
        setError(failError);

        toast({
          title: 'Transaction Failed',
          description: failError,
          variant: 'destructive',
        });

        return {
          success: false,
          signature: signResult.signature,
          error: failError,
          explorerUrl: `https://solscan.io/tx/${signResult.signature}`,
        };
      }
    } catch (err: any) {
      const message = err.message || 'Trade execution failed';
      setError(message);
      setStatus('failed');

      toast({
        title: 'Trade Failed',
        description: message,
        variant: 'destructive',
      });

      return {
        success: false,
        error: message,
      };
    }
  }, [isDemo, toast]);

  // Sell/close a position with automatic slippage retry
  const sellPosition = useCallback(async (
    tokenMint: string,
    amount: string,
    positionId: string,
    walletAddress: string,
    signAndSend: (transaction: VersionedTransaction) => Promise<SignAndSendResult>
  ): Promise<TradeResult> => {
    if (isDemo) {
      setStatus('confirmed');
      toast({
        title: '🎉 Demo Position Closed!',
        description: 'Simulated sell executed',
      });
      return { success: true, signature: 'demo_sell_' + Date.now() };
    }

    // CRITICAL: Check if this token is already being sold
    if (isSellLocked(tokenMint)) {
      toast({
        title: 'Sell Already In Progress',
        description: 'This token is already being sold by another process.',
        variant: 'destructive',
      });
      return { success: false, error: 'Sell already in progress' };
    }

    // Retry loop for slippage errors
    let retryCount = 0;
    let lastError: string | null = null;
    
    while (retryCount <= SLIPPAGE_RETRY_CONFIG.maxRetries) {
      try {
        if (retryCount > 0) {
          setStatus('retrying');
          // Wait before retry with exponential backoff
          const delay = getRetryDelay(retryCount - 1);
          console.log(`[Sell] Retrying with higher slippage (attempt ${retryCount + 1}), waiting ${delay}ms`);
          await new Promise(r => setTimeout(r, delay));
        }
        
        setStatus('fetching_quote');
        setError(null);

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          throw new Error('Please sign in to trade');
        }

        // Calculate dynamic slippage based on retry count
        const { slippageBps, reason } = calculateDynamicSlippage({
          isSell: true,
          isRetry: retryCount > 0,
          retryCount,
        });
        
        console.log(`[Sell] Using slippage: ${slippageBps} bps (${reason})`);

        // Get quote for selling token back to SOL
        setStatus('building_tx');
        
        const { data, error: fnError } = await supabase.functions.invoke('trade-execution', {
          body: {
            action: 'execute',
            inputMint: tokenMint,
            outputMint: SOL_MINT,
            amount,
            slippageBps,
            userPublicKey: walletAddress,
            priorityLevel: 'high', // Fast exit
          },
        });

        if (fnError) throw fnError;
        if (data.error) throw new Error(data.error);

        // Sign and send
        setStatus('awaiting_signature');
        const swapTransactionBytes = base64ToBytes(data.swapTransaction);
        const transaction = VersionedTransaction.deserialize(swapTransactionBytes);

        setStatus('broadcasting');
        const signResult = await signAndSend(transaction);

        if (!signResult.success) {
          throw new Error(signResult.error || 'Transaction rejected');
        }

        setTxSignature(signResult.signature);
        setStatus('confirming');

        // Confirm and update position
        const { data: confirmData } = await supabase.functions.invoke('confirm-transaction', {
          body: {
            signature: signResult.signature,
            positionId,
            action: 'sell',
          },
        });

        if (confirmData?.confirmed) {
          setStatus('confirmed');
          toast({
            title: '💰 Position Closed!',
            description: retryCount > 0 
              ? `Successfully sold after ${retryCount + 1} attempts` 
              : 'Successfully sold your position',
          });

          return {
            success: true,
            signature: signResult.signature,
            positionId,
            quote: data.quote,
            explorerUrl: `https://solscan.io/tx/${signResult.signature}`,
            retryCount,
          };
        } else {
          // Check if this is a slippage error that should trigger retry
          const errorMsg = confirmData?.error || 'Failed to confirm sell';
          if (isSlippageError(errorMsg) && retryCount < SLIPPAGE_RETRY_CONFIG.maxRetries) {
            lastError = errorMsg;
            retryCount++;
            continue; // Retry with higher slippage
          }
          throw new Error(errorMsg);
        }
      } catch (err: any) {
        const message = err.message || 'Sell failed';
        
        // Check if this is a slippage error that should trigger retry
        if (isSlippageError(message) && retryCount < SLIPPAGE_RETRY_CONFIG.maxRetries) {
          lastError = message;
          retryCount++;
          toast({
            title: 'Slippage Exceeded',
            description: `Retrying with higher slippage (attempt ${retryCount + 1}/${SLIPPAGE_RETRY_CONFIG.maxRetries + 1})...`,
          });
          continue; // Retry with higher slippage
        }
        
        // Non-retryable error or max retries reached
        setError(message);
        setStatus('failed');

        toast({
          title: retryCount > 0 ? 'Sell Failed After Retries' : 'Sell Failed',
          description: message,
          variant: 'destructive',
        });

        return {
          success: false,
          error: message,
          retryCount,
        };
      }
    }
    
    // Should not reach here, but handle edge case
    setError(lastError || 'Max retries exceeded');
    setStatus('failed');
    return {
      success: false,
      error: lastError || 'Max retries exceeded',
      retryCount,
    };
  }, [isDemo, toast]);

  const reset = useCallback(() => {
    setStatus('idle');
    setCurrentQuote(null);
    setError(null);
    setTxSignature(null);
  }, []);

  return {
    status,
    currentQuote,
    error,
    txSignature,
    isDemo,
    getQuote,
    executeTrade,
    sellPosition,
    reset,
  };
}
