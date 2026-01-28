import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateAutoExitInput } from "../_shared/validation.ts";
import { fetchJupiterQuoteWithRetry } from "../_shared/jupiter-retry.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ApiConfig {
  id: string;
  api_type: string;
  api_name: string;
  base_url: string;
  api_key_encrypted: string | null;
  is_enabled: boolean;
}

interface Position {
  id: string;
  user_id: string;
  token_address: string;
  token_symbol: string;
  token_name: string;
  chain: string;
  entry_price: number;
  entry_price_usd: number | null; // USD entry price for accurate P&L
  current_price: number;
  amount: number;
  entry_value: number;
  current_value: number;
  profit_loss_percent: number;
  profit_loss_value: number;
  profit_take_percent: number;
  stop_loss_percent: number;
  status: 'open' | 'closed' | 'pending';
  created_at: string; // Added for external sale detection timing
}

// Helper: generate short address format instead of "Unknown"
function shortAddress(address: string | null | undefined): string {
  if (!address || address.length < 10) return 'TOKEN';
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

function safeTokenSymbol(symbol: string | null | undefined, address: string): string {
  if (symbol && symbol.trim() && !/^(unknown|\?\?\?|n\/a|token)$/i.test(symbol.trim())) {
    return symbol.trim();
  }
  return shortAddress(address);
}

interface PriceData {
  address: string;
  price: number;
  priceChange24h?: number;
}

interface ExitResult {
  positionId: string;
  symbol: string;
  action: 'hold' | 'take_profit' | 'stop_loss';
  currentPrice: number;
  profitLossPercent: number;
  executed: boolean;
  txId?: string;
  error?: string;
}

// SPL Token Mint layout: decimals at offset 44
function base64ToBytes(base64: string): Uint8Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function rpcRequest(rpcUrl: string, method: string, params: unknown[]): Promise<any> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`RPC error ${res.status}: ${text.slice(0, 160)}`);
  }
  const data = await res.json();
  if (data?.error) throw new Error(data.error?.message || 'RPC returned an error');
  return data?.result;
}

async function getMintDecimals(rpcUrl: string, mint: string): Promise<number> {
  if (mint === 'So11111111111111111111111111111111111111112') return 9;
  const result = await rpcRequest(rpcUrl, 'getAccountInfo', [mint, { encoding: 'base64' }]);
  const value = result?.value;
  const data = value?.data;
  const base64 = Array.isArray(data) ? data[0] : null;
  if (!base64 || typeof base64 !== 'string') throw new Error('Mint account not found');
  const bytes = base64ToBytes(base64);
  if (bytes.length < 45) throw new Error(`Invalid mint data length: ${bytes.length}`);
  const decimals = bytes[44];
  return typeof decimals === 'number' ? decimals : 6;
}

function toBaseUnits(amountDecimal: number, decimals: number): string {
  const fixed = Math.max(0, amountDecimal).toFixed(decimals);
  const [whole, frac = ''] = fixed.split('.');
  return BigInt(`${whole}${frac.padEnd(decimals, '0')}`).toString();
}

// Get API key from environment (secure) with fallback to database (legacy)
function getApiKey(apiType: string, dbApiKey: string | null): string | null {
  // Priority 1: Environment variable (Supabase Secrets - secure)
  const envKey = Deno.env.get(`${apiType.toUpperCase()}_API_KEY`);
  if (envKey) {
    console.log(`Using secure environment variable for ${apiType}`);
    return envKey;
  }
  
  // Priority 2: Database fallback (legacy - less secure)
  if (dbApiKey) {
    console.log(`Warning: Using database-stored API key for ${apiType} - migrate to Supabase Secrets`);
    return dbApiKey;
  }
  
  return null;
}

// Check on-chain token balance to detect externally sold positions
// CRITICAL: This must NOT trigger for newly created positions (< 60 seconds old)
// to avoid false "sold_externally" closures due to RPC propagation delays
async function checkOnChainBalance(
  tokenAddress: string,
  walletAddress: string,
  positionCreatedAt: string
): Promise<{ hasBalance: boolean; balance: number; skipped: boolean }> {
  try {
    // CRITICAL GUARD: Skip balance check for positions created in the last 60 seconds
    // RPC nodes may not have propagated the token account yet after a swap
    const positionAge = Date.now() - new Date(positionCreatedAt).getTime();
    const MIN_AGE_FOR_EXTERNAL_SALE_CHECK_MS = 60000; // 60 seconds
    
    if (positionAge < MIN_AGE_FOR_EXTERNAL_SALE_CHECK_MS) {
      console.log(`[AutoExit] Skipping external sale check for ${shortAddress(tokenAddress)} - position only ${Math.round(positionAge / 1000)}s old`);
      return { hasBalance: true, balance: 0, skipped: true };
    }
    
    // Use Helius or Solana RPC to check token balance
    const rpcUrl = Deno.env.get('HELIUS_RPC_URL') || Deno.env.get('SOLANA_RPC_URL') || 'https://api.mainnet-beta.solana.com';
    
    // Get token accounts for this mint
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTokenAccountsByOwner',
        params: [
          walletAddress,
          { mint: tokenAddress },
          { encoding: 'jsonParsed' }
        ],
      }),
    });
    
    if (!response.ok) {
      console.log(`[AutoExit] RPC balance check failed: ${response.status}`);
      return { hasBalance: true, balance: 0, skipped: false }; // Assume has balance if check fails
    }
    
    const data = await response.json();
    const accounts = data?.result?.value || [];
    
    if (accounts.length === 0) {
      console.log(`[AutoExit] No token account found for ${shortAddress(tokenAddress)} - likely sold externally`);
      return { hasBalance: false, balance: 0, skipped: false };
    }
    
    // Sum up balance from all token accounts for this mint
    let totalBalance = 0;
    for (const account of accounts) {
      const amount = account?.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0;
      totalBalance += amount;
    }
    
    console.log(`[AutoExit] On-chain balance for ${shortAddress(tokenAddress)}: ${totalBalance}`);
    return { hasBalance: totalBalance > 0, balance: totalBalance, skipped: false };
  } catch (error) {
    console.error('[AutoExit] Balance check error:', error);
    return { hasBalance: true, balance: 0, skipped: false }; // Assume has balance on error
  }
}

// Fetch current price from external APIs
async function fetchCurrentPrice(
  tokenAddress: string,
  chain: string,
  apiConfigs: ApiConfig[]
): Promise<number | null> {
  // Try DexScreener first (no API key required, most reliable)
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const data = await response.json();
      // Get best pair by liquidity
      const pairs = data.pairs?.filter((p: any) => p.chainId === 'solana') || [];
      if (pairs.length > 0) {
        const bestPair = pairs.reduce((best: any, curr: any) => 
          (curr?.liquidity?.usd || 0) > (best?.liquidity?.usd || 0) ? curr : best
        );
        if (bestPair?.priceUsd) {
          return parseFloat(bestPair.priceUsd);
        }
      }
    }
  } catch (e) {
    console.error('DexScreener price fetch error:', e);
  }

  // Try GeckoTerminal
  const geckoConfig = apiConfigs.find(c => c.api_type === 'geckoterminal' && c.is_enabled);
  if (geckoConfig) {
    try {
      const networkId = chain === 'solana' ? 'solana' : chain === 'bsc' ? 'bsc' : 'eth';
      const response = await fetch(`${geckoConfig.base_url}/api/v2/networks/${networkId}/tokens/${tokenAddress}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        const data = await response.json();
        if (data.data?.attributes?.price_usd) {
          return parseFloat(data.data.attributes.price_usd);
        }
      }
    } catch (e) {
      console.error('GeckoTerminal price fetch error:', e);
    }
  }

  // Try Birdeye (Solana) - uses secure API key retrieval
  const birdeyeConfig = apiConfigs.find(c => c.api_type === 'birdeye' && c.is_enabled);
  if (birdeyeConfig && chain === 'solana') {
    const apiKey = getApiKey('birdeye', birdeyeConfig.api_key_encrypted);
    if (apiKey) {
      try {
        const response = await fetch(`${birdeyeConfig.base_url}/defi/price?address=${tokenAddress}`, {
          headers: { 'X-API-KEY': apiKey },
          signal: AbortSignal.timeout(5000),
        });
        if (response.ok) {
          const data = await response.json();
          if (data.data?.value) {
            return parseFloat(data.data.value);
          }
        }
      } catch (e) {
        console.error('Birdeye price fetch error:', e);
      }
    }
  }

  return null;
}

// Execute sell via Jupiter (real on-chain swap)
async function executeJupiterSell(
  position: Position,
  reason: 'take_profit' | 'stop_loss',
  rpcUrl: string,
  tokenAmountUiOverride?: number
): Promise<{ success: boolean; txId?: string; quote?: any; error?: string }> {
  try {
    console.log(`[AutoExit] Executing SELL via Jupiter for ${position.token_symbol} - Reason: ${reason}`);
    
    const SOL_MINT = 'So11111111111111111111111111111111111111112';
    
    const tokenAmountUi = (typeof tokenAmountUiOverride === 'number' && tokenAmountUiOverride > 0)
      ? tokenAmountUiOverride
      : position.amount;

    // Convert token amount to base units using real mint decimals
    let decimals = 6;
    try {
      decimals = await getMintDecimals(rpcUrl, position.token_address);
    } catch {
      decimals = 6;
    }

    const amountInSmallestUnit = toBaseUnits(tokenAmountUi, decimals);
    
    // Use retry-enabled Jupiter quote fetcher for rate limit resilience
    console.log(`[AutoExit] Fetching Jupiter quote with retry...`);
    const quoteResult = await fetchJupiterQuoteWithRetry({
      inputMint: position.token_address,
      outputMint: SOL_MINT,
      amount: amountInSmallestUnit,
      slippageBps: 1500,
    });
    
    if (quoteResult.ok === false) {
      console.error(`[AutoExit] Jupiter quote failed:`, quoteResult.kind, quoteResult.message);
      
      if (quoteResult.kind === 'NO_ROUTE') {
        return { success: false, error: 'No Jupiter route available - token may not be indexed or has no liquidity' };
      }
      if (quoteResult.kind === 'RATE_LIMITED') {
        return { success: false, error: 'Jupiter rate limited - will retry on next cycle' };
      }
      return { success: false, error: quoteResult.message || 'Jupiter quote failed' };
    }
    
    const quoteData = quoteResult.quote;
    console.log(`[AutoExit] Jupiter quote received - Output: ${quoteData.outAmount} lamports`);
    
    // Return quote data for building transaction
    // NOTE: Auto-exit cannot sign transactions - it needs to return quote info
    // The frontend must handle the actual transaction signing and broadcasting
    return {
      success: true,
      quote: quoteData,
      txId: `jupiter_quote_${Date.now()}`,
    };
  } catch (error) {
    console.error('[AutoExit] Jupiter sell error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Jupiter sell execution failed',
    };
  }
}

// Execute sell via external trade execution API (if configured)
async function executeSellViaApi(
  position: Position,
  reason: 'take_profit' | 'stop_loss',
  tradeExecutionConfig: ApiConfig
): Promise<{ success: boolean; txId?: string; error?: string }> {
  try {
    console.log(`[AutoExit] Executing SELL via API for ${position.token_symbol} - Reason: ${reason}`);
    
    const tradePayload = {
      tokenAddress: position.token_address,
      chain: position.chain,
      action: 'sell',
      amount: position.amount,
      slippage: 10, // Higher slippage for exit
      reason,
      positionId: position.id,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    const apiKey = getApiKey('trade_execution', tradeExecutionConfig.api_key_encrypted);
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(`${tradeExecutionConfig.base_url}/trade/execute`, {
      method: 'POST',
      headers,
      body: JSON.stringify(tradePayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `Trade API error: ${errorText}` };
    }

    const result = await response.json();
    return { 
      success: true, 
      txId: result.transactionId || result.txId || 'pending',
    };
  } catch (error) {
    console.error('[AutoExit] API sell error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Sell execution failed',
    };
  }
}

// Check if position should exit
// CRITICAL: Use entry_price_usd for USD-based price comparisons
// SANITY CHECK: Clamp P&L to reasonable bounds to prevent numeric overflow
function checkExitConditions(
  position: Position,
  currentPrice: number
): { shouldExit: boolean; reason: 'take_profit' | 'stop_loss' | null; profitLossPercent: number } {
  // CRITICAL: Validate input prices to prevent overflow
  if (!currentPrice || currentPrice <= 0 || !Number.isFinite(currentPrice)) {
    console.log(`[AutoExit] Invalid current price for ${position.token_symbol}: ${currentPrice}`);
    return { shouldExit: false, reason: null, profitLossPercent: 0 };
  }
  
  // Use USD entry price if available for accurate P&L
  // This ensures we compare USD to USD (currentPrice from DexScreener is in USD)
  const entryPriceForCalc = position.entry_price_usd ?? position.entry_price;
  
  // SANITY CHECK: Entry price must be valid
  if (!entryPriceForCalc || entryPriceForCalc <= 0 || !Number.isFinite(entryPriceForCalc)) {
    console.log(`[AutoExit] Invalid entry price for ${position.token_symbol}: entry_price_usd=${position.entry_price_usd}, entry_price=${position.entry_price}`);
    return { shouldExit: false, reason: null, profitLossPercent: 0 };
  }
  
  // Calculate raw P&L
  let profitLossPercent = ((currentPrice - entryPriceForCalc) / entryPriceForCalc) * 100;
  
  // SANITY CHECK: Clamp P&L to reasonable bounds (-100% to +10000%)
  // Anything beyond this indicates a data error (unit mismatch, stale prices, etc.)
  const MAX_REASONABLE_GAIN = 10000; // 100x = +10000%
  const MAX_REASONABLE_LOSS = -99.99; // Can't lose more than 100%
  
  if (profitLossPercent > MAX_REASONABLE_GAIN || profitLossPercent < MAX_REASONABLE_LOSS) {
    console.log(`[AutoExit] Suspicious P&L for ${position.token_symbol}: ${profitLossPercent.toFixed(2)}% - entry: $${entryPriceForCalc}, current: $${currentPrice}`);
    // If P&L is suspiciously high/low, clamp it but allow exit if threshold met
    profitLossPercent = Math.max(MAX_REASONABLE_LOSS, Math.min(MAX_REASONABLE_GAIN, profitLossPercent));
  }
  
  // Check take profit
  if (profitLossPercent >= position.profit_take_percent) {
    return { shouldExit: true, reason: 'take_profit', profitLossPercent };
  }
  
  // Check stop loss (negative threshold)
  if (profitLossPercent <= -position.stop_loss_percent) {
    return { shouldExit: true, reason: 'stop_loss', profitLossPercent };
  }
  
  return { shouldExit: false, reason: null, profitLossPercent };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Auth client for JWT verification (works with signing-keys on custom domains)
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.slice('Bearer '.length);
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    const userId = claimsData?.claims?.sub;

    if (claimsError || !userId) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Service client for DB access
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const user = { id: userId };

    // Parse and validate request body
    const rawBody = await req.json().catch(() => ({}));
    const validationResult = validateAutoExitInput(rawBody);
    
    if (!validationResult.success) {
      return new Response(JSON.stringify({ error: validationResult.error }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const { positionIds, executeExits, walletAddress } = validationResult.data!;

    // Fetch API configurations
    const { data: apiConfigs } = await supabase
      .from('api_configurations')
      .select('*')
      .eq('is_enabled', true);

    // If no API configs, we can still check exits but won't get updated prices
    const hasApiConfigs = apiConfigs && apiConfigs.length > 0;
    console.log(`API configs found: ${hasApiConfigs ? apiConfigs.length : 0}`);

    // Fetch user's open positions
    let positionsQuery = supabase
      .from('positions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'open');
    
    if (positionIds && positionIds.length > 0) {
      positionsQuery = positionsQuery.in('id', positionIds);
    }

    const { data: positions, error: positionsError } = await positionsQuery;

    if (positionsError) {
      throw new Error('Failed to fetch positions');
    }

    if (!positions || positions.length === 0) {
      return new Response(
        JSON.stringify({ 
          results: [], 
          message: 'No open positions to monitor',
          timestamp: new Date().toISOString(),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tradeExecutionConfig = apiConfigs?.find((c: ApiConfig) => c.api_type === 'trade_execution');
    const results: ExitResult[] = [];
    const positionUpdates: { id: string; updates: Partial<Position> }[] = [];

    // Process each position
    for (const position of positions as Position[]) {
      // Check on-chain balance if wallet address provided (detects externally sold tokens)
      // CRITICAL: Pass created_at to prevent false positives on new positions
      let onChainBalanceUi: number | null = null;
      let onChainBalanceSkipped = false;
      if (walletAddress) {
        const { hasBalance, balance, skipped } = await checkOnChainBalance(
          position.token_address, 
          walletAddress,
          position.created_at || new Date().toISOString()
        );

        onChainBalanceUi = balance;
        onChainBalanceSkipped = skipped;
        
        // Only mark as sold externally if NOT skipped (position old enough) AND balance is zero
        if (!skipped && (!hasBalance || balance < position.amount * 0.01)) {
          // Token was sold externally (Phantom wallet or elsewhere)
          console.log(`[AutoExit] Position ${position.token_symbol} sold externally - closing stale position`);
          
          await supabase
            .from('positions')
            .update({
              status: 'closed',
              exit_reason: 'sold_externally',
              exit_price: position.current_price || position.entry_price,
              exit_tx_id: null,
              closed_at: new Date().toISOString(),
              profit_loss_percent: position.profit_loss_percent,
              profit_loss_value: position.profit_loss_value,
            })
            .eq('id', position.id);
          
          // Log the external sale detection
          await supabase.from('system_logs').insert({
            user_id: user.id,
            event_type: 'position_sold_externally',
            event_category: 'trading',
            message: `Detected external sale: ${position.token_symbol} - position closed`,
            metadata: {
              position_id: position.id,
              token_symbol: position.token_symbol,
              on_chain_balance: balance,
              expected_balance: position.amount,
            },
            severity: 'info',
          });
          
          results.push({
            positionId: position.id,
            symbol: safeTokenSymbol(position.token_symbol, position.token_address),
            action: 'hold',
            currentPrice: position.current_price || position.entry_price,
            profitLossPercent: position.profit_loss_percent || 0,
            executed: true,
            error: 'Position closed - sold externally via wallet',
          });
          
          continue; // Skip normal processing for this position
        }
      }
      
      // Fetch current price (always try DexScreener first, no config needed)
      let currentPrice: number | null = await fetchCurrentPrice(position.token_address, position.chain, apiConfigs || []);
      
      // If can't fetch price, use last known price (don't simulate)
      if (currentPrice === null) {
        currentPrice = position.current_price || position.entry_price;
        console.log(`Using last known price for ${position.token_symbol}: ${currentPrice}`);
      }

      // Check exit conditions
      const { shouldExit, reason, profitLossPercent } = checkExitConditions(position, currentPrice);
      
      // Calculate P&L using entry_price_usd for accurate USD-based calculations
      const entryPriceForCalc = position.entry_price_usd ?? position.entry_price;
      const effectiveAmountForValuation = (!onChainBalanceSkipped && typeof onChainBalanceUi === 'number' && onChainBalanceUi > 0)
        ? onChainBalanceUi
        : position.amount;
      const entryValueForCalc = position.entry_value ?? (effectiveAmountForValuation * entryPriceForCalc);
      const currentValue = effectiveAmountForValuation * currentPrice;
      // Use entry_value for accurate P&L $ calculation
      const profitLossValue = entryValueForCalc * (profitLossPercent / 100);

      // Update position with current price data
      positionUpdates.push({
        id: position.id,
        updates: {
          current_price: currentPrice,
          current_value: currentValue,
          profit_loss_percent: profitLossPercent,
          profit_loss_value: profitLossValue,
        },
      });

      if (shouldExit && reason) {
        console.log(`Exit triggered for ${position.token_symbol}: ${reason} at ${profitLossPercent.toFixed(2)}%`);
        
        let executed = false;
        let txId: string | undefined;
        let error: string | undefined;

        if (executeExits) {
          // Try external API first, then fallback to Jupiter
          if (tradeExecutionConfig) {
            const sellResult = await executeSellViaApi(position, reason, tradeExecutionConfig);
            executed = sellResult.success;
            txId = sellResult.txId;
            error = sellResult.error;
          } else {
            // Use Jupiter for real sell execution
             const rpcUrl = Deno.env.get("SOLANA_RPC_URL") || "https://api.mainnet-beta.solana.com";
             const tokenAmountForExit = (!onChainBalanceSkipped && typeof onChainBalanceUi === 'number' && onChainBalanceUi > 0)
               ? onChainBalanceUi
               : position.amount;
             const jupiterResult = await executeJupiterSell(position, reason, rpcUrl, tokenAmountForExit);
            
            if (jupiterResult.success && jupiterResult.quote) {
              // Jupiter quote received - mark position with pending_exit and quote info
              // The frontend's useAutoExit hook must sign and broadcast
              executed = false;
              txId = jupiterResult.txId;
              error = 'PENDING_SIGNATURE: Jupiter quote ready, requires wallet signature';
              console.log(`[AutoExit] Jupiter quote ready for ${position.token_symbol} - requires frontend signature`);
            } else {
              // Jupiter failed - NO FORCE CLOSE
              // Keep position open with warning - user must manually handle illiquid tokens
              const noRoute = jupiterResult.error?.includes('No Jupiter route') || 
                              jupiterResult.error?.includes('No route available') ||
                              jupiterResult.error?.includes('404') ||
                              jupiterResult.error?.includes('Route not found');
              
              if (noRoute) {
                console.log(`[AutoExit] No Jupiter route for ${position.token_symbol} - ${reason} triggered but keeping position OPEN (illiquid)`);
                
                // Log the warning but DO NOT close the position
                await supabase.from('system_logs').insert({
                  user_id: user.id,
                  event_type: 'exit_blocked_no_route',
                  event_category: 'trading',
                  message: `Exit blocked (no route): ${position.token_symbol} - ${reason} triggered at ${profitLossPercent.toFixed(2)}% but no swap available`,
                  metadata: {
                    position_id: position.id,
                    token_symbol: position.token_symbol,
                    entry_price: position.entry_price,
                    current_price: currentPrice,
                    profit_loss_percent: profitLossPercent,
                    reason: `${reason} triggered but Jupiter has no route - position kept open, user must handle manually`,
                    original_error: jupiterResult.error,
                  },
                  severity: 'warning',
                });
              }
              
              executed = false;
              error = noRoute 
                ? `NO_ROUTE: ${reason} triggered but token has no liquidity - position kept open` 
                : (jupiterResult.error || 'Jupiter sell failed - waiting for route availability');
            }
          }

          if (executed) {
            // Update position to closed
            await supabase
              .from('positions')
              .update({
                status: 'closed',
                exit_reason: reason,
                exit_price: currentPrice,
                exit_tx_id: txId,
                closed_at: new Date().toISOString(),
                current_price: currentPrice,
                current_value: currentValue,
                profit_loss_percent: profitLossPercent,
                profit_loss_value: profitLossValue,
              })
              .eq('id', position.id);
            
            // Log the exit
            await supabase.from('system_logs').insert({
              user_id: user.id,
              event_type: reason === 'take_profit' ? 'take_profit_exit' : 'stop_loss_exit',
              event_category: 'trading',
              message: `Auto-exit ${reason}: ${position.token_symbol} at ${profitLossPercent.toFixed(2)}%`,
              metadata: {
                position_id: position.id,
                token_symbol: position.token_symbol,
                entry_price: position.entry_price,
                exit_price: currentPrice,
                profit_loss_percent: profitLossPercent,
                profit_loss_value: profitLossValue,
              },
              severity: reason === 'take_profit' ? 'info' : 'warning',
            });
          }
        }

        results.push({
          positionId: position.id,
          symbol: safeTokenSymbol(position.token_symbol, position.token_address),
          action: reason,
          currentPrice,
          profitLossPercent,
          executed,
          txId,
          error,
        });
      } else {
        results.push({
          positionId: position.id,
          symbol: safeTokenSymbol(position.token_symbol, position.token_address),
          action: 'hold',
          currentPrice,
          profitLossPercent,
          executed: false,
        });
      }
    }

    // Batch update positions with latest prices
    for (const { id, updates } of positionUpdates) {
      await supabase.from('positions').update(updates).eq('id', id);
    }

    const exitTriggered = results.filter(r => r.action !== 'hold');
    const executedCount = results.filter(r => r.executed).length;

    console.log(`Auto-exit: Checked ${positions.length} positions, ${exitTriggered.length} exits triggered, ${executedCount} executed`);

    return new Response(
      JSON.stringify({
        results,
        summary: {
          total: positions.length,
          holding: results.filter(r => r.action === 'hold').length,
          takeProfitTriggered: results.filter(r => r.action === 'take_profit').length,
          stopLossTriggered: results.filter(r => r.action === 'stop_loss').length,
          executed: executedCount,
        },
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('Auto-exit error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
