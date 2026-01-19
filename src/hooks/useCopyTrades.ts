import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface CopyTrade {
  id: string;
  user_id: string;
  leader_address: string;
  leader_name: string | null;
  token_address: string;
  token_symbol: string;
  action: 'buy' | 'sell';
  amount: number;
  price: number;
  tx_id: string | null;
  status: 'pending' | 'executed' | 'failed';
  created_at: string;
}

export function useCopyTrades() {
  const [trades, setTrades] = useState<CopyTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchTrades = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('copy_trades' as never)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setTrades((data as unknown as CopyTrade[]) || []);
    } catch (error: unknown) {
      const err = error as Error;
      toast({
        title: 'Error fetching copy trades',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const addCopyTrade = useCallback(async (trade: Omit<CopyTrade, 'id' | 'user_id' | 'created_at'>) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('copy_trades' as never)
        .insert({ ...trade, user_id: user.id } as never)
        .select()
        .single();

      if (error) throw error;
      
      setTrades(prev => [data as unknown as CopyTrade, ...prev]);
      return data as unknown as CopyTrade;
    } catch (error: unknown) {
      const err = error as Error;
      toast({
        title: 'Error adding copy trade',
        description: err.message,
        variant: 'destructive',
      });
      return null;
    }
  }, [toast]);

  useEffect(() => {
    fetchTrades();

    const channel = supabase
      .channel('copy-trades-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'copy_trades' },
        () => fetchTrades()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchTrades]);

  return {
    trades,
    loading,
    fetchTrades,
    addCopyTrade,
  };
}