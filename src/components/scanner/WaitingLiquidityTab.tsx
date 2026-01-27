import { memo, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Clock, RefreshCw, ArrowLeft, Zap, Wallet, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import type { WaitingPosition } from "@/hooks/useLiquidityRetryWorker";
import type { WalletToken } from "@/hooks/useWalletTokens";

export interface CombinedWaitingItem {
  id: string;
  token_address: string;
  token_symbol: string | null;
  token_name: string | null;
  amount: number;
  entry_price: number;
  current_price: number;
  profit_loss_percent: number | null;
  liquidity_last_checked_at: string | null;
  liquidity_check_count: number;
  waiting_for_liquidity_since: string | null;
  status: string;
  // Additional fields for wallet tokens
  isWalletToken: boolean;
  valueUsd: number | null;
}

interface WaitingLiquidityTabProps {
  positions: WaitingPosition[];
  walletTokens?: WalletToken[];
  activeTokenAddresses?: Set<string>;
  checking: boolean;
  loadingWalletTokens?: boolean;
  onRetryCheck: () => void;
  onMoveBack: (positionId: string) => void;
  onManualSell: (position: WaitingPosition | CombinedWaitingItem) => void;
  onRefreshWalletTokens?: () => void;
}

const avatarColors = [
  'bg-gradient-to-br from-warning/30 to-warning/10 text-warning',
  'bg-gradient-to-br from-orange-500/30 to-orange-500/10 text-orange-400',
  'bg-gradient-to-br from-amber-500/30 to-amber-500/10 text-amber-400',
  'bg-gradient-to-br from-purple-500/30 to-purple-500/10 text-purple-400',
  'bg-gradient-to-br from-pink-500/30 to-pink-500/10 text-pink-400',
];

const formatPrice = (value: number) => {
  if (value < 0.00001) return `$${value.toExponential(2)}`;
  if (value < 0.01) return `$${value.toFixed(6)}`;
  if (value < 1) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
};

const formatValue = (value: number | null) => {
  if (value === null) return '-';
  if (value < 0.01) return '<$0.01';
  if (value < 1) return `$${value.toFixed(2)}`;
  if (value < 1000) return `$${value.toFixed(2)}`;
  return `$${(value / 1000).toFixed(1)}K`;
};

const WaitingPositionRow = memo(({ 
  item, 
  colorIndex, 
  onMoveBack, 
  onManualSell 
}: { 
  item: CombinedWaitingItem; 
  colorIndex: number;
  onMoveBack: (id: string) => void;
  onManualSell: (item: CombinedWaitingItem) => void;
}) => {
  const displaySymbol = item.token_symbol || item.token_address.slice(0, 6);
  const displayName = item.token_name || `Token ${item.token_address.slice(0, 6)}`;
  const initials = displaySymbol.slice(0, 2).toUpperCase();
  const avatarClass = avatarColors[colorIndex % avatarColors.length];

  const waitingSince = item.waiting_for_liquidity_since 
    ? formatDistanceToNow(new Date(item.waiting_for_liquidity_since), { addSuffix: true })
    : null;

  const lastChecked = item.liquidity_last_checked_at
    ? formatDistanceToNow(new Date(item.liquidity_last_checked_at), { addSuffix: true })
    : 'Never';

  const handleMoveBack = useCallback(() => {
    onMoveBack(item.id);
  }, [onMoveBack, item.id]);

  const handleManualSell = useCallback(() => {
    onManualSell(item);
  }, [onManualSell, item]);

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
          {item.isWalletToken ? (
            <Badge variant="outline" className="bg-blue-500/10 border-blue-500/30 text-blue-400 text-[9px] px-1.5">
              <Wallet className="w-3 h-3 mr-1" />
              Wallet
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-warning/10 border-warning/30 text-warning text-[9px] px-1.5">
              <Clock className="w-3 h-3 mr-1" />
              Waiting
            </Badge>
          )}
        </div>
        
        {item.isWalletToken ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>Balance: {item.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
            {item.valueUsd !== null && (
              <>
                <span className="text-muted-foreground/40">•</span>
                <span className="text-foreground font-medium">{formatValue(item.valueUsd)}</span>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {waitingSince && <span>Waiting {waitingSince}</span>}
              <span className="text-muted-foreground/40">•</span>
              <span>Checked {item.liquidity_check_count}x</span>
              <span className="text-muted-foreground/40">•</span>
              <span>Last: {lastChecked}</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Entry:</span>
              <span className="font-mono tabular-nums">{formatPrice(item.entry_price)}</span>
              <span className="text-muted-foreground/40">→</span>
              <span className="font-mono tabular-nums">{formatPrice(item.current_price)}</span>
            </div>
          </>
        )}
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
        {!item.isWalletToken && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs gap-1 text-muted-foreground"
            onClick={handleMoveBack}
          >
            <ArrowLeft className="w-3 h-3" />
            Move Back
          </Button>
        )}
      </div>
    </div>
  );
});

WaitingPositionRow.displayName = 'WaitingPositionRow';

export default function WaitingLiquidityTab({
  positions,
  walletTokens = [],
  activeTokenAddresses = new Set(),
  checking,
  loadingWalletTokens = false,
  onRetryCheck,
  onMoveBack,
  onManualSell,
  onRefreshWalletTokens,
}: WaitingLiquidityTabProps) {
  
  // Combine waiting positions and wallet tokens, excluding active positions and duplicates
  const combinedItems = useMemo(() => {
    const items: CombinedWaitingItem[] = [];
    const seenAddresses = new Set<string>();
    
    // Add waiting positions first (higher priority)
    for (const pos of positions) {
      const addr = pos.token_address.toLowerCase();
      
      // Skip if already in active trades
      if (activeTokenAddresses.has(addr)) continue;
      
      seenAddresses.add(addr);
      items.push({
        id: pos.id,
        token_address: pos.token_address,
        token_symbol: pos.token_symbol,
        token_name: pos.token_name,
        amount: pos.amount,
        entry_price: pos.entry_price,
        current_price: pos.current_price,
        profit_loss_percent: pos.profit_loss_percent,
        liquidity_last_checked_at: pos.liquidity_last_checked_at,
        liquidity_check_count: pos.liquidity_check_count,
        waiting_for_liquidity_since: pos.waiting_for_liquidity_since,
        status: pos.status,
        isWalletToken: false,
        valueUsd: null,
      });
    }
    
    // Add wallet tokens that are not duplicates or active
    for (const token of walletTokens) {
      const addr = token.mint.toLowerCase();
      
      // Skip if already added from positions or in active trades
      if (seenAddresses.has(addr)) continue;
      if (activeTokenAddresses.has(addr)) continue;
      
      seenAddresses.add(addr);
      items.push({
        id: `wallet-${token.mint}`,
        token_address: token.mint,
        token_symbol: token.symbol,
        token_name: token.name,
        amount: token.balance,
        entry_price: token.priceUsd || 0,
        current_price: token.priceUsd || 0,
        profit_loss_percent: null,
        liquidity_last_checked_at: null,
        liquidity_check_count: 0,
        waiting_for_liquidity_since: null,
        status: 'wallet',
        isWalletToken: true,
        valueUsd: token.valueUsd,
      });
    }
    
    // Sort: waiting positions first, then by value
    items.sort((a, b) => {
      if (a.isWalletToken !== b.isWalletToken) {
        return a.isWalletToken ? 1 : -1; // Waiting positions first
      }
      // Then by value
      const aVal = a.valueUsd ?? 0;
      const bVal = b.valueUsd ?? 0;
      return bVal - aVal;
    });
    
    return items;
  }, [positions, walletTokens, activeTokenAddresses]);

  const waitingCount = positions.filter(p => !activeTokenAddresses.has(p.token_address.toLowerCase())).length;
  const walletCount = combinedItems.filter(i => i.isWalletToken).length;

  if (combinedItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Clock className="w-10 h-10 mb-3 opacity-20" />
        <p className="font-medium text-sm mb-1">No tokens waiting</p>
        <p className="text-xs text-muted-foreground/70 text-center max-w-xs">
          Tokens without swap routes and wallet tokens with value will appear here
        </p>
        {onRefreshWalletTokens && (
          <Button
            variant="outline"
            size="sm"
            className="mt-4 h-8 text-xs gap-1.5"
            onClick={onRefreshWalletTokens}
            disabled={loadingWalletTokens}
          >
            {loadingWalletTokens ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3" />
            )}
            Scan Wallet
          </Button>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Header with counts and actions */}
      <div className="flex items-center justify-between px-4 py-2 bg-secondary/30 border-b border-border/20">
        <div className="flex items-center gap-3 text-xs">
          {waitingCount > 0 && (
            <div className="flex items-center gap-1.5 text-warning">
              <Clock className="w-3.5 h-3.5" />
              <span className="font-medium">{waitingCount} waiting</span>
            </div>
          )}
          {walletCount > 0 && (
            <div className="flex items-center gap-1.5 text-blue-400">
              <Wallet className="w-3.5 h-3.5" />
              <span className="font-medium">{walletCount} wallet</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onRefreshWalletTokens && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
              onClick={onRefreshWalletTokens}
              disabled={loadingWalletTokens}
            >
              {loadingWalletTokens ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Wallet className="w-3 h-3" />
              )}
              Refresh
            </Button>
          )}
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
            {checking ? 'Checking...' : 'Check Routes'}
          </Button>
        </div>
      </div>

      {/* Position List */}
      <div className="divide-y divide-border/10">
        {combinedItems.map((item, idx) => (
          <WaitingPositionRow
            key={item.id}
            item={item}
            colorIndex={idx}
            onMoveBack={onMoveBack}
            onManualSell={onManualSell}
          />
        ))}
      </div>

      {/* Info footer */}
      <div className="px-4 py-3 bg-muted/30 border-t border-border/30">
        <p className="text-xs text-muted-foreground">
          💡 Wallet tokens and positions without swap routes. The bot checks every 30s and auto-sells when a route becomes available.
        </p>
      </div>
    </div>
  );
}
