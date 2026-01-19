import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAppMode } from '@/contexts/AppModeContext';

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
  errors: string[];
  apiErrors: ApiError[];
  timestamp: string;
  apiCount: number;
}

export interface RateLimitState {
  isLimited: boolean;
  remainingScans: number;
  resetTime: number | null;
  countdown: number;
}

// Demo tokens for testing without real API calls
const demoTokenNames = [
  { name: 'DogeMoon', symbol: 'DOGEM' },
  { name: 'ShibaRocket', symbol: 'SHIBR' },
  { name: 'PepeGold', symbol: 'PEPEG' },
  { name: 'FlokiMax', symbol: 'FLOKM' },
  { name: 'BabyWhale', symbol: 'BBYWH' },
  { name: 'SafeApe', symbol: 'SAPE' },
  { name: 'MoonShot', symbol: 'MSHOT' },
  { name: 'RocketFuel', symbol: 'RFUEL' },
  { name: 'DiamondHands', symbol: 'DHAND' },
  { name: 'GigaChad', symbol: 'GIGA' },
];

const MAX_SCANS_PER_MINUTE = 10;
const RATE_LIMIT_WINDOW_MS = 60000;

const generateSingleDemoToken = (idx: number): ScannedToken => {
  const token = demoTokenNames[idx % demoTokenNames.length];
  const isPumpFun = Math.random() > 0.4; // 60% are Pump.fun tokens
  return {
    id: `demo-${idx}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    address: `Demo${idx}...${Math.random().toString(36).substring(2, 8)}`,
    name: token.name,
    symbol: token.symbol,
    chain: 'solana',
    liquidity: Math.floor(Math.random() * 50000) + 5000,
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
    source: isPumpFun ? 'Pump.fun' : 'DexScreener',
    pairAddress: `DemoPair${idx}`,
    // Safety validation fields - mark demo tokens as tradeable
    isPumpFun: isPumpFun,
    isTradeable: true,
    canBuy: true,
    canSell: true,
    freezeAuthority: null,
    mintAuthority: null,
    safetyReasons: isPumpFun ? ['✅ Pump.fun bonding curve'] : ['✅ Demo token - always tradeable'],
  };
};

export function useTokenScanner() {
  const [tokens, setTokens] = useState<ScannedToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true); // Track first load
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [apiCount, setApiCount] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [apiErrors, setApiErrors] = useState<ApiError[]>([]);
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
  // Ref to store interval for tick-by-tick loading
  const tickIntervalRef = useRef<NodeJS.Timeout | null>(null);
  // Rate limiting
  const scanTimestampsRef = useRef<number[]>([]);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

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

  // Merge new tokens seamlessly - no delay, instant update
  const mergeTokens = useCallback((newTokens: ScannedToken[], onComplete?: () => void) => {
    setTokens(prev => {
      const tokenMap = new Map<string, ScannedToken>();
      
      // Add existing tokens to map
      prev.forEach(t => tokenMap.set(t.address, t));
      
      // Merge new tokens - update existing or add new
      newTokens.forEach(newToken => {
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
        }
      });
      
      // Convert back to array, new tokens first
      const newAddresses = new Set(newTokens.map(t => t.address));
      const existingAddresses = prev.map(t => t.address);
      
      // Build ordered array: new tokens first, then existing in their order
      const orderedTokens: ScannedToken[] = [];
      
      // Add genuinely new tokens at top
      newTokens.forEach(t => {
        if (!existingAddresses.includes(t.address)) {
          orderedTokens.push(tokenMap.get(t.address)!);
        }
      });
      
      // Add existing tokens (updated) in their original order
      existingAddresses.forEach(addr => {
        const token = tokenMap.get(addr);
        if (token) orderedTokens.push(token);
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

      if (error) throw error;

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

  // Cleanup on unmount
  const cleanup = useCallback(() => {
    if (tickIntervalRef.current) {
      clearInterval(tickIntervalRef.current);
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
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
    scanTokens,
    getTopOpportunities,
    filterByChain,
    filterByRisk,
    isDemo,
    isLive,
    cleanup,
  };
}
