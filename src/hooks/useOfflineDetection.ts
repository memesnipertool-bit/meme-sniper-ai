import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

interface OfflineState {
  isOnline: boolean;
  wasOffline: boolean;
  lastOnlineAt: Date | null;
}

/**
 * Hook to detect and handle offline/online status changes
 */
export function useOfflineDetection() {
  const [state, setState] = useState<OfflineState>({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    wasOffline: false,
    lastOnlineAt: null,
  });
  const { toast } = useToast();

  const handleOnline = useCallback(() => {
    setState(prev => ({
      isOnline: true,
      wasOffline: !prev.isOnline, // Was offline before
      lastOnlineAt: new Date(),
    }));
    
    toast({
      title: 'Connection Restored',
      description: 'You are back online. Data will sync automatically.',
    });
  }, [toast]);

  const handleOffline = useCallback(() => {
    setState(prev => ({
      ...prev,
      isOnline: false,
      wasOffline: false,
    }));
    
    toast({
      title: 'You are offline',
      description: 'Some features may be unavailable until connection is restored.',
      variant: 'destructive',
    });
  }, [toast]);

  useEffect(() => {
    // Initial check
    setState(prev => ({
      ...prev,
      isOnline: navigator.onLine,
      lastOnlineAt: navigator.onLine ? new Date() : null,
    }));

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [handleOnline, handleOffline]);

  // Clear the wasOffline flag after a period
  useEffect(() => {
    if (state.wasOffline) {
      const timer = setTimeout(() => {
        setState(prev => ({ ...prev, wasOffline: false }));
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [state.wasOffline]);

  return state;
}
