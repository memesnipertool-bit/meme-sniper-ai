import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface Position {
  id: string;
  user_id: string;
  token_address: string;
  token_symbol: string | null;
  token_name: string | null;
  chain: string;
  entry_price: number;
  current_price: number | null;
  amount: number;
  entry_value: number | null;
  current_value: number | null;
  profit_loss_percent: number;
  profit_loss_value: number | null;
  profit_take_percent: number;
  stop_loss_percent: number;
  pnl_percentage: number | null;
  status: 'open' | 'closed' | 'pending';
  exit_reason: string | null;
  exit_price: number | null;
  exit_tx_id: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

export interface ExitResult {
  positionId: string;
  symbol: string;
  action: 'hold' | 'take_profit' | 'stop_loss';
  currentPrice: number;
  profitLossPercent: number;
  executed: boolean;
  txId?: string;
  error?: string;
}

export interface AutoExitSummary {
  total: number;
  holding: number;
  takeProfitTriggered: number;
  stopLossTriggered: number;
  executed: number;
}

export function usePositions() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingExits, setCheckingExits] = useState(false);
  const [lastExitCheck, setLastExitCheck] = useState<string | null>(null);
  const [exitResults, setExitResults] = useState<ExitResult[]>([]);
  const { toast } = useToast();

  // Fetch positions
  const fetchPositions = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('positions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPositions((data as unknown as Position[]) || []);
    } catch (error: unknown) {
      const err = error as Error;
      toast({
        title: 'Error fetching positions',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Create a new position
  const createPosition = useCallback(async (
    tokenAddress: string,
    tokenSymbol: string,
    tokenName: string,
    chain: string,
    entryPrice: number,
    amount: number,
    profitTakePercent: number,
    stopLossPercent: number
  ): Promise<Position | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const entryValue = amount * entryPrice;

      const { data, error } = await supabase
        .from('positions')
        .insert({
          user_id: user.id,
          token_address: tokenAddress,
          token_symbol: tokenSymbol,
          token_name: tokenName,
          chain,
          entry_price: entryPrice,
          current_price: entryPrice,
          amount,
          entry_value: entryValue,
          current_value: entryValue,
          profit_take_percent: profitTakePercent,
          stop_loss_percent: stopLossPercent,
        })
        .select()
        .single();

      if (error) throw error;

      const newPosition = data as unknown as Position;
      setPositions(prev => [newPosition, ...prev]);
      
      // Log activity (fire and forget)
      supabase.from('user_activity_logs' as never).insert({
        user_id: user.id,
        activity_type: 'position_opened',
        activity_category: 'trading',
        description: `Opened position: ${tokenSymbol} with ${amount} tokens at $${entryPrice.toFixed(6)}`,
        metadata: {
          position_id: newPosition.id,
          token_address: tokenAddress,
          token_symbol: tokenSymbol,
          entry_price: entryPrice,
          amount,
          profit_take_percent: profitTakePercent,
          stop_loss_percent: stopLossPercent,
        },
      } as never).then(({ error: logError }) => {
        if (logError) console.error('Failed to log activity:', logError);
      });
      
      toast({
        title: 'Position Created',
        description: `Tracking ${tokenSymbol} with TP: ${profitTakePercent}% / SL: ${stopLossPercent}%`,
      });

      return newPosition;
    } catch (error: unknown) {
      const err = error as Error;
      toast({
        title: 'Error creating position',
        description: err.message,
        variant: 'destructive',
      });
      return null;
    }
  }, [toast]);

  // Check exit conditions for all open positions
  const checkExitConditions = useCallback(async (executeExits: boolean = false): Promise<{
    results: ExitResult[];
    summary: AutoExitSummary;
  } | null> => {
    try {
      setCheckingExits(true);
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const { data, error } = await supabase.functions.invoke('auto-exit', {
        body: { executeExits },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setExitResults(data.results || []);
      setLastExitCheck(data.timestamp);

      // Refresh positions after check
      await fetchPositions();

      const summary = data.summary as AutoExitSummary | undefined;
      
      // Guard against missing summary
      if (!summary) {
        console.log('Auto-exit returned no summary');
        return { results: data.results || [], summary: { total: 0, holding: 0, takeProfitTriggered: 0, stopLossTriggered: 0, executed: 0 } };
      }
      
      if ((summary.takeProfitTriggered || 0) > 0 || (summary.stopLossTriggered || 0) > 0) {
        toast({
          title: 'Exit Conditions Met',
          description: `Take Profit: ${summary.takeProfitTriggered || 0}, Stop Loss: ${summary.stopLossTriggered || 0}${executeExits ? `, Executed: ${summary.executed || 0}` : ''}`,
          variant: (summary.stopLossTriggered || 0) > 0 ? 'destructive' : 'default',
        });
      }

      return { results: data.results, summary };
    } catch (error: unknown) {
      const err = error as Error;
      toast({
        title: 'Error checking exit conditions',
        description: err.message,
        variant: 'destructive',
      });
      return null;
    } finally {
      setCheckingExits(false);
    }
  }, [toast, fetchPositions]);

  // Close a position manually
  const closePosition = useCallback(async (positionId: string, exitPrice: number) => {
    try {
      const position = positions.find(p => p.id === positionId);
      if (!position) throw new Error('Position not found');

      const currentValue = position.amount * exitPrice;
      const entryValue = position.entry_value || (position.amount * position.entry_price);
      const profitLossValue = currentValue - entryValue;
      const profitLossPercent = ((exitPrice - position.entry_price) / position.entry_price) * 100;

      const { error } = await supabase
        .from('positions')
        .update({
          status: 'closed',
          exit_reason: 'manual',
          exit_price: exitPrice,
          current_price: exitPrice,
          current_value: currentValue,
          profit_loss_percent: profitLossPercent,
          profit_loss_value: profitLossValue,
          closed_at: new Date().toISOString(),
        })
        .eq('id', positionId);

      if (error) throw error;

      // Log activity
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        supabase.from('user_activity_logs' as never).insert({
          user_id: user.id,
          activity_type: 'position_closed',
          activity_category: 'trading',
          description: `Closed position: ${position.token_symbol} with ${profitLossPercent >= 0 ? '+' : ''}${profitLossPercent.toFixed(2)}% P&L`,
          metadata: {
            position_id: positionId,
            token_symbol: position.token_symbol,
            entry_price: position.entry_price,
            exit_price: exitPrice,
            profit_loss_percent: profitLossPercent,
            profit_loss_value: profitLossValue,
            exit_reason: 'manual',
          },
        } as never).then(({ error: logError }) => {
          if (logError) console.error('Failed to log activity:', logError);
        });
      }

      await fetchPositions();
      
      toast({
        title: 'Position Closed',
        description: `${position.token_symbol} closed with ${profitLossPercent >= 0 ? '+' : ''}${profitLossPercent.toFixed(2)}%`,
      });
    } catch (error: unknown) {
      const err = error as Error;
      toast({
        title: 'Error closing position',
        description: err.message,
        variant: 'destructive',
      });
    }
  }, [positions, toast, fetchPositions]);

  // Subscribe to realtime updates
  useEffect(() => {
    fetchPositions();

    const channel = supabase
      .channel('positions-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'positions',
        },
        () => {
          fetchPositions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchPositions]);

  const openPositions = positions.filter(p => p.status === 'open');
  const closedPositions = positions.filter(p => p.status === 'closed');
  const pendingPositions = positions.filter(p => p.status === 'pending');

  return {
    positions,
    openPositions,
    closedPositions,
    pendingPositions,
    loading,
    checkingExits,
    lastExitCheck,
    exitResults,
    fetchPositions,
    createPosition,
    checkExitConditions,
    closePosition,
  };
}