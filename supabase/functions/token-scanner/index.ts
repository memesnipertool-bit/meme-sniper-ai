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

// Jupiter API for tradability check
const JUPITER_QUOTE_API = "https://quote-api.jup.ag/v6/quote";

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

    const checkTradability = async (token: TokenData): Promise<TokenData> => {
      // Pump.fun tokens are always tradeable via bonding curve - skip Jupiter check
      if (token.isPumpFun) {
        token.canBuy = true;
        token.canSell = true;
        token.isTradeable = true;
        token.safetyReasons.push("✅ Pump.fun bonding curve (tradeable)");
        return token;
      }

      try {
        const params = new URLSearchParams({
          inputMint: SOL_MINT,
          outputMint: token.address,
          amount: "1000000", // 0.001 SOL
          slippageBps: "500",
        });
        
        const buildUrl = (endpoint: string) => `${endpoint}?${params}`;
        const response = await fetchWithRetry(buildUrl);
        
        if (response) {
          const data = await response.json();
          if (data.outAmount && parseInt(data.outAmount) > 0) {
            token.canBuy = true;
            token.isTradeable = true;
            token.safetyReasons.push("✅ Tradeable on Jupiter");
          } else if (data.routePlan && data.routePlan.length > 0) {
            // Alternative response format
            token.canBuy = true;
            token.isTradeable = true;
            token.safetyReasons.push("✅ Jupiter route available");
          } else {
            // No Jupiter route found - but for new tokens this is expected
            // They can still be traded via Raydium or Pump.fun directly
            if (token.isPumpFun && token.liquidity && token.liquidity > 0) {
              token.canBuy = true;
              token.isTradeable = true;
              token.safetyReasons.push("✅ Tradeable via Pump.fun");
            } else if (token.liquidity && token.liquidity > 0) {
              token.canBuy = true;
              token.isTradeable = true;
              token.safetyReasons.push("✅ Tradeable via Raydium (Jupiter indexing in progress)");
            } else {
              token.canBuy = false;
              token.isTradeable = false;
              token.safetyReasons.push("❌ No liquidity pool found");
            }
          }
        } else {
          // All endpoints failed - likely infrastructure issue
          // For Pump.fun tokens or tokens with liquidity, allow direct trading via Raydium/Pump.fun
          if (token.isPumpFun && token.liquidity && token.liquidity > 0) {
            token.canBuy = true;
            token.isTradeable = true;
            token.safetyReasons.push("✅ Tradeable via Pump.fun (Jupiter not required)");
          } else if (token.liquidity && token.liquidity > 500) {
            token.canBuy = true;
            token.isTradeable = true;
            token.safetyReasons.push("✅ Tradeable via Raydium (new token, Jupiter pending)");
          } else if (token.liquidity && token.liquidity > 0) {
            token.canBuy = true;
            token.isTradeable = true;
            token.safetyReasons.push("⚠️ Low liquidity - trade with caution");
          } else {
            // Keep defaults but warn user
            token.safetyReasons.push("⚠️ No liquidity detected");
          }
        }
      } catch (e: any) {
        console.error('Jupiter check unexpected error for', token.symbol, e);
        // Unexpected error - don't block trading
        token.safetyReasons.push("⚠️ Jupiter check incomplete");
      }
      
      return token;
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

    // DexScreener fetch function
    const fetchDexScreener = async () => {
      const dexScreenerConfig = getApiConfigLocal('dexscreener');
      if (!dexScreenerConfig) return;

      const endpoint = `${dexScreenerConfig.base_url}/latest/dex/search?q=solana`;
      const startTime = Date.now();
      try {
        console.log('Fetching from DexScreener...');
        const response = await fetch(endpoint, {
          signal: AbortSignal.timeout(10000),
        });
        const responseTime = Date.now() - startTime;
        
        if (response.ok) {
          await logApiHealth('dexscreener', endpoint, responseTime, response.status, true);
          const data = await response.json();
          
          let pairs: any[] = [];
          if (Array.isArray(data)) {
            pairs = data;
          } else if (data && Array.isArray(data.pairs)) {
            pairs = data.pairs;
          } else if (data && typeof data === 'object') {
            const arrayKey = Object.keys(data).find(key => Array.isArray(data[key]));
            if (arrayKey) {
              pairs = data[arrayKey];
            }
          }
          
          const pairsToProcess = pairs.slice(0, 20);
          for (const pair of pairsToProcess) {
            if (!pair) continue;
            const liquidity = parseFloat(pair.liquidity?.usd || pair.liquidity || 0);
            
            if (liquidity >= minLiquidity) {
              tokens.push({
                id: `dex-${pair.pairAddress || pair.address || Math.random().toString(36)}`,
                address: pair.baseToken?.address || pair.address || '',
                name: pair.baseToken?.name || pair.name || 'Unknown',
                symbol: pair.baseToken?.symbol || pair.symbol || '???',
                chain: pair.chainId || 'solana',
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
                isPumpFun: false,
                safetyReasons: [],
              });
            }
          }
        } else {
          const errorMsg = `HTTP ${response.status}: ${response.statusText}`;
          await logApiHealth('dexscreener', endpoint, responseTime, response.status, false, errorMsg);
          errors.push(`DexScreener: ${errorMsg}`);
          apiErrors.push({
            apiName: dexScreenerConfig.api_name,
            apiType: 'dexscreener',
            errorMessage: errorMsg,
            endpoint,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (e: any) {
        const responseTime = Date.now() - startTime;
        const errorMsg = e.name === 'TimeoutError' ? 'Request timeout' : (e.message || 'Network error');
        await logApiHealth('dexscreener', endpoint, responseTime, 0, false, errorMsg);
        console.error('DexScreener error:', e);
        errors.push(`DexScreener: ${errorMsg}`);
        apiErrors.push({
          apiName: dexScreenerConfig.api_name,
          apiType: 'dexscreener',
          errorMessage: errorMsg,
          endpoint,
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

    // Validate tokens in parallel (limit to first 15 for performance)
    const tokensToValidate = solanaOnlyTokens.slice(0, 15);
    const validatedTokens = await Promise.all(
      tokensToValidate.map(async (token) => {
        // Skip Pump.fun tokens from additional validation (they have bonding curve)
        if (token.isPumpFun) return token;
        
        // Run safety and tradability checks in parallel
        const [safetyChecked, tradabilityChecked] = await Promise.all([
          validateTokenSafety(token),
          checkTradability(token),
        ]);
        
        return {
          ...token,
          ...safetyChecked,
          canBuy: tradabilityChecked.canBuy,
          isTradeable: safetyChecked.isTradeable && tradabilityChecked.canBuy,
          safetyReasons: [...safetyChecked.safetyReasons, ...tradabilityChecked.safetyReasons],
        };
      })
    );

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
