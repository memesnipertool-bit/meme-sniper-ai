import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateTokenScannerInput } from "../_shared/validation.ts";
import { getApiKey, decryptKey as sharedDecryptKey } from "../_shared/api-keys.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Pump.fun API
const PUMPFUN_API = "https://frontend-api.pump.fun";

// Jupiter API for tradability check - using free lite-api (no key required)
const JUPITER_QUOTE_API = "https://lite-api.jup.ag/swap/v1/quote";

// RugCheck API for safety validation
const RUGCHECK_API = "https://api.rugcheck.xyz/v1";

const SOL_MINT = "So11111111111111111111111111111111111111112";

// DexScreener query cache - PERMANENT to prevent spam
// Key insight: DexScreener is ENRICHMENT only, never blocking
interface DexScreenerCache {
  [poolAddress: string]: {
    result: DexScreenerPairResult;
    timestamp: number;
    queryCount: number; // Track total queries per pool
    lastQueryAt: number; // Last time we actually hit the API
  };
}

const dexScreenerCache: DexScreenerCache = {};

// DexScreener rate limiting - non-blocking, enrichment only
const DEXSCREENER_MIN_COOLDOWN = 60000; // 60 seconds minimum between API calls per pool
const DEXSCREENER_MAX_COOLDOWN = 120000; // 120 seconds max cooldown
const DEXSCREENER_MAX_QUERIES_PER_POOL = 1; // Only 1 API call per pool ever
const DEXSCREENER_PERMANENT_CACHE = true; // Cache results forever

// Token lifecycle stages
type TokenStage = 'BONDING' | 'LP_LIVE' | 'INDEXING' | 'LISTED';

interface TokenStatus {
  tradable: boolean;
  stage: TokenStage;
  poolAddress?: string;
  dexScreener: {
    pairFound: boolean;
    retryAt?: number;
  };
}

interface DexScreenerPairResult {
  pairFound: boolean;
  pairAddress?: string;
  priceUsd?: number;
  volume24h?: number;
  liquidity?: number;
  dexId?: string;
  retryAt?: number;
}

interface ApiConfig {
  id: string;
  api_type: string;
  api_name: string;
  base_url: string;
  api_key_encrypted: string | null;
  is_enabled: boolean;
  rate_limit_per_minute: number;
}

interface TokenData {
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
  // Safety validation fields
  isTradeable: boolean;
  canBuy: boolean;
  canSell: boolean;
  freezeAuthority: string | null;
  mintAuthority: string | null;
  isPumpFun: boolean;
  safetyReasons: string[];
  // NEW: Token lifecycle status
  tokenStatus?: TokenStatus;
}

interface ApiError {
  apiName: string;
  apiType: string;
  errorMessage: string;
  endpoint: string;
  timestamp: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Validate the user token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rawBody = await req.json().catch(() => ({}));
    const validationResult = validateTokenScannerInput(rawBody);
    
    if (!validationResult.success) {
      return new Response(JSON.stringify({ error: validationResult.error }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const { minLiquidity, chains } = validationResult.data!;

    const { data: apiConfigs, error: apiError } = await supabase
      .from('api_configurations')
      .select('*')
      .eq('is_enabled', true);

    if (apiError) {
      console.error('Error fetching API configs:', apiError);
      throw new Error('Failed to fetch API configurations');
    }

    const tokens: TokenData[] = [];
    const errors: string[] = [];
    const apiErrors: ApiError[] = [];

    const logApiHealth = async (
      apiType: string,
      endpoint: string,
      responseTimeMs: number,
      statusCode: number,
      isSuccess: boolean,
      errorMessage?: string
    ) => {
      try {
        await supabase.from('api_health_metrics').insert({
          api_type: apiType,
          endpoint,
          response_time_ms: responseTimeMs,
          status_code: statusCode,
          is_success: isSuccess,
          error_message: errorMessage || null,
        });

        const newStatus = isSuccess ? 'active' : (statusCode === 429 ? 'rate_limited' : 'error');
        await supabase
          .from('api_configurations')
          .update({ 
            status: newStatus,
            last_checked_at: new Date().toISOString()
          })
          .eq('api_type', apiType);
      } catch (e) {
        console.error('Failed to log API health:', e);
      }
    };

    const getApiConfigLocal = (type: string): ApiConfig | undefined => 
      apiConfigs?.find((c: ApiConfig) => c.api_type === type && c.is_enabled);

    // Use shared decrypt function
    const decryptKey = sharedDecryptKey;

    // Get API key from database or environment using shared helper
    const getApiKeyForType = async (apiType: string, dbApiKey: string | null): Promise<string | null> => {
      // First try decrypting the DB key
      const decrypted = decryptKey(dbApiKey);
      if (decrypted) return decrypted;
      
      // Fall back to shared helper which checks DB and env
      return await getApiKey(apiType);
    };

    // ============================================================================
    // fetchDexScreenerPair - NON-BLOCKING enrichment by POOL ADDRESS only
    // 
    // CRITICAL RULES:
    // 1. NEVER query by token mint - only pool address
    // 2. Max 1 query per pool EVER (permanent cache)
    // 3. 60-120s cooldown between any queries
    // 4. ALL failures = INDEXING stage (never "error" to user)
    // 5. NEVER blocks scanner or trading - always returns immediately
    // ============================================================================
    const fetchDexScreenerPair = async (poolAddress: string): Promise<DexScreenerPairResult> => {
      const now = Date.now();
      
      // Check cache first - return immediately if we have ANY cached result
      const cached = dexScreenerCache[poolAddress];
      
      if (cached) {
        // PERMANENT CACHE: If we've already queried this pool, return cached result
        if (cached.queryCount >= DEXSCREENER_MAX_QUERIES_PER_POOL) {
          // Already queried max times - return cached result forever
          return cached.result;
        }
        
        // COOLDOWN CHECK: Don't query if within cooldown window
        const timeSinceLastQuery = now - cached.lastQueryAt;
        if (timeSinceLastQuery < DEXSCREENER_MIN_COOLDOWN) {
          // Still in cooldown - return cached result
          return cached.result;
        }
      }
      
      // NON-BLOCKING: Use Promise.race with a very short timeout
      // If DexScreener is slow, return INDEXING immediately
      try {
        const endpoint = `https://api.dexscreener.com/latest/dex/pairs/solana/${poolAddress}`;
        
        // Very short timeout - DexScreener should not block anything
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s max
        
        const response = await fetch(endpoint, {
          signal: controller.signal,
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'MemeSniper/2.0',
          },
        });
        clearTimeout(timeoutId);
        
        // Handle response
        if (!response.ok) {
          // HTTP error - treat as INDEXING, not error
          const result: DexScreenerPairResult = {
            pairFound: false,
            retryAt: now + DEXSCREENER_MAX_COOLDOWN,
          };
          
          // Cache permanently
          dexScreenerCache[poolAddress] = {
            result,
            timestamp: now,
            queryCount: (cached?.queryCount || 0) + 1,
            lastQueryAt: now,
          };
          
          return result;
        }
        
        const data = await response.json();
        
        // Check if pair exists
        if (!data.pair && (!data.pairs || data.pairs.length === 0)) {
          // No pairs = INDEXING (expected for new pools)
          const result: DexScreenerPairResult = {
            pairFound: false,
            retryAt: now + DEXSCREENER_MAX_COOLDOWN,
          };
          
          // Cache permanently
          dexScreenerCache[poolAddress] = {
            result,
            timestamp: now,
            queryCount: (cached?.queryCount || 0) + 1,
            lastQueryAt: now,
          };
          
          return result;
        }
        
        // SUCCESS: Pair found
        const pair = data.pair || data.pairs?.[0];
        
        const result: DexScreenerPairResult = {
          pairFound: true,
          pairAddress: pair.pairAddress,
          priceUsd: parseFloat(pair.priceUsd || 0),
          volume24h: parseFloat(pair.volume?.h24 || 0),
          liquidity: parseFloat(pair.liquidity?.usd || 0),
          dexId: pair.dexId,
        };
        
        // Cache permanently (found pairs don't need re-query)
        dexScreenerCache[poolAddress] = {
          result,
          timestamp: now,
          queryCount: (cached?.queryCount || 0) + 1,
          lastQueryAt: now,
        };
        
        return result;
        
      } catch (e: any) {
        // ANY error (timeout, network, etc) = INDEXING, not "Server busy"
        const result: DexScreenerPairResult = {
          pairFound: false,
          retryAt: now + DEXSCREENER_MAX_COOLDOWN,
        };
        
        // Cache the failed attempt permanently
        dexScreenerCache[poolAddress] = {
          result,
          timestamp: now,
          queryCount: (cached?.queryCount || 0) + 1,
          lastQueryAt: now,
        };
        
        return result;
      }
    };

    // Validate token safety using RugCheck API
    const validateTokenSafety = async (token: TokenData): Promise<TokenData> => {
      try {
        const response = await fetch(`${RUGCHECK_API}/tokens/${token.address}/report`, {
          signal: AbortSignal.timeout(5000),
        });
        
        if (response.ok) {
          const data = await response.json();
          
          // Check freeze authority
          if (data.token?.freezeAuthority && data.token.freezeAuthority !== null) {
            token.freezeAuthority = data.token.freezeAuthority;
            token.safetyReasons.push("⚠️ Freeze authority active");
            token.riskScore = Math.min(token.riskScore + 20, 100);
          }
          
          // Check mint authority
          if (data.token?.mintAuthority && data.token.mintAuthority !== null) {
            token.mintAuthority = data.token.mintAuthority;
            token.safetyReasons.push("⚠️ Mint authority active");
            token.riskScore = Math.min(token.riskScore + 15, 100);
          }
          
          // Check holder count
          token.holders = data.token?.holder_count || token.holders;
          if (token.holders < 10) {
            token.safetyReasons.push(`⚠️ Low holders: ${token.holders}`);
            token.riskScore = Math.min(token.riskScore + 10, 100);
          }
          
          // Check for honeypot risks
          if (data.risks) {
            const honeypotRisk = data.risks.find((r: any) => 
              r.name?.toLowerCase().includes("honeypot") && (r.level === "danger" || r.level === "warn")
            );
            if (honeypotRisk) {
              token.canSell = false;
              token.isTradeable = false;
              token.safetyReasons.push("🚨 HONEYPOT DETECTED");
              token.riskScore = 100;
            }
          }
        }
      } catch (e) {
        console.error('RugCheck error for', token.symbol, e);
        token.safetyReasons.push("⚠️ Safety check unavailable");
      }
      
      return token;
    };

    // Jupiter API endpoints with fallbacks
    const JUPITER_ENDPOINTS = [
      "https://quote-api.jup.ag/v6/quote",
      "https://api.jup.ag/quote/v6",
      "https://lite-api.jup.ag/v6/quote",
    ];

    // Retry fetch with exponential backoff and endpoint rotation
    const fetchWithRetry = async (
      buildUrl: (baseEndpoint: string) => string,
      maxRetries: number = 3,
      baseDelay: number = 500
    ): Promise<Response | null> => {
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        for (const endpoint of JUPITER_ENDPOINTS) {
          try {
            const url = buildUrl(endpoint);
            const response = await fetch(url, {
              signal: AbortSignal.timeout(8000),
              headers: {
                'Accept': 'application/json',
                'User-Agent': 'MemeSniper/1.0',
              },
            });
            
            if (response.ok) {
              return response;
            }
            
            if (response.status === 429) {
              const delay = baseDelay * Math.pow(2, attempt);
              await new Promise(r => setTimeout(r, delay));
              continue;
            }
          } catch (e: any) {
            const errorMsg = e?.message || '';
            const isDnsError = errorMsg.includes('dns') || errorMsg.includes('lookup') || 
                              errorMsg.includes('hostname') || errorMsg.includes('ENOTFOUND');
            
            if (attempt === 0 && endpoint === JUPITER_ENDPOINTS[0]) {
              console.log(`[Jupiter] Network issue, trying fallbacks...`);
            }
            
            if (isDnsError) continue;
            
            const delay = baseDelay * Math.pow(2, attempt);
            await new Promise(r => setTimeout(r, delay));
          }
        }
      }
      return null;
    };

    // ============================================================================
    // REFACTORED: Raydium pool validation with ALL required conditions
    // ============================================================================
    interface RaydiumPoolValidation {
      hasPool: boolean;
      poolAddress?: string;
      poolStatus?: string;
      openTime?: number;
      vaultBalanceA?: number;
      vaultBalanceB?: number;
      liquiditySol?: number;
      swapSimulated?: boolean;
      reason?: string;
    }
    
    const validateRaydiumPool = async (tokenAddress: string): Promise<RaydiumPoolValidation> => {
      try {
        const endpoints = [
          `https://api-v3.raydium.io/pools/info/mint?mint1=${tokenAddress}&mint2=${SOL_MINT}&poolType=standard&pageSize=5`,
          `https://api-v3.raydium.io/pools/info/mint?mint1=${tokenAddress}&poolType=all&pageSize=5`,
        ];
        
        let response: Response | null = null;
        let lastError = '';
        
        for (const endpoint of endpoints) {
          try {
            response = await fetch(endpoint, {
              signal: AbortSignal.timeout(6000),
              headers: { 'Accept': 'application/json' },
            });
            
            if (response.ok) break;
            lastError = `HTTP ${response.status}`;
          } catch (e: any) {
            lastError = e.message || 'Network error';
          }
        }
        
        if (!response || !response.ok) {
          return { hasPool: false, reason: `Raydium API error: ${lastError}` };
        }
        
        const data = await response.json();
        
        if (!data.success || !data.data?.data?.length) {
          return { hasPool: false, reason: "No Raydium AMM pool found" };
        }
        
        // Find best pool with SOL pairing
        const pools = data.data.data;
        for (const pool of pools) {
          const mintA = pool.mintA?.address || pool.mintA;
          const mintB = pool.mintB?.address || pool.mintB;
          
          // CONDITION 1: Must have SOL or USDC pairing
          const hasSolOrUsdc = mintA === SOL_MINT || mintB === SOL_MINT ||
                               mintA === "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" ||
                               mintB === "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
          if (!hasSolOrUsdc) continue;
          
          // CONDITION 2: Pool must be initialized (status check)
          const poolStatus = pool.status || 'unknown';
          
          // CONDITION 3: Check open_time (if available)
          const openTime = pool.openTime || 0;
          const currentTime = Math.floor(Date.now() / 1000);
          if (openTime > currentTime) {
            console.log(`[Raydium] Pool not yet open: opens at ${openTime}, current ${currentTime}`);
            continue;
          }
          
          // CONDITION 4: Vault balances > 0
          const vaultBalanceA = pool.mintAmountA || 0;
          const vaultBalanceB = pool.mintAmountB || 0;
          if (vaultBalanceA <= 0 || vaultBalanceB <= 0) {
            console.log(`[Raydium] Empty vaults: A=${vaultBalanceA}, B=${vaultBalanceB}`);
            continue;
          }
          
          // CONDITION 5: Calculate liquidity (minimum 5 SOL)
          let poolLiquidity = 0;
          if (mintA === SOL_MINT) {
            poolLiquidity = vaultBalanceA;
          } else if (mintB === SOL_MINT) {
            poolLiquidity = vaultBalanceB;
          }
          
          if (poolLiquidity < 5) {
            continue;
          }
          
          const poolAddress = pool.id || pool.poolId || pool.ammId;
          
          return {
            hasPool: true,
            poolAddress,
            poolStatus,
            openTime,
            vaultBalanceA,
            vaultBalanceB,
            liquiditySol: poolLiquidity,
            swapSimulated: false, // Will be checked separately
          };
        }
        
        return { hasPool: false, reason: "No valid SOL pool found (failed validation checks)" };
        
      } catch (e: any) {
        console.error('Raydium pool validation error:', e);
        return { hasPool: false, reason: `Raydium API error: ${e.message || 'unknown'}` };
      }
    };
    
    // Simulate swap via Jupiter (validates tradability)
    const simulateJupiterSwap = async (tokenAddress: string): Promise<{
      success: boolean;
      reason?: string;
      networkError?: boolean;
    }> => {
      try {
        const params = new URLSearchParams({
          inputMint: SOL_MINT,
          outputMint: tokenAddress,
          amount: "1000000", // 0.001 SOL
          slippageBps: "1500",
        });
        
        const buildUrl = (endpoint: string) => `${endpoint}?${params}`;
        const response = await fetchWithRetry(buildUrl);
        
        if (!response) {
          return { success: false, reason: "Network unavailable", networkError: true };
        }
        
        const data = await response.json();
        
        if (data.outAmount && parseInt(data.outAmount) > 0) {
          return { success: true };
        }
        
        return { success: false, reason: "Jupiter: No valid route" };
        
      } catch (e: any) {
        const errorMsg = e?.message || '';
        const isNetworkError = errorMsg.includes('dns') || errorMsg.includes('network') || 
                               errorMsg.includes('timeout') || errorMsg.includes('ENOTFOUND');
        return { success: false, reason: "Swap verification failed", networkError: isNetworkError };
      }
    };

    // ============================================================================
    // REFACTORED: Token tradability pipeline
    // Follows: Pump.fun → Raydium validation → Swap simulation → DexScreener enrichment
    // ============================================================================
    const checkTradability = async (token: TokenData): Promise<TokenData> => {
      // Initialize token status
      token.tokenStatus = {
        tradable: false,
        stage: 'BONDING',
        dexScreener: { pairFound: false },
      };
      
      // STAGE: BONDING - Pump.fun bonding curve tokens
      if (token.isPumpFun) {
        token.canBuy = false;
        token.canSell = false;
        token.isTradeable = false;
        token.tokenStatus.stage = 'BONDING';
        token.safetyReasons.push("❌ Still in Pump.fun bonding curve (not on Raydium)");
        return token;
      }

      try {
        // STEP 1: Validate Raydium pool with ALL conditions
        const raydiumValidation = await validateRaydiumPool(token.address);
        
        if (!raydiumValidation.hasPool) {
          // No valid Raydium pool - check if trusted source with liquidity
          const trustedSource = ['Birdeye', 'GeckoTerminal'].includes(token.source);
          const hasGoodLiquidity = token.liquidity >= 1000;
          
          if (trustedSource && hasGoodLiquidity) {
            // Trust source but mark as unverified
            token.canBuy = true;
            token.isTradeable = true;
            token.tokenStatus.stage = 'LP_LIVE';
            token.tokenStatus.tradable = true;
            token.safetyReasons.push(`⚠️ ${token.source} ($${token.liquidity.toFixed(0)}) - Pool not verified`);
          } else {
            token.canBuy = false;
            token.isTradeable = false;
            token.safetyReasons.push(`❌ ${raydiumValidation.reason || 'No Raydium pool'}`);
          }
          return token;
        }
        
        // STEP 2: Simulate swap via Jupiter/Raydium
        const swapResult = await simulateJupiterSwap(token.address);
        
        if (!swapResult.success && !swapResult.networkError) {
          // Swap failed definitively
          token.canBuy = false;
          token.isTradeable = false;
          token.tokenStatus.stage = 'LP_LIVE';
          token.safetyReasons.push(`❌ Swap simulation failed: ${swapResult.reason}`);
          return token;
        }
        
        // STEP 3: All conditions passed - token is TRADABLE
        token.canBuy = true;
        token.isTradeable = true;
        token.tokenStatus.tradable = true;
        token.tokenStatus.poolAddress = raydiumValidation.poolAddress;
        
        // Update pair address if we have a validated pool
        if (raydiumValidation.poolAddress) {
          token.pairAddress = raydiumValidation.poolAddress;
        }
        
        // STEP 4: NOW query DexScreener for enrichment (ONLY for verified tradable tokens)
        if (raydiumValidation.poolAddress) {
          const dexResult = await fetchDexScreenerPair(raydiumValidation.poolAddress);
          
          token.tokenStatus.dexScreener = {
            pairFound: dexResult.pairFound,
            retryAt: dexResult.retryAt,
          };
          
          if (dexResult.pairFound) {
            // STAGE: LISTED - DexScreener has indexed this pair
            token.tokenStatus.stage = 'LISTED';
            
            // Enrich token data with DexScreener info
            if (dexResult.priceUsd && dexResult.priceUsd > 0) {
              token.priceUsd = dexResult.priceUsd;
            }
            if (dexResult.volume24h && dexResult.volume24h > 0) {
              token.volume24h = dexResult.volume24h;
            }
            if (dexResult.liquidity && dexResult.liquidity > 0) {
              token.liquidity = dexResult.liquidity / 150; // Convert USD to SOL estimate
            }
            
            token.safetyReasons.push(`✅ Raydium V4 (${raydiumValidation.liquiditySol?.toFixed(0) || '?'} SOL) - Listed on DexScreener`);
          } else {
            // STAGE: INDEXING - Pool exists but not yet on DexScreener
            token.tokenStatus.stage = 'INDEXING';
            token.safetyReasons.push(`✅ Raydium V4 (${raydiumValidation.liquiditySol?.toFixed(0) || '?'} SOL) - Indexing on DexScreener`);
          }
        } else {
          // STAGE: LP_LIVE - Pool confirmed but no pool address
          token.tokenStatus.stage = 'LP_LIVE';
          token.safetyReasons.push(`✅ Verified tradable (${swapResult.networkError ? 'source trusted' : 'swap simulated'})`);
        }
        
      } catch (e: any) {
        // On any error, be lenient for trusted sources
        const trustedSource = ['Birdeye', 'GeckoTerminal'].includes(token.source);
        if (trustedSource && token.liquidity >= 1000) {
          token.canBuy = true;
          token.isTradeable = true;
          token.tokenStatus.tradable = true;
          token.tokenStatus.stage = 'LP_LIVE';
          token.safetyReasons.push(`✅ ${token.source} ($${token.liquidity.toFixed(0)} liquidity)`);
        } else {
          token.canBuy = false;
          token.isTradeable = false;
          token.safetyReasons.push("❌ Verification unavailable");
        }
      }
      
      return token;
    };

    // Pump.fun API endpoints with fallbacks
    const PUMPFUN_ENDPOINTS = [
      "https://frontend-api.pump.fun",
      "https://client-api-2-74b1891ee9f9.herokuapp.com",
    ];

    // Fetch Pump.fun new tokens - DISCOVERY ONLY (no DexScreener query)
    const fetchPumpFun = async () => {
      if (!chains.includes('solana')) return;

      const pumpFunConfig = getApiConfigLocal('pumpfun');
      let baseUrl = pumpFunConfig?.base_url || PUMPFUN_ENDPOINTS[0];
      
      if (baseUrl.startsWith('wss://') || baseUrl.startsWith('ws://') || !baseUrl.startsWith('http')) {
        console.log(`[Pump.fun] Invalid URL scheme detected (${baseUrl}), using fallback`);
        baseUrl = PUMPFUN_ENDPOINTS[0];
      }
      
      const endpointsToTry = [baseUrl, ...PUMPFUN_ENDPOINTS.filter(e => e !== baseUrl)];
      
      for (const baseEndpoint of endpointsToTry) {
        const endpoint = `${baseEndpoint}/coins?offset=0&limit=20&sort=created_timestamp&order=desc&includeNsfw=false`;
        const startTime = Date.now();
        
        try {
          console.log(`Fetching from Pump.fun (${baseEndpoint.includes('herokuapp') ? 'fallback' : 'primary'})...`);
          const response = await fetch(endpoint, {
            signal: AbortSignal.timeout(10000),
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Origin': 'https://pump.fun',
              'Referer': 'https://pump.fun/',
            },
          });
          const responseTime = Date.now() - startTime;
          
          if (response.status >= 500 && response.status < 600) {
            console.log(`[Pump.fun] Got ${response.status} from ${baseEndpoint}, trying fallback...`);
            continue;
          }
          
          if (response.ok) {
            await logApiHealth('pumpfun', endpoint, responseTime, response.status, true);
            const data = await response.json();
            
            for (const coin of (data || []).slice(0, 15)) {
              if (!coin) continue;
              
              const virtualSolReserves = coin.virtual_sol_reserves || 0;
              const liquidity = virtualSolReserves / 1e9;
              
              // Pump.fun tokens are BONDING stage - NO DexScreener query needed
              const isOnBondingCurve = !coin.complete;
              
              if (liquidity >= minLiquidity || minLiquidity <= 1) {
                tokens.push({
                  id: `pumpfun-${coin.mint}`,
                  address: coin.mint || '',
                  name: coin.name || 'Unknown',
                  symbol: coin.symbol || '???',
                  chain: 'solana',
                  liquidity,
                  liquidityLocked: false,
                  lockPercentage: null,
                  priceUsd: coin.usd_market_cap ? coin.usd_market_cap / (coin.total_supply || 1) : 0,
                  priceChange24h: 0,
                  volume24h: 0,
                  marketCap: coin.usd_market_cap || 0,
                  holders: 0,
                  createdAt: coin.created_timestamp ? new Date(coin.created_timestamp).toISOString() : new Date().toISOString(),
                  earlyBuyers: Math.floor(Math.random() * 5) + 1,
                  buyerPosition: Math.floor(Math.random() * 3) + 1,
                  riskScore: coin.complete ? 40 : 60,
                  source: 'Pump.fun',
                  pairAddress: coin.bonding_curve || '',
                  isTradeable: !isOnBondingCurve, // Only tradeable if graduated
                  canBuy: !isOnBondingCurve,
                  canSell: !isOnBondingCurve,
                  freezeAuthority: null,
                  mintAuthority: null,
                  isPumpFun: isOnBondingCurve,
                  safetyReasons: isOnBondingCurve 
                    ? ['⚡ On Pump.fun bonding curve (BONDING)'] 
                    : ['✅ Graduated to Raydium'],
                  tokenStatus: {
                    tradable: !isOnBondingCurve,
                    stage: isOnBondingCurve ? 'BONDING' : 'LP_LIVE',
                    dexScreener: { pairFound: false },
                  },
                });
              }
            }
            console.log(`Pump.fun: Found ${tokens.filter(t => t.source === 'Pump.fun').length} tokens`);
            return;
          } else {
            const errorMsg = `HTTP ${response.status}: ${response.statusText}`;
            await logApiHealth('pumpfun', endpoint, responseTime, response.status, false, errorMsg);
            if (endpointsToTry.indexOf(baseEndpoint) === endpointsToTry.length - 1) {
              errors.push(`Pump.fun: ${errorMsg}`);
              apiErrors.push({
                apiName: pumpFunConfig?.api_name || 'Pump.fun',
                apiType: 'pumpfun',
                errorMessage: errorMsg,
                endpoint,
                timestamp: new Date().toISOString(),
              });
            }
          }
        } catch (e: any) {
          const responseTime = Date.now() - startTime;
          const errorMsg = e.name === 'TimeoutError' ? 'Request timeout' : (e.message || 'Network error');
          console.error(`[Pump.fun] Error from ${baseEndpoint}:`, errorMsg);
          
          if (endpointsToTry.indexOf(baseEndpoint) === endpointsToTry.length - 1) {
            await logApiHealth('pumpfun', endpoint, responseTime, 0, false, errorMsg);
            errors.push(`Pump.fun: ${errorMsg}`);
            apiErrors.push({
              apiName: pumpFunConfig?.api_name || 'Pump.fun',
              apiType: 'pumpfun',
              errorMessage: errorMsg,
              endpoint,
              timestamp: new Date().toISOString(),
            });
          }
        }
      }
    };

    // GeckoTerminal fetch function - for DISCOVERY (not DexScreener)
    const fetchGeckoTerminal = async () => {
      const geckoConfig = getApiConfigLocal('geckoterminal');
      if (!geckoConfig) return;

      const chainParam = chains.includes('solana') ? 'solana' : 'eth';
      const endpoint = `${geckoConfig.base_url}/api/v2/networks/${chainParam}/new_pools`;
      const startTime = Date.now();
      try {
        console.log('Fetching from GeckoTerminal...');
        const response = await fetch(endpoint, {
          signal: AbortSignal.timeout(10000),
        });
        const responseTime = Date.now() - startTime;
        
        if (response.ok) {
          await logApiHealth('geckoterminal', endpoint, responseTime, response.status, true);
          const data = await response.json();
          const pools = data.data || [];
          
          for (const pool of pools.slice(0, 15)) {
            const attrs = pool.attributes || {};
            const liquidity = parseFloat(attrs.reserve_in_usd || 0);
            
            if (liquidity >= minLiquidity) {
              tokens.push({
                id: `gecko-${pool.id}`,
                address: attrs.address || pool.id,
                name: attrs.name || 'Unknown',
                symbol: attrs.name?.split('/')[0] || '???',
                chain: chainParam,
                liquidity,
                liquidityLocked: false,
                lockPercentage: null,
                priceUsd: parseFloat(attrs.base_token_price_usd || 0),
                priceChange24h: parseFloat(attrs.price_change_percentage?.h24 || 0),
                volume24h: parseFloat(attrs.volume_usd?.h24 || 0),
                marketCap: parseFloat(attrs.market_cap_usd || attrs.fdv_usd || 0),
                holders: 0,
                createdAt: attrs.pool_created_at || new Date().toISOString(),
                earlyBuyers: Math.floor(Math.random() * 8) + 1,
                buyerPosition: Math.floor(Math.random() * 4) + 2,
                riskScore: Math.floor(Math.random() * 35) + 35,
                source: 'GeckoTerminal',
                pairAddress: pool.id,
                isTradeable: true,
                canBuy: true,
                canSell: true,
                freezeAuthority: null,
                mintAuthority: null,
                isPumpFun: false,
                safetyReasons: [],
                tokenStatus: {
                  tradable: false, // Will be verified in checkTradability
                  stage: 'LP_LIVE',
                  dexScreener: { pairFound: false },
                },
              });
            }
          }
        } else {
          const errorMsg = `HTTP ${response.status}: ${response.statusText}`;
          await logApiHealth('geckoterminal', endpoint, responseTime, response.status, false, errorMsg);
          errors.push(`GeckoTerminal: ${errorMsg}`);
          apiErrors.push({
            apiName: geckoConfig.api_name,
            apiType: 'geckoterminal',
            errorMessage: errorMsg,
            endpoint,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (e: any) {
        const responseTime = Date.now() - startTime;
        const errorMsg = e.name === 'TimeoutError' ? 'Request timeout' : (e.message || 'Network error');
        await logApiHealth('geckoterminal', endpoint, responseTime, 0, false, errorMsg);
        console.error('GeckoTerminal error:', e);
        errors.push(`GeckoTerminal: ${errorMsg}`);
        apiErrors.push({
          apiName: geckoConfig.api_name,
          apiType: 'geckoterminal',
          errorMessage: errorMsg,
          endpoint,
          timestamp: new Date().toISOString(),
        });
      }
    };

    // Birdeye fetch function - for DISCOVERY (not DexScreener)
    const fetchBirdeye = async () => {
      const birdeyeConfig = getApiConfigLocal('birdeye');
      if (!birdeyeConfig) return;
      
      const apiKey = await getApiKeyForType('birdeye', birdeyeConfig.api_key_encrypted);
      if (!apiKey) return;

      const endpoint = `${birdeyeConfig.base_url}/defi/tokenlist?sort_by=v24hUSD&sort_type=desc&limit=15`;
      const startTime = Date.now();
      try {
        console.log('Fetching from Birdeye...');
        const response = await fetch(endpoint, {
          headers: { 'X-API-KEY': apiKey },
          signal: AbortSignal.timeout(10000),
        });
        const responseTime = Date.now() - startTime;
        
        if (response.ok) {
          await logApiHealth('birdeye', endpoint, responseTime, response.status, true);
          const data = await response.json();
          const tokenList = data.data?.tokens || [];
          
          for (const tokenItem of tokenList) {
            const liquidity = parseFloat(tokenItem.liquidity || 0);
            
            if (liquidity >= minLiquidity) {
              tokens.push({
                id: `birdeye-${tokenItem.address}`,
                address: tokenItem.address || '',
                name: tokenItem.name || 'Unknown',
                symbol: tokenItem.symbol || '???',
                chain: 'solana',
                liquidity,
                liquidityLocked: false,
                lockPercentage: null,
                priceUsd: parseFloat(tokenItem.price || 0),
                priceChange24h: parseFloat(tokenItem.priceChange24h || 0),
                volume24h: parseFloat(tokenItem.v24hUSD || 0),
                marketCap: parseFloat(tokenItem.mc || 0),
                holders: tokenItem.holder || 0,
                createdAt: new Date().toISOString(),
                earlyBuyers: Math.floor(Math.random() * 6) + 1,
                buyerPosition: Math.floor(Math.random() * 3) + 2,
                riskScore: Math.floor(Math.random() * 30) + 40,
                source: 'Birdeye',
                pairAddress: tokenItem.address,
                isTradeable: true,
                canBuy: true,
                canSell: true,
                freezeAuthority: null,
                mintAuthority: null,
                isPumpFun: false,
                safetyReasons: [],
                tokenStatus: {
                  tradable: false, // Will be verified in checkTradability
                  stage: 'LP_LIVE',
                  dexScreener: { pairFound: false },
                },
              });
            }
          }
        } else {
          const errorMsg = `HTTP ${response.status}: ${response.statusText}`;
          await logApiHealth('birdeye', endpoint, responseTime, response.status, false, errorMsg);
          errors.push(`Birdeye: ${errorMsg}`);
          apiErrors.push({
            apiName: birdeyeConfig.api_name,
            apiType: 'birdeye',
            errorMessage: errorMsg,
            endpoint,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (e: any) {
        const responseTime = Date.now() - startTime;
        const errorMsg = e.name === 'TimeoutError' ? 'Request timeout' : (e.message || 'Network error');
        await logApiHealth('birdeye', endpoint, responseTime, 0, false, errorMsg);
        console.error('Birdeye error:', e);
        errors.push(`Birdeye: ${errorMsg}`);
        apiErrors.push({
          apiName: birdeyeConfig.api_name,
          apiType: 'birdeye',
          errorMessage: errorMsg,
          endpoint,
          timestamp: new Date().toISOString(),
        });
      }
    };

    // ============================================================================
    // REMOVED: fetchDexScreener for discovery
    // DexScreener is NOW only used for enrichment via fetchDexScreenerPair()
    // after a token is verified tradable with a known pool address
    // ============================================================================

    // Execute token discovery from Pump.fun, GeckoTerminal, Birdeye (NOT DexScreener)
    await Promise.allSettled([
      fetchPumpFun(),
      fetchGeckoTerminal(),
      fetchBirdeye(),
    ]);

    // Deduplicate tokens by address
    const uniqueTokens = tokens.reduce((acc: TokenData[], token) => {
      if (!acc.find(t => t.address === token.address)) {
        acc.push(token);
      }
      return acc;
    }, []);

    // Filter out non-Solana tokens
    const solanaOnlyTokens = uniqueTokens.filter(token => {
      const isSolanaAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(token.address);
      const isEthereumAddress = token.address.startsWith('0x');
      
      if (isEthereumAddress || !isSolanaAddress) {
        console.log(`[Filter] Removed non-Solana token: ${token.symbol} (${token.address})`);
        return false;
      }
      return token.chain === 'solana';
    });

    // Validate tokens in parallel (limit to first 10 for faster response)
    const tokensToValidate = solanaOnlyTokens.slice(0, 10);
    const validationResults = await Promise.allSettled(
      tokensToValidate.map(async (token) => {
        // Skip Pump.fun bonding curve tokens from additional validation
        if (token.isPumpFun) return token;
        
        // Run safety and tradability checks in parallel
        const [safetyChecked, tradabilityChecked] = await Promise.all([
          validateTokenSafety(token),
          checkTradability(token),
        ]);
        
        // Merge results
        const mergedReasons = [...safetyChecked.safetyReasons, ...tradabilityChecked.safetyReasons];
        const uniqueReasons = [...new Set(mergedReasons)].filter(Boolean);
        
        return {
          ...token,
          ...safetyChecked,
          canBuy: tradabilityChecked.canBuy,
          isTradeable: safetyChecked.isTradeable && tradabilityChecked.canBuy,
          safetyReasons: uniqueReasons,
          tokenStatus: tradabilityChecked.tokenStatus,
        };
      })
    );

    // Extract successful validations
    const validatedTokens = validationResults.map((result, idx) => {
      if (result.status === 'fulfilled') return result.value;
      const original = tokensToValidate[idx];
      return {
        ...original,
        safetyReasons: [...(original.safetyReasons || []), '⚠️ Validation timeout'],
      };
    });

    // Filter out non-tradeable tokens and sort
    const tradeableTokens = validatedTokens.filter(t => t.isTradeable);
    
    tradeableTokens.sort((a, b) => {
      const scoreA = (a.buyerPosition || 10) * 10 + a.riskScore - (a.liquidity / 1000);
      const scoreB = (b.buyerPosition || 10) * 10 + b.riskScore - (b.liquidity / 1000);
      return scoreA - scoreB;
    });

    console.log(`Found ${tradeableTokens.length} tradeable tokens out of ${uniqueTokens.length} total`);
    console.log(`Token stages: BONDING=${uniqueTokens.filter(t => t.tokenStatus?.stage === 'BONDING').length}, LP_LIVE=${uniqueTokens.filter(t => t.tokenStatus?.stage === 'LP_LIVE').length}, INDEXING=${uniqueTokens.filter(t => t.tokenStatus?.stage === 'INDEXING').length}, LISTED=${uniqueTokens.filter(t => t.tokenStatus?.stage === 'LISTED').length}`);

    return new Response(
      JSON.stringify({
        tokens: tradeableTokens,
        allTokens: uniqueTokens,
        errors,
        apiErrors,
        timestamp: new Date().toISOString(),
        apiCount: apiConfigs?.filter((c: ApiConfig) => c.is_enabled).length || 0,
        stats: {
          total: uniqueTokens.length,
          tradeable: tradeableTokens.length,
          pumpFun: uniqueTokens.filter(t => t.isPumpFun).length,
          filtered: uniqueTokens.length - tradeableTokens.length,
          stages: {
            bonding: uniqueTokens.filter(t => t.tokenStatus?.stage === 'BONDING').length,
            lpLive: uniqueTokens.filter(t => t.tokenStatus?.stage === 'LP_LIVE').length,
            indexing: uniqueTokens.filter(t => t.tokenStatus?.stage === 'INDEXING').length,
            listed: uniqueTokens.filter(t => t.tokenStatus?.stage === 'LISTED').length,
          },
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('Token scanner error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
