import { WifiOff, Wifi } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useOfflineDetection } from '@/hooks/useOfflineDetection';
import { cn } from '@/lib/utils';

interface OfflineIndicatorProps {
  className?: string;
}

/**
 * Component that displays offline/online status to users
 */
export function OfflineIndicator({ className }: OfflineIndicatorProps) {
  const { isOnline, wasOffline } = useOfflineDetection();

  // Show nothing when online and wasn't recently offline
  if (isOnline && !wasOffline) {
    return null;
  }

  // Show reconnected message briefly
  if (isOnline && wasOffline) {
    return (
      <Alert 
        className={cn(
          "fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50",
          "bg-success/10 border-success/30 animate-in slide-in-from-bottom-4",
          className
        )}
      >
        <Wifi className="h-4 w-4 text-success" />
        <AlertTitle className="text-success">Connection Restored</AlertTitle>
        <AlertDescription className="text-success/80">
          You're back online. Syncing data...
        </AlertDescription>
      </Alert>
    );
  }

  // Show offline warning
  return (
    <Alert 
      className={cn(
        "fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50",
        "bg-destructive/10 border-destructive/30 animate-in slide-in-from-bottom-4",
        className
      )}
    >
      <WifiOff className="h-4 w-4 text-destructive" />
      <AlertTitle className="text-destructive">You're Offline</AlertTitle>
      <AlertDescription className="text-destructive/80">
        Check your internet connection. Some features may not work.
      </AlertDescription>
    </Alert>
  );
}
