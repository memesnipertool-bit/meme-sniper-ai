import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useNotifications } from '@/hooks/useNotifications';
import { useWallet } from '@/hooks/useWallet';
import { addBotLog } from '@/components/scanner/BotActivityLog';

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
  const { wallet, signAndSendTransaction, refreshBalance } = useWallet();

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

    const actionLabel = result.action === 'take_profit' ? '💰 TAKE PROFIT' : '🛑 STOP LOSS';
    // Note: At this point we don't have position details yet, so we use symbol
    // Full token name will be logged after DB fetch
    addBotLog({
      level: 'info',
      category: 'exit',
      message: `${actionLabel} triggered: ${result.symbol}`,
      tokenSymbol: result.symbol,
      details: `🪙 Token: ${result.symbol}\nCurrent P&L: ${result.profitLossPercent >= 0 ? '+' : ''}${result.profitLossPercent.toFixed(2)}% | Price: $${result.currentPrice.toFixed(8)}`,
    });

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
      
      // Get Jupiter quote - using lite-api endpoint (public, no auth required)
      // Exit slippage is intentionally higher (15%) to ensure positions can close
      const EXIT_SLIPPAGE_BPS = '1500'; // 15% - higher for exits to ensure execution
      const quoteUrl = `https://lite-api.jup.ag/v6/quote?inputMint=${position.token_address}&outputMint=${SOL_MINT}&amount=${amountInSmallestUnit}&slippageBps=${EXIT_SLIPPAGE_BPS}`;

      const quoteRes = await fetch(quoteUrl);
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

      // Log sell to trade_history
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('trade_history')
          .insert({
            user_id: user.id,
            token_address: position.token_address,
            token_symbol: position.token_symbol,
            token_name: position.token_name,
            trade_type: 'sell',
            amount: position.amount,
            price_sol: result.currentPrice,
            price_usd: null,
            status: 'completed',
            tx_hash: signResult.signature,
          });
      }

      // Success notification & detailed log with position data
      const exitLabel = result.action === 'take_profit' ? '💰 TAKE PROFIT' : '🛑 STOP LOSS';
      const pnlText = result.profitLossPercent >= 0 ? `+${result.profitLossPercent.toFixed(2)}%` : `${result.profitLossPercent.toFixed(2)}%`;
      const entryPrice = position.entry_price_usd || position.entry_price || 0;
      const exitValue = result.currentPrice * position.amount;
      const entryValue = position.entry_value || (entryPrice * position.amount);
      const pnlValue = entryValue * (result.profitLossPercent / 100);
      const tokenName = position.token_name || result.symbol;
      
      addBotLog({
        level: result.action === 'take_profit' ? 'success' : 'warning',
        category: 'exit',
        message: `✅ SELL FILLED: ${tokenName} (${result.symbol})`,
        tokenSymbol: result.symbol,
        details: `🪙 Token: ${tokenName} (${result.symbol})\n📊 Entry: $${entryPrice.toFixed(8)} → Exit: $${result.currentPrice.toFixed(8)}\nP&L: ${pnlText} ($${pnlValue >= 0 ? '+' : ''}${pnlValue.toFixed(4)}) | Reason: ${result.action.replace('_', ' ')}\nTokens Sold: ${position.amount.toLocaleString()} | Exit Value: $${exitValue.toFixed(4)}\n🔗 TX: ${signResult.signature}`,
      });

      toast({
        title: result.action === 'take_profit' ? '💰 Take Profit Executed!' : '🛑 Stop Loss Executed!',
        description: `${result.symbol} sold at ${result.profitLossPercent >= 0 ? '+' : ''}${result.profitLossPercent.toFixed(1)}%`,
        variant: result.action === 'take_profit' ? 'default' : 'destructive',
      });

      refreshBalance();
      return true;

    } catch (error: any) {
      console.error('[AutoExit] Execute exit error:', error);
      
      // Note: position is not available in catch block, use result.symbol only
      addBotLog({
        level: 'error',
        category: 'exit',
        message: `❌ SELL FAILED: ${result.symbol}`,
        tokenSymbol: result.symbol,
        details: `🪙 Token: ${result.symbol}\nReason: ${error.message || 'Unknown error'}\nPrice at failure: $${result.currentPrice.toFixed(8)} | P&L: ${result.profitLossPercent >= 0 ? '+' : ''}${result.profitLossPercent.toFixed(2)}%\nAttempted: ${result.action.replace('_', ' ')} exit`,
      });

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
      // NOTE: Removed demo guard - let demo mode handle separately in useDemoAutoExit
      // This hook should only be called in live mode from Scanner.tsx

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.log('No session for auto-exit check');
        isRunningRef.current = false;
        setChecking(false);
        return null;
      }

      console.log('[AutoExit] Running check, executeExits:', executeExits, 'wallet:', wallet.isConnected, 'address:', wallet.address);

      const { data, error } = await supabase.functions.invoke('auto-exit', {
        body: { 
          executeExits,
          walletAddress: wallet.address, // Pass wallet address for on-chain balance check
        },
      });

      if (error) {
        console.error('[AutoExit] Edge function error:', error);
        throw error;
      }
      if (data.error) throw new Error(data.error);

      console.log('[AutoExit] Results:', data.results?.length || 0, 'positions checked');
      
      setResults(data.results || []);
      setLastCheck(data.timestamp || new Date().toISOString());

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

      // Also handle exits that were force-closed (no_route) to show proper notifications
      const forceClosedExits = exitResults.filter(
        r => r.executed && (r.txId === 'force_closed_no_route' || r.error?.includes('force_closed'))
      );
      
      // Log force-closed positions to activity
      forceClosedExits.forEach((result) => {
        const actionLabel = result.action === 'take_profit' ? '💰 TAKE PROFIT' : '🛑 STOP LOSS';
        addBotLog({
          level: 'warning',
          category: 'exit',
          message: `⚠️ ${actionLabel} (Force Closed): ${result.symbol}`,
          tokenSymbol: result.symbol,
          details: `Position closed without swap - token has no Jupiter route (illiquid)\nP&L at close: ${result.profitLossPercent >= 0 ? '+' : ''}${result.profitLossPercent.toFixed(2)}% | Price: $${result.currentPrice.toFixed(8)}`,
        });
        
        toast({
          title: `⚠️ Position Force-Closed`,
          description: `${result.symbol} removed from active trades - no swap route available`,
          variant: 'destructive',
        });
      });

      if (pendingSignatureExits.length > 0 && executeExits && wallet.isConnected) {
        console.log(`[AutoExit] ${pendingSignatureExits.length} exits need wallet signature`);
        setPendingExits(pendingSignatureExits);

        // Auto-execute pending exits if wallet is connected
        for (const exitResult of pendingSignatureExits) {
          addBotLog({
            level: 'info',
            category: 'exit',
            message: `🔐 Requesting wallet signature: ${exitResult.symbol}`,
            tokenSymbol: exitResult.symbol,
            details: `${exitResult.action === 'take_profit' ? 'Take Profit' : 'Stop Loss'} triggered - awaiting user confirmation\nP&L: ${exitResult.profitLossPercent >= 0 ? '+' : ''}${exitResult.profitLossPercent.toFixed(2)}%`,
          });
          
          const success = await executePendingExit(exitResult);
          if (success) {
            summary.executed = (summary.executed || 0) + 1;
          }
        }
        setPendingExits([]);
      }

      // Notify on exits (only for non-force-closed)
      if ((summary.takeProfitTriggered || 0) > 0 || (summary.stopLossTriggered || 0) > 0) {
        exitResults.forEach((result) => {
          // Skip force-closed - already handled above
          if (result.txId === 'force_closed_no_route') return;
          
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
  }, [toast, addNotification, wallet.isConnected, executePendingExit]);

  // Default monitor interval: 30 seconds - balanced between responsiveness and API load
  const DEFAULT_MONITOR_INTERVAL_MS = 30000;
  
  const startAutoExitMonitor = useCallback((intervalMs: number = DEFAULT_MONITOR_INTERVAL_MS) => {
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
