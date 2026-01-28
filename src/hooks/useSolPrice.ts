import { useState, useEffect, useCallback, useRef } from 'react';

const SOL_PRICE_CACHE_KEY = 'sol_price_cache';
const CACHE_DURATION = 60000; // 1 minute cache

interface SolPriceCache {
  price: number;
  timestamp: number;
}

/**
 * Hook to fetch real-time SOL price from CoinGecko API
 * Falls back to cached price or default on failure
 */
export function useSolPrice(refreshInterval = 60000) {
  const [price, setPrice] = useState<number>(() => {
    // Initialize from cache if available
    try {
      const cached = localStorage.getItem(SOL_PRICE_CACHE_KEY);
      if (cached) {
        const { price: cachedPrice, timestamp } = JSON.parse(cached) as SolPriceCache;
        if (Date.now() - timestamp < CACHE_DURATION) {
          return cachedPrice;
        }
      }
    } catch {
      // Ignore cache errors
    }
    return 150; // Default fallback
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastFetchRef = useRef<number>(0);

  const fetchPrice = useCallback(async () => {
    // Throttle: minimum 30 seconds between fetches
    const now = Date.now();
    if (now - lastFetchRef.current < 30000) {
      return price;
    }
    
    lastFetchRef.current = now;
    setLoading(true);
    setError(null);

    // Try multiple price sources for resilience
    const priceSources = [
      // Primary: CoinGecko (most reliable, no API key)
      async (): Promise<number | null> => {
        const response = await fetch(
          'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
          { 
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(5000),
          }
        );
        if (!response.ok) return null;
        const data = await response.json();
        return data?.solana?.usd ?? null;
      },
      // Fallback 1: Jupiter Price API (fast, Solana-native)
      async (): Promise<number | null> => {
        const response = await fetch(
          'https://price.jup.ag/v6/price?ids=So11111111111111111111111111111111111111112',
          { 
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(5000),
          }
        );
        if (!response.ok) return null;
        const data = await response.json();
        return data?.data?.['So11111111111111111111111111111111111111112']?.price ?? null;
      },
      // Fallback 2: Binance public API
      async (): Promise<number | null> => {
        const response = await fetch(
          'https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT',
          { 
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(5000),
          }
        );
        if (!response.ok) return null;
        const data = await response.json();
        return data?.price ? parseFloat(data.price) : null;
      },
    ];

    let newPrice: number | null = null;
    
    for (const fetchSource of priceSources) {
      try {
        const result = await fetchSource();
        if (typeof result === 'number' && result > 0 && Number.isFinite(result)) {
          newPrice = result;
          break; // Success - stop trying other sources
        }
      } catch {
        // Try next source
        continue;
      }
    }

    if (newPrice !== null) {
      setPrice(newPrice);
      
      // Cache the price
      const cache: SolPriceCache = { price: newPrice, timestamp: Date.now() };
      localStorage.setItem(SOL_PRICE_CACHE_KEY, JSON.stringify(cache));
      
      setLoading(false);
      return newPrice;
    }
    
    // All sources failed - try cache
    console.warn('All SOL price sources failed, using cache');
    setError('All price sources unavailable');
    
    try {
      const cached = localStorage.getItem(SOL_PRICE_CACHE_KEY);
      if (cached) {
        const { price: cachedPrice } = JSON.parse(cached) as SolPriceCache;
        setLoading(false);
        return cachedPrice;
      }
    } catch {
      // Ignore cache errors
    }
    
    setLoading(false);
    return price; // Return current price on total failure
  }, [price]);

  // Initial fetch
  useEffect(() => {
    fetchPrice();
  }, []);

  // Periodic refresh
  useEffect(() => {
    if (refreshInterval <= 0) return;

    const interval = setInterval(() => {
      fetchPrice();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [refreshInterval, fetchPrice]);

  return {
    price,
    loading,
    error,
    refetch: fetchPrice,
  };
}

/**
 * Get SOL price synchronously from cache (for use in calculations)
 * Returns default if not cached
 */
export function getSolPriceSync(): number {
  try {
    const cached = localStorage.getItem(SOL_PRICE_CACHE_KEY);
    if (cached) {
      const { price, timestamp } = JSON.parse(cached) as SolPriceCache;
      // Use cached price if less than 5 minutes old
      if (Date.now() - timestamp < 300000) {
        return price;
      }
    }
  } catch {
    // Ignore cache errors
  }
  return 150; // Default fallback
}
