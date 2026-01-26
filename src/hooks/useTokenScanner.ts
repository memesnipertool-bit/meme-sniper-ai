import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAppMode } from '@/contexts/AppModeContext';
import { fetchDexScreenerPrices, isLikelyRealSolanaMint } from '@/lib/dexscreener';
import { getFunctionErrorMessage } from '@/lib/functionErrors';

// Token lifecycle stages (Raydium-only - no bonding curve tokens)
export type TokenStage = 'LP_LIVE' | 'INDEXING' | 'LISTED';

export interface TokenStatus {
  tradable: boolean;
  stage: TokenStage;
  poolAddress?: string;
  detectedAtSlot?: number;
  dexScreener: {
    pairFound: boolean;
    retryAt?: number;
  };
}

export interface ScannedToken {
  id: string;
  address: string;
  name: string;
  symbol: string;
  chain: string;
  liquidity: number;
  liquidityLocked: boolean;
  lockPercentage: number | null;
  priceUsd: number;
  priceChange24h: number;
  volume24h: number;
  marketCap: number;
  holders: number;
  createdAt: string;
  earlyBuyers: number;
  buyerPosition: number | null;
  riskScore: number;
  source: string;
  pairAddress: string;
  // Safety validation fields from token-scanner - CRITICAL for trade execution
  isPumpFun?: boolean;       // True if on Pump.fun bonding curve
  isTradeable?: boolean;     // True if scanner verified tradability  
  canBuy?: boolean;          // True if buy is possible
  canSell?: boolean;         // True if sell is possible
  freezeAuthority?: string | null;
  mintAuthority?: string | null;
  safetyReasons?: string[];  // Array of safety check results
  // NEW: Token lifecycle status
  tokenStatus?: TokenStatus;
}

export interface ApiError {
  apiName: string;
  apiType: string;
  errorMessage: string;
  endpoint: string;
  timestamp: string;
}

interface ScanResult {
  tokens: ScannedToken[];
  allTokens?: ScannedToken[];
  errors: string[];
  apiErrors: ApiError[];
  timestamp: string;
  apiCount: number;
  stats?: {
    total: number;
    tradeable: number;
    pumpFun: number;
    filtered: number;
    stages?: {
      lpLive: number;
      indexing: number;
      listed: number;
    };
  };
}

export interface RateLimitState {
  isLimited: boolean;
  remainingScans: number;
  resetTime: number | null;
  countdown: number;
}

// Demo tokens for testing without real API calls - uses REAL token addresses for realistic testing
const demoTokenConfigs = [
  { name: 'DogeMoon', symbol: 'DOGEM', address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263' },
  { name: 'ShibaRocket', symbol: 'SHIBR', address: 'So11111111111111111111111111111111111111112' },
  { name: 'PepeGold', symbol: 'PEPEG', address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
  { name: 'FlokiMax', symbol: 'FLOKM', address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB' },
  { name: 'BabyWhale', symbol: 'BBYWH', address: '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr' },
  { name: 'SafeApe', symbol: 'SAPE', address: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So' },
  { name: 'MoonShot', symbol: 'MSHOT', address: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN' },
  { name: 'RocketFuel', symbol: 'RFUEL', address: 'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE' },
  { name: 'DiamondHands', symbol: 'DHAND', address: 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3' },
  { name: 'GigaChad', symbol: 'GIGA', address: 'A3eME5CetyZPBoWbRUwY3tSe25S6tb18ba9ZPbWk9eFJ' },
];

const MAX_SCANS_PER_MINUTE = 10;
const RATE_LIMIT_WINDOW_MS = 60000;

// Generate a realistic demo token with valid Solana-like address
const generateSingleDemoToken = (idx: number): ScannedToken => {
  const config = demoTokenConfigs[idx % demoTokenConfigs.length];
  const liquidity = Math.floor(Math.random() * 50) + 5; // 5-55 SOL liquidity
  const stage: TokenStage = Math.random() > 0.5 ? 'LISTED' : 'LP_LIVE';
  const uniqueId = `demo-${idx}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  
  return {
    id: uniqueId,
    // Use a generated realistic address format for demo tokens
    address: generateDemoAddress(idx),
    name: config.name,
    symbol: config.symbol,
    chain: 'solana',
    liquidity,
    liquidityLocked: Math.random() > 0.3,
    lockPercentage: Math.random() > 0.5 ? Math.floor(Math.random() * 50) + 50 : null,
    priceUsd: Math.random() * 0.001,
    priceChange24h: (Math.random() - 0.3) * 200,
    volume24h: Math.floor(Math.random() * 100000) + 1000,
    marketCap: Math.floor(Math.random() * 500000) + 10000,
    holders: Math.floor(Math.random() * 500) + 50,
    createdAt: new Date(Date.now() - Math.random() * 86400000).toISOString(),
    earlyBuyers: Math.floor(Math.random() * 8) + 1,
    buyerPosition: Math.floor(Math.random() * 5) + 1,
    riskScore: Math.floor(Math.random() * 60) + 20,
    source: 'Raydium AMM',
    pairAddress: `DemoPair${idx}`,
    // All demo tokens are Raydium-verified tradeable
    isPumpFun: false,
    isTradeable: true,
    canBuy: true,
    canSell: true,
    freezeAuthority: null,
    mintAuthority: null,
    safetyReasons: [`✅ Raydium V4 (${liquidity.toFixed(1)} SOL) - ${stage === 'LISTED' ? 'Listed' : 'Live LP'}`],
    tokenStatus: {
      tradable: true,
      stage,
      poolAddress: `DemoPool${idx}`,
      dexScreener: { pairFound: stage === 'LISTED' },
    },
  };
};

// Generate a valid-looking Solana address for demo tokens
function generateDemoAddress(seed: number): string {
  const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let address = '';
  // Generate a 44-character base58-like address
  const random = new Array(44).fill(0).map((_, i) => chars[(seed * 31 + i * 17 + Date.now()) % chars.length]);
  address = random.join('');
  return address;
}

export interface ScanStats {
  total: number;
  tradeable: number;
  pumpFun: number;
  filtered: number;
  stages: {
    lpLive: number;
    indexing: number;
    listed: number;
  };
}

export function useTokenScanner() {
  const [tokens, setTokens] = useState<ScannedToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true); // Track first load
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [apiCount, setApiCount] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [apiErrors, setApiErrors] = useState<ApiError[]>([]);
  const [lastScanStats, setLastScanStats] = useState<ScanStats | null>(null);
  const [rateLimit, setRateLimit] = useState<RateLimitState>({
    isLimited: false,
    remainingScans: MAX_SCANS_PER_MINUTE,
    resetTime: null,
    countdown: 0,
  });
  const { toast } = useToast();
  const { isDemo, isLive } = useAppMode();
  
  // Ref to track if a scan is in progress
  const scanInProgress = useRef(false);
  // Ref to track if a background price update is in progress
  const priceUpdateInProgress = useRef(false);
  // Ref to store interval for tick-by-tick loading
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Ref for background price update interval
  const priceUpdateIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Rate limiting
  const scanTimestampsRef = useRef<number[]>([]);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Update countdown every second when rate limited
  useEffect(() => {
    if (rateLimit.isLimited && rateLimit.resetTime) {
      countdownIntervalRef.current = setInterval(() => {
        const now = Date.now();
        const remaining = Math.max(0, Math.ceil((rateLimit.resetTime! - now) / 1000));
        
        if (remaining <= 0) {
          // Reset rate limit
          setRateLimit({
            isLimited: false,
            remainingScans: MAX_SCANS_PER_MINUTE,
            resetTime: null,
            countdown: 0,
          });
          scanTimestampsRef.current = [];
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
          }
        } else {
          setRateLimit(prev => ({ ...prev, countdown: remaining }));
        }
      }, 1000);
    }

    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, [rateLimit.isLimited, rateLimit.resetTime]);

  // Track seen token addresses to prevent duplicates across scans
  const seenAddressesRef = useRef<Set<string>>(new Set());
  
  // Clear seen addresses periodically to allow re-discovery
  useEffect(() => {
    const interval = setInterval(() => {
      // Only keep addresses from current tokens list
      const currentAddresses = new Set(tokens.map(t => t.address));
      seenAddressesRef.current = currentAddresses;
    }, 120000); // Clear every 2 minutes
    
    return () => clearInterval(interval);
  }, [tokens]);

  // Merge new tokens seamlessly - with strict deduplication
  const mergeTokens = useCallback((newTokens: ScannedToken[], onComplete?: () => void) => {
    setTokens(prev => {
      const tokenMap = new Map<string, ScannedToken>();
      const processedAddresses = new Set<string>();
      
      // Add existing tokens to map (dedupe by address)
      prev.forEach(t => {
        if (!processedAddresses.has(t.address)) {
          tokenMap.set(t.address, t);
          processedAddresses.add(t.address);
        }
      });
      
      // Merge new tokens - update existing or add new (dedupe by address)
      newTokens.forEach(newToken => {
        // Skip if we've already processed this address in THIS batch
        if (processedAddresses.has(newToken.address) && !tokenMap.has(newToken.address)) {
          return;
        }
        
        const existing = tokenMap.get(newToken.address);
        if (existing) {
          // Update existing token's price data only (keep position stable)
          tokenMap.set(newToken.address, {
            ...existing,
            priceUsd: newToken.priceUsd,
            priceChange24h: newToken.priceChange24h,
            volume24h: newToken.volume24h,
            liquidity: newToken.liquidity,
            marketCap: newToken.marketCap,
            holders: newToken.holders,
            riskScore: newToken.riskScore,
          });
        } else {
          // New token - add to map (will be placed at top)
          tokenMap.set(newToken.address, newToken);
          processedAddresses.add(newToken.address);
        }
      });
      
      // Convert back to array, new tokens first
      const existingAddresses = prev.map(t => t.address);
      
      // Build ordered array: new tokens first, then existing in their order
      const orderedTokens: ScannedToken[] = [];
      const addedAddresses = new Set<string>();
      
      // Add genuinely new tokens at top
      newTokens.forEach(t => {
        if (!existingAddresses.includes(t.address) && !addedAddresses.has(t.address)) {
          const token = tokenMap.get(t.address);
          if (token) {
            orderedTokens.push(token);
            addedAddresses.add(t.address);
          }
        }
      });
      
      // Add existing tokens (updated) in their original order
      existingAddresses.forEach(addr => {
        if (!addedAddresses.has(addr)) {
          const token = tokenMap.get(addr);
          if (token) {
            orderedTokens.push(token);
            addedAddresses.add(addr);
          }
        }
      });
      
      return orderedTokens.slice(0, 100); // Keep max 100 tokens
    });
    
    onComplete?.();
  }, []);

  // Check and update rate limit status
  const checkRateLimit = useCallback((): { allowed: boolean; remaining: number; resetIn: number } => {
    const now = Date.now();
    const windowStart = now - RATE_LIMIT_WINDOW_MS;
    
    // Remove expired timestamps
    scanTimestampsRef.current = scanTimestampsRef.current.filter(ts => ts > windowStart);
    
    const currentCount = scanTimestampsRef.current.length;
    const remaining = MAX_SCANS_PER_MINUTE - currentCount;
    
    if (currentCount >= MAX_SCANS_PER_MINUTE) {
      const oldestTimestamp = scanTimestampsRef.current[0];
      const resetTime = oldestTimestamp + RATE_LIMIT_WINDOW_MS;
      const resetIn = Math.ceil((resetTime - now) / 1000);
      
      return { allowed: false, remaining: 0, resetIn };
    }
    
    return { allowed: true, remaining, resetIn: 0 };
  }, []);

  const scanTokens = useCallback(async (minLiquidity: number = 300, chains: string[] = ['solana']): Promise<ScanResult | null> => {
    // Prevent concurrent scans
    if (scanInProgress.current) {
      console.log('Scan already in progress, skipping...');
      return null;
    }

    // Rate limiting for live mode
    if (isLive) {
      const { allowed, remaining, resetIn } = checkRateLimit();
      
      if (!allowed) {
        const resetTime = Date.now() + (resetIn * 1000);
        setRateLimit({
          isLimited: true,
          remainingScans: 0,
          resetTime,
          countdown: resetIn,
        });
        
        toast({
          title: 'Rate Limited',
          description: `Too many scans. Please wait ${resetIn} seconds before scanning again.`,
          variant: 'destructive',
        });
        return null;
      }
      
      // Add current timestamp
      scanTimestampsRef.current.push(Date.now());
      
      // Update remaining scans
      setRateLimit(prev => ({
        ...prev,
        remainingScans: remaining - 1,
        isLimited: false,
      }));
    }

    scanInProgress.current = true;
    
    // Only show loading spinner on initial load - subsequent scans are background
    if (isInitialLoad) {
      setLoading(true);
    }
    setErrors([]);
    setApiErrors([]);

    try {
      // Demo mode: return simulated data
      if (isDemo) {
        // Generate 3-5 new demo tokens per scan
        const numNewTokens = Math.floor(Math.random() * 3) + 3;
        const newDemoTokens: ScannedToken[] = [];
        
        for (let i = 0; i < numNewTokens; i++) {
          const token = generateSingleDemoToken(Math.floor(Math.random() * 10));
          if (token.liquidity >= minLiquidity) {
            newDemoTokens.push(token);
          }
        }

        // Merge tokens seamlessly (no flicker)
        mergeTokens(newDemoTokens, () => {
          setLoading(false);
          setIsInitialLoad(false);
          scanInProgress.current = false;
        });

        setLastScan(new Date().toISOString());
        setApiCount(3);
        
        return { 
          tokens: newDemoTokens, 
          errors: [], 
          apiErrors: [], 
          timestamp: new Date().toISOString(), 
          apiCount: 3 
        };
      }

      // Live mode: call real API
      const { data, error } = await supabase.functions.invoke('token-scanner', {
        body: { minLiquidity, chains },
      });

      if (error) {
        const message = await getFunctionErrorMessage(error);
        throw new Error(message);
      }

      const result = data as ScanResult;
      
      // Merge tokens seamlessly (background update, no flicker)
      if (result.tokens && result.tokens.length > 0) {
        mergeTokens(result.tokens, () => {
          setLoading(false);
          setIsInitialLoad(false);
          scanInProgress.current = false;
        });
      } else {
        setLoading(false);
        setIsInitialLoad(false);
        scanInProgress.current = false;
      }

      setLastScan(result.timestamp);
      setApiCount(result.apiCount);
      setApiErrors(result.apiErrors || []);
      
      // Save scan stats for display
      if (result.stats) {
        setLastScanStats({
          total: result.stats.total,
          tradeable: result.stats.tradeable,
          pumpFun: 0, // No Pump.fun tokens in Raydium-only pipeline
          filtered: result.stats.filtered,
          stages: result.stats.stages || {
            lpLive: 0,
            indexing: 0,
            listed: 0,
          },
        });
      }
      
      if (result.errors && result.errors.length > 0) {
        setErrors(result.errors);
        // Build a clean list of failed APIs, filtering empty/undefined names
        const failedApiNames = result.apiErrors
          ?.map(e => e.apiName || e.apiType)
          .filter(name => name && name.trim() !== '')
          || [];
        
        // Only show destructive toast if ALL sources failed (no tokens returned)
        // Otherwise just log - partial failures are normal for decentralized APIs
        const hasTokens = result.tokens && result.tokens.length > 0;
        if (!hasTokens && failedApiNames.length > 0) {
          toast({
            title: 'Scan failed',
            description: `No tokens found. APIs with issues: ${failedApiNames.join(', ')}`,
            variant: 'destructive',
          });
        } else if (failedApiNames.length > 0) {
          // Partial success - just log, don't show destructive toast
          console.log(`Scan completed with ${result.tokens?.length || 0} tokens. Some APIs had issues: ${failedApiNames.join(', ')}`);
        }
      }

      return result;
    } catch (error: any) {
      console.error('Scan error:', error);
      toast({
        title: 'Scan failed',
        description: error.message || 'Failed to scan for tokens',
        variant: 'destructive',
      });
      setLoading(false);
      setIsInitialLoad(false);
      scanInProgress.current = false;
      return null;
    }
  }, [toast, isDemo, isLive, mergeTokens, checkRateLimit, isInitialLoad]);

  const getTopOpportunities = useCallback((limit: number = 5) => {
    return tokens
      .filter(t => t.buyerPosition && t.buyerPosition <= 5 && t.riskScore < 70)
      .slice(0, limit);
  }, [tokens]);

  const filterByChain = useCallback((chain: string) => {
    return tokens.filter(t => t.chain === chain);
  }, [tokens]);

  const filterByRisk = useCallback((maxRisk: number) => {
    return tokens.filter(t => t.riskScore <= maxRisk);
  }, [tokens]);

  /**
   * Silent background price update for all tokens.
   * Uses deep comparison to only update tokens whose prices actually changed.
   * This prevents UI flickering by avoiding unnecessary state updates.
   */
  const updateTokenPrices = useCallback(async () => {
    // Skip if already updating or no tokens
    if (priceUpdateInProgress.current || tokens.length === 0) return;
    
    const addresses = tokens
      .map(t => t.address)
      .filter(addr => isLikelyRealSolanaMint(addr));
    
    if (addresses.length === 0) return;
    
    priceUpdateInProgress.current = true;
    
    try {
      const priceMap = await fetchDexScreenerPrices(addresses, {
        timeoutMs: 5000,
        chunkSize: 30,
      });
      
      if (priceMap.size === 0) {
        priceUpdateInProgress.current = false;
        return;
      }
      
      // Use functional update with deep comparison
      setTokens(prev => {
        let hasChanges = false;
        
        const updated = prev.map(token => {
          const priceData = priceMap.get(token.address);
          if (!priceData || priceData.priceUsd <= 0) return token;
          
          // DEEP COMPARISON: Only update if price changed by more than 0.05%
          const oldPrice = token.priceUsd || 0;
          const priceChangePercent = oldPrice > 0 
            ? Math.abs((priceData.priceUsd - oldPrice) / oldPrice) * 100 
            : 100;
          
          if (priceChangePercent < 0.05) return token; // No meaningful change
          
          hasChanges = true;
          
          return {
            ...token,
            priceUsd: priceData.priceUsd,
            priceChange24h: priceData.priceChange24h,
            volume24h: priceData.volume24h,
            liquidity: priceData.liquidity,
          };
        });
        
        // Return same reference if no changes to prevent re-render
        return hasChanges ? updated : prev;
      });
    } catch (err) {
      // Silent failure - don't log to avoid console spam
    } finally {
      priceUpdateInProgress.current = false;
    }
  }, [tokens]);

  // Set up background price updates (every 10 seconds)
  useEffect(() => {
    // Only start background updates if we have tokens
    if (tokens.length === 0) return;
    
    // Initial update after 2 seconds
    const initialTimeout = setTimeout(updateTokenPrices, 2000);
    
    // Regular interval every 10 seconds
    priceUpdateIntervalRef.current = setInterval(updateTokenPrices, 10000);
    
    return () => {
      clearTimeout(initialTimeout);
      if (priceUpdateIntervalRef.current) {
        clearInterval(priceUpdateIntervalRef.current);
      }
    };
  }, [tokens.length > 0, updateTokenPrices]);

  // Cleanup on unmount
  const cleanup = useCallback(() => {
    if (tickIntervalRef.current) {
      clearInterval(tickIntervalRef.current);
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }
    if (priceUpdateIntervalRef.current) {
      clearInterval(priceUpdateIntervalRef.current);
    }
  }, []);

  return {
    tokens,
    loading,
    lastScan,
    apiCount,
    errors,
    apiErrors,
    rateLimit,
    lastScanStats,
    scanTokens,
    getTopOpportunities,
    filterByChain,
    filterByRisk,
    isDemo,
    isLive,
    cleanup,
    updateTokenPrices,
  };
}
