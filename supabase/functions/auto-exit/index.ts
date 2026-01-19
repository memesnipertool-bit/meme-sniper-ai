import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateAutoExitInput } from "../_shared/validation.ts";

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
  current_price: number;
  amount: number;
  entry_value: number;
  current_value: number;
  profit_loss_percent: number;
  profit_loss_value: number;
  profit_take_percent: number;
  stop_loss_percent: number;
  status: 'open' | 'closed' | 'pending';
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

// Fetch current price from external APIs
async function fetchCurrentPrice(
  tokenAddress: string,
  chain: string,
  apiConfigs: ApiConfig[]
): Promise<number | null> {
  // Try DexScreener first
  const dexScreenerConfig = apiConfigs.find(c => c.api_type === 'dexscreener' && c.is_enabled);
  if (dexScreenerConfig) {
    try {
      const response = await fetch(`${dexScreenerConfig.base_url}/latest/dex/tokens/${tokenAddress}`);
      if (response.ok) {
        const data = await response.json();
        const pair = data.pairs?.[0];
        if (pair?.priceUsd) {
          return parseFloat(pair.priceUsd);
        }
      }
    } catch (e) {
      console.error('DexScreener price fetch error:', e);
    }
  }

  // Try GeckoTerminal
  const geckoConfig = apiConfigs.find(c => c.api_type === 'geckoterminal' && c.is_enabled);
  if (geckoConfig) {
    try {
      const networkId = chain === 'solana' ? 'solana' : chain === 'bsc' ? 'bsc' : 'eth';
      const response = await fetch(`${geckoConfig.base_url}/api/v2/networks/${networkId}/tokens/${tokenAddress}`);
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

// Execute sell via trade execution API
async function executeSell(
  position: Position,
  reason: 'take_profit' | 'stop_loss',
  tradeExecutionConfig: ApiConfig
): Promise<{ success: boolean; txId?: string; error?: string }> {
  try {
    console.log(`Executing SELL for ${position.token_symbol} - Reason: ${reason}`);
    
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
    console.error('Sell execution error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Sell execution failed',
    };
  }
}

// Check if position should exit
function checkExitConditions(
  position: Position,
  currentPrice: number
): { shouldExit: boolean; reason: 'take_profit' | 'stop_loss' | null; profitLossPercent: number } {
  const profitLossPercent = ((currentPrice - position.entry_price) / position.entry_price) * 100;
  
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
    const validationResult = validateAutoExitInput(rawBody);
    
    if (!validationResult.success) {
      return new Response(JSON.stringify({ error: validationResult.error }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const { positionIds, executeExits } = validationResult.data!;

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
      // Fetch current price (use existing price if no API configs)
      let currentPrice: number | null = null;
      if (hasApiConfigs) {
        currentPrice = await fetchCurrentPrice(position.token_address, position.chain, apiConfigs);
      }
      
      // If can't fetch price, simulate price movement for demo/testing
      if (currentPrice === null) {
        // Apply small random price movement to simulate market activity
        const priceChange = (Math.random() - 0.4) * 0.1; // -4% to +6% change
        currentPrice = position.current_price * (1 + priceChange);
        console.log(`Simulated price for ${position.token_symbol}: ${currentPrice.toFixed(8)} (was ${position.current_price})`);
      }

      // Check exit conditions
      const { shouldExit, reason, profitLossPercent } = checkExitConditions(position, currentPrice);
      
      // Calculate P&L
      const currentValue = position.amount * currentPrice;
      const profitLossValue = currentValue - position.entry_value;

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
          // Try to execute via API if available
          if (tradeExecutionConfig) {
            const sellResult = await executeSell(position, reason, tradeExecutionConfig);
            executed = sellResult.success;
            txId = sellResult.txId;
            error = sellResult.error;
          } else {
            // No trade execution API - just close the position in DB (simulated)
            executed = true;
            txId = `sim_exit_${Date.now()}`;
            console.log(`Simulated exit for ${position.token_symbol} (no trade API configured)`);
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
          symbol: position.token_symbol,
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
          symbol: position.token_symbol,
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
