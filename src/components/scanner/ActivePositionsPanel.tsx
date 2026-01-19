import { memo, useMemo, useCallback, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, MoreVertical, ExternalLink, RefreshCw, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface Position {
  id: string;
  token_name: string;
  token_symbol: string;
  token_address?: string;
  amount: number;
  entry_price: number;
  current_price: number;
  profit_loss_percent: number | null;
  profit_loss_value: number | null;
  profit_take_percent?: number;
  stop_loss_percent?: number;
}

interface ActivePositionsPanelProps {
  positions: Position[];
  loading?: boolean;
  onClosePosition?: (positionId: string, currentPrice: number) => void;
  onForceClose?: (positionId: string) => void;
  onRefresh?: () => void;
}

const avatarColors = [
  'bg-gradient-to-br from-success/30 to-success/10 text-success',
  'bg-gradient-to-br from-blue-500/30 to-blue-500/10 text-blue-400',
  'bg-gradient-to-br from-purple-500/30 to-purple-500/10 text-purple-400',
  'bg-gradient-to-br from-orange-500/30 to-orange-500/10 text-orange-400',
  'bg-gradient-to-br from-pink-500/30 to-pink-500/10 text-pink-400',
  'bg-gradient-to-br from-cyan-500/30 to-cyan-500/10 text-cyan-400',
];

const formatPrice = (value: number) => {
  if (value < 0.00001) return `$${value.toExponential(2)}`;
  if (value < 0.01) return `$${value.toFixed(6)}`;
  if (value < 1) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
};

// Memoized position row
const PositionRow = memo(({ 
  position, 
  colorIndex, 
  onClosePosition,
  onForceClose
}: { 
  position: Position; 
  colorIndex: number;
  onClosePosition?: (positionId: string, currentPrice: number) => void;
  onForceClose?: (positionId: string) => void;
}) => {
  const pnlPercent = position.profit_loss_percent || 0;
  const pnlValue = position.profit_loss_value || 0;
  const isPositive = pnlPercent >= 0;
  const progressWidth = Math.min(Math.abs(pnlPercent), 100);

  const handleClose = useCallback(() => {
    onClosePosition?.(position.id, position.current_price);
  }, [onClosePosition, position.id, position.current_price]);

  const handleForceClose = useCallback(() => {
    onForceClose?.(position.id);
  }, [onForceClose, position.id]);

  return (
    <div className="px-4 py-3 border-b border-border/20 hover:bg-secondary/20 transition-colors group">
      <div className="flex items-center justify-between gap-3">
        {/* Left: Avatar + Info */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div 
            className={cn(
              "w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 border border-white/5",
              avatarColors[colorIndex % avatarColors.length]
            )}
          >
            {position.token_symbol.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-foreground truncate">{position.token_name}</span>
              <span className="text-xs text-muted-foreground">{position.token_symbol}</span>
            </div>
            <p className="text-xs text-muted-foreground tabular-nums">
              {position.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} tokens
            </p>
          </div>
        </div>
        
        {/* Right: PnL + Actions */}
        <div className="flex items-center gap-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="text-right cursor-help">
                <div className={cn(
                  "font-bold text-sm tabular-nums transition-all duration-300",
                  isPositive ? 'text-success' : 'text-destructive'
                )}>
                  {isPositive ? '+' : ''}{pnlPercent.toFixed(1)}%
                </div>
                <p className={cn(
                  "text-xs tabular-nums font-medium transition-all duration-300",
                  isPositive ? 'text-success/80' : 'text-destructive/80'
                )}>
                  {isPositive ? '+' : ''}${Math.abs(pnlValue).toFixed(2)}
                </p>
              </div>
            </TooltipTrigger>
            <TooltipContent side="left" className="bg-popover border-border text-xs">
              <div className="space-y-1">
                <p className="tabular-nums">Entry: {formatPrice(position.entry_price)}</p>
                <p className="tabular-nums">Current: {formatPrice(position.current_price)}</p>
                {position.profit_take_percent && (
                  <p className="text-success">TP: +{position.profit_take_percent}%</p>
                )}
                {position.stop_loss_percent && (
                  <p className="text-destructive">SL: -{position.stop_loss_percent}%</p>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="w-8 h-8 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-popover border-border">
              {onClosePosition && (
                <DropdownMenuItem 
                  onClick={handleClose}
                  className="cursor-pointer"
                >
                  Sell & Close
                </DropdownMenuItem>
              )}
              {onForceClose && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={handleForceClose}
                    className="text-destructive focus:text-destructive cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-2" />
                    Force Close (No Sell)
                  </DropdownMenuItem>
                </>
              )}
              {position.token_address && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <a 
                      href={`https://solscan.io/token/${position.token_address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      View on Solscan
                    </a>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      
      {/* Progress Bar */}
      <div className="mt-2.5 flex items-center gap-3 text-xs">
        <span className="text-muted-foreground tabular-nums min-w-[85px]">
          Entry: {formatPrice(position.entry_price)}
        </span>
        <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
          <div 
            className={cn(
              "h-full rounded-full transition-all duration-500 ease-out",
              isPositive ? 'bg-success' : 'bg-destructive'
            )}
            style={{ width: `${progressWidth}%` }}
          />
        </div>
        <span className={cn(
          "tabular-nums min-w-[85px] text-right font-medium transition-all duration-300",
          isPositive ? 'text-success' : 'text-destructive'
        )}>
          Now: {formatPrice(position.current_price)}
        </span>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.position.id === nextProps.position.id &&
    prevProps.position.current_price === nextProps.position.current_price &&
    prevProps.position.profit_loss_percent === nextProps.position.profit_loss_percent &&
    prevProps.position.profit_loss_value === nextProps.position.profit_loss_value &&
    prevProps.colorIndex === nextProps.colorIndex
  );
});

PositionRow.displayName = 'PositionRow';

// Loading skeleton
const PositionSkeleton = memo(() => (
  <div className="px-4 py-3 border-b border-border/20 animate-pulse">
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-secondary/60" />
        <div className="space-y-1.5">
          <div className="h-4 w-24 bg-secondary/60 rounded" />
          <div className="h-3 w-16 bg-secondary/40 rounded" />
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="h-4 w-14 bg-secondary/60 rounded ml-auto" />
        <div className="h-3 w-10 bg-secondary/40 rounded ml-auto" />
      </div>
    </div>
    <div className="mt-2.5 h-2 w-full bg-secondary/40 rounded" />
  </div>
));

PositionSkeleton.displayName = 'PositionSkeleton';

export default function ActivePositionsPanel({ 
  positions, 
  loading = false,
  onClosePosition,
  onForceClose,
  onRefresh,
}: ActivePositionsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showAll, setShowAll] = useState(false);
  
  // Display all or first 5
  const displayedPositions = useMemo(() => 
    showAll ? positions : positions.slice(0, 5), 
    [positions, showAll]
  );
  
  const remainingCount = positions.length - 5;

  // Total P&L
  const totalPnL = useMemo(() => 
    positions.reduce((sum, p) => sum + (p.profit_loss_value || 0), 0),
    [positions]
  );

  if (loading) {
    return (
      <Card className="bg-card/80 backdrop-blur-sm border-border/50">
        <CardHeader className="pb-2 px-4 pt-4">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Active Positions
          </CardTitle>
          <div className="h-4 w-24 bg-secondary/60 rounded animate-pulse" />
        </CardHeader>
        <CardContent className="p-0">
          {[1, 2, 3].map((i) => (
            <PositionSkeleton key={i} />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/80 backdrop-blur-sm border-border/50">
      <CardHeader className="pb-2 px-4 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20">
              <TrendingUp className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">Active Positions</CardTitle>
              <p className="text-xs text-muted-foreground tabular-nums">
                {positions.length} open trades
                {positions.length > 0 && (
                  <span className={cn(
                    "ml-2 font-medium",
                    totalPnL >= 0 ? 'text-success' : 'text-destructive'
                  )}>
                    ({totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)})
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {onRefresh && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="w-8 h-8"
                    onClick={onRefresh}
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="bg-popover border-border">
                  <p className="text-xs">Refresh positions</p>
                </TooltipContent>
              </Tooltip>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="w-8 h-8"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>
      
      {isExpanded && (
        <CardContent className="p-0">
          {positions.length === 0 ? (
            <div className="text-center py-10">
              <TrendingUp className="w-10 h-10 mx-auto mb-3 text-muted-foreground/20" />
              <p className="text-sm text-muted-foreground font-medium">No active positions</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Positions will appear here when you open trades
              </p>
            </div>
          ) : (
            <>
              {displayedPositions.map((position, index) => (
                <PositionRow
                  key={position.id}
                  position={position}
                  colorIndex={index}
                  onClosePosition={onClosePosition}
                  onForceClose={onForceClose}
                />
              ))}
              
              {remainingCount > 0 && !showAll && (
                <div className="px-4 py-3 border-t border-border/30">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAll(true)}
                    className="w-full h-8 text-xs"
                  >
                    Show all ({remainingCount} more)
                  </Button>
                </div>
              )}
              
              {showAll && remainingCount > 0 && (
                <div className="px-4 py-3 border-t border-border/30">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAll(false)}
                    className="w-full h-8 text-xs text-muted-foreground"
                  >
                    Show less
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
