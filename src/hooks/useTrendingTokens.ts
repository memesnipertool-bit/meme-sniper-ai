import { useState, useEffect, useCallback } from 'react';
import { useAppMode } from '@/contexts/AppModeContext';

export interface TrendingToken {
  address: string;
  symbol: string;
  name: string;
  priceUsd: number;
  priceChange24h: number;
  volume24h: number;
  liquidity: number;
  hot: boolean;
}

// Real Solana token addresses for trending
const TRENDING_TOKEN_ADDRESSES = [
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', // BONK
  'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', // WIF
  '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', // POPCAT
  'MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5', // MEW
  'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', // JUP
];

export function useTrendingTokens() {
  const [tokens, setTokens] = useState<TrendingToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isDemo } = useAppMode();

  const fetchTrendingTokens = useCallback(async () => {
    if (isDemo) {
      // Demo data
      setTokens([
        { address: 'demo1', symbol: 'DEMO1', name: 'Demo Token 1', priceUsd: 0.001234, priceChange24h: 15.5, volume24h: 125000000, liquidity: 500000, hot: true },
        { address: 'demo2', symbol: 'DEMO2', name: 'Demo Token 2', priceUsd: 0.00567, priceChange24h: 8.2, volume24h: 89000000, liquidity: 350000, hot: true },
        { address: 'demo3', symbol: 'DEMO3', name: 'Demo Token 3', priceUsd: 0.156, priceChange24h: -3.5, volume24h: 42000000, liquidity: 200000, hot: false },
      ]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Fetch from DexScreener API
      const addressList = TRENDING_TOKEN_ADDRESSES.join(',');
      const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${addressList}`, {
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(`DexScreener API error: ${response.status}`);
      }

      const data = await response.json();
      const pairs = data.pairs || [];

      // Group by token address and get the best pair (highest liquidity)
      const tokenMap = new Map<string, TrendingToken>();

      pairs.forEach((pair: any) => {
        if (pair.chainId !== 'solana') return;
        
        const address = pair.baseToken?.address;
        if (!address) return;

        const existing = tokenMap.get(address);
        const liquidity = pair.liquidity?.usd || 0;

        if (!existing || liquidity > existing.liquidity) {
          // Use short address as fallback instead of "UNKNOWN"
          const shortAddr = address.length > 8 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address;
          tokenMap.set(address, {
            address,
            symbol: pair.baseToken?.symbol || shortAddr,
            name: pair.baseToken?.name || `Token ${shortAddr}`,
            priceUsd: parseFloat(pair.priceUsd) || 0,
            priceChange24h: pair.priceChange?.h24 || 0,
            volume24h: pair.volume?.h24 || 0,
            liquidity,
            hot: (pair.priceChange?.h24 || 0) > 10 || liquidity > 100000,
          });
        }
      });

      // Sort by volume and take top 5
      const sortedTokens = Array.from(tokenMap.values())
        .sort((a, b) => b.volume24h - a.volume24h)
        .slice(0, 5);

      setTokens(sortedTokens);
    } catch (err: any) {
      console.error('Failed to fetch trending tokens:', err);
      setError(err.message);
      
      // Fallback to static data on error
      setTokens([
        { address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', symbol: 'BONK', name: 'Bonk', priceUsd: 0.00003241, priceChange24h: 15.4, volume24h: 125000000, liquidity: 500000, hot: true },
        { address: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', symbol: 'WIF', name: 'dogwifhat', priceUsd: 2.45, priceChange24h: 8.2, volume24h: 89000000, liquidity: 350000, hot: true },
        { address: '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', symbol: 'POPCAT', name: 'Popcat', priceUsd: 0.892, priceChange24h: 22.1, volume24h: 67000000, liquidity: 200000, hot: true },
      ]);
    } finally {
      setLoading(false);
    }
  }, [isDemo]);

  useEffect(() => {
    fetchTrendingTokens();
    
    // Refresh every 60 seconds
    const interval = setInterval(fetchTrendingTokens, 60000);
    return () => clearInterval(interval);
  }, [fetchTrendingTokens]);

  return {
    tokens,
    loading,
    error,
    refetch: fetchTrendingTokens,
  };
}
