import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateRiskCheckInput } from "../_shared/validation.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RiskSettings {
  emergency_stop_active: boolean;
  circuit_breaker_enabled: boolean;
  circuit_breaker_loss_threshold: number;
  circuit_breaker_time_window_minutes: number;
  circuit_breaker_triggered_at: string | null;
  max_risk_score: number;
  require_ownership_renounced: boolean;
  require_liquidity_locked: boolean;
  max_tax_percent: number;
}

interface TokenRiskData {
  address: string;
  symbol?: string;
  chain?: string;
}

interface RiskCheckResult {
  token: TokenRiskData;
  passed: boolean;
  riskScore: number;
  checks: {
    honeypot: { passed: boolean; detected: boolean };
    blacklist: { passed: boolean; blacklisted: boolean };
    ownershipRenounced: { passed: boolean; renounced: boolean };
    liquidityLocked: { passed: boolean; locked: boolean; percentage: number | null };
    taxCheck: { passed: boolean; buyTax: number; sellTax: number };
  };
  rejectionReasons: string[];
  circuitBreakerTriggered: boolean;
  emergencyStopActive: boolean;
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

// Call Rugcheck/Honeypot API
async function callRugcheckApi(tokenAddress: string, baseUrl: string): Promise<any> {
  try {
    const response = await fetch(`${baseUrl}/v2/IsHoneypot?address=${tokenAddress}`);
    if (!response.ok) throw new Error('Rugcheck API failed');
    return await response.json();
  } catch (error) {
    console.error('Rugcheck API error:', error);
    return null;
  }
}

// Alternative: Call Solana-specific rugcheck
async function callSolanaRugcheck(tokenAddress: string): Promise<any> {
  try {
    const response = await fetch(`https://api.rugcheck.xyz/v1/tokens/${tokenAddress}/report`);
    if (!response.ok) throw new Error('Solana rugcheck failed');
    return await response.json();
  } catch (error) {
    console.error('Solana rugcheck error:', error);
    return null;
  }
}

// Check if circuit breaker should be triggered based on recent losses
async function checkCircuitBreaker(
  supabase: any,
  userId: string,
  settings: RiskSettings
): Promise<{ triggered: boolean; reason?: string }> {
  if (!settings.circuit_breaker_enabled) {
    return { triggered: false };
  }

  // Check if already triggered
  if (settings.circuit_breaker_triggered_at) {
    const triggeredTime = new Date(settings.circuit_breaker_triggered_at);
    const resetTime = new Date(triggeredTime.getTime() + settings.circuit_breaker_time_window_minutes * 60 * 1000);
    if (new Date() < resetTime) {
      return { triggered: true, reason: 'Circuit breaker still active from previous trigger' };
    }
  }

  // Calculate losses in time window
  const windowStart = new Date();
  windowStart.setMinutes(windowStart.getMinutes() - settings.circuit_breaker_time_window_minutes);

  const { data: recentTrades } = await supabase
    .from('positions')
    .select('profit_loss_percent, closed_at')
    .eq('user_id', userId)
    .eq('status', 'closed')
    .gte('closed_at', windowStart.toISOString());

  if (recentTrades && recentTrades.length > 0) {
    const totalLoss = recentTrades
      .filter((t: any) => t.profit_loss_percent < 0)
      .reduce((sum: number, t: any) => sum + Math.abs(t.profit_loss_percent), 0);

    if (totalLoss >= settings.circuit_breaker_loss_threshold) {
      // Trigger circuit breaker
      await supabase
        .from('risk_settings')
        .update({ circuit_breaker_triggered_at: new Date().toISOString() })
        .eq('user_id', userId);

      return { 
        triggered: true, 
        reason: `Circuit breaker triggered: ${totalLoss.toFixed(1)}% cumulative loss in ${settings.circuit_breaker_time_window_minutes} mins` 
      };
    }
  }

  return { triggered: false };
}

// Perform comprehensive risk check on a token
async function performRiskCheck(
  token: TokenRiskData,
  settings: RiskSettings,
  honeypotApiUrl: string | null
): Promise<Omit<RiskCheckResult, 'circuitBreakerTriggered' | 'emergencyStopActive'>> {
  const rejectionReasons: string[] = [];
  let riskScore = 0;

  // Initialize check results
  const checks = {
    honeypot: { passed: true, detected: false },
    blacklist: { passed: true, blacklisted: false },
    ownershipRenounced: { passed: true, renounced: true },
    liquidityLocked: { passed: true, locked: true, percentage: null as number | null },
    taxCheck: { passed: true, buyTax: 0, sellTax: 0 },
  };

  // Try to get data from APIs
  let apiData: any = null;
  
  if (honeypotApiUrl) {
    apiData = await callRugcheckApi(token.address, honeypotApiUrl);
  }
  
  // Fallback to Solana rugcheck for Solana tokens
  if (!apiData && (!token.chain || token.chain === 'solana')) {
    apiData = await callSolanaRugcheck(token.address);
  }

  if (apiData) {
    // Honeypot check
    const isHoneypot = apiData.honeypotResult?.isHoneypot || apiData.is_honeypot || false;
    checks.honeypot.detected = isHoneypot;
    checks.honeypot.passed = !isHoneypot;
    if (isHoneypot) {
      rejectionReasons.push('HONEYPOT DETECTED - Token cannot be sold');
      riskScore += 100;
    }

    // Blacklist check
    const isBlacklisted = apiData.simulationResult?.isBlacklisted || 
                          apiData.is_blacklisted || 
                          apiData.risks?.some((r: any) => r.name === 'Blacklisted') || 
                          false;
    checks.blacklist.blacklisted = isBlacklisted;
    checks.blacklist.passed = !isBlacklisted;
    if (isBlacklisted) {
      rejectionReasons.push('Token is BLACKLISTED');
      riskScore += 50;
    }

    // Ownership renounced check
    const ownerRenounced = apiData.contractCode?.ownershipRenounced || 
                           apiData.ownership_renounced || 
                           apiData.mint_authority === null ||
                           false;
    checks.ownershipRenounced.renounced = ownerRenounced;
    checks.ownershipRenounced.passed = !settings.require_ownership_renounced || ownerRenounced;
    if (settings.require_ownership_renounced && !ownerRenounced) {
      rejectionReasons.push('Owner NOT RENOUNCED - Rug pull risk');
      riskScore += 30;
    }

    // Liquidity lock check
    const liquidityLocked = apiData.pair?.liquidity?.isLocked || 
                            apiData.liquidity_locked || 
                            false;
    const lockPercentage = apiData.pair?.liquidity?.lockPercentage || 
                           apiData.lock_percentage || 
                           null;
    checks.liquidityLocked.locked = liquidityLocked;
    checks.liquidityLocked.percentage = lockPercentage;
    checks.liquidityLocked.passed = !settings.require_liquidity_locked || liquidityLocked;
    if (settings.require_liquidity_locked && !liquidityLocked) {
      rejectionReasons.push('Liquidity NOT LOCKED - High rug risk');
      riskScore += 25;
    }

    // Tax check
    const buyTax = apiData.simulationResult?.buyTax || apiData.buy_tax || 0;
    const sellTax = apiData.simulationResult?.sellTax || apiData.sell_tax || 0;
    checks.taxCheck.buyTax = buyTax;
    checks.taxCheck.sellTax = sellTax;
    const maxTax = Math.max(buyTax, sellTax);
    checks.taxCheck.passed = maxTax <= settings.max_tax_percent;
    if (maxTax > settings.max_tax_percent) {
      rejectionReasons.push(`HIGH TAX DETECTED - Buy: ${buyTax}%, Sell: ${sellTax}%`);
      riskScore += 20;
    }

    // Get risk score from API if available
    if (apiData.riskScore !== undefined) {
      riskScore = Math.max(riskScore, apiData.riskScore);
    } else if (apiData.score !== undefined) {
      // Rugcheck.xyz uses inverted scoring (higher = better)
      riskScore = Math.max(riskScore, 100 - apiData.score);
    }
  } else {
    // No API data available - conservative approach
    riskScore = 75;
    rejectionReasons.push('Unable to verify token - Risk APIs unavailable');
    checks.honeypot.passed = false;
  }

  // Check against max risk score setting
  const passed = riskScore <= settings.max_risk_score && rejectionReasons.length === 0;
  if (riskScore > settings.max_risk_score && !rejectionReasons.includes('Risk score exceeds threshold')) {
    rejectionReasons.push(`Risk score ${riskScore} exceeds maximum ${settings.max_risk_score}`);
  }

  return {
    token,
    passed,
    riskScore: Math.min(riskScore, 100),
    checks,
    rejectionReasons,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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
    const validationResult = validateRiskCheckInput(rawBody);
    
    if (!validationResult.success) {
      return new Response(JSON.stringify({ error: validationResult.error }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const { action, tokens, updates, active, limit } = validationResult.data!;

    // Fetch user's risk settings
    let { data: riskSettings, error: settingsError } = await supabase
      .from('risk_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();

    // Create default settings if not exist
    if (settingsError || !riskSettings) {
      const { data: newSettings } = await supabase
        .from('risk_settings')
        .insert({ user_id: user.id })
        .select()
        .single();
      riskSettings = newSettings;
    }

    const settings = riskSettings as RiskSettings;

    // Handle different actions
    if (action === 'get_settings') {
      return new Response(JSON.stringify({ settings }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'update_settings') {
      const { data: updatedSettings, error: updateError } = await supabase
        .from('risk_settings')
        .update(updates || {})
        .eq('user_id', user.id)
        .select()
        .single();

      if (updateError) throw updateError;

      return new Response(JSON.stringify({ settings: updatedSettings }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'emergency_stop') {
      const { data: updatedSettings } = await supabase
        .from('risk_settings')
        .update({ emergency_stop_active: active })
        .eq('user_id', user.id)
        .select()
        .single();

      console.log(`Emergency stop ${active ? 'ACTIVATED' : 'DEACTIVATED'} for user ${user.id}`);

      return new Response(JSON.stringify({ 
        success: true, 
        emergency_stop_active: active,
        message: active ? 'EMERGENCY STOP ACTIVATED - All trading halted' : 'Emergency stop deactivated'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'reset_circuit_breaker') {
      await supabase
        .from('risk_settings')
        .update({ circuit_breaker_triggered_at: null })
        .eq('user_id', user.id);

      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Circuit breaker reset' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'check_tokens' && tokens && Array.isArray(tokens)) {
      // Check emergency stop
      if (settings.emergency_stop_active) {
        return new Response(JSON.stringify({
          canTrade: false,
          reason: 'EMERGENCY STOP ACTIVE - All trading halted',
          results: [],
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check circuit breaker
      const circuitBreakerStatus = await checkCircuitBreaker(supabase, user.id, settings);
      if (circuitBreakerStatus.triggered) {
        return new Response(JSON.stringify({
          canTrade: false,
          reason: circuitBreakerStatus.reason,
          circuitBreakerTriggered: true,
          results: [],
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Fetch honeypot API config
      const { data: apiConfigs } = await supabase
        .from('api_configurations')
        .select('*')
        .eq('api_type', 'honeypot_rugcheck')
        .eq('is_enabled', true)
        .limit(1);

      const honeypotApiUrl = apiConfigs?.[0]?.base_url || null;

      // Check each token
      const results: RiskCheckResult[] = [];
      for (const tokenData of tokens) {
        const checkResult = await performRiskCheck(tokenData, settings, honeypotApiUrl);
        
        // Log the check
        await supabase.from('risk_check_logs').insert({
          user_id: user.id,
          token_address: tokenData.address,
          token_symbol: tokenData.symbol || null,
          chain: tokenData.chain || 'solana',
          is_honeypot: checkResult.checks.honeypot.detected,
          is_blacklisted: checkResult.checks.blacklist.blacklisted,
          owner_renounced: checkResult.checks.ownershipRenounced.renounced,
          liquidity_locked: checkResult.checks.liquidityLocked.locked,
          lock_percentage: checkResult.checks.liquidityLocked.percentage,
          buy_tax: checkResult.checks.taxCheck.buyTax,
          sell_tax: checkResult.checks.taxCheck.sellTax,
          risk_score: checkResult.riskScore,
          passed_checks: checkResult.passed,
          rejection_reasons: checkResult.rejectionReasons,
        });

        results.push({
          ...checkResult,
          circuitBreakerTriggered: false,
          emergencyStopActive: false,
        });
      }

      const allPassed = results.every(r => r.passed);
      
      return new Response(JSON.stringify({
        canTrade: allPassed,
        reason: allPassed ? 'All tokens passed risk checks' : 'One or more tokens failed risk checks',
        results,
        settings: {
          maxRiskScore: settings.max_risk_score,
          requireOwnershipRenounced: settings.require_ownership_renounced,
          requireLiquidityLocked: settings.require_liquidity_locked,
          maxTaxPercent: settings.max_tax_percent,
        },
        timestamp: new Date().toISOString(),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'get_logs') {
      const queryLimit = limit ?? 50;
      const { data: logs } = await supabase
        .from('risk_check_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('checked_at', { ascending: false })
        .limit(queryLimit);

      return new Response(JSON.stringify({ logs: logs || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('Risk check error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
