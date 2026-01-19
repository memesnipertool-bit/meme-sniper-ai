import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useWallet } from '@/hooks/useWallet';
import { useAppMode } from '@/contexts/AppModeContext';
import { RealtimeChannel } from '@supabase/supabase-js';

export interface TradeSignal {
  id: string;
  user_id: string;
  token_address: string;
  token_symbol: string;
  token_name: string;
  chain: string;
  liquidity: number;
  price_usd: number | null;
  risk_score: number;
  trade_amount: number;
  slippage: number;
  priority: string;
  status: 'pending' | 'executed' | 'expired' | 'cancelled';
  reasons: string[];
  source: string | null;
  is_pump_fun: boolean;
  tx_signature: string | null;
  executed_at: string | null;
  expires_at: string;
  created_at: string;
  metadata: Record<string, any>;
}

export function useTradeSignals() {
  const [signals, setSignals] = useState<TradeSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState<string | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  const { wallet, signAndSendTransaction } = useWallet();
  const { mode } = useAppMode();
  const isDemo = mode === 'demo';

  // Fetch pending signals
  const fetchSignals = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('trade_signals')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Type assertion since we know the structure
      setSignals((data as unknown as TradeSignal[]) || []);
    } catch (error: any) {
      console.error('Error fetching trade signals:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!user) return;

    fetchSignals();

    // Subscribe to realtime changes
    const channel: RealtimeChannel = supabase
      .channel('trade_signals_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trade_signals',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('[TradeSignals] Realtime update:', payload);
          
          if (payload.eventType === 'INSERT') {
            const newSignal = payload.new as unknown as TradeSignal;
            setSignals(prev => [newSignal, ...prev]);
            
            // Show notification for new signal
            toast({
              title: '🎯 Trade Signal',
              description: `${newSignal.token_symbol} approved! Click to execute.`,
            });
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as unknown as TradeSignal;
            setSignals(prev => 
              prev.map(s => s.id === updated.id ? updated : s)
                .filter(s => s.status === 'pending')
            );
          } else if (payload.eventType === 'DELETE') {
            const deleted = payload.old as { id: string };
            setSignals(prev => prev.filter(s => s.id !== deleted.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchSignals, toast]);

  // Execute a trade signal
  const executeSignal = useCallback(async (signal: TradeSignal) => {
    if (!user || !wallet.isConnected) {
      toast({
        title: 'Wallet Required',
        description: 'Please connect your wallet to execute trades.',
        variant: 'destructive',
      });
      return { success: false, error: 'Wallet not connected' };
    }

    if (isDemo) {
      // Demo mode simulation
      toast({
        title: 'Demo Mode',
        description: `Simulated trade for ${signal.token_symbol}`,
      });
      
      await supabase
        .from('trade_signals')
        .update({ 
          status: 'executed', 
          executed_at: new Date().toISOString(),
          tx_signature: `demo_${Date.now()}`,
        })
        .eq('id', signal.id);
      
      return { success: true, txSignature: `demo_${Date.now()}` };
    }

    setExecuting(signal.id);

    try {
      // Step 1: Get quote and build transaction from trade-execution edge function
      const { data: tradeData, error: tradeError } = await supabase.functions.invoke('trade-execution', {
        body: {
          action: 'execute',
          inputMint: 'So11111111111111111111111111111111111111112', // SOL
          outputMint: signal.token_address,
          amount: String(Math.floor(signal.trade_amount * 1e9)), // Convert to lamports
          slippageBps: signal.slippage * 100,
          userPublicKey: wallet.address,
          tokenSymbol: signal.token_symbol,
          tokenName: signal.token_name,
          priorityLevel: signal.priority,
          isPumpFun: signal.is_pump_fun,
        },
      });

      if (tradeError || !tradeData?.success) {
        throw new Error(tradeData?.error || tradeError?.message || 'Failed to build transaction');
      }

      // Step 2: Decode and sign the transaction
      const txBytes = Uint8Array.from(atob(tradeData.swapTransaction), c => c.charCodeAt(0));
      const { VersionedTransaction } = await import('@solana/web3.js');
      const transaction = VersionedTransaction.deserialize(txBytes);

      // Step 3: Sign and send via wallet
      const signResult = await signAndSendTransaction(transaction);

      if (signResult.error) {
        throw new Error(signResult.error);
      }

      // Step 4: Update signal status
      await supabase
        .from('trade_signals')
        .update({ 
          status: 'executed', 
          executed_at: new Date().toISOString(),
          tx_signature: signResult.signature,
        })
        .eq('id', signal.id);

      // Step 5: Update position status if created
      if (tradeData.positionId) {
        await supabase
          .from('positions')
          .update({ status: 'open' })
          .eq('id', tradeData.positionId);
      }

      toast({
        title: '✅ Trade Executed!',
        description: `Bought ${signal.token_symbol} successfully`,
      });

      return { success: true, txSignature: signResult.signature };

    } catch (error: any) {
      console.error('Trade execution error:', error);
      
      // Mark signal as failed/cancelled
      await supabase
        .from('trade_signals')
        .update({ 
          status: 'cancelled',
          metadata: { error: error.message },
        })
        .eq('id', signal.id);

      toast({
        title: 'Trade Failed',
        description: error.message || 'Failed to execute trade',
        variant: 'destructive',
      });

      return { success: false, error: error.message };
    } finally {
      setExecuting(null);
    }
  }, [user, wallet, signAndSendTransaction, isDemo, toast]);

  // Cancel a signal
  const cancelSignal = useCallback(async (signalId: string) => {
    try {
      await supabase
        .from('trade_signals')
        .update({ status: 'cancelled' })
        .eq('id', signalId);

      setSignals(prev => prev.filter(s => s.id !== signalId));
    } catch (error: any) {
      console.error('Error cancelling signal:', error);
    }
  }, []);

  // Clean up expired signals
  const cleanupExpired = useCallback(async () => {
    if (!user) return;

    try {
      await supabase
        .from('trade_signals')
        .update({ status: 'expired' })
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .lt('expires_at', new Date().toISOString());

      fetchSignals();
    } catch (error: any) {
      console.error('Error cleaning up signals:', error);
    }
  }, [user, fetchSignals]);

  // Periodically clean up expired signals
  useEffect(() => {
    const interval = setInterval(cleanupExpired, 60000); // Every minute
    return () => clearInterval(interval);
  }, [cleanupExpired]);

  return {
    signals,
    loading,
    executing,
    executeSignal,
    cancelSignal,
    refreshSignals: fetchSignals,
    pendingCount: signals.length,
  };
}
