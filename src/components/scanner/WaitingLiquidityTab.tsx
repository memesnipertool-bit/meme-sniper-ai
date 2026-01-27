import { memo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Clock, RefreshCw, ArrowLeft, Zap, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import type { WaitingPosition } from "@/hooks/useLiquidityRetryWorker";

interface WaitingLiquidityTabProps {
  positions: WaitingPosition[];
  checking: boolean;
  onRetryCheck: () => void;
  onMoveBack: (positionId: string) => void;
  onManualSell: (position: WaitingPosition) => void;
}

const avatarColors = [
  'bg-gradient-to-br from-warning/30 to-warning/10 text-warning',
  'bg-gradient-to-br from-orange-500/30 to-orange-500/10 text-orange-400',
  'bg-gradient-to-br from-amber-500/30 to-amber-500/10 text-amber-400',
];

const formatPrice = (value: number) => {
  if (value < 0.00001) return `$${value.toExponential(2)}`;
  if (value < 0.01) return `$${value.toFixed(6)}`;
  if (value < 1) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
};

const WaitingPositionRow = memo(({ 
  position, 
  colorIndex, 
  onMoveBack, 
  onManualSell 
}: { 
  position: WaitingPosition; 
  colorIndex: number;
  onMoveBack: (id: string) => void;
  onManualSell: (position: WaitingPosition) => void;
}) => {
  const displaySymbol = position.token_symbol || position.token_address.slice(0, 6);
  const displayName = position.token_name || `Token ${position.token_address.slice(0, 6)}`;
  const initials = displaySymbol.slice(0, 2).toUpperCase();
  const avatarClass = avatarColors[colorIndex % avatarColors.length];

  const waitingSince = position.waiting_for_liquidity_since 
    ? formatDistanceToNow(new Date(position.waiting_for_liquidity_since), { addSuffix: true })
    : 'Unknown';

  const lastChecked = position.liquidity_last_checked_at
    ? formatDistanceToNow(new Date(position.liquidity_last_checked_at), { addSuffix: true })
    : 'Never';

  const handleMoveBack = useCallback(() => {
    onMoveBack(position.id);
  }, [onMoveBack, position.id]);

  const handleManualSell = useCallback(() => {
    onManualSell(position);
  }, [onManualSell, position]);

  return (
    <div className="grid grid-cols-[40px_1fr_auto] items-center gap-3 px-3 py-3 border-b border-border/20 hover:bg-secondary/30 transition-colors">
      {/* Avatar */}
      <div className={cn(
        "w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs border border-white/5",
        avatarClass
      )}>
        {initials}
      </div>
      
      {/* Token Info */}
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground text-sm truncate">{displayName}</span>
          <span className="text-muted-foreground text-xs">{displaySymbol}</span>
          <Badge variant="outline" className="bg-warning/10 border-warning/30 text-warning text-[9px] px-1.5">
            <Clock className="w-3 h-3 mr-1" />
            Waiting
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Waiting {waitingSince}</span>
          <span className="text-muted-foreground/40">•</span>
          <span>Checked {position.liquidity_check_count}x</span>
          <span className="text-muted-foreground/40">•</span>
          <span>Last: {lastChecked}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Entry:</span>
          <span className="font-mono tabular-nums">{formatPrice(position.entry_price)}</span>
          <span className="text-muted-foreground/40">→</span>
          <span className="font-mono tabular-nums">{formatPrice(position.current_price)}</span>
        </div>
      </div>
      
      {/* Actions */}
      <div className="flex flex-col gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs gap-1"
          onClick={handleManualSell}
        >
          <Zap className="w-3 h-3" />
          Try Sell
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs gap-1 text-muted-foreground"
          onClick={handleMoveBack}
        >
          <ArrowLeft className="w-3 h-3" />
          Move Back
        </Button>
      </div>
    </div>
  );
});

WaitingPositionRow.displayName = 'WaitingPositionRow';

export default function WaitingLiquidityTab({
  positions,
  checking,
  onRetryCheck,
  onMoveBack,
  onManualSell,
}: WaitingLiquidityTabProps) {
  if (positions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Clock className="w-10 h-10 mb-3 opacity-20" />
        <p className="font-medium text-sm mb-1">No tokens waiting</p>
        <p className="text-xs text-muted-foreground/70 text-center max-w-xs">
          Tokens without swap routes will appear here and be auto-sold when liquidity returns
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Header with retry button */}
      <div className="flex items-center justify-between px-4 py-2 bg-warning/5 border-b border-warning/20">
        <div className="flex items-center gap-2 text-xs text-warning">
          <Clock className="w-4 h-4" />
          <span className="font-medium">{positions.length} token(s) waiting for liquidity</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1.5 border-warning/30 text-warning hover:bg-warning/10"
          onClick={onRetryCheck}
          disabled={checking}
        >
          {checking ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <RefreshCw className="w-3 h-3" />
          )}
          {checking ? 'Checking...' : 'Check Now'}
        </Button>
      </div>

      {/* Position List */}
      <div className="divide-y divide-border/10">
        {positions.map((position, idx) => (
          <WaitingPositionRow
            key={position.id}
            position={position}
            colorIndex={idx}
            onMoveBack={onMoveBack}
            onManualSell={onManualSell}
          />
        ))}
      </div>

      {/* Info footer */}
      <div className="px-4 py-3 bg-muted/30 border-t border-border/30">
        <p className="text-xs text-muted-foreground">
          💡 These tokens have no Jupiter/Raydium swap route. The bot checks every 30 seconds and will auto-sell when a route becomes available.
        </p>
      </div>
    </div>
  );
}
