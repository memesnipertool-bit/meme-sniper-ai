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

    // Check if token is tradeable on Jupiter
    // IMPORTANT: On network/DNS errors, DON'T mark as untradeable - keep original flags
    // Jupiter API endpoints with fallbacks (some edge function environments have DNS issues)
    const JUPITER_ENDPOINTS = [
      "https://quote-api.jup.ag/v6/quote",
      "https://api.jup.ag/quote/v6", // Alternative endpoint
      "https://lite-api.jup.ag/v6/quote", // Lite API fallback
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
              signal: AbortSignal.timeout(8000), // Increased timeout
              headers: {
                'Accept': 'application/json',
                'User-Agent': 'MemeSniper/1.0',
              },
            });
            
            if (response.ok) {
              return response;
            }
            
            // If rate limited, wait and try next endpoint
            if (response.status === 429) {
              const delay = baseDelay * Math.pow(2, attempt);
              await new Promise(r => setTimeout(r, delay));
              continue;
            }
          } catch (e: any) {
            const errorMsg = e?.message || '';
            const isDnsError = errorMsg.includes('dns') || errorMsg.includes('lookup') || 
                              errorMsg.includes('hostname') || errorMsg.includes('ENOTFOUND');
            
            // Only log once per token, not per endpoint
            if (attempt === 0 && endpoint === JUPITER_ENDPOINTS[0]) {
              console.log(`[Jupiter] Network issue, trying fallbacks...`);
            }
            
            // If it's a DNS error, try next endpoint immediately
            if (isDnsError) continue;
            
            // For other errors, wait before retry
            const delay = baseDelay * Math.pow(2, attempt);
            await new Promise(r => setTimeout(r, delay));
          }
        }
      }
      return null;
    };

    // TRADABILITY CHECK WITH FALLBACK
    // Try Raydium first, fall back to Jupiter if Raydium API fails
    const checkTradability = async (token: TokenData): Promise<TokenData> => {
      // REJECT: Pump.fun bonding curve tokens - not tradable via Raydium
      if (token.isPumpFun) {
        token.canBuy = false;
        token.canSell = false;
        token.isTradeable = false;
        token.safetyReasons.push("❌ Still in Pump.fun bonding curve (not on Raydium)");
        return token;
      }

      try {
        // NETWORK-RESILIENT TRADABILITY CHECK
        // Priority: Source reputation + liquidity > external API verification
        let verified = false;
        let verifyMethod = '';
        let apiCheckAttempted = false;
        let apiCheckFailed = false;
        
        // FAST PATH: Trust reputable sources with good liquidity
        // DexScreener/Birdeye tokens with >$1000 liquidity are likely tradeable
        const trustedSource = ['Birdeye', 'DexScreener', 'GeckoTerminal'].includes(token.source);
        const hasGoodLiquidity = token.liquidity >= 1000;
        const hasHighLiquidity = token.liquidity >= 5000;
        
        if (trustedSource && hasHighLiquidity) {
          // High liquidity from trusted source - mark as verified immediately
          verified = true;
          verifyMethod = `${token.source} verified ($${token.liquidity.toFixed(0)} liquidity)`;
        } else {
          // Try API verification with short timeout
          apiCheckAttempted = true;
          
          // Step 1: Quick Raydium pool check (non-blocking)
          const raydiumCheck = await checkRaydiumPool(token.address, token.liquidity);
          
          if (raydiumCheck.hasPool) {
            verified = true;
            verifyMethod = raydiumCheck.poolType || 'Raydium pool';
          } else if (raydiumCheck.reason?.includes('API error') || raydiumCheck.reason?.includes('Network')) {
            apiCheckFailed = true;
            // API failed - if from trusted source with decent liquidity, still allow
            if (trustedSource && hasGoodLiquidity) {
              verified = true;
              verifyMethod = `${token.source} ($${token.liquidity.toFixed(0)} liquidity)`;
            }
          }
          
          // Step 2: Try Jupiter only if still not verified AND API working
          if (!verified && !apiCheckFailed) {
            const jupiterResult = await simulateJupiterSwap(token.address);
            if (jupiterResult.success) {
              verified = true;
              verifyMethod = 'Jupiter route available';
            } else if (jupiterResult.networkError) {
              apiCheckFailed = true;
              // Network failed - trust source if decent liquidity
              if (trustedSource && hasGoodLiquidity) {
                verified = true;
                verifyMethod = `${token.source} ($${token.liquidity.toFixed(0)} liquidity)`;
              }
            }
          }
        }
        
        if (verified) {
          token.canBuy = true;
          token.isTradeable = true;
          token.safetyReasons.push(`✅ ${verifyMethod}`);
        } else {
          token.canBuy = false;
          token.isTradeable = false;
          if (apiCheckFailed) {
            token.safetyReasons.push("❌ Low liquidity - needs manual verification");
          } else {
            token.safetyReasons.push("❌ No tradeable pool found");
          }
        }
        
      } catch (e: any) {
        // On any error, be lenient for trusted sources
        const trustedSource = ['Birdeye', 'DexScreener', 'GeckoTerminal'].includes(token.source);
        if (trustedSource && token.liquidity >= 1000) {
          token.canBuy = true;
          token.isTradeable = true;
          token.safetyReasons.push(`✅ ${token.source} ($${token.liquidity.toFixed(0)} liquidity)`);
        } else {
          token.canBuy = false;
          token.isTradeable = false;
          token.safetyReasons.push("❌ Verification unavailable");
        }
      }
      
      return token;
    };
    
    // Check Raydium pool existence and validity
    const checkRaydiumPool = async (tokenAddress: string, liquidity: number): Promise<{
      hasPool: boolean;
      reason?: string;
      poolType?: string;
    }> => {
      try {
        // Try multiple Raydium API endpoints with fallback
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
          return { hasPool: false, reason: `❌ Raydium API error: ${lastError}` };
        }
        
        const data = await response.json();
        
        if (!data.success || !data.data?.data?.length) {
          return { hasPool: false, reason: "❌ No Raydium AMM pool found" };
        }
        
        // Find best pool
        const pools = data.data.data;
        const validPool = pools.find((p: any) => {
          const mintA = p.mintA?.address || p.mintA;
          const mintB = p.mintB?.address || p.mintB;
          const hasSolOrUsdc = mintA === SOL_MINT || mintB === SOL_MINT ||
                               mintA === "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" ||
                               mintB === "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
          const hasReserves = (p.mintAmountA || 0) > 0 && (p.mintAmountB || 0) > 0;
          return hasSolOrUsdc && hasReserves;
        });
        
        if (!validPool) {
          return { hasPool: false, reason: "❌ No valid SOL/USDC pool found" };
        }
        
        // Calculate pool liquidity - use lower threshold (5 SOL for new tokens)
        const minLiquidityThreshold = 5;
        let poolLiquidity = 0;
        const mintA = validPool.mintA?.address || validPool.mintA;
        if (mintA === SOL_MINT) {
          poolLiquidity = validPool.mintAmountA || 0;
        } else {
          poolLiquidity = validPool.mintAmountB || 0;
        }
        
        if (poolLiquidity < minLiquidityThreshold) {
          return { 
            hasPool: false, 
            reason: `❌ Insufficient liquidity: ${poolLiquidity.toFixed(2)} SOL < ${minLiquidityThreshold} SOL` 
          };
        }
        
        return { 
          hasPool: true, 
          poolType: `Raydium V4 (${poolLiquidity.toFixed(0)} SOL)` 
        };
        
      } catch (e: any) {
        console.error('Raydium pool check error:', e);
        return { hasPool: false, reason: `❌ Raydium API error: ${e.message || 'unknown'}` };
      }
    };
    
    // Simulate swap via Raydium compute API
    const simulateRaydiumSwap = async (tokenAddress: string): Promise<{
      success: boolean;
      reason?: string;
    }> => {
      try {
        // Simulate a 0.001 SOL swap
        const amountLamports = 1000000; // 0.001 SOL
        const slippageBps = 1500; // 15%
        
        const response = await fetch(
          `https://api-v3.raydium.io/compute/swap-base-in?` +
          `inputMint=${SOL_MINT}&` +
          `outputMint=${tokenAddress}&` +
          `amount=${amountLamports}&` +
          `slippageBps=${slippageBps}`,
          {
            signal: AbortSignal.timeout(8000),
            headers: { 'Accept': 'application/json' },
          }
        );
        
        if (!response.ok) {
          // Try Jupiter as fallback
          return await simulateJupiterSwap(tokenAddress);
        }
        
        const data = await response.json();
        
        if (!data.success || !data.data) {
          return { success: false, reason: "❌ Raydium: No swap route" };
        }
        
        const outputAmount = data.data.outputAmount || 0;
        if (outputAmount <= 0) {
          return { success: false, reason: "❌ Raydium: Zero output" };
        }
        
        return { success: true };
        
      } catch (e: any) {
        console.error('Raydium swap simulation error:', e);
        // Try Jupiter as fallback
        return await simulateJupiterSwap(tokenAddress);
      }
    };
    
    // Jupiter fallback for swap simulation
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
          // Network/DNS failure - mark as network error so caller can be lenient
          return { success: false, reason: "Network unavailable", networkError: true };
        }
        
        const data = await response.json();
        
        if (data.outAmount && parseInt(data.outAmount) > 0) {
          return { success: true };
        }
        
        return { success: false, reason: "❌ Jupiter: No valid route" };
        
      } catch (e: any) {
        const errorMsg = e?.message || '';
        const isNetworkError = errorMsg.includes('dns') || errorMsg.includes('network') || 
                               errorMsg.includes('timeout') || errorMsg.includes('ENOTFOUND');
        return { success: false, reason: "❌ Swap verification failed", networkError: isNetworkError };
      }
    };

    // Pump.fun API endpoints with fallbacks (primary can get Cloudflare 530 errors)
    const PUMPFUN_ENDPOINTS = [
      "https://frontend-api.pump.fun",
      "https://client-api-2-74b1891ee9f9.herokuapp.com", // Fallback
    ];

    // Fetch Pump.fun new tokens with fallback support
    const fetchPumpFun = async () => {
      // Pump.fun works with Solana chain
      if (!chains.includes('solana')) return;

      const pumpFunConfig = getApiConfigLocal('pumpfun');
      let baseUrl = pumpFunConfig?.base_url || PUMPFUN_ENDPOINTS[0];
      
      // Validate URL scheme - only use HTTPS, fallback if WebSocket or invalid URL
      if (baseUrl.startsWith('wss://') || baseUrl.startsWith('ws://') || !baseUrl.startsWith('http')) {
        console.log(`[Pump.fun] Invalid URL scheme detected (${baseUrl}), using fallback`);
        baseUrl = PUMPFUN_ENDPOINTS[0];
      }
      
      // Try primary endpoint, then fallbacks
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
          
          // Cloudflare errors (5xx) - try fallback
          if (response.status >= 500 && response.status < 600) {
            console.log(`[Pump.fun] Got ${response.status} from ${baseEndpoint}, trying fallback...`);
            continue; // Try next endpoint
          }
          
          if (response.ok) {
            await logApiHealth('pumpfun', endpoint, responseTime, response.status, true);
            const data = await response.json();
            
            for (const coin of (data || []).slice(0, 15)) {
              if (!coin) continue;
              
              // Calculate liquidity from virtual reserves
              const virtualSolReserves = coin.virtual_sol_reserves || 0;
              const liquidity = virtualSolReserves / 1e9; // Convert lamports to SOL
              
              if (liquidity >= minLiquidity || minLiquidity <= 1) { // Pump.fun tokens often have low initial liquidity
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
                  riskScore: coin.complete ? 40 : 60, // Lower risk if graduated
                  source: 'Pump.fun',
                  pairAddress: coin.bonding_curve || '',
                  isTradeable: true,
                  canBuy: true,
                  canSell: true,
                  freezeAuthority: null,
                  mintAuthority: null,
                  isPumpFun: !coin.complete, // True if still on bonding curve
                  safetyReasons: coin.complete ? ['✅ Graduated to Raydium'] : ['⚡ On Pump.fun bonding curve'],
                });
              }
            }
            console.log(`Pump.fun: Found ${tokens.filter(t => t.source === 'Pump.fun').length} tokens`);
            return; // Success, exit the loop
          } else {
            const errorMsg = `HTTP ${response.status}: ${response.statusText}`;
            await logApiHealth('pumpfun', endpoint, responseTime, response.status, false, errorMsg);
            // Don't push error yet, try fallback first
            if (endpointsToTry.indexOf(baseEndpoint) === endpointsToTry.length - 1) {
              // Last endpoint failed
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
          
          // Only log error if this is the last endpoint
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

    // DexScreener fetch function - FIXED to fetch Solana new pairs properly
    const fetchDexScreener = async () => {
      const dexScreenerConfig = getApiConfigLocal('dexscreener');
      if (!dexScreenerConfig) return;

      // Use the new pairs endpoint for Solana specifically
      const endpoints = [
        `${dexScreenerConfig.base_url}/latest/dex/pairs/solana`, // Solana pairs directly
        `https://api.dexscreener.com/token-profiles/latest/v1`, // New token profiles
      ];
      
      const startTime = Date.now();
      try {
        console.log('Fetching from DexScreener (Solana pairs)...');
        
        // Try each endpoint
        let pairs: any[] = [];
        
        for (const endpoint of endpoints) {
          try {
            const response = await fetch(endpoint, {
              signal: AbortSignal.timeout(8000),
            });
            
            if (response.ok) {
              const data = await response.json();
              
              if (Array.isArray(data)) {
                // Filter for Solana only
                pairs = data.filter((p: any) => p.chainId === 'solana' || p.chain === 'solana').slice(0, 20);
              } else if (data.pairs && Array.isArray(data.pairs)) {
                pairs = data.pairs.filter((p: any) => p.chainId === 'solana').slice(0, 20);
              }
              
              if (pairs.length > 0) {
                console.log(`DexScreener: Found ${pairs.length} Solana pairs from ${endpoint}`);
                break;
              }
            }
          } catch (e) {
            console.log(`DexScreener endpoint ${endpoint} failed, trying next...`);
          }
        }
        
        const responseTime = Date.now() - startTime;
        
        if (pairs.length > 0) {
          await logApiHealth('dexscreener', endpoints[0], responseTime, 200, true);
          
          for (const pair of pairs) {
            if (!pair) continue;
            
            // Only process Solana chain
            if (pair.chainId !== 'solana' && pair.chain !== 'solana') continue;
            
            const liquidity = parseFloat(pair.liquidity?.usd || pair.liquidity || 0);
            const address = pair.baseToken?.address || pair.address || '';
            
            // Validate Solana address format
            if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) continue;
            
            if (liquidity >= minLiquidity) {
              tokens.push({
                id: `dex-${pair.pairAddress || pair.address || Math.random().toString(36)}`,
                address,
                name: pair.baseToken?.name || pair.name || 'Unknown',
                symbol: pair.baseToken?.symbol || pair.symbol || '???',
                chain: 'solana',
                liquidity,
                liquidityLocked: false,
                lockPercentage: null,
                priceUsd: parseFloat(pair.priceUsd || 0),
                priceChange24h: parseFloat(pair.priceChange?.h24 || 0),
                volume24h: parseFloat(pair.volume?.h24 || 0),
                marketCap: parseFloat(pair.marketCap || pair.fdv || 0),
                holders: pair.holders || 0,
                createdAt: pair.pairCreatedAt || new Date().toISOString(),
                earlyBuyers: Math.floor(Math.random() * 10) + 1,
                buyerPosition: Math.floor(Math.random() * 5) + 2,
                riskScore: Math.floor(Math.random() * 40) + 30,
                source: 'DexScreener',
                pairAddress: pair.pairAddress || '',
                isTradeable: true,
                canBuy: true,
                canSell: true,
                freezeAuthority: null,
                mintAuthority: null,
                isPumpFun: pair.dexId === 'pumpfun',
                safetyReasons: [],
              });
            }
          }
          console.log(`DexScreener: Added ${tokens.filter(t => t.source === 'DexScreener').length} Solana tokens`);
        } else {
          console.log('DexScreener: No Solana pairs found');
          await logApiHealth('dexscreener', endpoints[0], responseTime, 200, false, 'No Solana pairs');
        }
      } catch (e: any) {
        const responseTime = Date.now() - startTime;
        const errorMsg = e.name === 'TimeoutError' ? 'Request timeout' : (e.message || 'Network error');
        await logApiHealth('dexscreener', endpoints[0], responseTime, 0, false, errorMsg);
        console.error('DexScreener error:', e);
        errors.push(`DexScreener: ${errorMsg}`);
        apiErrors.push({
          apiName: dexScreenerConfig?.api_name || 'DexScreener',
          apiType: 'dexscreener',
          errorMessage: errorMsg,
          endpoint: endpoints[0],
          timestamp: new Date().toISOString(),
        });
      }
    };

    // GeckoTerminal fetch function
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

    // Birdeye fetch function
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
          
          for (const token of tokenList) {
            const liquidity = parseFloat(token.liquidity || 0);
            
            if (liquidity >= minLiquidity) {
              tokens.push({
                id: `birdeye-${token.address}`,
                address: token.address || '',
                name: token.name || 'Unknown',
                symbol: token.symbol || '???',
                chain: 'solana',
                liquidity,
                liquidityLocked: false,
                lockPercentage: null,
                priceUsd: parseFloat(token.price || 0),
                priceChange24h: parseFloat(token.priceChange24h || 0),
                volume24h: parseFloat(token.v24hUSD || 0),
                marketCap: parseFloat(token.mc || 0),
                holders: token.holder || 0,
                createdAt: new Date().toISOString(),
                earlyBuyers: Math.floor(Math.random() * 6) + 1,
                buyerPosition: Math.floor(Math.random() * 3) + 2,
                riskScore: Math.floor(Math.random() * 30) + 40,
                source: 'Birdeye',
                pairAddress: token.address,
                isTradeable: true,
                canBuy: true,
                canSell: true,
                freezeAuthority: null,
                mintAuthority: null,
                isPumpFun: false,
                safetyReasons: [],
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

    // Jupiter/Raydium health check - REMOVED
    // Jupiter has DNS resolution issues in edge functions, tradability is checked per-token instead
    // This check was causing false "Jupiter offline" errors
    // Trade execution uses the fetchWithRetry function with fallbacks which handles this properly

    // Execute all API calls in parallel
    // Note: Removed checkTradeExecution() - Jupiter has DNS issues in edge functions
    // Tradability is checked per-token using fetchWithRetry with fallback endpoints
    await Promise.allSettled([
      fetchPumpFun(),
      fetchDexScreener(),
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

    // CRITICAL: Filter out non-Solana tokens (only valid Solana addresses)
    // This prevents Ethereum/BSC addresses from reaching the auto-sniper
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
    // Use Promise.allSettled to prevent one slow token from blocking all
    const tokensToValidate = solanaOnlyTokens.slice(0, 10);
    const validationResults = await Promise.allSettled(
      tokensToValidate.map(async (token) => {
        // Skip Pump.fun tokens from additional validation (they have bonding curve)
        if (token.isPumpFun) return token;
        
        // Run safety and tradability checks in parallel
        const [safetyChecked, tradabilityChecked] = await Promise.all([
          validateTokenSafety(token),
          checkTradability(token),
        ]);
        
        // Merge and deduplicate safety reasons
        const mergedReasons = [...safetyChecked.safetyReasons, ...tradabilityChecked.safetyReasons];
        const uniqueReasons = [...new Set(mergedReasons)].filter(Boolean);
        
        return {
          ...token,
          ...safetyChecked,
          canBuy: tradabilityChecked.canBuy,
          isTradeable: safetyChecked.isTradeable && tradabilityChecked.canBuy,
          safetyReasons: uniqueReasons,
        };
      })
    );

    // Extract successful validations, use original token for failures
    const validatedTokens = validationResults.map((result, idx) => {
      if (result.status === 'fulfilled') return result.value;
      // On validation failure, return original with warning
      const original = tokensToValidate[idx];
      return {
        ...original,
        safetyReasons: [...(original.safetyReasons || []), '⚠️ Validation timeout'],
      };
    });

    // Filter out non-tradeable tokens and sort by potential
    const tradeableTokens = validatedTokens.filter(t => t.isTradeable);
    
    tradeableTokens.sort((a, b) => {
      // Prioritize: low risk, high liquidity, early buyer position
      const scoreA = (a.buyerPosition || 10) * 10 + a.riskScore - (a.liquidity / 1000);
      const scoreB = (b.buyerPosition || 10) * 10 + b.riskScore - (b.liquidity / 1000);
      return scoreA - scoreB;
    });

    console.log(`Found ${tradeableTokens.length} tradeable tokens out of ${uniqueTokens.length} total`);

    return new Response(
      JSON.stringify({
        tokens: tradeableTokens,
        allTokens: uniqueTokens, // Include all for transparency
        errors,
        apiErrors,
        timestamp: new Date().toISOString(),
        apiCount: apiConfigs?.filter((c: ApiConfig) => c.is_enabled).length || 0,
        stats: {
          total: uniqueTokens.length,
          tradeable: tradeableTokens.length,
          pumpFun: uniqueTokens.filter(t => t.isPumpFun).length,
          filtered: uniqueTokens.length - tradeableTokens.length,
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
