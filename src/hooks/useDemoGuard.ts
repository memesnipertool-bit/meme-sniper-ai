import { useCallback } from 'react';
import { useAppMode } from '@/contexts/AppModeContext';
import { useToast } from '@/hooks/use-toast';

/**
 * Hook to guard against real API calls in demo mode
 * Returns utilities to check and block demo mode API calls
 */
export function useDemoGuard() {
  const { mode } = useAppMode();
  const { toast } = useToast();

  const isDemo = mode === 'demo';

  /**
   * Check if we're in demo mode and show a warning
   * Returns true if the call should be blocked (demo mode)
   */
  const shouldBlockCall = useCallback((actionName?: string): boolean => {
    if (isDemo) {
      toast({
        title: 'Demo Mode Active',
        description: actionName 
          ? `${actionName} is simulated in demo mode. Switch to Live mode for real transactions.`
          : 'This action is simulated in demo mode.',
      });
      return true;
    }
    return false;
  }, [isDemo, toast]);

  /**
   * Guard a function - only executes in live mode
   * In demo mode, returns the fallback value and shows toast
   */
  const guardFunction = useCallback(<T>(
    fn: () => Promise<T>,
    demoFallback: T,
    actionName?: string
  ): Promise<T> => {
    if (isDemo) {
      if (actionName) {
        toast({
          title: 'Demo Mode',
          description: `${actionName} is simulated. No real API call made.`,
        });
      }
      return Promise.resolve(demoFallback);
    }
    return fn();
  }, [isDemo, toast]);

  /**
   * Wrap an async function to skip in demo mode
   */
  const wrapWithDemoGuard = useCallback(<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    demoResult?: Awaited<ReturnType<T>>,
    actionName?: string
  ): T => {
    return ((...args: Parameters<T>) => {
      if (isDemo) {
        console.log(`[Demo Guard] Blocked API call: ${actionName || fn.name}`);
        return Promise.resolve(demoResult);
      }
      return fn(...args);
    }) as T;
  }, [isDemo]);

  return {
    isDemo,
    shouldBlockCall,
    guardFunction,
    wrapWithDemoGuard,
  };
}

/**
 * Simple check for demo mode without hook
 * Use this in edge functions or outside React components
 */
export function isDemoMode(): boolean {
  try {
    const stored = localStorage.getItem('app_mode');
    return stored === 'demo';
  } catch {
    return false;
  }
}
