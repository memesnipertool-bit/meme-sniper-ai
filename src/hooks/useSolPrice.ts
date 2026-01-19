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

    try {
      // Use CoinGecko API (free, no API key required)
      const response = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
        { 
          method: 'GET',
          headers: { 'Accept': 'application/json' },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const newPrice = data?.solana?.usd;

      if (typeof newPrice === 'number' && newPrice > 0) {
        setPrice(newPrice);
        
        // Cache the price
        const cache: SolPriceCache = { price: newPrice, timestamp: Date.now() };
        localStorage.setItem(SOL_PRICE_CACHE_KEY, JSON.stringify(cache));
        
        return newPrice;
      } else {
        throw new Error('Invalid price data');
      }
    } catch (err: any) {
      console.error('Failed to fetch SOL price:', err);
      setError(err.message || 'Failed to fetch price');
      
      // Try to use cached price on error
      try {
        const cached = localStorage.getItem(SOL_PRICE_CACHE_KEY);
        if (cached) {
          const { price: cachedPrice } = JSON.parse(cached) as SolPriceCache;
          return cachedPrice;
        }
      } catch {
        // Ignore cache errors
      }
      
      return price; // Return current price on failure
    } finally {
      setLoading(false);
    }
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
