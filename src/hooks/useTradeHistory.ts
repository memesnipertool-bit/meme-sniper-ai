import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { fetchDexScreenerTokenMetadata, isPlaceholderTokenText } from '@/lib/dexscreener';

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

  // Cache DexScreener metadata by token address to avoid repeated external calls
  const tokenMetaCacheRef = useState(() => new Map<string, { name: string; symbol: string }>())[0];

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

      const rawTrades = ((data || []) as TradeHistoryEntry[]).map((t) => ({ ...t }));
      setTrades(rawTrades);

      // Enrich missing/placeholder token metadata
      const addressesToFetch = Array.from(
        new Set(
          rawTrades
            .filter((t) => isPlaceholderTokenText(t.token_symbol) || isPlaceholderTokenText(t.token_name))
            .map((t) => t.token_address)
            .filter((addr) => !tokenMetaCacheRef.has(addr))
        )
      );

      if (addressesToFetch.length > 0) {
        const metaMap = await fetchDexScreenerTokenMetadata(addressesToFetch);
        for (const [addr, meta] of metaMap.entries()) {
          tokenMetaCacheRef.set(addr, { name: meta.name, symbol: meta.symbol });
        }

        if (metaMap.size > 0) {
          setTrades((prev) =>
            prev.map((t) => {
              const meta = tokenMetaCacheRef.get(t.token_address);
              if (!meta) return t;
              return {
                ...t,
                token_symbol: isPlaceholderTokenText(t.token_symbol) ? meta.symbol : t.token_symbol,
                token_name: isPlaceholderTokenText(t.token_name) ? meta.name : t.token_name,
              };
            })
          );
        }
      }
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
