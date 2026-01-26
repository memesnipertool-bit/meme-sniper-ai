import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
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
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchTrades = useCallback(async () => {
    // CRITICAL: Don't fetch if no user is logged in
    if (!user) {
      setTrades([]);
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      // CRITICAL FIX: Explicitly filter by user_id for data isolation
      const { data, error } = await supabase
        .from('copy_trades' as never)
        .select('*')
        .eq('user_id', user.id)
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
  }, [user, toast]);

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
    if (!user) {
      setTrades([]);
      return;
    }
    
    fetchTrades();

    // CRITICAL FIX: Add user_id filter to realtime subscription
    const channel = supabase
      .channel('copy-trades-changes')
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'copy_trades',
          filter: `user_id=eq.${user.id}`,
        },
        () => fetchTrades()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchTrades]);

  return {
    trades,
    loading,
    fetchTrades,
    addCopyTrade,
  };
}