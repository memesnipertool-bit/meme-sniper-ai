import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export interface TradeHistoryEntry {
  id: string;
  user_id: string;
  token_address: string;
  token_name: string | null;
  token_symbol: string | null;
  trade_type: 'buy' | 'sell';
  amount: number;
  price_sol: number | null;
  price_usd: number | null;
  status: string | null;
  tx_hash: string | null;
  created_at: string;
}

export function useTradeHistory(limit: number = 20) {
  const [trades, setTrades] = useState<TradeHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchTrades = useCallback(async () => {
    if (!user) {
      setTrades([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('trade_history')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      setTrades((data || []) as TradeHistoryEntry[]);
    } catch (error: any) {
      console.error('Error fetching trade history:', error);
      toast({
        title: 'Error',
        description: 'Failed to load trade history',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [user, limit, toast]);

  // Initial fetch
  useEffect(() => {
    fetchTrades();
  }, [fetchTrades]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('trade_history_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trade_history',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('Trade history update:', payload);
          fetchTrades();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchTrades]);

  return {
    trades,
    loading,
    refetch: fetchTrades,
  };
}
