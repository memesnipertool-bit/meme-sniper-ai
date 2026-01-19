/**
 * React Hook for the 3-Stage Trading Engine
 * Wraps the trading engine with state management and wallet integration
 * 
 * CRITICAL: This hook now persists positions to the database after successful snipes
 */

import { useState, useCallback, useRef } from 'react';
import { VersionedTransaction } from '@solana/web3.js';
import { useToast } from '@/hooks/use-toast';
import { useAppMode } from '@/contexts/AppModeContext';
import { supabase } from '@/integrations/supabase/client';

import {
  runTradingFlow,
  quickSnipe,
  executeExit,
  checkTokenStatus,
  detectLiquidity,
  createTradingConfig,
  type TradingConfig,
  type TradingFlowResult,
  type TradingEvent,
  type LiquidityDetectionResult,
  type JupiterIndexStatus,
  type UnsignedTransaction,
} from '@/lib/trading-engine';

export type TradingEngineStatus = 
  | 'idle'
  | 'detecting_liquidity'
  | 'sniping'
  | 'waiting_jupiter'
  | 'executing_exit'
  | 'success'
  | 'failed';

export interface TradingEngineState {
  status: TradingEngineStatus;
  currentToken: string | null;
  lastResult: TradingFlowResult | null;
  error: string | null;
  events: TradingEvent[];
}

interface SignAndSendResult {
  signature: string;
  success: boolean;
  error?: string;
}

function base64ToBytes(base64: string): Uint8Array {
  const bin = globalThis.atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function useTradingEngine() {
  const [state, setState] = useState<TradingEngineState>({
    status: 'idle',
    currentToken: null,
    lastResult: null,
    error: null,
    events: [],
  });
  
  const { toast } = useToast();
  const { mode } = useAppMode();
  const isDemo = mode === 'demo';
  const abortControllerRef = useRef<AbortController | null>(null);
  const isExecutingRef = useRef(false);

  // Convert wallet signAndSend to engine format
  const createSignTransaction = useCallback((
    walletSignAndSend: (tx: VersionedTransaction) => Promise<SignAndSendResult>
  ) => {
    return async (unsignedTx: UnsignedTransaction): Promise<{ signature: string; error?: string }> => {
      try {
        const txBytes = base64ToBytes(unsignedTx.serializedTransaction);
        const transaction = VersionedTransaction.deserialize(txBytes);
        const result = await walletSignAndSend(transaction);
        
        if (!result.success) {
          return { signature: '', error: result.error || 'Transaction rejected' };
        }
        
        return { signature: result.signature };
      } catch (err) {
        return { signature: '', error: err instanceof Error ? err.message : 'Signing failed' };
      }
    };
  }, []);

  // Event handler for trading flow
  const handleEvent = useCallback((event: TradingEvent) => {
    setState(prev => ({
      ...prev,
      events: [...prev.events.slice(-50), event], // Keep last 50 events
    }));

    // Update status based on event
    switch (event.type) {
      case 'LIQUIDITY_DETECTED':
        setState(prev => ({ ...prev, status: 'detecting_liquidity' }));
        break;
      case 'SNIPE_STARTED':
        setState(prev => ({ ...prev, status: 'sniping' }));
        break;
      case 'SNIPE_SUCCESS':
        toast({
          title: '🎯 Snipe Successful!',
          description: `Entry at ${event.data.entryPrice?.toFixed(8)} | TX: ${event.data.txHash?.slice(0, 12)}...`,
        });
        break;
      case 'SNIPE_FAILED':
        toast({
          title: 'Snipe Failed',
          description: event.data.error,
          variant: 'destructive',
        });
        break;
      case 'JUPITER_POLLING':
        setState(prev => ({ ...prev, status: 'waiting_jupiter' }));
        break;
      case 'JUPITER_READY':
        toast({
          title: '✅ Jupiter Ready',
          description: `Token now tradeable via ${event.data.availableDexes.join(', ')}`,
        });
        break;
      case 'TRADE_EXECUTED':
        if (event.data.status === 'TRADE_COMPLETE') {
          toast({
            title: '💰 Trade Complete!',
            description: `TX: ${event.data.txHash?.slice(0, 12)}...`,
          });
        }
        break;
      case 'FLOW_COMPLETE':
        setState(prev => ({
          ...prev,
          status: event.data.status === 'SUCCESS' ? 'success' : 'failed',
          lastResult: event.data,
        }));
        break;
      case 'ERROR':
        console.error(`[TradingEngine] ${event.data.stage}: ${event.data.error}`);
        break;
    }
  }, [toast]);

  /**
   * Quick snipe a token - detect liquidity and execute immediately
   */
  const snipeToken = useCallback(async (
    tokenAddress: string,
    walletAddress: string,
    walletSignAndSend: (tx: VersionedTransaction) => Promise<SignAndSendResult>,
    config?: Partial<TradingConfig>
  ): Promise<TradingFlowResult | null> => {
    if (isExecutingRef.current) {
      console.log('[TradingEngine] Already executing, skipping');
      return null;
    }

    // Demo mode simulation
    if (isDemo) {
      setState(prev => ({ ...prev, status: 'sniping', currentToken: tokenAddress }));
      await new Promise(r => setTimeout(r, 1500));
      
      const mockResult: TradingFlowResult = {
        status: 'SUCCESS',
        stages: {
          liquidityDetection: null,
          raydiumSnipe: {
            status: 'SNIPED',
            txHash: 'demo_' + Math.random().toString(36).substring(7),
            entryPrice: 0.0001,
            tokenAmount: 1000000,
            solSpent: config?.buyAmount || 0.1,
            attempts: 1,
            snipedAt: Date.now(),
          },
          jupiterReady: false,
        },
        position: {
          tokenAddress,
          tokenSymbol: 'DEMO',
          entryPrice: 0.0001,
          tokenAmount: 1000000,
          solSpent: config?.buyAmount || 0.1,
          entryTxHash: 'demo_tx',
          status: 'OPEN',
          jupiterEnabled: false,
        },
        startedAt: Date.now() - 1500,
        completedAt: Date.now(),
      };

      setState(prev => ({
        ...prev,
        status: 'success',
        lastResult: mockResult,
      }));

      toast({
        title: '🎯 Demo Snipe Executed!',
        description: 'Simulated snipe successful',
      });

      return mockResult;
    }

    isExecutingRef.current = true;
    abortControllerRef.current = new AbortController();

    setState({
      status: 'detecting_liquidity',
      currentToken: tokenAddress,
      lastResult: null,
      error: null,
      events: [],
    });

    try {
      const result = await quickSnipe(tokenAddress, {
        walletAddress,
        signTransaction: createSignTransaction(walletSignAndSend),
        config,
        onEvent: handleEvent,
        abortSignal: abortControllerRef.current.signal,
      });

      // CRITICAL: Persist position to database after successful snipe
      if (result.status === 'SUCCESS' && result.position) {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const position = result.position;
            const entryValue = position.solSpent;
            
            const { data: savedPosition, error: dbError } = await supabase
              .from('positions')
              .insert({
                user_id: user.id,
                token_address: position.tokenAddress,
                token_symbol: position.tokenSymbol,
                token_name: position.tokenSymbol, // Use symbol as fallback
                chain: 'solana',
                entry_price: position.entryPrice,
                current_price: position.entryPrice,
                amount: position.tokenAmount,
                entry_value: entryValue,
                current_value: entryValue,
                profit_take_percent: config?.maxRiskScore ? 100 : 50, // Default TP
                stop_loss_percent: 20, // Default SL
                status: 'open',
              })
              .select()
              .single();

            if (dbError) {
              console.error('[TradingEngine] Failed to persist position:', dbError);
              // Don't fail the trade, just log
            } else {
              console.log('[TradingEngine] Position saved to database:', savedPosition?.id);
            }
          }
        } catch (persistError) {
          console.error('[TradingEngine] Position persistence error:', persistError);
          // Trade succeeded, don't fail on DB error
        }
      }

      setState(prev => ({
        ...prev,
        status: result.status === 'SUCCESS' ? 'success' : 'failed',
        lastResult: result,
        error: result.error || null,
      }));

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Snipe failed';
      setState(prev => ({
        ...prev,
        status: 'failed',
        error: errorMessage,
      }));
      
      toast({
        title: 'Snipe Failed',
        description: errorMessage,
        variant: 'destructive',
      });
      
      return null;
    } finally {
      isExecutingRef.current = false;
      abortControllerRef.current = null;
    }
  }, [isDemo, toast, createSignTransaction, handleEvent]);

  /**
   * Exit a position using Jupiter
   */
  const exitPosition = useCallback(async (
    tokenAddress: string,
    tokenAmount: number,
    walletAddress: string,
    walletSignAndSend: (tx: VersionedTransaction) => Promise<SignAndSendResult>,
    config?: Partial<TradingConfig>
  ): Promise<{ success: boolean; txHash: string | null; solReceived: number | null; error?: string }> => {
    if (isDemo) {
      await new Promise(r => setTimeout(r, 1000));
      toast({
        title: '💰 Demo Exit Complete!',
        description: 'Simulated sell executed',
      });
      return {
        success: true,
        txHash: 'demo_exit_' + Date.now(),
        solReceived: tokenAmount * 0.0001,
      };
    }

    setState(prev => ({ ...prev, status: 'executing_exit' }));

    try {
      const result = await executeExit(tokenAddress, tokenAmount, {
        walletAddress,
        signTransaction: createSignTransaction(walletSignAndSend),
        config,
        onEvent: handleEvent,
      });

      setState(prev => ({
        ...prev,
        status: result.success ? 'success' : 'failed',
        error: result.error || null,
      }));

      if (result.success) {
        toast({
          title: '💰 Position Closed!',
          description: `Received ${result.solReceived?.toFixed(4)} SOL`,
        });
      }

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Exit failed';
      setState(prev => ({
        ...prev,
        status: 'failed',
        error: errorMessage,
      }));
      
      return { success: false, txHash: null, solReceived: null, error: errorMessage };
    }
  }, [isDemo, toast, createSignTransaction, handleEvent]);

  /**
   * Check token status without trading
   */
  const checkToken = useCallback(async (
    tokenAddress: string,
    config?: Partial<TradingConfig>
  ): Promise<{
    liquidity: LiquidityDetectionResult;
    jupiterStatus: JupiterIndexStatus;
  } | null> => {
    try {
      return await checkTokenStatus(tokenAddress, config, handleEvent);
    } catch (err) {
      console.error('[TradingEngine] Check token failed:', err);
      return null;
    }
  }, [handleEvent]);

  /**
   * Abort current operation
   */
  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setState(prev => ({
        ...prev,
        status: 'idle',
        error: 'Aborted by user',
      }));
    }
  }, []);

  /**
   * Reset state
   */
  const reset = useCallback(() => {
    setState({
      status: 'idle',
      currentToken: null,
      lastResult: null,
      error: null,
      events: [],
    });
  }, []);

  return {
    // State
    ...state,
    isExecuting: isExecutingRef.current,
    isDemo,
    
    // Actions
    snipeToken,
    exitPosition,
    checkToken,
    abort,
    reset,
    
    // Utilities
    createConfig: createTradingConfig,
  };
}
