/**
 * Token State Manager
 * 
 * Provides persistent, database-backed state tracking for token processing.
 * Ensures deterministic, restart-safe behavior - tokens are never traded twice.
 * 
 * States:
 * - NEW: Token just discovered, ready for evaluation
 * - PENDING: Waiting for liquidity/route, will retry within time window
 * - TRADED: Trade executed successfully, permanently locked
 * - REJECTED: Permanently disqualified (honeypot, timeout, etc.)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type TokenState = 'NEW' | 'PENDING' | 'TRADED' | 'REJECTED';

export interface TokenStateRecord {
  id: string;
  user_id: string;
  token_address: string;
  token_symbol: string | null;
  token_name: string | null;
  state: TokenState;
  discovered_at: string;
  source: string | null;
  liquidity_at_discovery: number | null;
  risk_score_at_discovery: number | null;
  buyer_position_at_discovery: number | null;
  pending_since: string | null;
  pending_reason: string | null;
  retry_count: number;
  max_retries: number;
  retry_expires_at: string | null;
  traded_at: string | null;
  trade_tx_hash: string | null;
  position_id: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface DiscoveredToken {
  address: string;
  symbol: string;
  name: string;
  source?: string;
  liquidity?: number;
  riskScore?: number;
  buyerPosition?: number | null;
}

// Default retry window: 5 minutes for PENDING tokens
const DEFAULT_RETRY_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_MAX_RETRIES = 5;

export function useTokenStateManager() {
  const [states, setStates] = useState<Map<string, TokenStateRecord>>(new Map());
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  
  // In-memory cache for fast lookups (synced with DB)
  const statesCacheRef = useRef<Map<string, TokenState>>(new Map());
  const pendingOpsRef = useRef<Set<string>>(new Set());

  /**
   * Load all token states from database on mount
   */
  const loadStates = useCallback(async () => {
    try {
      setLoading(true);
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user?.id) {
        setInitialized(true);
        return;
      }

      const { data, error } = await supabase
        .from('token_processing_states')
        .select('*')
        .eq('user_id', session.session.user.id);

      if (error) {
        console.error('[TokenStateManager] Failed to load states:', error);
        return;
      }

      const statesMap = new Map<string, TokenStateRecord>();
      const cacheMap = new Map<string, TokenState>();
      
      for (const record of data || []) {
        const addr = record.token_address.toLowerCase();
        statesMap.set(addr, record as TokenStateRecord);
        cacheMap.set(addr, record.state as TokenState);
      }

      setStates(statesMap);
      statesCacheRef.current = cacheMap;
      setInitialized(true);
      
      console.log(`[TokenStateManager] Loaded ${statesMap.size} token states`);
    } catch (err) {
      console.error('[TokenStateManager] Error loading states:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load states on mount
  useEffect(() => {
    loadStates();
  }, [loadStates]);

  /**
   * Get the current state of a token (from cache for speed)
   */
  const getTokenState = useCallback((tokenAddress: string): TokenState | null => {
    return statesCacheRef.current.get(tokenAddress.toLowerCase()) || null;
  }, []);

  /**
   * Check if token can be processed (not TRADED or REJECTED)
   */
  const canProcessToken = useCallback((tokenAddress: string): boolean => {
    const state = statesCacheRef.current.get(tokenAddress.toLowerCase());
    if (!state) return true; // New token
    return state !== 'TRADED' && state !== 'REJECTED';
  }, []);

  /**
   * Check if token is eligible for trade (NEW state only, or PENDING with valid retry)
   */
  const canTradeToken = useCallback((tokenAddress: string): boolean => {
    const addr = tokenAddress.toLowerCase();
    const state = statesCacheRef.current.get(addr);
    
    if (!state) return true; // New token - can trade
    if (state === 'TRADED' || state === 'REJECTED') return false;
    
    if (state === 'PENDING') {
      // Check if retry window has expired
      const record = states.get(addr);
      if (record?.retry_expires_at) {
        const expiry = new Date(record.retry_expires_at).getTime();
        if (Date.now() > expiry) {
          return false; // Expired - should be rejected
        }
      }
      // Check retry count
      if (record && record.retry_count >= record.max_retries) {
        return false; // Max retries exceeded
      }
      return true; // Can retry
    }
    
    return state === 'NEW';
  }, [states]);

  /**
   * Register a newly discovered token
   */
  const registerToken = useCallback(async (token: DiscoveredToken): Promise<boolean> => {
    const addr = token.address.toLowerCase();
    
    // Skip if already registered
    if (statesCacheRef.current.has(addr)) {
      return true;
    }
    
    // Skip if operation in progress
    if (pendingOpsRef.current.has(addr)) {
      return true;
    }
    
    pendingOpsRef.current.add(addr);
    
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user?.id) {
        return false;
      }

      const { data, error } = await supabase
        .from('token_processing_states')
        .upsert({
          user_id: session.session.user.id,
          token_address: addr,
          token_symbol: token.symbol,
          token_name: token.name,
          state: 'NEW',
          source: token.source || null,
          liquidity_at_discovery: token.liquidity || null,
          risk_score_at_discovery: token.riskScore || null,
          buyer_position_at_discovery: token.buyerPosition || null,
        }, {
          onConflict: 'user_id,token_address',
          ignoreDuplicates: true, // Don't update if already exists
        })
        .select()
        .single();

      if (error && !error.message.includes('duplicate')) {
        console.error('[TokenStateManager] Failed to register token:', error);
        return false;
      }

      if (data) {
        statesCacheRef.current.set(addr, data.state as TokenState);
        setStates(prev => new Map(prev).set(addr, data as TokenStateRecord));
      }
      
      return true;
    } catch (err) {
      console.error('[TokenStateManager] Error registering token:', err);
      return false;
    } finally {
      pendingOpsRef.current.delete(addr);
    }
  }, []);

  /**
   * Batch register multiple tokens
   */
  const registerTokensBatch = useCallback(async (tokens: DiscoveredToken[]): Promise<void> => {
    // Filter out already registered tokens
    const newTokens = tokens.filter(t => !statesCacheRef.current.has(t.address.toLowerCase()));
    if (newTokens.length === 0) return;

    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user?.id) return;

      const userId = session.session.user.id;
      const records = newTokens.map(token => ({
        user_id: userId,
        token_address: token.address.toLowerCase(),
        token_symbol: token.symbol,
        token_name: token.name,
        state: 'NEW' as const,
        source: token.source || null,
        liquidity_at_discovery: token.liquidity || null,
        risk_score_at_discovery: token.riskScore || null,
        buyer_position_at_discovery: token.buyerPosition || null,
      }));

      const { data, error } = await supabase
        .from('token_processing_states')
        .upsert(records, {
          onConflict: 'user_id,token_address',
          ignoreDuplicates: true,
        })
        .select();

      if (error) {
        console.error('[TokenStateManager] Batch register error:', error);
        return;
      }

      // Update cache
      for (const record of data || []) {
        const addr = record.token_address.toLowerCase();
        statesCacheRef.current.set(addr, record.state as TokenState);
        setStates(prev => new Map(prev).set(addr, record as TokenStateRecord));
      }

      console.log(`[TokenStateManager] Registered ${data?.length || 0} new tokens`);
    } catch (err) {
      console.error('[TokenStateManager] Batch register error:', err);
    }
  }, []);

  /**
   * Transition token to PENDING state
   */
  const markPending = useCallback(async (
    tokenAddress: string,
    reason: string,
    retryWindowMs: number = DEFAULT_RETRY_WINDOW_MS
  ): Promise<boolean> => {
    const addr = tokenAddress.toLowerCase();
    const currentState = statesCacheRef.current.get(addr);
    
    // Can only transition to PENDING from NEW or PENDING
    if (currentState === 'TRADED' || currentState === 'REJECTED') {
      return false;
    }

    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user?.id) return false;

      const now = new Date();
      const expiresAt = new Date(now.getTime() + retryWindowMs);
      
      // Get current record for retry count
      const existing = states.get(addr);
      const newRetryCount = (existing?.retry_count || 0) + (currentState === 'PENDING' ? 1 : 0);

      const { data, error } = await supabase
        .from('token_processing_states')
        .upsert({
          user_id: session.session.user.id,
          token_address: addr,
          state: 'PENDING',
          pending_since: existing?.pending_since || now.toISOString(),
          pending_reason: reason,
          retry_count: newRetryCount,
          retry_expires_at: expiresAt.toISOString(),
        }, {
          onConflict: 'user_id,token_address',
        })
        .select()
        .single();

      if (error) {
        console.error('[TokenStateManager] Failed to mark pending:', error);
        return false;
      }

      if (data) {
        statesCacheRef.current.set(addr, 'PENDING');
        setStates(prev => new Map(prev).set(addr, data as TokenStateRecord));
      }

      console.log(`[TokenStateManager] Token ${addr} -> PENDING (${reason})`);
      return true;
    } catch (err) {
      console.error('[TokenStateManager] Error marking pending:', err);
      return false;
    }
  }, [states]);

  /**
   * Transition token to TRADED state (PERMANENT - never trade again)
   */
  const markTraded = useCallback(async (
    tokenAddress: string,
    txHash?: string,
    positionId?: string
  ): Promise<boolean> => {
    const addr = tokenAddress.toLowerCase();
    
    // CRITICAL: Immediately update cache to prevent race conditions
    statesCacheRef.current.set(addr, 'TRADED');

    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user?.id) return false;

      const { data, error } = await supabase
        .from('token_processing_states')
        .upsert({
          user_id: session.session.user.id,
          token_address: addr,
          state: 'TRADED',
          traded_at: new Date().toISOString(),
          trade_tx_hash: txHash || null,
          position_id: positionId || null,
          // Clear pending fields
          pending_since: null,
          pending_reason: null,
        }, {
          onConflict: 'user_id,token_address',
        })
        .select()
        .single();

      if (error) {
        console.error('[TokenStateManager] Failed to mark traded:', error);
        return false;
      }

      if (data) {
        setStates(prev => new Map(prev).set(addr, data as TokenStateRecord));
      }

      console.log(`[TokenStateManager] Token ${addr} -> TRADED (permanent)`);
      return true;
    } catch (err) {
      console.error('[TokenStateManager] Error marking traded:', err);
      return false;
    }
  }, []);

  /**
   * Transition token to REJECTED state (PERMANENT - never process again)
   */
  const markRejected = useCallback(async (
    tokenAddress: string,
    reason: string
  ): Promise<boolean> => {
    const addr = tokenAddress.toLowerCase();
    
    // CRITICAL: Immediately update cache
    statesCacheRef.current.set(addr, 'REJECTED');

    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user?.id) return false;

      const { data, error } = await supabase
        .from('token_processing_states')
        .upsert({
          user_id: session.session.user.id,
          token_address: addr,
          state: 'REJECTED',
          rejected_at: new Date().toISOString(),
          rejection_reason: reason,
          // Clear pending fields
          pending_since: null,
          pending_reason: null,
        }, {
          onConflict: 'user_id,token_address',
        })
        .select()
        .single();

      if (error) {
        console.error('[TokenStateManager] Failed to mark rejected:', error);
        return false;
      }

      if (data) {
        setStates(prev => new Map(prev).set(addr, data as TokenStateRecord));
      }

      console.log(`[TokenStateManager] Token ${addr} -> REJECTED (${reason})`);
      return true;
    } catch (err) {
      console.error('[TokenStateManager] Error marking rejected:', err);
      return false;
    }
  }, []);

  /**
   * Get all tokens in PENDING state that are due for retry
   */
  const getPendingTokensForRetry = useCallback((): TokenStateRecord[] => {
    const now = Date.now();
    const pending: TokenStateRecord[] = [];
    
    states.forEach((record) => {
      if (record.state !== 'PENDING') return;
      
      // Check if expired
      if (record.retry_expires_at) {
        const expiry = new Date(record.retry_expires_at).getTime();
        if (now > expiry) return; // Expired - should be rejected
      }
      
      // Check retry count
      if (record.retry_count >= record.max_retries) return;
      
      pending.push(record);
    });
    
    return pending;
  }, [states]);

  /**
   * Clean up expired PENDING tokens (move to REJECTED)
   */
  const cleanupExpiredPending = useCallback(async (): Promise<number> => {
    const now = Date.now();
    const expired: string[] = [];
    
    states.forEach((record, addr) => {
      if (record.state !== 'PENDING') return;
      
      const isExpired = record.retry_expires_at && 
        new Date(record.retry_expires_at).getTime() < now;
      const maxRetriesReached = record.retry_count >= record.max_retries;
      
      if (isExpired || maxRetriesReached) {
        expired.push(addr);
      }
    });
    
    // Mark all expired as rejected
    let rejectedCount = 0;
    for (const addr of expired) {
      const record = states.get(addr);
      const reason = record?.retry_count >= record?.max_retries 
        ? 'max_retries_exceeded' 
        : 'liquidity_timeout';
      const success = await markRejected(addr, reason);
      if (success) rejectedCount++;
    }
    
    if (rejectedCount > 0) {
      console.log(`[TokenStateManager] Cleaned up ${rejectedCount} expired PENDING tokens`);
    }
    
    return rejectedCount;
  }, [states, markRejected]);

  /**
   * Get counts by state
   */
  const getStateCounts = useCallback(() => {
    let newCount = 0;
    let pendingCount = 0;
    let tradedCount = 0;
    let rejectedCount = 0;
    
    statesCacheRef.current.forEach((state) => {
      switch (state) {
        case 'NEW': newCount++; break;
        case 'PENDING': pendingCount++; break;
        case 'TRADED': tradedCount++; break;
        case 'REJECTED': rejectedCount++; break;
      }
    });
    
    return { newCount, pendingCount, tradedCount, rejectedCount, total: statesCacheRef.current.size };
  }, []);

  /**
   * Filter tokens that can be evaluated (not TRADED or REJECTED)
   */
  const filterEvaluableTokens = useCallback(<T extends { address: string }>(tokens: T[]): T[] => {
    return tokens.filter(t => {
      const state = statesCacheRef.current.get(t.address.toLowerCase());
      if (!state) return true; // New token
      return state !== 'TRADED' && state !== 'REJECTED';
    });
  }, []);

  /**
   * Filter tokens that can be traded (NEW or valid PENDING)
   */
  const filterTradeableTokens = useCallback(<T extends { address: string }>(tokens: T[]): T[] => {
    return tokens.filter(t => canTradeToken(t.address));
  }, [canTradeToken]);

  return {
    // State
    states,
    loading,
    initialized,
    
    // Queries
    getTokenState,
    canProcessToken,
    canTradeToken,
    getPendingTokensForRetry,
    getStateCounts,
    
    // Filters
    filterEvaluableTokens,
    filterTradeableTokens,
    
    // State transitions
    registerToken,
    registerTokensBatch,
    markPending,
    markTraded,
    markRejected,
    
    // Maintenance
    cleanupExpiredPending,
    reload: loadStates,
  };
}
