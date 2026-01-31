import { useState, useEffect } from 'react';
import { 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  ExternalLink,
  Clock,
  Send,
  Wallet,
  Search,
  Zap,
  RefreshCw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { TransactionStatus as TxStatus, TradeQuote } from '@/hooks/useTradeExecution';

interface TransactionStatusProps {
  status: TxStatus;
  quote?: TradeQuote | null;
  signature?: string | null;
  error?: string | null;
  tokenSymbol?: string;
  onRetry?: () => void;
  onClose?: () => void;
}

const STATUS_CONFIG: Record<TxStatus, {
  label: string;
  icon: React.ElementType;
  color: string;
  progress: number;
}> = {
  idle: {
    label: 'Ready',
    icon: Clock,
    color: 'text-muted-foreground',
    progress: 0,
  },
  fetching_quote: {
    label: 'Getting best price...',
    icon: Search,
    color: 'text-primary',
    progress: 15,
  },
  building_tx: {
    label: 'Building transaction...',
    icon: Zap,
    color: 'text-primary',
    progress: 35,
  },
  awaiting_signature: {
    label: 'Approve in wallet',
    icon: Wallet,
    color: 'text-yellow-500',
    progress: 50,
  },
  broadcasting: {
    label: 'Broadcasting to network...',
    icon: Send,
    color: 'text-primary',
    progress: 70,
  },
  confirming: {
    label: 'Confirming transaction...',
    icon: Loader2,
    color: 'text-primary',
    progress: 85,
  },
  confirmed: {
    label: 'Transaction confirmed!',
    icon: CheckCircle2,
    color: 'text-green-500',
    progress: 100,
  },
  retrying: {
    label: 'Retrying with higher slippage...',
    icon: RefreshCw,
    color: 'text-yellow-500',
    progress: 40,
  },
  failed: {
    label: 'Transaction failed',
    icon: XCircle,
    color: 'text-destructive',
    progress: 0,
  },
};

export function TransactionStatus({
  status,
  quote,
  signature,
  error,
  tokenSymbol = 'TOKEN',
  onRetry,
  onClose,
}: TransactionStatusProps) {
  const [elapsedTime, setElapsedTime] = useState(0);
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  
  const isLoading = !['idle', 'confirmed', 'failed'].includes(status);
  const isComplete = status === 'confirmed';
  const isFailed = status === 'failed';

  // Track elapsed time for loading states
  useEffect(() => {
    if (!isLoading) {
      setElapsedTime(0);
      return;
    }

    const interval = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isLoading]);

  if (status === 'idle') {
    return null;
  }

  return (
    <Card className="border-2 overflow-hidden">
      <CardContent className="p-4 space-y-4">
        {/* Status Header */}
        <div className="flex items-center gap-3">
          <div className={cn(
            'p-2 rounded-full',
            isComplete && 'bg-green-500/20',
            isFailed && 'bg-destructive/20',
            isLoading && 'bg-primary/20'
          )}>
            <Icon 
              className={cn(
                'h-6 w-6',
                config.color,
                isLoading && status !== 'awaiting_signature' && 'animate-spin'
              )} 
            />
          </div>
          <div className="flex-1">
            <p className={cn('font-medium', config.color)}>
              {config.label}
            </p>
            {isLoading && (
              <p className="text-xs text-muted-foreground">
                {elapsedTime}s elapsed
              </p>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        {isLoading && (
          <Progress 
            value={config.progress} 
            className="h-2"
          />
        )}

        {/* Quote Details */}
        {quote && (
          <div className="bg-muted/50 rounded-lg p-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">You pay</span>
              <span className="font-mono font-medium">
                {quote.inputAmountDecimal.toFixed(4)} SOL
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">You receive</span>
              <span className="font-mono font-medium">
                ~{quote.outputAmountDecimal.toLocaleString()} {tokenSymbol}
              </span>
            </div>
            {quote.priceImpactPct > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Price impact</span>
                <span className={cn(
                  'font-mono',
                  quote.priceImpactPct > 5 ? 'text-destructive' : 
                  quote.priceImpactPct > 1 ? 'text-yellow-500' : 
                  'text-green-500'
                )}>
                  {quote.priceImpactPct.toFixed(2)}%
                </span>
              </div>
            )}
            {quote.route && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Route</span>
                <span className="text-xs font-mono">{quote.route}</span>
              </div>
            )}
          </div>
        )}

        {/* Wallet Prompt */}
        {status === 'awaiting_signature' && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-center">
            <p className="text-sm text-yellow-600 dark:text-yellow-400">
              Please check your wallet extension and approve the transaction
            </p>
          </div>
        )}

        {/* Error Message */}
        {isFailed && error && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3">
            <p className="text-sm text-destructive whitespace-pre-wrap break-words">{error}</p>
            {error.includes('pump.fun') && (
              <a 
                href="https://pump.fun" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-2 text-xs text-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                Trade on Pump.fun
              </a>
            )}
          </div>
        )}

        {/* Success Details */}
        {isComplete && signature && (
          <div className="space-y-3">
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-center">
              <p className="text-sm text-green-600 dark:text-green-400">
                Your transaction has been confirmed on-chain!
              </p>
            </div>
            
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => window.open(`https://solscan.io/tx/${signature}`, '_blank')}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              View on Solscan
            </Button>
          </div>
        )}

        {/* Action Buttons */}
        {(isComplete || isFailed) && (
          <div className="flex gap-2">
            {isFailed && onRetry && (
              <Button onClick={onRetry} variant="default" className="flex-1">
                Retry
              </Button>
            )}
            {onClose && (
              <Button 
                onClick={onClose} 
                variant={isFailed ? 'outline' : 'default'} 
                className="flex-1"
              >
                {isComplete ? 'Done' : 'Close'}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
