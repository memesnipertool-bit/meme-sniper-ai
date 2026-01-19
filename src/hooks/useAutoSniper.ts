import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useNotifications } from '@/hooks/useNotifications';
import { useAppMode } from '@/contexts/AppModeContext';

export interface TokenData {
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
  // Scanner validation flags - CRITICAL for trade execution
  isPumpFun?: boolean;      // True if on Pump.fun bonding curve
  isTradeable?: boolean;    // True if scanner verified tradability
  canBuy?: boolean;         // True if buy is possible
  canSell?: boolean;        // True if sell is possible
  source?: string;          // API source (e.g., 'Pump.fun', 'DexScreener')
  safetyReasons?: string[]; // Array of safety check results
}

export interface SnipeDecision {
  token: TokenData;
  approved: boolean;
  reasons: string[];
  tradeParams: {
    amount: number;
    slippage: number;
    priority: string;
  } | null;
}

export interface ExecutedTrade {
  token: string;
  txId?: string;
  error?: string;
  positionId?: string;
}

export interface AutoSniperResult {
  decisions: SnipeDecision[];
  executedTrades: ExecutedTrade[];
  summary: {
    total: number;
    approved: number;
    rejected: number;
    executed: number;
    openPositions: number;
    maxPositions: number;
  };
  settings: {
    minLiquidity: number;
    priority: string;
    categoryFilters: string[];
    profitTakePercent: number;
    stopLossPercent: number;
  };
  timestamp: string;
}

export interface EvaluateTokensOptions {
  /**
   * When true, do not show the "Enable auto-trading" / opportunities toast.
   * Useful when the caller handles execution (e.g., wallet-signing flow) and will
   * show its own UX.
   */
  suppressOpportunityToast?: boolean;
}

export function useAutoSniper() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AutoSniperResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const { addNotification } = useNotifications();
  const { mode } = useAppMode();
  
  // Demo mode guard
  const isDemo = mode === 'demo';
  
  // Ref to prevent concurrent evaluations
  const evaluatingRef = useRef(false);
  // Last evaluation timestamp
  const lastEvalRef = useRef(0);

  const evaluateTokens = useCallback(async (
    tokens: TokenData[],
    executeOnApproval: boolean = false,
    onTradeExecuted?: () => void,
    options?: EvaluateTokensOptions
  ): Promise<AutoSniperResult | null> => {
    // Prevent concurrent evaluations
    if (evaluatingRef.current) {
      console.log('[Auto-sniper] Evaluation already in progress, skipping...');
      return null;
    }

    // Throttle: 5 seconds for live mode (wallet signing takes time anyway)
    // 20 seconds for demo mode (fast simulation)
    const throttleMs = isDemo ? 20000 : 5000;
    const now = Date.now();
    if (now - lastEvalRef.current < throttleMs) {
      console.log(`[Auto-sniper] Throttled, wait ${Math.ceil((throttleMs - (now - lastEvalRef.current)) / 1000)}s`);
      return null;
    }

    evaluatingRef.current = true;
    lastEvalRef.current = now;
    setLoading(true);
    setError(null);

    try {
      // Demo mode guard - don't call real API (demo trades handled in Scanner.tsx)
      if (isDemo) {
        console.log('[Auto-sniper] Demo mode - skipping API call');
        evaluatingRef.current = false;
        setLoading(false);
        return null;
      }

      // Filter out demo/invalid tokens before sending to API
      // Demo tokens have truncated addresses like "Demo0...f9xjij" which fail validation
      const validTokens = tokens.filter(t => {
        const addr = t.address || '';
        // Reject demo addresses (contain '...' or start with 'Demo')
        if (addr.includes('...') || addr.startsWith('Demo')) {
          console.log(`[Auto-sniper] Filtering out demo token: ${t.symbol} (${addr})`);
          return false;
        }
        // Reject invalid length addresses
        if (addr.length < 26 || addr.length > 66) {
          console.log(`[Auto-sniper] Filtering out invalid address: ${t.symbol} (${addr.length} chars)`);
          return false;
        }
        return true;
      });

      if (validTokens.length === 0) {
        console.log('[Auto-sniper] No valid tokens after filtering, skipping API call');
        evaluatingRef.current = false;
        setLoading(false);
        return null;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Please sign in to use the auto-sniper');
      }

      console.log(`[Auto-sniper] Evaluating ${validTokens.length} tokens (filtered from ${tokens.length}):`, validTokens.map(t => `${t.symbol}(${t.source || 'unknown'})`).join(', '));

      const { data, error: fnError } = await supabase.functions.invoke('auto-sniper', {
        body: { tokens: validTokens, executeOnApproval },
      });

      if (fnError) throw fnError;

      if (data.error) {
        throw new Error(data.error);
      }

      setResult(data);
      
      const approved = data.summary?.approved || 0;
      const executed = data.summary?.executed || 0;
      const executedTrades = data.executedTrades || [];
      
      // Send notifications for each executed trade
      if (executeOnApproval && executed > 0) {
        executedTrades.forEach((trade: ExecutedTrade) => {
          if (!trade.error) {
            // Send toast notification
            toast({
              title: '🎯 Trade Executed!',
              description: `Bought ${trade.token} - Position opened`,
            });
            
            // Add to notification center
            addNotification({
              title: `Trade Executed: ${trade.token}`,
              message: `Auto-sniper bought ${trade.token}. Position ID: ${trade.positionId?.slice(0, 8) || 'N/A'}`,
              type: 'trade',
              metadata: {
                token: trade.token,
                txId: trade.txId,
                positionId: trade.positionId,
                settings: data.settings,
              },
            });
          } else {
            // Notify about failed trade
            addNotification({
              title: `Trade Failed: ${trade.token}`,
              message: trade.error,
              type: 'error',
            });
          }
        });

        // Notify parent to refresh positions
        if (onTradeExecuted) {
          onTradeExecuted();
        }
      } else if (approved > 0 && !executeOnApproval && !options?.suppressOpportunityToast) {
        toast({
          title: 'Opportunities Found',
          description: `${approved} token(s) passed all rules.`,
        });
      }

      return data;
    } catch (err: any) {
      const message = err.message || 'Failed to evaluate tokens';
      setError(message);
      console.error('Auto-sniper error:', err);
      toast({
        title: 'Auto-Sniper Error',
        description: message,
        variant: 'destructive',
      });
      return null;
    } finally {
      setLoading(false);
      evaluatingRef.current = false;
    }
  }, [toast, addNotification, isDemo]);

  const clearResult = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return {
    loading,
    result,
    error,
    evaluateTokens,
    clearResult,
  };
}
