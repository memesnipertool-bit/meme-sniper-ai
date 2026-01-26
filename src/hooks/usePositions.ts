import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { fetchDexScreenerTokenMetadata, fetchDexScreenerPrices, isPlaceholderTokenText, isLikelyRealSolanaMint } from '@/lib/dexscreener';
export interface Position {
  id: string;
  user_id: string;
  token_address: string;
  token_symbol: string | null;
  token_name: string | null;
  chain: string;
  entry_price: number;
  entry_price_usd: number | null; // USD entry price for accurate P&L
  current_price: number | null;
  amount: number;
  entry_value: number | null;
  current_value: number | null;
  profit_loss_percent: number;
  profit_loss_value: number | null;
  profit_take_percent: number;
  stop_loss_percent: number;
  pnl_percentage: number | null;
  status: 'open' | 'closed' | 'pending';
  exit_reason: string | null;
  exit_price: number | null;
  exit_tx_id: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

export interface ExitResult {
  positionId: string;
  symbol: string;
  action: 'hold' | 'take_profit' | 'stop_loss';
  currentPrice: number;
  profitLossPercent: number;
  executed: boolean;
  txId?: string;
  error?: string;
}

export interface AutoExitSummary {
  total: number;
  holding: number;
  takeProfitTriggered: number;
  stopLossTriggered: number;
  executed: number;
}

// Price update interval: 15 seconds for real-time feel
const PRICE_UPDATE_INTERVAL_MS = 15000;

export function usePositions() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  // Background refresh indicator (does NOT blank UI like `loading`)
  const [refreshing, setRefreshing] = useState(false);
  const [checkingExits, setCheckingExits] = useState(false);
  const [lastExitCheck, setLastExitCheck] = useState<string | null>(null);
  const [exitResults, setExitResults] = useState<ExitResult[]>([]);
  const [lastPriceUpdate, setLastPriceUpdate] = useState<string | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  
  // Track user ID to reset state when user changes
  const currentUserIdRef = useRef<string | null>(null);

  // Cache DexScreener metadata by token address to avoid repeated external calls
  const tokenMetaCacheRef = useRef(new Map<string, { name: string; symbol: string }>());

  // Keep a ref to the latest positions so our background polling callbacks can be stable
  // (prevents resubscribing realtime on every price tick, which can miss updates).
  const positionsRef = useRef<Position[]>([]);
  useEffect(() => {
    positionsRef.current = positions;
  }, [positions]);

  // Prevent UI flicker: only use `loading` for the very first fetch,
  // and avoid overwriting state if the server payload hasn't changed.
  const hasLoadedOnceRef = useRef(false);
  const lastServerSignatureRef = useRef<string>('');
  // Force next fetch to always update state (used after close/create operations)
  const forceNextFetchRef = useRef(false);
  // Flag to temporarily block realtime updates during optimistic operations
  const blockRealtimeUntilRef = useRef<number>(0);


  // Fetch positions (forceUpdate bypasses signature check for explicit refreshes)
  const fetchPositions = useCallback(async (forceUpdate: boolean = false) => {
    // CRITICAL: Don't fetch if no user is logged in
    if (!user) {
      setPositions([]);
      setLoading(false);
      return;
    }
    
    // Check if we should force this update
    const shouldForce = forceUpdate || forceNextFetchRef.current;
    forceNextFetchRef.current = false; // Reset the flag
    
    const isInitialLoad = !hasLoadedOnceRef.current;
    try {
      if (isInitialLoad) setLoading(true);
      else setRefreshing(true);

      // CRITICAL FIX: Explicitly filter by user_id to ensure data isolation
      // This provides defense-in-depth alongside RLS policies
      const { data, error } = await supabase
        .from('positions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const rawPositions = ((data as unknown as Position[]) || []).map((p) => ({ ...p }));

      // Only replace positions when the server data actually changed,
      // OR when explicitly forced (after closing/creating positions).
      const nextSig = rawPositions.map((p) => `${p.id}:${p.updated_at}:${p.status}`).join('|');
      if (shouldForce || nextSig !== lastServerSignatureRef.current) {
        lastServerSignatureRef.current = nextSig;
        setPositions(rawPositions);
      }

      hasLoadedOnceRef.current = true;

      // Enrich missing/placeholder token metadata (prevents the UI from showing UNKNOWN everywhere)
      const addressesToFetch = Array.from(
        new Set(
          rawPositions
            .filter((p) =>
              isPlaceholderTokenText(p.token_symbol) || isPlaceholderTokenText(p.token_name)
            )
            .map((p) => p.token_address)
            .filter((addr) => !tokenMetaCacheRef.current.has(addr))
        )
      );

      if (addressesToFetch.length > 0) {
        const metaMap = await fetchDexScreenerTokenMetadata(addressesToFetch);

        for (const [addr, meta] of metaMap.entries()) {
          tokenMetaCacheRef.current.set(addr, { name: meta.name, symbol: meta.symbol });
        }

        if (metaMap.size > 0) {
          setPositions((prev) =>
            prev.map((p) => {
              const meta = tokenMetaCacheRef.current.get(p.token_address);
              if (!meta) return p;
              return {
                ...p,
                token_symbol: isPlaceholderTokenText(p.token_symbol) ? meta.symbol : p.token_symbol,
                token_name: isPlaceholderTokenText(p.token_name) ? meta.name : p.token_name,
              };
            })
          );
        }
      }
    } catch (error: unknown) {
      const err = error as Error;
      toast({
        title: 'Error fetching positions',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast, user]);

  // Create a new position
  const createPosition = useCallback(async (
    tokenAddress: string,
    tokenSymbol: string,
    tokenName: string,
    chain: string,
    entryPrice: number,
    amount: number,
    profitTakePercent: number,
    stopLossPercent: number
  ): Promise<Position | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const entryValue = amount * entryPrice;

      const { data, error } = await supabase
        .from('positions')
        .insert({
          user_id: user.id,
          token_address: tokenAddress,
          token_symbol: tokenSymbol,
          token_name: tokenName,
          chain,
          entry_price: entryPrice,
          current_price: entryPrice,
          amount,
          entry_value: entryValue,
          current_value: entryValue,
          profit_take_percent: profitTakePercent,
          stop_loss_percent: stopLossPercent,
        })
        .select()
        .single();

      if (error) throw error;

      const newPosition = data as unknown as Position;
      setPositions(prev => [newPosition, ...prev]);
      
      // Log activity (fire and forget)
      supabase.from('user_activity_logs' as never).insert({
        user_id: user.id,
        activity_type: 'position_opened',
        activity_category: 'trading',
        description: `Opened position: ${tokenSymbol} with ${amount} tokens at $${entryPrice.toFixed(6)}`,
        metadata: {
          position_id: newPosition.id,
          token_address: tokenAddress,
          token_symbol: tokenSymbol,
          entry_price: entryPrice,
          amount,
          profit_take_percent: profitTakePercent,
          stop_loss_percent: stopLossPercent,
        },
      } as never).then(({ error: logError }) => {
        if (logError) console.error('Failed to log activity:', logError);
      });
      
      toast({
        title: 'Position Created',
        description: `Tracking ${tokenSymbol} with TP: ${profitTakePercent}% / SL: ${stopLossPercent}%`,
      });

      return newPosition;
    } catch (error: unknown) {
      const err = error as Error;
      toast({
        title: 'Error creating position',
        description: err.message,
        variant: 'destructive',
      });
      return null;
    }
  }, [toast]);

  // Check exit conditions for all open positions
  const checkExitConditions = useCallback(async (executeExits: boolean = false): Promise<{
    results: ExitResult[];
    summary: AutoExitSummary;
  } | null> => {
    try {
      setCheckingExits(true);
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const { data, error } = await supabase.functions.invoke('auto-exit', {
        body: { executeExits },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setExitResults(data.results || []);
      setLastExitCheck(data.timestamp);

      // Force refresh positions after check to ensure closed positions are removed
      forceNextFetchRef.current = true;
      await fetchPositions(true);

      const summary = data.summary as AutoExitSummary | undefined;
      
      // Guard against missing summary
      if (!summary) {
        console.log('Auto-exit returned no summary');
        return { results: data.results || [], summary: { total: 0, holding: 0, takeProfitTriggered: 0, stopLossTriggered: 0, executed: 0 } };
      }
      
      if ((summary.takeProfitTriggered || 0) > 0 || (summary.stopLossTriggered || 0) > 0) {
        toast({
          title: 'Exit Conditions Met',
          description: `Take Profit: ${summary.takeProfitTriggered || 0}, Stop Loss: ${summary.stopLossTriggered || 0}${executeExits ? `, Executed: ${summary.executed || 0}` : ''}`,
          variant: (summary.stopLossTriggered || 0) > 0 ? 'destructive' : 'default',
        });
      }

      return { results: data.results, summary };
    } catch (error: unknown) {
      const err = error as Error;
      toast({
        title: 'Error checking exit conditions',
        description: err.message,
        variant: 'destructive',
      });
      return null;
    } finally {
      setCheckingExits(false);
    }
  }, [toast, fetchPositions]);

  // Close a position manually
  const closePosition = useCallback(async (positionId: string, exitPrice: number): Promise<boolean> => {
    // IMPORTANT: do not rely on `positions` from the closure here.
    // Use the ref so we always act on the latest list (prevents "Position not found" / stale updates).
    const snapshot = positionsRef.current;
    const position = snapshot.find(p => p.id === positionId);

    if (!position) {
      toast({
        title: 'Position not found',
        description: 'This position is no longer active. Try refreshing.',
        variant: 'destructive',
      });
      forceNextFetchRef.current = true;
      fetchPositions(true);
      return false;
    }

    // Ensure we always persist a valid exit price
    const safeExitPrice = Number.isFinite(exitPrice) && exitPrice > 0
      ? exitPrice
      : (position.current_price ?? position.entry_price);

    // OPTIMISTIC UPDATE: immediately hide from UI
    const previousPositions = [...snapshot];

    try {
      // Block realtime updates for 2 seconds to prevent stale data from overwriting
      blockRealtimeUntilRef.current = Date.now() + 2000;

      setPositions(prev => prev.map(p =>
        p.id === positionId ? { ...p, status: 'closed' as const } : p
      ));

      const currentValue = position.amount * safeExitPrice;
      const entryValue = position.entry_value || (position.amount * position.entry_price);
      const entryPriceForCalc = position.entry_price_usd ?? position.entry_price;
      const profitLossPercent = ((safeExitPrice - entryPriceForCalc) / entryPriceForCalc) * 100;
      // Use entry_value for accurate P&L $ calculation
      const profitLossValue = entryValue * (profitLossPercent / 100);

      const { data: updatedRows, error } = await supabase
        .from('positions')
        .update({
          status: 'closed',
          exit_reason: 'manual',
          exit_price: safeExitPrice,
          current_price: safeExitPrice,
          current_value: currentValue,
          profit_loss_percent: profitLossPercent,
          profit_loss_value: profitLossValue,
          closed_at: new Date().toISOString(),
        })
        .eq('id', positionId)
        .select('id, updated_at, status');

      if (error) throw error;
      if (!updatedRows || updatedRows.length === 0) {
        throw new Error('Close failed: no rows updated');
      }

      const updatedAt = updatedRows[0]?.updated_at ?? new Date().toISOString();

      // Update signature cache so the next fetch can't re-introduce this as open
      lastServerSignatureRef.current = previousPositions
        .map(p => {
          if (p.id !== positionId) return `${p.id}:${p.updated_at}:${p.status}`;
          return `${p.id}:${updatedAt}:closed`;
        })
        .join('|');

      // Log activity (fire-and-forget)
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        supabase.from('user_activity_logs' as never).insert({
          user_id: user.id,
          activity_type: 'position_closed',
          activity_category: 'trading',
          description: `Closed position: ${position.token_symbol} with ${profitLossPercent >= 0 ? '+' : ''}${profitLossPercent.toFixed(2)}% P&L`,
          metadata: {
            position_id: positionId,
            token_symbol: position.token_symbol,
            entry_price: position.entry_price,
            exit_price: safeExitPrice,
            profit_loss_percent: profitLossPercent,
            profit_loss_value: profitLossValue,
            exit_reason: 'manual',
          },
        } as never).then(({ error: logError }) => {
          if (logError) console.error('Failed to log activity:', logError);
        });
      }

      // Small delay to let DB settle, then reconcile
      setTimeout(() => {
        forceNextFetchRef.current = true;
        fetchPositions(true);
      }, 500);

      toast({
        title: 'Position Closed',
        description: `${position.token_symbol} closed with ${profitLossPercent >= 0 ? '+' : ''}${profitLossPercent.toFixed(2)}%`,
      });

      return true;
    } catch (error: unknown) {
      // Rollback optimistic update on error
      setPositions(previousPositions);

      const err = error as Error;
      toast({
        title: 'Error closing position',
        description: err.message,
        variant: 'destructive',
      });
      return false;
    }
  }, [toast, fetchPositions]);

  // Fetch real-time prices for open positions and update UI state
  // CRITICAL: Use entry_price_usd for P&L calculations to ensure unit consistency
  // Uses deep comparison to only update positions whose prices have actually changed
  const updatePricesFromDexScreener = useCallback(async () => {
    const snapshot = positionsRef.current;
    const openPositions = snapshot.filter((p) => p.status === 'open' || p.status === 'pending');
    
    const openAddresses = openPositions.map((p) => p.token_address).filter((addr) => isLikelyRealSolanaMint(addr));

    if (openAddresses.length === 0) return;

    try {
      const priceMap = await fetchDexScreenerPrices(openAddresses);
      
      if (priceMap.size === 0) return;

      // Use functional update with deep comparison to prevent unnecessary re-renders
      setPositions((prev) => {
        let hasChanges = false;
        
        const updated = prev.map((p) => {
          if (p.status !== 'open' && p.status !== 'pending') return p;
          
          const priceData = priceMap.get(p.token_address);
          if (!priceData || priceData.priceUsd <= 0) return p;

          const currentPriceUsd = priceData.priceUsd;
          
          // DEEP COMPARISON: Only update if price changed by more than 0.01%
          const oldPrice = p.current_price ?? 0;
          const priceChangePercent = oldPrice > 0 
            ? Math.abs((currentPriceUsd - oldPrice) / oldPrice) * 100 
            : 100;
          
          if (priceChangePercent < 0.01) return p; // No meaningful change
          
          hasChanges = true;
          
          const currentValue = p.amount * currentPriceUsd;
          
          // CRITICAL: Use entry_price_usd for P&L if available, otherwise use entry_price
          // This ensures unit consistency (USD vs USD)
          const entryPriceForCalc = p.entry_price_usd ?? p.entry_price;
          
          // Use entry_value (actual SOL invested) for P&L dollar value calculation
          // This is more accurate than amount * entry_price for tiny token amounts
          const entryValueForCalc = p.entry_value ?? (p.amount * entryPriceForCalc);
          
          // If we didn't have entry_price_usd, try to backfill it from current price structure
          // This handles legacy positions that were stored with SOL entry prices
          const needsBackfill = p.entry_price_usd === null && p.entry_price < 0.0001;
          
          // P&L % is based on price change
          let profitLossPercent = entryPriceForCalc > 0 
            ? ((currentPriceUsd - entryPriceForCalc) / entryPriceForCalc) * 100 
            : 0;
          
          // SANITY CHECK: Clamp P&L to reasonable bounds (-100% to +10000%)
          // Prevents UI from showing absurd values due to data errors
          const MAX_REASONABLE_GAIN = 10000; // 100x = +10000%
          const MAX_REASONABLE_LOSS = -99.99;
          profitLossPercent = Math.max(MAX_REASONABLE_LOSS, Math.min(MAX_REASONABLE_GAIN, profitLossPercent));
          
          // P&L $ value uses entry_value (SOL invested) as baseline for accuracy
          // Formula: entryValue * (1 + profitLossPercent/100) - entryValue
          // Which simplifies to: entryValue * profitLossPercent/100
          const profitLossValue = entryValueForCalc * (profitLossPercent / 100);

          return {
            ...p,
            current_price: currentPriceUsd,
            current_value: currentValue,
            profit_loss_value: profitLossValue,
            profit_loss_percent: profitLossPercent,
            // Backfill entry_price_usd if we detected a unit mismatch
            // (entry was in SOL but current is in USD)
            entry_price_usd: needsBackfill ? null : (p.entry_price_usd ?? entryPriceForCalc),
          };
        });
        
        // Return same reference if no changes to prevent re-render
        return hasChanges ? updated : prev;
      });

      setLastPriceUpdate(new Date().toISOString());
    } catch (err) {
      // Silent failure - don't log to avoid console spam during background updates
    }
  }, []);

  // CRITICAL: Reset state when user changes to prevent cross-user data leakage
  useEffect(() => {
    const newUserId = user?.id ?? null;
    
    if (currentUserIdRef.current !== newUserId) {
      // User changed - reset all state
      setPositions([]);
      setExitResults([]);
      setLastExitCheck(null);
      setLastPriceUpdate(null);
      hasLoadedOnceRef.current = false;
      lastServerSignatureRef.current = '';
      forceNextFetchRef.current = true;
      tokenMetaCacheRef.current.clear();
      
      currentUserIdRef.current = newUserId;
    }
  }, [user]);

  // Subscribe to realtime updates (keep this effect stable so we don't miss events)
  useEffect(() => {
    if (!user) return;
    
    fetchPositions();

    // CRITICAL FIX: Add user_id filter to realtime subscription
    const channel = supabase
      .channel(`positions-changes-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'positions',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          // Skip realtime updates during optimistic update window
          // This prevents stale data from overwriting our immediate UI update
          if (Date.now() < blockRealtimeUntilRef.current) return;

          forceNextFetchRef.current = true;
          fetchPositions(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchPositions]);

  // Periodic price refresh (separate effect so it can't interfere with realtime subscriptions)
  useEffect(() => {
    const priceInterval = setInterval(() => {
      updatePricesFromDexScreener();
    }, PRICE_UPDATE_INTERVAL_MS);

    const initialPriceTimeout = setTimeout(() => {
      updatePricesFromDexScreener();
    }, 2000);

    return () => {
      clearInterval(priceInterval);
      clearTimeout(initialPriceTimeout);
    };
  }, [updatePricesFromDexScreener]);

  // CRITICAL: Include both 'open' and 'pending' statuses for active trades display
  // This ensures newly opened positions (pending) and active positions (open) show correctly
  const openPositions = positions.filter(p => p.status === 'open' || p.status === 'pending');
  const closedPositions = positions.filter(p => p.status === 'closed');
  const pendingPositions = positions.filter(p => p.status === 'pending');

  return {
    positions,
    openPositions,
    closedPositions,
    pendingPositions,
    loading,
    refreshing,
    checkingExits,
    lastExitCheck,
    exitResults,
    lastPriceUpdate,
    fetchPositions,
    createPosition,
    checkExitConditions,
    closePosition,
    updatePricesFromDexScreener,
  };
}