import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useNotifications } from '@/hooks/useNotifications';
import { useAppMode } from '@/contexts/AppModeContext';

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

export function useAutoExit() {
  const [checking, setChecking] = useState(false);
  const [lastCheck, setLastCheck] = useState<string | null>(null);
  const [results, setResults] = useState<ExitResult[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isRunningRef = useRef(false);
  const { toast } = useToast();
  const { addNotification } = useNotifications();
  const { mode } = useAppMode();
  
  // Demo mode guard
  const isDemo = mode === 'demo';

  const checkExitConditions = useCallback(async (executeExits: boolean = true): Promise<{
    results: ExitResult[];
    summary: AutoExitSummary;
  } | null> => {
    // Prevent concurrent checks
    if (isRunningRef.current) {
      console.log('Auto-exit check already in progress, skipping...');
      return null;
    }

    isRunningRef.current = true;
    setChecking(true);

    try {
      // Demo mode guard - don't call real API
      if (isDemo) {
        console.log('[Demo Guard] Skipping real auto-exit API call in demo mode');
        isRunningRef.current = false;
        setChecking(false);
        return null;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.log('No session for auto-exit check');
        return null;
      }

      console.log('Running auto-exit check, executeExits:', executeExits);

      const { data, error } = await supabase.functions.invoke('auto-exit', {
        body: { executeExits },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setResults(data.results || []);
      setLastCheck(data.timestamp);

      const summary = data.summary as AutoExitSummary | undefined;

      // Guard against missing summary
      if (!summary) {
        console.log('Auto-exit returned no summary');
        return { results: data.results || [], summary: { total: 0, holding: 0, takeProfitTriggered: 0, stopLossTriggered: 0, executed: 0 } };
      }

      // Notify on exits
      if ((summary.takeProfitTriggered || 0) > 0 || (summary.stopLossTriggered || 0) > 0) {
        const exitResults = (data.results as ExitResult[]).filter(r => r.action !== 'hold');
        
        exitResults.forEach((result) => {
          if (result.action === 'take_profit') {
            toast({
              title: '💰 Take Profit Hit!',
              description: `${result.symbol} closed at +${result.profitLossPercent.toFixed(1)}%`,
            });
            addNotification({
              title: `Take Profit: ${result.symbol}`,
              message: `Closed at +${result.profitLossPercent.toFixed(1)}% profit`,
              type: 'trade',
              metadata: { positionId: result.positionId, action: result.action },
            });
          } else if (result.action === 'stop_loss') {
            toast({
              title: '🛑 Stop Loss Hit',
              description: `${result.symbol} closed at ${result.profitLossPercent.toFixed(1)}%`,
              variant: 'destructive',
            });
            addNotification({
              title: `Stop Loss: ${result.symbol}`,
              message: `Closed at ${result.profitLossPercent.toFixed(1)}% loss`,
              type: 'error',
              metadata: { positionId: result.positionId, action: result.action },
            });
          }
        });
      }

      return { results: data.results, summary };
    } catch (error: any) {
      console.error('Auto-exit check error:', error);
      return null;
    } finally {
      setChecking(false);
      isRunningRef.current = false;
    }
  }, [toast, addNotification]);

  const startAutoExitMonitor = useCallback((intervalMs: number = 30000) => {
    if (intervalRef.current) {
      console.log('Auto-exit monitor already running');
      return;
    }

    console.log(`Starting auto-exit monitor with ${intervalMs}ms interval`);
    
    // Run immediately on start
    checkExitConditions(true);

    // Then run periodically
    intervalRef.current = setInterval(() => {
      checkExitConditions(true);
    }, intervalMs);
  }, [checkExitConditions]);

  const stopAutoExitMonitor = useCallback(() => {
    if (intervalRef.current) {
      console.log('Stopping auto-exit monitor');
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

  return {
    checking,
    lastCheck,
    results,
    checkExitConditions,
    startAutoExitMonitor,
    stopAutoExitMonitor,
    isMonitoring: !!intervalRef.current,
  };
}
