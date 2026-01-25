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
async function checkOnChainBalance(
  tokenAddress: string,
  walletAddress: string
): Promise<{ hasBalance: boolean; balance: number }> {
  try {
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
      return { hasBalance: true, balance: 0 }; // Assume has balance if check fails
    }
    
    const data = await response.json();
    const accounts = data?.result?.value || [];
    
    if (accounts.length === 0) {
      console.log(`[AutoExit] No token account found for ${shortAddress(tokenAddress)} - likely sold externally`);
      return { hasBalance: false, balance: 0 };
    }
    
    // Sum up balance from all token accounts for this mint
    let totalBalance = 0;
    for (const account of accounts) {
      const amount = account?.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0;
      totalBalance += amount;
    }
    
    console.log(`[AutoExit] On-chain balance for ${shortAddress(tokenAddress)}: ${totalBalance}`);
    return { hasBalance: totalBalance > 0, balance: totalBalance };
  } catch (error) {
    console.error('[AutoExit] Balance check error:', error);
    return { hasBalance: true, balance: 0 }; // Assume has balance on error
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
  rpcUrl: string
): Promise<{ success: boolean; txId?: string; quote?: any; error?: string }> {
  try {
    console.log(`[AutoExit] Executing SELL via Jupiter for ${position.token_symbol} - Reason: ${reason}`);
    
    const SOL_MINT = 'So11111111111111111111111111111111111111112';
    
    // Convert token amount to integer (assuming 9 decimals for most Solana tokens)
    const amountInSmallestUnit = Math.floor(position.amount * 1e9);
    
    // Use lite-api.jup.ag which is the recommended public endpoint
    // See: https://station.jup.ag/docs/apis/price-api
    const quoteUrl = `https://lite-api.jup.ag/v6/quote?inputMint=${position.token_address}&outputMint=${SOL_MINT}&amount=${amountInSmallestUnit}&slippageBps=1500`;
    
    console.log(`[AutoExit] Fetching Jupiter quote...`);
    const quoteResponse = await fetch(quoteUrl, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });
    
    if (!quoteResponse.ok) {
      const errorText = await quoteResponse.text();
      console.error(`[AutoExit] Jupiter quote failed:`, quoteResponse.status, errorText);
      
      // If 400/404 = token not indexed or no route
      if (quoteResponse.status === 400 || quoteResponse.status === 404) {
        return { success: false, error: 'No Jupiter route available - token may not be indexed or has no liquidity' };
      }
      return { success: false, error: `Jupiter quote failed: ${quoteResponse.status}` };
    }
    
    const quoteData = await quoteResponse.json();
    
    if (!quoteData || quoteData.error) {
      console.error(`[AutoExit] Jupiter quote error:`, quoteData?.error || 'No route');
      return { success: false, error: quoteData?.error || 'No route available for sell' };
    }
    
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
      if (walletAddress) {
        const { hasBalance, balance } = await checkOnChainBalance(position.token_address, walletAddress);
        
        if (!hasBalance || balance < position.amount * 0.01) {
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
          // Try external API first, then fallback to Jupiter
          if (tradeExecutionConfig) {
            const sellResult = await executeSellViaApi(position, reason, tradeExecutionConfig);
            executed = sellResult.success;
            txId = sellResult.txId;
            error = sellResult.error;
          } else {
            // Use Jupiter for real sell execution
            const rpcUrl = Deno.env.get("SOLANA_RPC_URL") || "https://api.mainnet-beta.solana.com";
            const jupiterResult = await executeJupiterSell(position, reason, rpcUrl);
            
            if (jupiterResult.success && jupiterResult.quote) {
              // Jupiter quote received - mark position with pending_exit and quote info
              // The frontend's useAutoExit hook must sign and broadcast
              executed = false;
              txId = jupiterResult.txId;
              error = 'PENDING_SIGNATURE: Jupiter quote ready, requires wallet signature';
              console.log(`[AutoExit] Jupiter quote ready for ${position.token_symbol} - requires frontend signature`);
            } else {
              // Jupiter failed - check if this is a "dead" position that should be force-closed
              // Lowered threshold to -80% to catch more dead tokens that can't be sold
              const isDeadToken = profitLossPercent <= -80;
              const noRoute = jupiterResult.error?.includes('No Jupiter route') || 
                              jupiterResult.error?.includes('No route available') ||
                              jupiterResult.error?.includes('404');
              
              if (isDeadToken && noRoute) {
                console.log(`[AutoExit] Force-closing dead position ${position.token_symbol} at ${profitLossPercent.toFixed(2)}%`);
                
                // Force close the position - mark as closed with no tx
                await supabase
                  .from('positions')
                  .update({
                    status: 'closed',
                    exit_reason: 'force_closed_dead_token',
                    exit_price: currentPrice,
                    exit_tx_id: null,
                    closed_at: new Date().toISOString(),
                    current_price: currentPrice,
                    current_value: currentValue,
                    profit_loss_percent: profitLossPercent,
                    profit_loss_value: profitLossValue,
                  })
                  .eq('id', position.id);
                
                // Log the force close
                await supabase.from('system_logs').insert({
                  user_id: user.id,
                  event_type: 'force_close_dead_token',
                  event_category: 'trading',
                  message: `Force-closed dead token: ${position.token_symbol} at ${profitLossPercent.toFixed(2)}%`,
                  metadata: {
                    position_id: position.id,
                    token_symbol: position.token_symbol,
                    entry_price: position.entry_price,
                    exit_price: currentPrice,
                    profit_loss_percent: profitLossPercent,
                    reason: 'No Jupiter route available - token likely rugged or dead',
                  },
                  severity: 'warning',
                });
                
                executed = true;
                txId = 'force_closed';
                error = undefined;
              } else {
                executed = false;
                error = jupiterResult.error || 'Jupiter sell failed';
              }
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
