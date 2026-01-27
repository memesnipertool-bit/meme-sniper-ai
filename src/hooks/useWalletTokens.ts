import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useWallet } from '@/hooks/useWallet';

export interface WalletToken {
  mint: string;
  symbol: string | null;
  name: string | null;
  balance: number;
  decimals: number;
  priceUsd: number | null;
  valueUsd: number | null;
}

interface UseWalletTokensOptions {
  minValueUsd?: number;
  autoRefreshInterval?: number | null; // ms, null to disable
}

export function useWalletTokens(options: UseWalletTokensOptions = {}) {
  const { minValueUsd = 0.01, autoRefreshInterval = 60000 } = options;
  
  const { wallet } = useWallet();
  const [tokens, setTokens] = useState<WalletToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchTokens = useCallback(async (silent = false) => {
    if (!wallet.isConnected || !wallet.address) {
      setTokens([]);
      return [];
    }

    if (!silent) setLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('wallet-tokens', {
        body: { 
          owner: wallet.address,
          minValueUsd,
        },
      });

      if (fnError) {
        throw new Error(fnError.message || 'Failed to fetch wallet tokens');
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Unknown error');
      }

      const fetchedTokens = data.tokens || [];
      setTokens(fetchedTokens);
      setLastFetched(new Date());
      return fetchedTokens;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch wallet tokens';
      setError(message);
      console.error('[useWalletTokens] Error:', err);
      return [];
    } finally {
      if (!silent) setLoading(false);
    }
  }, [wallet.isConnected, wallet.address, minValueUsd]);

  // Auto-refresh
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (autoRefreshInterval && wallet.isConnected) {
      intervalRef.current = setInterval(() => {
        fetchTokens(true);
      }, autoRefreshInterval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoRefreshInterval, wallet.isConnected, fetchTokens]);

  // Fetch on wallet connect/disconnect
  useEffect(() => {
    if (wallet.isConnected && wallet.address) {
      fetchTokens();
    } else {
      setTokens([]);
      setLastFetched(null);
    }
  }, [wallet.isConnected, wallet.address, fetchTokens]);

  return {
    tokens,
    loading,
    error,
    lastFetched,
    refetch: fetchTokens,
  };
}
