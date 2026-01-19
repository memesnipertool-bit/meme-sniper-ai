import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useTradeSignals, TradeSignal } from '@/hooks/useTradeSignals';
import { useWallet } from '@/hooks/useWallet';
import { useAppMode } from '@/contexts/AppModeContext';
import { 
  Zap, 
  Clock, 
  AlertTriangle, 
  Check, 
  X, 
  Loader2,
  ExternalLink,
  TrendingUp,
  Droplets,
  Target
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface TradeSignalCardProps {
  signal: TradeSignal;
  onExecute: (signal: TradeSignal) => void;
  onCancel: (signalId: string) => void;
  isExecuting: boolean;
  walletConnected: boolean;
}

function TradeSignalCard({ 
  signal, 
  onExecute, 
  onCancel, 
  isExecuting,
  walletConnected 
}: TradeSignalCardProps) {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const updateTimeLeft = () => {
      const expires = new Date(signal.expires_at);
      const now = new Date();
      const diff = expires.getTime() - now.getTime();
      
      if (diff <= 0) {
        setTimeLeft('Expired');
      } else {
        const minutes = Math.floor(diff / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        setTimeLeft(`${minutes}:${seconds.toString().padStart(2, '0')}`);
      }
    };

    updateTimeLeft();
    const interval = setInterval(updateTimeLeft, 1000);
    return () => clearInterval(interval);
  }, [signal.expires_at]);

  const isExpired = timeLeft === 'Expired';

  return (
    <Card className={`border ${isExpired ? 'border-muted opacity-50' : 'border-primary/50 bg-primary/5'}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          {/* Token Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-bold text-lg truncate">{signal.token_symbol}</span>
              {signal.is_pump_fun && (
                <Badge variant="secondary" className="text-xs">Pump.fun</Badge>
              )}
              {signal.source && (
                <Badge variant="outline" className="text-xs">{signal.source}</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground truncate">{signal.token_name}</p>
            
            {/* Stats Row */}
            <div className="flex items-center gap-4 mt-2 text-sm">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger className="flex items-center gap-1">
                    <Droplets className="h-3 w-3 text-blue-500" />
                    <span>{signal.liquidity.toFixed(0)} SOL</span>
                  </TooltipTrigger>
                  <TooltipContent>Liquidity</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger className="flex items-center gap-1">
                    <Target className="h-3 w-3 text-green-500" />
                    <span>{signal.trade_amount} SOL</span>
                  </TooltipTrigger>
                  <TooltipContent>Trade Amount</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger className="flex items-center gap-1">
                    <AlertTriangle className={`h-3 w-3 ${signal.risk_score > 60 ? 'text-red-500' : 'text-yellow-500'}`} />
                    <span>{signal.risk_score}</span>
                  </TooltipTrigger>
                  <TooltipContent>Risk Score</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            {/* Reasons */}
            {signal.reasons.length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {signal.reasons.filter(r => r.startsWith('✓')).slice(0, 2).join(' | ')}
                </p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col items-end gap-2">
            {/* Timer */}
            <div className={`flex items-center gap-1 text-sm ${isExpired ? 'text-muted-foreground' : 'text-primary'}`}>
              <Clock className="h-3 w-3" />
              <span className="font-mono">{timeLeft}</span>
            </div>

            {/* Buttons */}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onCancel(signal.id)}
                disabled={isExecuting || isExpired}
              >
                <X className="h-4 w-4" />
              </Button>
              
              <Button
                size="sm"
                onClick={() => onExecute(signal)}
                disabled={isExecuting || isExpired || !walletConnected}
                className="gap-1"
              >
                {isExecuting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Executing...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4" />
                    Execute
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function TradeSignalPanel() {
  const { signals, loading, executing, executeSignal, cancelSignal, pendingCount } = useTradeSignals();
  const { wallet } = useWallet();
  const { mode } = useAppMode();
  const isDemo = mode === 'demo';

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Trade Signals
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Trade Signals
            {pendingCount > 0 && (
              <Badge variant="default" className="ml-2">
                {pendingCount} pending
              </Badge>
            )}
          </CardTitle>
          
          {isDemo && (
            <Badge variant="outline">Demo Mode</Badge>
          )}
        </div>
        
        {!wallet.isConnected && (
          <p className="text-sm text-muted-foreground mt-1">
            Connect wallet to execute trades
          </p>
        )}
      </CardHeader>
      
      <CardContent className="pt-0">
        {signals.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <TrendingUp className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p>No pending trade signals</p>
            <p className="text-sm mt-1">Approved tokens will appear here</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-3">
              {signals.map(signal => (
                <TradeSignalCard
                  key={signal.id}
                  signal={signal}
                  onExecute={executeSignal}
                  onCancel={cancelSignal}
                  isExecuting={executing === signal.id}
                  walletConnected={wallet.isConnected}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
