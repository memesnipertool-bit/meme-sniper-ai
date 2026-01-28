import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useWallet } from '@/hooks/useWallet';
import { addBotLog } from '@/components/scanner/BotActivityLog';
import { fetchJupiterQuote } from '@/lib/jupiterQuote';

export interface WaitingPosition {
  id: string;
  token_address: string;
  token_symbol: string;
  token_name: string;
  amount: number;
  entry_price: number;
  current_price: number;
  profit_loss_percent: number | null;
  liquidity_last_checked_at: string | null;
  liquidity_check_count: number;
  waiting_for_liquidity_since: string | null;
  status: string;
}

interface RouteCheckResult {
  hasJupiterRoute: boolean;
  hasRaydiumRoute: boolean;
  quote?: any;
  source?: 'jupiter' | 'raydium';
}

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const RAYDIUM_QUOTE_API = 'https://transaction-v1.raydium.io/compute/swap-base-in';

export function useLiquidityRetryWorker() {
  const [waitingPositions, setWaitingPositions] = useState<WaitingPosition[]>([]);
  const [checking, setChecking] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();
  const { wallet, signAndSendTransaction, refreshBalance } = useWallet();

  // Fetch positions waiting for liquidity
  const fetchWaitingPositions = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from('positions')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'waiting_for_liquidity')
        .order('waiting_for_liquidity_since', { ascending: true });

      if (error) {
        console.error('[LiquidityRetry] Fetch error:', error);
        return [];
      }

      setWaitingPositions(data || []);
      return data || [];
    } catch (err) {
      console.error('[LiquidityRetry] Error:', err);
      return [];
    }
  }, []);

  // Check if Jupiter has a route for the token
  const checkJupiterRoute = async (tokenAddress: string, amount: string): Promise<{ hasRoute: boolean; quote?: any }> => {
    try {
      const quoteResult = await fetchJupiterQuote({
        inputMint: tokenAddress,
        outputMint: SOL_MINT,
        amount,
        slippageBps: 1500,
        timeoutMs: 10000,
      });

      if (!quoteResult.ok) {
        return { hasRoute: false };
      }

      return { hasRoute: true, quote: quoteResult.quote };
    } catch {
      return { hasRoute: false };
    }
  };

  // Check if Raydium has a route for the token
  const checkRaydiumRoute = async (tokenAddress: string, amount: string): Promise<{ hasRoute: boolean; quote?: any }> => {
    try {
      const params = new URLSearchParams({
        inputMint: tokenAddress,
        outputMint: SOL_MINT,
        amount,
        slippageBps: '1500',
        txVersion: 'V0',
      });

      const response = await fetch(`${RAYDIUM_QUOTE_API}?${params}`, {
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        return { hasRoute: false };
      }

      const data = await response.json();
      if (!data.success) {
        return { hasRoute: false };
      }

      return { hasRoute: true, quote: data };
    } catch {
      return { hasRoute: false };
    }
  };

  // Check routes for a position (Jupiter first, then Raydium)
  const checkRoutes = async (position: WaitingPosition): Promise<RouteCheckResult> => {
    // Get on-chain balance and decimals
    let decimals = 6;
    let balanceUi = position.amount;
    
    try {
      const { data } = await supabase.functions.invoke('token-metadata', {
        body: { mint: position.token_address, owner: wallet.address },
      });
      if (data?.decimals) decimals = data.decimals;
      if (data?.balanceUi && data.balanceUi > 0) balanceUi = data.balanceUi;
    } catch {
      // Use defaults
    }

    // Convert to base units
    const amountInBaseUnits = Math.floor(balanceUi * Math.pow(10, decimals)).toString();

    // Check Jupiter first
    const jupiterResult = await checkJupiterRoute(position.token_address, amountInBaseUnits);
    if (jupiterResult.hasRoute) {
      return {
        hasJupiterRoute: true,
        hasRaydiumRoute: false,
        quote: jupiterResult.quote,
        source: 'jupiter',
      };
    }

    // Fallback to Raydium
    const raydiumResult = await checkRaydiumRoute(position.token_address, amountInBaseUnits);
    if (raydiumResult.hasRoute) {
      return {
        hasJupiterRoute: false,
        hasRaydiumRoute: true,
        quote: raydiumResult.quote,
        source: 'raydium',
      };
    }

    return {
      hasJupiterRoute: false,
      hasRaydiumRoute: false,
    };
  };

  // Execute swap via Jupiter
  const executeJupiterSwap = async (quote: any): Promise<{ success: boolean; signature?: string; error?: string }> => {
    if (!wallet.address) {
      return { success: false, error: 'Wallet not connected' };
    }

    try {
      const swapRes = await fetch('https://lite-api.jup.ag/swap/v1/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteResponse: quote,
          userPublicKey: wallet.address,
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
          dynamicSlippage: true,
          priorityLevelWithMaxLamports: { maxLamports: 5000000, priorityLevel: 'high' },
        }),
      });

      if (!swapRes.ok) {
        return { success: false, error: 'Failed to build Jupiter swap' };
      }

      const swapData = await swapRes.json();
      if (!swapData.swapTransaction) {
        return { success: false, error: 'No swap transaction returned' };
      }

      // Decode and sign
      const txBytes = Uint8Array.from(atob(swapData.swapTransaction), c => c.charCodeAt(0));
      const { VersionedTransaction } = await import('@solana/web3.js');
      const transaction = VersionedTransaction.deserialize(txBytes);

      const result = await signAndSendTransaction(transaction);
      return result.success 
        ? { success: true, signature: result.signature }
        : { success: false, error: result.error };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  };

  // Execute swap via Raydium
  const executeRaydiumSwap = async (quoteResponse: any): Promise<{ success: boolean; signature?: string; error?: string }> => {
    if (!wallet.address) {
      return { success: false, error: 'Wallet not connected' };
    }

    try {
      const response = await fetch('https://transaction-v1.raydium.io/transaction/swap-base-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          swapResponse: quoteResponse,
          wallet: wallet.address,
          txVersion: 'V0',
          wrapSol: false,
          unwrapSol: true,
          computeUnitPriceMicroLamports: '500000',
        }),
      });

      if (!response.ok) {
        return { success: false, error: 'Failed to build Raydium swap' };
      }

      const swapData = await response.json();
      if (!swapData.success || !swapData.data?.transaction) {
        return { success: false, error: swapData.msg || 'Raydium swap failed' };
      }

      // Decode and sign
      const txBytes = Uint8Array.from(atob(swapData.data.transaction), c => c.charCodeAt(0));
      const { VersionedTransaction } = await import('@solana/web3.js');
      const transaction = VersionedTransaction.deserialize(txBytes);

      const result = await signAndSendTransaction(transaction);
      return result.success 
        ? { success: true, signature: result.signature }
        : { success: false, error: result.error };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  };

  // Check and execute a single waiting position
  const checkAndExecutePosition = useCallback(async (position: WaitingPosition): Promise<boolean> => {
    if (!wallet.isConnected || !wallet.address) {
      return false;
    }

    // CRITICAL: Detect if this is a wallet token (not a DB position)
    // Wallet tokens have synthetic IDs starting with "wallet-" which are NOT valid UUIDs
    const isWalletToken = typeof position.id === 'string' && position.id.startsWith('wallet-');

    addBotLog({
      level: 'info',
      category: 'exit',
      message: `🔄 Checking liquidity: ${position.token_symbol}`,
      tokenSymbol: position.token_symbol,
      details: isWalletToken ? 'Wallet token (no DB record)' : `Check #${(position.liquidity_check_count || 0) + 1}`,
    });

    const routeResult = await checkRoutes(position);

    // Only update DB for real positions (valid UUID IDs)
    // Wallet tokens have synthetic IDs like "wallet-<mint>" which would cause UUID parse errors
    if (!isWalletToken) {
      await supabase
        .from('positions')
        .update({
          liquidity_last_checked_at: new Date().toISOString(),
          liquidity_check_count: (position.liquidity_check_count || 0) + 1,
        })
        .eq('id', position.id);
    }

    if (!routeResult.hasJupiterRoute && !routeResult.hasRaydiumRoute) {
      addBotLog({
        level: 'warning',
        category: 'exit',
        message: `⏳ Still no route: ${position.token_symbol}`,
        tokenSymbol: position.token_symbol,
        details: `Checked ${(position.liquidity_check_count || 0) + 1} times. Will retry.`,
      });
      return false;
    }

    // Route available! Execute the swap
    addBotLog({
      level: 'success',
      category: 'exit',
      message: `✅ Route found: ${position.token_symbol} via ${routeResult.source}`,
      tokenSymbol: position.token_symbol,
    });

    toast({
      title: `🎯 Route Available: ${position.token_symbol}`,
      description: `Executing sell via ${routeResult.source}...`,
    });

    const swapResult = routeResult.source === 'jupiter'
      ? await executeJupiterSwap(routeResult.quote)
      : await executeRaydiumSwap(routeResult.quote);

    if (swapResult.success && swapResult.signature) {
      // CRITICAL: Only update DB for real positions (not wallet tokens)
      // Wallet tokens have synthetic IDs like "wallet-<mint>" which are not valid UUIDs
      if (!isWalletToken) {
        // Close the position in DB
        await supabase
          .from('positions')
          .update({
            status: 'closed',
            closed_at: new Date().toISOString(),
            exit_tx_id: swapResult.signature,
            exit_reason: 'liquidity_retry_success',
          })
          .eq('id', position.id);
      }

      // Log to trade_history (always - uses user.id not position.id)
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('trade_history').insert({
          user_id: user.id,
          token_address: position.token_address,
          token_symbol: position.token_symbol,
          token_name: position.token_name,
          trade_type: 'sell',
          amount: position.amount,
          price_sol: position.current_price,
          status: 'completed',
          tx_hash: swapResult.signature,
        });
      }

      addBotLog({
        level: 'success',
        category: 'exit',
        message: `✅ SELL FILLED: ${position.token_symbol}`,
        tokenSymbol: position.token_symbol,
        details: `Sold via ${routeResult.source} after waiting for liquidity.\nTX: ${swapResult.signature}`,
      });

      toast({
        title: `💰 Sold: ${position.token_symbol}`,
        description: `Position closed successfully via ${routeResult.source}`,
      });

      refreshBalance();
      return true;
    } else {
      addBotLog({
        level: 'error',
        category: 'exit',
        message: `❌ Swap failed: ${position.token_symbol}`,
        tokenSymbol: position.token_symbol,
        details: swapResult.error,
      });
      return false;
    }
  }, [wallet, signAndSendTransaction, refreshBalance, toast]);

  // Run the retry worker once with parallel processing
  const runRetryCheck = useCallback(async () => {
    if (checking) return;
    if (!wallet.isConnected) return;

    setChecking(true);

    try {
      const positions = await fetchWaitingPositions();
      
      if (positions.length === 0) {
        return;
      }

      console.log(`[LiquidityRetry] Checking ${positions.length} waiting positions in parallel`);

      // PARALLEL PROCESSING: Process up to 3 positions concurrently
      const CONCURRENCY_LIMIT = 3;
      const results: boolean[] = [];
      
      for (let i = 0; i < positions.length; i += CONCURRENCY_LIMIT) {
        const batch = positions.slice(i, i + CONCURRENCY_LIMIT);
        const batchResults = await Promise.all(
          batch.map(position => checkAndExecutePosition(position))
        );
        results.push(...batchResults);
        
        // Small delay between batches to avoid overwhelming APIs
        if (i + CONCURRENCY_LIMIT < positions.length) {
          await new Promise(r => setTimeout(r, 500));
        }
      }
      
      const successCount = results.filter(Boolean).length;
      if (successCount > 0) {
        console.log(`[LiquidityRetry] ${successCount}/${positions.length} positions sold successfully`);
      }

      // Refresh the list
      await fetchWaitingPositions();
    } finally {
      setChecking(false);
    }
  }, [checking, wallet.isConnected, fetchWaitingPositions, checkAndExecutePosition]);

  // Move a position to waiting for liquidity
  const moveToWaitingForLiquidity = useCallback(async (positionId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('positions')
        .update({
          status: 'waiting_for_liquidity',
          waiting_for_liquidity_since: new Date().toISOString(),
          liquidity_check_count: 0,
          liquidity_last_checked_at: null,
        })
        .eq('id', positionId);

      if (error) {
        console.error('[LiquidityRetry] Move error:', error);
        return false;
      }

      toast({
        title: '⏳ Moved to Waiting Pool',
        description: 'Position will be auto-sold when liquidity becomes available',
      });

      // Refresh the list
      await fetchWaitingPositions();
      return true;
    } catch (err) {
      console.error('[LiquidityRetry] Move error:', err);
      return false;
    }
  }, [toast, fetchWaitingPositions]);

  // Move position back to open (remove from waiting)
  const moveBackToOpen = useCallback(async (positionId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('positions')
        .update({
          status: 'open',
          waiting_for_liquidity_since: null,
          liquidity_check_count: 0,
          liquidity_last_checked_at: null,
        })
        .eq('id', positionId);

      if (error) {
        return false;
      }

      await fetchWaitingPositions();
      return true;
    } catch {
      return false;
    }
  }, [fetchWaitingPositions]);

  // Start the retry worker
  const startRetryWorker = useCallback((intervalMs: number = 30000) => {
    if (intervalRef.current) {
      return; // Already running
    }

    console.log(`[LiquidityRetry] Starting worker with ${intervalMs}ms interval`);

    // Run immediately
    runRetryCheck();

    // Then run on interval
    intervalRef.current = setInterval(() => {
      runRetryCheck();
    }, intervalMs);
  }, [runRetryCheck]);

  // Stop the retry worker
  const stopRetryWorker = useCallback(() => {
    if (intervalRef.current) {
      console.log('[LiquidityRetry] Stopping worker');
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // Fetch waiting positions on mount
  useEffect(() => {
    fetchWaitingPositions();
  }, [fetchWaitingPositions]);

  return {
    waitingPositions,
    checking,
    fetchWaitingPositions,
    runRetryCheck,
    moveToWaitingForLiquidity,
    moveBackToOpen,
    checkAndExecutePosition,
    startRetryWorker,
    stopRetryWorker,
    isRunning: !!intervalRef.current,
  };
}
