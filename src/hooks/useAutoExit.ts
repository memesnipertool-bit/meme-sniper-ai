import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useNotifications } from '@/hooks/useNotifications';
import { useAppMode } from '@/contexts/AppModeContext';
import { useWallet } from '@/hooks/useWallet';

export interface ExitResult {
  positionId: string;
  symbol: string;
  action: 'hold' | 'take_profit' | 'stop_loss';
  currentPrice: number;
  profitLossPercent: number;
  executed: boolean;
  txId?: string;
  error?: string;
  pendingSignature?: boolean;
}

export interface AutoExitSummary {
  total: number;
  holding: number;
  takeProfitTriggered: number;
  stopLossTriggered: number;
  executed: number;
}

export function useAutoExit() {
  const [checking, setChecking] = useState(false);
  const [lastCheck, setLastCheck] = useState<string | null>(null);
  const [results, setResults] = useState<ExitResult[]>([]);
  const [pendingExits, setPendingExits] = useState<ExitResult[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isRunningRef = useRef(false);
  const { toast } = useToast();
  const { addNotification } = useNotifications();
  const { mode } = useAppMode();
  const { wallet, signAndSendTransaction, refreshBalance } = useWallet();
  
  // Demo mode guard
  const isDemo = mode === 'demo';

  // Execute a single pending exit via Jupiter
  const executePendingExit = useCallback(async (result: ExitResult): Promise<boolean> => {
    if (!wallet.isConnected || !wallet.address) {
      toast({
        title: 'Wallet Not Connected',
        description: 'Connect wallet to execute auto-exit',
        variant: 'destructive',
      });
      return false;
    }

    try {
      // Get the position details from DB
      const { data: position, error: posError } = await supabase
        .from('positions')
        .select('*')
        .eq('id', result.positionId)
        .single();

      if (posError || !position) {
        console.error('[AutoExit] Position not found:', result.positionId);
        return false;
      }

      // Build Jupiter swap transaction for the sell
      const SOL_MINT = 'So11111111111111111111111111111111111111112';
      const amountInSmallestUnit = Math.floor(position.amount * 1e9);
      
      // Get Jupiter quote
      const quoteUrl = new URL('https://api.jup.ag/quote/v6');
      quoteUrl.searchParams.set('inputMint', position.token_address);
      quoteUrl.searchParams.set('outputMint', SOL_MINT);
      quoteUrl.searchParams.set('amount', amountInSmallestUnit.toString());
      quoteUrl.searchParams.set('slippageBps', '1500');

      const quoteRes = await fetch(quoteUrl.toString());
      if (!quoteRes.ok) {
        toast({
          title: 'Exit Failed',
          description: 'Could not get Jupiter quote for sell',
          variant: 'destructive',
        });
        return false;
      }

      const quote = await quoteRes.json();
      if (!quote || quote.error) {
        toast({
          title: 'No Route Available',
          description: `Cannot sell ${result.symbol} - no Jupiter route`,
          variant: 'destructive',
        });
        return false;
      }

      // Build swap transaction
      const swapRes = await fetch('https://lite-api.jup.ag/swap/v1/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteResponse: quote,
          userPublicKey: wallet.address,
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
          dynamicSlippage: true,
          priorityLevelWithMaxLamports: { maxLamports: 5000000, priorityLevel: 'high' },
        }),
      });

      if (!swapRes.ok) {
        toast({
          title: 'Swap Build Failed',
          description: 'Could not build Jupiter swap transaction',
          variant: 'destructive',
        });
        return false;
      }

      const swapData = await swapRes.json();
      
      if (!swapData.swapTransaction) {
        toast({
          title: 'Transaction Error',
          description: 'Jupiter did not return transaction data',
          variant: 'destructive',
        });
        return false;
      }

      // Decode and sign transaction
      const txBytes = Uint8Array.from(atob(swapData.swapTransaction), c => c.charCodeAt(0));
      const { VersionedTransaction } = await import('@solana/web3.js');
      const transaction = VersionedTransaction.deserialize(txBytes);

      // Sign and send via wallet
      const signResult = await signAndSendTransaction(transaction);

      if (!signResult.success) {
        toast({
          title: 'Transaction Rejected',
          description: signResult.error || 'Wallet rejected the transaction',
          variant: 'destructive',
        });
        return false;
      }

      // Confirm transaction
      const { data: confirmData, error: confirmError } = await supabase.functions.invoke('confirm-transaction', {
        body: {
          signature: signResult.signature,
          positionId: result.positionId,
          action: 'sell',
        },
      });

      if (confirmError || !confirmData?.confirmed) {
        console.error('[AutoExit] Transaction confirmation failed:', confirmError);
        // Still mark as executed since tx was broadcast
      }

      // Update position as closed
      await supabase
        .from('positions')
        .update({
          status: 'closed',
          exit_reason: result.action,
          exit_price: result.currentPrice,
          exit_tx_id: signResult.signature,
          closed_at: new Date().toISOString(),
          profit_loss_percent: result.profitLossPercent,
        })
        .eq('id', result.positionId);

      // Success notification
      toast({
        title: result.action === 'take_profit' ? '💰 Take Profit Executed!' : '🛑 Stop Loss Executed!',
        description: `${result.symbol} sold at ${result.profitLossPercent >= 0 ? '+' : ''}${result.profitLossPercent.toFixed(1)}%`,
        variant: result.action === 'take_profit' ? 'default' : 'destructive',
      });

      refreshBalance();
      return true;

    } catch (error: any) {
      console.error('[AutoExit] Execute exit error:', error);
      toast({
        title: 'Exit Execution Failed',
        description: error.message || 'Unknown error',
        variant: 'destructive',
      });
      return false;
    }
  }, [wallet, signAndSendTransaction, refreshBalance, toast]);

  const checkExitConditions = useCallback(async (executeExits: boolean = true): Promise<{
    results: ExitResult[];
    summary: AutoExitSummary;
  } | null> => {
    // Prevent concurrent checks
    if (isRunningRef.current) {
      console.log('Auto-exit check already in progress, skipping...');
      return null;
    }

    isRunningRef.current = true;
    setChecking(true);

    try {
      // Demo mode guard - don't call real API
      if (isDemo) {
        console.log('[Demo Guard] Skipping real auto-exit API call in demo mode');
        isRunningRef.current = false;
        setChecking(false);
        return null;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.log('No session for auto-exit check');
        return null;
      }

      console.log('Running auto-exit check, executeExits:', executeExits);

      const { data, error } = await supabase.functions.invoke('auto-exit', {
        body: { executeExits },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setResults(data.results || []);
      setLastCheck(data.timestamp);

      const summary = data.summary as AutoExitSummary | undefined;

      // Guard against missing summary
      if (!summary) {
        console.log('Auto-exit returned no summary');
        return { results: data.results || [], summary: { total: 0, holding: 0, takeProfitTriggered: 0, stopLossTriggered: 0, executed: 0 } };
      }

      // Check for pending exits that need wallet signature
      const exitResults = (data.results as ExitResult[]) || [];
      const pendingSignatureExits = exitResults.filter(
        r => r.action !== 'hold' && !r.executed && r.error?.includes('PENDING_SIGNATURE')
      );

      if (pendingSignatureExits.length > 0 && executeExits && wallet.isConnected) {
        console.log(`[AutoExit] ${pendingSignatureExits.length} exits need wallet signature`);
        setPendingExits(pendingSignatureExits);

        // Auto-execute pending exits if wallet is connected
        for (const exitResult of pendingSignatureExits) {
          const success = await executePendingExit(exitResult);
          if (success) {
            summary.executed = (summary.executed || 0) + 1;
          }
        }
        setPendingExits([]);
      }

      // Notify on exits
      if ((summary.takeProfitTriggered || 0) > 0 || (summary.stopLossTriggered || 0) > 0) {
        exitResults.forEach((result) => {
          if (result.executed && result.action === 'take_profit') {
            toast({
              title: '💰 Take Profit Hit!',
              description: `${result.symbol} closed at +${result.profitLossPercent.toFixed(1)}%`,
            });
            addNotification({
              title: `Take Profit: ${result.symbol}`,
              message: `Closed at +${result.profitLossPercent.toFixed(1)}% profit`,
              type: 'trade',
              metadata: { positionId: result.positionId, action: result.action },
            });
          } else if (result.executed && result.action === 'stop_loss') {
            toast({
              title: '🛑 Stop Loss Hit',
              description: `${result.symbol} closed at ${result.profitLossPercent.toFixed(1)}%`,
              variant: 'destructive',
            });
            addNotification({
              title: `Stop Loss: ${result.symbol}`,
              message: `Closed at ${result.profitLossPercent.toFixed(1)}% loss`,
              type: 'error',
              metadata: { positionId: result.positionId, action: result.action },
            });
          }
        });
      }

      return { results: data.results, summary };
    } catch (error: any) {
      console.error('Auto-exit check error:', error);
      return null;
    } finally {
      setChecking(false);
      isRunningRef.current = false;
    }
  }, [toast, addNotification, isDemo, wallet.isConnected, executePendingExit]);

  const startAutoExitMonitor = useCallback((intervalMs: number = 30000) => {
    if (intervalRef.current) {
      console.log('Auto-exit monitor already running');
      return;
    }

    console.log(`Starting auto-exit monitor with ${intervalMs}ms interval`);
    
    // Run immediately on start
    checkExitConditions(true);

    // Then run periodically
    intervalRef.current = setInterval(() => {
      checkExitConditions(true);
    }, intervalMs);
  }, [checkExitConditions]);

  const stopAutoExitMonitor = useCallback(() => {
    if (intervalRef.current) {
      console.log('Stopping auto-exit monitor');
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    checking,
    lastCheck,
    results,
    pendingExits,
    checkExitConditions,
    executePendingExit,
    startAutoExitMonitor,
    stopAutoExitMonitor,
    isMonitoring: !!intervalRef.current,
  };
}
