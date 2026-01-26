import { useState, useEffect, useCallback, useRef } from 'react';
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

type RefetchOptions = {
  /** If true, attempts to rebuild history from existing positions even if we've tried before. */
  forceBackfill?: boolean;
};

type PositionBackfillRow = {
  token_address: string;
  token_name: string | null;
  token_symbol: string | null;
  amount: number;
  entry_price: number;
  entry_price_usd: number | null;
  status: string | null;
  created_at: string;
  closed_at: string | null;
  exit_price: number | null;
  exit_tx_id: string | null;
};

// NOTE: PostgREST has a default max of 1000 rows per request.
export function useTradeHistory(limit: number = 1000) {
  const [trades, setTrades] = useState<TradeHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  const hasAttemptedBackfillRef = useRef(false);

  // Cache DexScreener metadata by token address to avoid repeated external calls
  const tokenMetaCacheRef = useState(() => new Map<string, { name: string; symbol: string }>())[0];

  useEffect(() => {
    // reset between users
    hasAttemptedBackfillRef.current = false;
  }, [user?.id]);

  const backfillFromPositions = useCallback(async () => {
    if (!user) return 0;

    const { data: positionsData, error: positionsError } = await supabase
      .from('positions')
      .select(
        'token_address, token_symbol, token_name, amount, entry_price, entry_price_usd, status, created_at, closed_at, exit_price, exit_tx_id'
      )
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (positionsError) throw positionsError;

    const positions = ((positionsData || []) as unknown as PositionBackfillRow[]).map((p) => ({ ...p }));
    if (positions.length === 0) return 0;

    // Use 'confirmed' to match the database check constraint
    const buyRows = positions.map((p) => ({
      user_id: user.id,
      token_address: p.token_address,
      token_symbol: p.token_symbol,
      token_name: p.token_name,
      trade_type: 'buy' as const,
      amount: Number(p.amount),
      price_sol: p.entry_price ?? null,
      price_usd: p.entry_price_usd ?? null,
      status: 'confirmed',
      tx_hash: null,
      created_at: p.created_at,
    }));

    const sellRows = positions
      .filter((p) => (p.status || '').toLowerCase() === 'closed')
      .map((p) => ({
        user_id: user.id,
        token_address: p.token_address,
        token_symbol: p.token_symbol,
        token_name: p.token_name,
        trade_type: 'sell' as const,
        amount: Number(p.amount),
        price_sol: p.exit_price ?? null,
        price_usd: null,
        status: 'confirmed',
        tx_hash: p.exit_tx_id ?? null,
        created_at: p.closed_at ?? p.created_at,
      }));

    const rows = [...buyRows, ...sellRows];
    if (rows.length === 0) return 0;

    const { error: insertError } = await supabase.from('trade_history').insert(rows);
    if (insertError) throw insertError;

    return rows.length;
  }, [user]);

  const fetchTrades = useCallback(async (options?: RefetchOptions) => {
    if (!user) {
      setTrades([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      // Fetch up to the maximum allowed per request (default 1000)
      let { data, error } = await supabase
        .from('trade_history')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      // If history is empty, rebuild it from existing positions (one-time by default).
      const shouldAttemptBackfill = (options?.forceBackfill ?? false) || !hasAttemptedBackfillRef.current;
      if ((data?.length ?? 0) === 0 && shouldAttemptBackfill) {
        hasAttemptedBackfillRef.current = true;
        try {
          const inserted = await backfillFromPositions();
          if (inserted > 0) {
            toast({
              title: 'Transaction history rebuilt',
              description: `Imported ${inserted} transactions from existing positions`,
            });

            const refetchResult = await supabase
              .from('trade_history')
              .select('*')
              .eq('user_id', user.id)
              .order('created_at', { ascending: false })
              .limit(limit);

            if (refetchResult.error) throw refetchResult.error;
            data = refetchResult.data;
          }
        } catch (e) {
          console.warn('Trade history backfill failed:', e);
        }
      }

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
  }, [user, limit, toast, backfillFromPositions]);

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
