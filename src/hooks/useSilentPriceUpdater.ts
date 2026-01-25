/**
 * Silent Background Price Updater Hook
 * 
 * Fetches real-time prices from DexScreener without triggering loading states.
 * Uses deep comparison to only update state when values actually change,
 * preventing unnecessary re-renders and UI flickering.
 */

import { useCallback, useRef, useEffect } from 'react';
import { fetchDexScreenerPrices, isLikelyRealSolanaMint } from '@/lib/dexscreener';

export interface PriceData {
  address: string;
  priceUsd: number;
  priceChange24h: number;
  volume24h: number;
  liquidityUsd: number;
}

interface UseSilentPriceUpdaterOptions {
  /** Interval between price updates in ms (default: 10000 = 10s) */
  intervalMs?: number;
  /** Whether to enable the updater (default: true) */
  enabled?: boolean;
  /** Callback when prices are fetched - receives map of address -> price data */
  onPricesUpdate?: (prices: Map<string, PriceData>) => void;
}

// Cache to store last known prices to avoid redundant updates
const globalPriceCache = new Map<string, { data: PriceData; timestamp: number }>();
const CACHE_TTL_MS = 5000; // 5 second cache TTL

/**
 * Check if a price has meaningfully changed (>0.01% difference)
 */
function hasPriceChanged(oldPrice: number, newPrice: number): boolean {
  if (oldPrice === 0 && newPrice === 0) return false;
  if (oldPrice === 0 || newPrice === 0) return true;
  const percentChange = Math.abs((newPrice - oldPrice) / oldPrice) * 100;
  return percentChange > 0.01;
}

/**
 * Deep compare price data to determine if an update is needed
 */
function shouldUpdatePrice(cached: PriceData | undefined, fresh: PriceData): boolean {
  if (!cached) return true;
  return (
    hasPriceChanged(cached.priceUsd, fresh.priceUsd) ||
    hasPriceChanged(cached.priceChange24h, fresh.priceChange24h) ||
    hasPriceChanged(cached.liquidityUsd, fresh.liquidityUsd)
  );
}

export function useSilentPriceUpdater(
  addresses: string[],
  options: UseSilentPriceUpdaterOptions = {}
) {
  const {
    intervalMs = 10000,
    enabled = true,
    onPricesUpdate,
  } = options;

  const isFetchingRef = useRef(false);
  const lastFetchRef = useRef<number>(0);
  const addressesRef = useRef<string[]>([]);

  // Update addressesRef without triggering re-renders
  useEffect(() => {
    addressesRef.current = addresses;
  }, [addresses]);

  const fetchPrices = useCallback(async () => {
    const currentAddresses = addressesRef.current;
    
    // Skip if already fetching or no addresses
    if (isFetchingRef.current || currentAddresses.length === 0) return;
    
    // Throttle: don't fetch if last fetch was less than 3 seconds ago
    const now = Date.now();
    if (now - lastFetchRef.current < 3000) return;
    
    const validAddresses = currentAddresses.filter(addr => isLikelyRealSolanaMint(addr));
    if (validAddresses.length === 0) return;

    isFetchingRef.current = true;
    lastFetchRef.current = now;

    try {
      const priceMap = await fetchDexScreenerPrices(validAddresses, {
        timeoutMs: 5000,
        chunkSize: 30,
      });

      if (priceMap.size === 0) {
        isFetchingRef.current = false;
        return;
      }

      // Build update map - only include prices that have actually changed
      const updatedPrices = new Map<string, PriceData>();
      
      for (const [address, data] of priceMap.entries()) {
        const priceData: PriceData = {
          address,
          priceUsd: data.priceUsd,
          priceChange24h: data.priceChange24h,
          volume24h: data.volume24h,
          liquidityUsd: data.liquidity,
        };

        const cached = globalPriceCache.get(address);
        const cachedData = cached?.data;

        // Only include if price has meaningfully changed
        if (shouldUpdatePrice(cachedData, priceData)) {
          updatedPrices.set(address, priceData);
          globalPriceCache.set(address, { data: priceData, timestamp: now });
        }
      }

      // Only call callback if there are actual changes
      if (updatedPrices.size > 0 && onPricesUpdate) {
        onPricesUpdate(updatedPrices);
      }
    } catch (err) {
      // Silent failure - don't log to avoid console spam
    } finally {
      isFetchingRef.current = false;
    }
  }, [onPricesUpdate]);

  // Set up interval for background updates
  useEffect(() => {
    if (!enabled) return;

    // Initial fetch after 1 second
    const initialTimeout = setTimeout(fetchPrices, 1000);

    // Regular interval
    const interval = setInterval(fetchPrices, intervalMs);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [enabled, intervalMs, fetchPrices]);

  return {
    fetchPrices,
    getCache: () => globalPriceCache,
  };
}

/**
 * Get cached price for an address (returns undefined if not cached or expired)
 */
export function getCachedPrice(address: string): PriceData | undefined {
  const cached = globalPriceCache.get(address);
  if (!cached) return undefined;
  if (Date.now() - cached.timestamp > CACHE_TTL_MS * 2) return undefined;
  return cached.data;
}

/**
 * Clear the global price cache
 */
export function clearPriceCache(): void {
  globalPriceCache.clear();
}
