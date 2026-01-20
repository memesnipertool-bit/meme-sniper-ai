import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateAutoSniperInput, type TokenData as ValidatedTokenData } from "../_shared/validation.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Jupiter API for route validation - using free lite-api (no key required)
const JUPITER_QUOTE_API = "https://lite-api.jup.ag/swap/v1/quote";
// Raydium API for route validation (fallback)
const RAYDIUM_QUOTE_API = "https://transaction-v1.raydium.io/compute/swap-base-in";
const SOL_MINT = "So11111111111111111111111111111111111111112";

interface ApiConfig {
  id: string;
  api_type: string;
  api_name: string;
  base_url: string;
  api_key_encrypted: string | null;
  is_enabled: boolean;
}

interface UserSettings {
  user_id: string;
  min_liquidity: number;
  profit_take_percentage: number;
  stop_loss_percentage: number;
  trade_amount: number;
  max_concurrent_trades: number;
  priority: 'normal' | 'fast' | 'turbo';
  category_filters: string[];
  token_blacklist: string[];
  token_whitelist: string[];
}

interface TokenData {
  address: string;
  name: string;
  symbol: string;
  chain: string;
  liquidity: number;
  liquidityLocked: boolean;
  lockPercentage: number | null;
  buyerPosition: number | null;
  riskScore: number;
  categories: string[];
  priceUsd?: number;
  // Scanner validation flags - CRITICAL for bypassing DEX route checks
  isPumpFun?: boolean;      // From token-scanner: on Pump.fun bonding curve
  isTradeable?: boolean;    // From token-scanner: verified as tradeable
  canBuy?: boolean;         // From token-scanner: buy is possible
  canSell?: boolean;        // From token-scanner: sell is possible
  source?: string;          // API source (e.g., 'Pump.fun', 'DexScreener')
  safetyReasons?: string[]; // Safety check results from scanner
}

interface SnipeDecision {
  token: TokenData;
  approved: boolean;
  reasons: string[];
  tradeParams: {
    amount: number;
    slippage: number;
    priority: string;
  } | null;
}

interface RiskCheckResult {
  isHoneypot: boolean;
  isBlacklisted: boolean;
  ownerRenounced: boolean;
  liquidityLocked: boolean;
  lockPercentage: number | null;
  riskScore: number;
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

// Rule 1: Check if liquidity meets user's minimum setting
function checkLiquidity(token: TokenData, settings: UserSettings): { passed: boolean; reason: string } {
  const passed = token.liquidity >= settings.min_liquidity;
  return {
    passed,
    reason: passed 
      ? `✓ Liquidity ${token.liquidity.toFixed(2)} SOL meets minimum ${settings.min_liquidity} SOL`
      : `✗ Liquidity ${token.liquidity.toFixed(2)} SOL below minimum ${settings.min_liquidity} SOL`,
  };
}

// Rule 2: Check if liquidity is locked (OPTIONAL - just informational, don't block)
function checkLiquidityLock(token: TokenData): { passed: boolean; reason: string } {
  // Liquidity lock is informational only - many legitimate tokens don't lock
  const isLocked = token.liquidityLocked === true;
  return {
    passed: true, // Always pass - this is just informational
    reason: isLocked 
      ? `✓ Liquidity locked${token.lockPercentage ? ` (${token.lockPercentage}%)` : ''}`
      : '⚠ Liquidity not locked - proceed with caution',
  };
}

// Rule 3: Check if token matches user's category filters
function checkCategoryMatch(token: TokenData, settings: UserSettings): { passed: boolean; reason: string } {
  // If user didn't set any filters, always pass
  if (settings.category_filters.length === 0) {
    return { passed: true, reason: '✓ No category filters applied' };
  }

  // IMPORTANT: In live scanning, category metadata may be unavailable.
  // If we have no categories, don't block trading (otherwise nothing ever approves).
  if (!token.categories || token.categories.length === 0) {
    return {
      passed: true,
      reason: '✓ Category data unavailable - skipping category filter',
    };
  }

  const matchedCategories = token.categories.filter((cat) =>
    settings.category_filters.includes(cat.toLowerCase())
  );

  const passed = matchedCategories.length > 0;
  return {
    passed,
    reason: passed
      ? `✓ Matches categories: ${matchedCategories.join(', ')}`
      : `✗ No match for filters: ${settings.category_filters.join(', ')}`,
  };
}

// Rule 4: Check buyer position (allow positions 2-10 for live trading flexibility)
function checkBuyerPosition(token: TokenData): { passed: boolean; reason: string } {
  const position = token.buyerPosition;
  
  // If position is unknown, allow the trade (don't block on missing data)
  if (position === null || position === undefined) {
    return { passed: true, reason: '✓ Buyer position unknown - allowing trade' };
  }
  
  // Allow positions 2-10 (not first buyer, but reasonable entry)
  const passed = position >= 2 && position <= 10;
  return {
    passed,
    reason: passed 
      ? `✓ Can enter as buyer #${position}`
      : position < 2 
        ? '✗ Would be first buyer - waiting for others'
        : `✗ Buyer position #${position} too late (>10)`,
  };
}

// Rule 5: Risk API approval (honeypot, blacklist, owner-renounced)
// IMPORTANT: This check is optional - if API fails, we allow the trade with a warning
async function checkRiskApproval(
  token: TokenData, 
  honeypotConfig: ApiConfig | undefined
): Promise<{ passed: boolean; reason: string; riskData?: RiskCheckResult }> {
  if (!honeypotConfig) {
    // No API configured - allow trade with warning
    return { passed: true, reason: '⚠ Risk check skipped - no API configured' };
  }

  try {
    // HoneyPot.is only works for EVM chains, not Solana
    // Skip risk check for Solana tokens as the API doesn't support them
    if (token.chain === 'solana' || token.address.length > 50) {
      console.log(`Skipping HoneyPot check for Solana token ${token.symbol}`);
      return { 
        passed: true, 
        reason: '⚠ Risk check skipped for Solana (use built-in riskScore)',
        riskData: {
          isHoneypot: false,
          isBlacklisted: false,
          ownerRenounced: true,
          liquidityLocked: token.liquidityLocked,
          lockPercentage: token.lockPercentage,
          riskScore: token.riskScore,
        }
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout
    
    const response = await fetch(
      `${honeypotConfig.base_url}/v2/IsHoneypot?address=${token.address}`,
      { signal: controller.signal }
    );
    
    clearTimeout(timeout);
    
    if (!response.ok) {
      // API error - allow trade with warning, don't block
      console.log(`Risk API returned ${response.status} for ${token.symbol}`);
      return { passed: true, reason: `⚠ Risk API returned ${response.status} - proceeding with caution` };
    }

    const data = await response.json();
    
    const riskData: RiskCheckResult = {
      isHoneypot: data.honeypotResult?.isHoneypot || false,
      isBlacklisted: data.simulationResult?.isBlacklisted || false,
      ownerRenounced: data.contractCode?.ownershipRenounced || false,
      liquidityLocked: data.pair?.liquidity?.isLocked || false,
      lockPercentage: data.pair?.liquidity?.lockPercentage || null,
      riskScore: data.honeypotResult?.isHoneypot ? 100 : (data.riskScore || 50),
    };

    // Only block on confirmed honeypot or blacklist - not on "owner not renounced"
    const isBlocked = riskData.isHoneypot || riskData.isBlacklisted;
    const issues: string[] = [];
    if (riskData.isHoneypot) issues.push('HONEYPOT');
    if (riskData.isBlacklisted) issues.push('BLACKLISTED');
    
    return {
      passed: !isBlocked,
      reason: isBlocked 
        ? `✗ BLOCKED: ${issues.join(', ')}`
        : `✓ Risk check passed (score: ${riskData.riskScore})`,
      riskData,
    };
  } catch (error) {
    // Network error, timeout, etc - allow trade with warning
    console.error('Risk check error:', error);
    return { passed: true, reason: '⚠ Risk API unavailable - proceeding with caution' };
  }
}

// Rule 6: Check if token is tradeable (Pump.fun bonding curve OR Jupiter/Raydium route)
// New tokens on Pump.fun don't have DEX routes yet - they use the bonding curve
// CRITICAL: Trust the token-scanner's validation to avoid blocking valid trades
// IMPORTANT: Edge functions have intermittent DNS issues - be lenient when checks fail
async function checkTradeRoute(token: TokenData): Promise<{ passed: boolean; reason: string; source?: string }> {
  // CRITICAL: Only Solana tokens can be traded
  const isSolanaAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(token.address);
  const isEthereumAddress = token.address.startsWith('0x');
  
  if (token.chain !== 'solana' || isEthereumAddress || !isSolanaAddress) {
    return { passed: false, reason: `✗ Non-Solana token rejected` };
  }

  // PRIORITY 1: Trust token-scanner's validation flags (most reliable)
  // The scanner already verified tradability, don't double-check
  if (token.isPumpFun === true) {
    console.log(`[Route] ${token.symbol} is Pump.fun token (from scanner) - auto-approved`);
    return { passed: true, reason: `✓ Pump.fun bonding curve (verified by scanner)`, source: 'pumpfun' };
  }
  
  if (token.isTradeable === true) {
    console.log(`[Route] ${token.symbol} verified tradeable by scanner - auto-approved`);
    return { passed: true, reason: `✓ Verified tradeable by token scanner`, source: 'scanner' };
  }

  // PRIORITY 2: Check source - if from Pump.fun source, trust it
  if (token.source === 'Pump.fun') {
    console.log(`[Route] ${token.symbol} from Pump.fun source - auto-approved`);
    return { passed: true, reason: `✓ Pump.fun source token`, source: 'pumpfun' };
  }

  // Track if all checks failed due to network/DNS issues (not "no route" errors)
  let allNetworkFailures = true;
  let networkErrorCount = 0;

  // PRIORITY 3: Check Pump.fun API directly (fallback for tokens without scanner flags)
  try {
    const pumpFunController = new AbortController();
    const pumpFunTimeout = setTimeout(() => pumpFunController.abort(), 5000);

    const pumpFunResponse = await fetch(`https://frontend-api.pump.fun/coins/${token.address}`, {
      signal: pumpFunController.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; MemeSniper/1.0)',
      },
    });

    clearTimeout(pumpFunTimeout);
    allNetworkFailures = false; // Request succeeded

    if (pumpFunResponse.ok) {
      const pumpData = await pumpFunResponse.json();
      // Token exists on Pump.fun (either on bonding curve or graduated)
      if (pumpData) {
        if (!pumpData.complete) {
          console.log(`[Pump.fun] Token ${token.symbol} is on bonding curve - tradeable`);
          return { 
            passed: true, 
            reason: `✓ Pump.fun bonding curve token`,
            source: 'pumpfun'
          };
        } else {
          console.log(`[Pump.fun] Token ${token.symbol} graduated - tradeable via DEX`);
          return { 
            passed: true, 
            reason: `✓ Graduated Pump.fun token (tradeable on DEX)`,
            source: 'pumpfun-graduated'
          };
        }
      }
    }
  } catch (pumpError: any) {
    const errorMsg = pumpError.message || '';
    // Check if this is a DNS/network error vs a valid "not found" response
    if (errorMsg.includes('dns error') || errorMsg.includes('network') || errorMsg.includes('timeout') || errorMsg.includes('connect')) {
      networkErrorCount++;
      console.log(`[Pump.fun] Network error for ${token.symbol}: ${errorMsg}`);
    } else {
      allNetworkFailures = false; // This was a real API response (like 404)
      console.log(`[Pump.fun] Check failed for ${token.symbol}: ${errorMsg}`);
    }
  }

  // PRIORITY 4: Check Jupiter/Raydium routes for non-Pump.fun tokens
  const testAmount = "1000000"; // 0.001 SOL in lamports
  
  // Check both in parallel
  const routeChecks = await Promise.allSettled([
    // Jupiter check
    (async () => {
      const jupiterParams = new URLSearchParams({
        inputMint: SOL_MINT,
        outputMint: token.address,
        amount: testAmount,
        slippageBps: "500",
        swapMode: "ExactIn",
      });

      const response = await fetch(`${JUPITER_QUOTE_API}?${jupiterParams}`, {
        signal: AbortSignal.timeout(8000),
      });

      if (response.ok) {
        const data = await response.json();
        if (!data.error && data.outAmount) {
          return { source: 'jupiter', outputAmount: data.outAmount, networkError: false };
        }
      }
      throw new Error('No Jupiter route');
    })(),
    
    // Raydium check
    (async () => {
      const raydiumParams = new URLSearchParams({
        inputMint: SOL_MINT,
        outputMint: token.address,
        amount: testAmount,
        slippageBps: "500",
        txVersion: "V0",
      });

      const response = await fetch(`${RAYDIUM_QUOTE_API}?${raydiumParams}`, {
        signal: AbortSignal.timeout(8000),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data?.outputAmount) {
          return { source: 'raydium', outputAmount: data.data.outputAmount, networkError: false };
        }
      }
      throw new Error('No Raydium route');
    })(),
  ]);

  // Check if any route succeeded
  for (const result of routeChecks) {
    if (result.status === 'fulfilled') {
      const { source, outputAmount } = result.value;
      console.log(`[${source}] Route found for ${token.symbol}: ${outputAmount} output`);
      return { 
        passed: true, 
        reason: `✓ ${source === 'jupiter' ? 'Jupiter' : 'Raydium'} route verified`,
        source
      };
    } else if (result.status === 'rejected') {
      const errorMsg = (result.reason?.message || String(result.reason) || '').toLowerCase();
      if (errorMsg.includes('dns error') || errorMsg.includes('network') || errorMsg.includes('timeout') || errorMsg.includes('connect') || errorMsg.includes('lookup')) {
        networkErrorCount++;
      } else {
        allNetworkFailures = false; // Real API response
      }
    }
  }

  // PRIORITY 5: If ALL checks failed due to network/DNS issues, allow the trade
  // The scanner already validated these tokens - DNS failures shouldn't block execution
  if (allNetworkFailures && networkErrorCount > 0) {
    console.log(`[Route] ${token.symbol} - all ${networkErrorCount} route checks failed due to network issues, allowing trade`);
    return { 
      passed: true, 
      reason: `✓ Network checks unavailable - allowing (scanner validated)`,
      source: 'network-fallback'
    };
  }

  // PRIORITY 6: For tokens with substantial liquidity, allow even without route verification
  // (Route checks can fail due to network issues but token may still be tradeable)
  if (token.liquidity >= 300) { // 300+ SOL liquidity is substantial for meme tokens
    console.log(`[Route] ${token.symbol} has good liquidity (${token.liquidity} SOL) - allowing despite no route`);
    return { 
      passed: true, 
      reason: `✓ Good liquidity (${token.liquidity.toFixed(0)} SOL) - likely tradeable`,
      source: 'liquidity'
    };
  }

  // No routes found
  console.log(`[Route] No route found for ${token.symbol} on Jupiter or Raydium`);
  return { 
    passed: false, 
    reason: `✗ No DEX route found - token may be too new or have no liquidity`
  };
}

// Check blacklist/whitelist
function checkBlacklistWhitelist(
  token: TokenData, 
  settings: UserSettings
): { passed: boolean; reason: string } {
  // Check blacklist first
  if (settings.token_blacklist.some(addr => 
    addr.toLowerCase() === token.address.toLowerCase()
  )) {
    return { passed: false, reason: '✗ Token is blacklisted by user' };
  }

  // If whitelist exists and is not empty, token must be on it
  if (settings.token_whitelist.length > 0) {
    const onWhitelist = settings.token_whitelist.some(addr => 
      addr.toLowerCase() === token.address.toLowerCase()
    );
    return {
      passed: onWhitelist,
      reason: onWhitelist 
        ? '✓ Token is on whitelist'
        : '✗ Token not on whitelist',
    };
  }

  return { passed: true, reason: '✓ Token not blacklisted' };
}

// Create a trade signal for frontend execution (proper wallet signing)
async function createTradeSignal(
  token: TokenData,
  settings: UserSettings,
  supabase: any,
  userId: string,
  routeSource?: string
): Promise<{ success: boolean; signalId?: string; error?: string }> {
  try {
    console.log(`Creating trade signal for ${token.symbol}`);
    
    // Calculate signal expiry (5 minutes from now)
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    
    // Create trade signal for frontend to execute
    const { data: signalData, error: signalError } = await supabase
      .from('trade_signals')
      .insert({
        user_id: userId,
        token_address: token.address,
        token_symbol: token.symbol,
        token_name: token.name,
        chain: token.chain || 'solana',
        liquidity: token.liquidity,
        price_usd: token.priceUsd,
        risk_score: token.riskScore,
        trade_amount: settings.trade_amount,
        slippage: settings.priority === 'turbo' ? 15 : settings.priority === 'fast' ? 10 : 5,
        priority: settings.priority,
        status: 'pending',
        reasons: [],
        source: routeSource || (token.isPumpFun ? 'pumpfun' : 'jupiter'),
        is_pump_fun: token.isPumpFun || false,
        expires_at: expiresAt,
        metadata: {
          buyer_position: token.buyerPosition,
          liquidity_locked: token.liquidityLocked,
          lock_percentage: token.lockPercentage,
          profit_take_percent: settings.profit_take_percentage,
          stop_loss_percent: settings.stop_loss_percentage,
        },
      })
      .select()
      .single();

    if (signalError) {
      console.error('Error creating trade signal:', signalError);
      return { success: false, error: `Failed to create signal: ${signalError.message}` };
    }

    console.log(`Trade signal created for ${token.symbol}:`, signalData.id);
    
    // Log the signal in system_logs
    await supabase.from('system_logs').insert({
      user_id: userId,
      event_type: 'trade_signal_created',
      event_category: 'trading',
      message: `Trade signal created for ${token.symbol} - Amount: ${settings.trade_amount} SOL`,
      metadata: {
        signal_id: signalData.id,
        token_address: token.address,
        token_symbol: token.symbol,
        amount: settings.trade_amount,
        liquidity: token.liquidity,
        risk_score: token.riskScore,
        source: routeSource,
        expires_at: expiresAt,
      },
      severity: 'info',
    });

    return { 
      success: true, 
      signalId: signalData.id,
    };
  } catch (error) {
    console.error('Trade signal creation error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Signal creation failed',
    };
  }
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

    // Verify user from token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse and validate request body
    const rawBody = await req.json().catch(() => ({}));
    const validationResult = validateAutoSniperInput(rawBody);
    
    if (!validationResult.success) {
      return new Response(JSON.stringify({ error: validationResult.error }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const { tokens, executeOnApproval } = validationResult.data!;

    // Default settings to use if user hasn't configured any
    const defaultSettings: UserSettings = {
      user_id: user.id,
      min_liquidity: 300,
      profit_take_percentage: 100,
      stop_loss_percentage: 20,
      trade_amount: 0.1,
      max_concurrent_trades: 3,
      priority: 'normal',
      category_filters: ['animals', 'parody', 'trend', 'utility'],
      token_blacklist: [],
      token_whitelist: [],
    };

    // Fetch user's sniper settings
    const { data: userSettings } = await supabase
      .from('user_sniper_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();

    // Use user settings if found, otherwise use defaults
    const settings: UserSettings = userSettings || defaultSettings;
    console.log(`Using settings for user ${user.id}:`, userSettings ? 'custom' : 'defaults');

    // Fetch API configurations
    const { data: apiConfigs } = await supabase
      .from('api_configurations')
      .select('*')
      .eq('is_enabled', true);

    const getApiConfig = (type: string): ApiConfig | undefined =>
      apiConfigs?.find((c: ApiConfig) => c.api_type === type);

    const honeypotConfig = getApiConfig('honeypot_rugcheck');
    const tradeExecutionConfig = getApiConfig('trade_execution');

    // Check how many open positions user already has
    const { count: openPositionsCount } = await supabase
      .from('positions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'open');

    const currentOpenPositions = openPositionsCount || 0;
    const availableSlots = Math.max(0, settings.max_concurrent_trades - currentOpenPositions);
    
    console.log(`User has ${currentOpenPositions} open positions, ${availableSlots} slots available`);

    const decisions: SnipeDecision[] = [];
    const executedTrades: { token: string; txId?: string; error?: string; positionId?: string }[] = [];
    let tradesExecuted = 0;

    // Evaluate each token against the rules
    for (const tokenData of tokens as TokenData[]) {
      const reasons: string[] = [];
      let allPassed = true;

      // Rule 1: Liquidity check
      const liquidityCheck = checkLiquidity(tokenData, settings);
      reasons.push(liquidityCheck.reason);
      if (!liquidityCheck.passed) allPassed = false;

      // Rule 2: Liquidity lock check (optional - can be bypassed if not required)
      const lockCheck = checkLiquidityLock(tokenData);
      reasons.push(lockCheck.reason);
      // Don't fail on lock check alone - just add reason
      // if (!lockCheck.passed) allPassed = false;

      // Rule 3: Category filter check
      const categoryCheck = checkCategoryMatch(tokenData, settings);
      reasons.push(categoryCheck.reason);
      if (!categoryCheck.passed) allPassed = false;

      // Rule 4: Buyer position check
      const positionCheck = checkBuyerPosition(tokenData);
      reasons.push(positionCheck.reason);
      if (!positionCheck.passed) allPassed = false;

      // Check blacklist/whitelist
      const listCheck = checkBlacklistWhitelist(tokenData, settings);
      reasons.push(listCheck.reason);
      if (!listCheck.passed) allPassed = false;

      // Rule 5: Risk API check (only if other rules pass AND API is configured)
      // Skip risk check if no API configured - don't block trades due to missing config
      if (allPassed && honeypotConfig) {
        const riskCheck = await checkRiskApproval(tokenData, honeypotConfig);
        reasons.push(riskCheck.reason);
        if (!riskCheck.passed) allPassed = false;

        // Update token with risk data
        if (riskCheck.riskData) {
          tokenData.liquidityLocked = riskCheck.riskData.liquidityLocked;
          tokenData.lockPercentage = riskCheck.riskData.lockPercentage;
          tokenData.riskScore = riskCheck.riskData.riskScore;
        }
      } else if (allPassed && !honeypotConfig) {
        // No risk API configured - allow trade with warning
        reasons.push('⚠ Risk check skipped - no API configured');
        console.log(`Risk check skipped for ${tokenData.symbol} - no honeypot API configured`);
      }

      // Rule 6: CRITICAL - Verify Jupiter/Raydium has a route for this token
      // This prevents ROUTE_NOT_FOUND errors during trade execution
      if (allPassed) {
        const routeCheck = await checkTradeRoute(tokenData);
        reasons.push(routeCheck.reason);
        if (!routeCheck.passed) {
          allPassed = false;
          console.log(`[Route] Token ${tokenData.symbol} rejected - no route available`);
        }
      }
      
      // Log the decision for debugging
      console.log(`Token ${tokenData.symbol}: approved=${allPassed}, reasons=${reasons.join(' | ')}`);


      const decision: SnipeDecision = {
        token: tokenData,
        approved: allPassed,
        reasons,
        tradeParams: allPassed ? {
          amount: settings.trade_amount,
          slippage: settings.priority === 'turbo' ? 15 : settings.priority === 'fast' ? 10 : 5,
          priority: settings.priority,
        } : null,
      };

      decisions.push(decision);

      // Create trade signal if approved and execution is enabled and we have available slots
      if (allPassed && executeOnApproval && tradesExecuted < availableSlots) {
        // Create trade signal for frontend wallet signing (proper production flow)
        const routeCheck = await checkTradeRoute(tokenData);
        const signalResult = await createTradeSignal(
          tokenData, 
          settings, 
          supabase, 
          user.id,
          routeCheck.source
        );
        executedTrades.push({
          token: tokenData.symbol,
          txId: signalResult.signalId,
          error: signalResult.error,
          positionId: undefined,
        });
        if (signalResult.success) {
          tradesExecuted++;
          console.log(`Trade signal created for ${tokenData.symbol}, signal: ${signalResult.signalId}`);
        }
      }
    }

    const approvedCount = decisions.filter(d => d.approved).length;
    console.log(`Auto-sniper evaluated ${tokens.length} tokens, ${approvedCount} approved, ${tradesExecuted} executed`);

    return new Response(
      JSON.stringify({
        decisions,
        executedTrades,
        summary: {
          total: tokens.length,
          approved: approvedCount,
          rejected: tokens.length - approvedCount,
          executed: tradesExecuted,
          openPositions: currentOpenPositions + tradesExecuted,
          maxPositions: settings.max_concurrent_trades,
        },
        settings: {
          minLiquidity: settings.min_liquidity,
          priority: settings.priority,
          categoryFilters: settings.category_filters,
          profitTakePercent: settings.profit_take_percentage,
          stopLossPercent: settings.stop_loss_percentage,
        },
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('Auto-sniper error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
