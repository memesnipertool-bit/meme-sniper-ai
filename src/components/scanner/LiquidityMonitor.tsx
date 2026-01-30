import { useState, useMemo, memo, useCallback, useEffect, useRef, forwardRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ScannedToken } from "@/hooks/useTokenScanner";
import { Zap, TrendingUp, TrendingDown, ExternalLink, ShieldCheck, ShieldX, Lock, Search, LogOut, ChevronDown, ChevronUp, DollarSign, Eye, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import WaitingLiquidityTab, { type CombinedWaitingItem } from "./WaitingLiquidityTab";
import type { WaitingPosition } from "@/hooks/useLiquidityRetryWorker";
import type { WalletToken } from "@/hooks/useWalletTokens";

interface ActiveTradePosition {
  id: string;
  token_address: string;
  token_symbol: string;
  token_name: string;
  chain: string;
  entry_price: number;
  entry_price_usd?: number | null; // USD entry price (source of truth for P&L)
  current_price: number;
  amount: number;
  entry_value: number;      // May be stale/mixed-unit - prefer deriving from amount × entry_price_usd
  current_value: number;    // May be stale/mixed-unit - prefer deriving from amount × current_price
  profit_loss_percent: number | null;
  profit_loss_value: number | null;
  profit_take_percent: number;
  stop_loss_percent: number;
  status: 'open' | 'closed' | 'pending' | 'waiting_for_liquidity';
  created_at: string;
}

interface LiquidityMonitorProps {
  pools: ScannedToken[];
  activeTrades: ActiveTradePosition[];
  waitingPositions?: WaitingPosition[];
  walletTokens?: WalletToken[];
  loadingWalletTokens?: boolean;
  loading: boolean;
  apiStatus: 'waiting' | 'active' | 'error' | 'rate_limited';
  onExitTrade?: (positionId: string, currentPrice: number) => void;
  onRetryLiquidityCheck?: () => void;
  onMoveBackFromWaiting?: (positionId: string) => void;
  onManualSellWaiting?: (position: WaitingPosition | CombinedWaitingItem) => void;
  onRefreshWalletTokens?: () => void;
  checkingLiquidity?: boolean;
}

const formatLiquidity = (value: number) => {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
};

const formatPrice = (value: number) => {
  if (value < 0.00001) return `$${value.toExponential(2)}`;
  if (value < 0.01) return `$${value.toFixed(6)}`;
  if (value < 1) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
};

const avatarColors = [
  'bg-gradient-to-br from-primary/30 to-primary/10 text-primary',
  'bg-gradient-to-br from-blue-500/30 to-blue-500/10 text-blue-400',
  'bg-gradient-to-br from-purple-500/30 to-purple-500/10 text-purple-400',
  'bg-gradient-to-br from-orange-500/30 to-orange-500/10 text-orange-400',
  'bg-gradient-to-br from-pink-500/30 to-pink-500/10 text-pink-400',
  'bg-gradient-to-br from-cyan-500/30 to-cyan-500/10 text-cyan-400',
];

// Memoized Pool Row with improved visibility and criteria details
const PoolRow = memo(({ pool, colorIndex, isNew, onViewDetails }: { pool: ScannedToken; colorIndex: number; isNew?: boolean; onViewDetails: (pool: ScannedToken) => void }) => {
  const [expanded, setExpanded] = useState(false);
  const isPositive = pool.priceChange24h >= 0;
  
  // Use short address as fallback for placeholder names/symbols
  const displaySymbol = isPlaceholder(pool.symbol) 
    ? shortAddress(pool.address) 
    : pool.symbol;
  const displayName = isPlaceholder(pool.name) 
    ? `Token ${shortAddress(pool.address)}` 
    : pool.name;
    
  const initials = displaySymbol.slice(0, 2).toUpperCase();
  const avatarClass = avatarColors[colorIndex % avatarColors.length];
  const honeypotSafe = pool.riskScore < 50;
  const liquidityLocked = pool.liquidityLocked;

  // Criteria badges
  const isPumpFun = pool.isPumpFun || pool.source?.toLowerCase().includes('pump');
  const isTradeable = pool.isTradeable !== false;
  const canBuy = pool.canBuy !== false;
  const canSell = pool.canSell !== false;

  const handleViewDetails = (e: React.MouseEvent) => {
    e.stopPropagation();
    onViewDetails(pool);
  };

  return (
    <div className="border-b border-border/20">
      <div 
        className={cn(
          "grid grid-cols-[32px_1fr_auto] md:grid-cols-[40px_1fr_auto_auto_auto] items-center gap-2 md:gap-3 px-2 md:px-3 py-2 md:py-2.5 hover:bg-secondary/30 transition-all duration-200 cursor-pointer",
          isNew && "animate-fade-in bg-primary/5"
        )}
        onClick={() => setExpanded(!expanded)}
      >
        {/* Avatar */}
        <div className={cn(
          "w-8 h-8 md:w-9 md:h-9 rounded-lg flex items-center justify-center font-bold text-[10px] md:text-xs border border-white/5",
          avatarClass
        )}>
          {initials}
        </div>
        
        {/* Token Info - More visible */}
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-1.5 md:gap-2">
            <span className="font-semibold text-foreground text-xs md:text-sm truncate">{displayName}</span>
            <span className="text-muted-foreground text-[10px] md:text-xs font-medium hidden sm:inline">{displaySymbol}</span>
            {isNew && (
              <Badge className="bg-primary/20 text-primary text-[8px] md:text-[9px] px-1 py-0 h-3.5 md:h-4">NEW</Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5 md:gap-2 text-[10px] md:text-xs">
            <span className="font-mono text-muted-foreground/80 hidden sm:inline">{pool.address.slice(0, 4)}...{pool.address.slice(-3)}</span>
            {/* Mobile: Show key info inline */}
            <Badge 
              variant="outline" 
              className={cn(
                "text-[8px] md:hidden px-1 py-0 h-4",
                isTradeable && canBuy && canSell
                  ? "border-success/40 text-success bg-success/10" 
                  : "border-destructive/40 text-destructive bg-destructive/10"
              )}
            >
              {isTradeable && canBuy && canSell ? '✓' : '✗'}
            </Badge>
          </div>
        </div>
        
        {/* Source & Trade Status Badges - Desktop only */}
        <div className="hidden md:flex items-center gap-1 flex-wrap">
          <Badge 
            variant="outline" 
            className={cn(
              "text-[9px] px-1.5 py-0 h-5",
              isPumpFun 
                ? "border-orange-500/40 text-orange-400 bg-orange-500/10" 
                : "border-purple-500/40 text-purple-400 bg-purple-500/10"
            )}
          >
            {isPumpFun ? '🎉 Pump' : pool.source || 'DEX'}
          </Badge>
          <Badge 
            variant="outline" 
            className={cn(
              "text-[9px] px-1.5 py-0 h-5",
              isTradeable && canBuy && canSell
                ? "border-success/40 text-success bg-success/10" 
                : "border-destructive/40 text-destructive bg-destructive/10"
            )}
          >
            {isTradeable && canBuy && canSell ? '✓ Trade' : '✗ No Trade'}
          </Badge>
        </div>
        
        {/* Safety + Risk - Desktop only */}
        <div className="hidden md:flex items-center gap-1.5">
          {honeypotSafe ? (
            <div className="p-1.5 rounded-md bg-success/15 border border-success/20">
              <ShieldCheck className="w-3.5 h-3.5 text-success" />
            </div>
          ) : (
            <div className="p-1.5 rounded-md bg-destructive/15 border border-destructive/20">
              <ShieldX className="w-3.5 h-3.5 text-destructive" />
            </div>
          )}
          {liquidityLocked && (
            <div className="p-1.5 rounded-md bg-success/15 border border-success/20">
              <Lock className="w-3.5 h-3.5 text-success" />
            </div>
          )}
          <Badge 
            variant="outline" 
            className={cn(
              "text-[10px] px-1.5 py-0 h-5 tabular-nums font-medium",
              pool.riskScore < 40 ? "border-success/40 text-success bg-success/10" :
              pool.riskScore < 70 ? "border-warning/40 text-warning bg-warning/10" :
              "border-destructive/40 text-destructive bg-destructive/10"
            )}
          >
            {pool.riskScore}
          </Badge>
        </div>
        
        {/* Price & Liquidity - Always visible, compact on mobile */}
        <div className="text-right min-w-[70px] md:min-w-[90px]">
          <div className={cn(
            "flex items-center justify-end gap-0.5 md:gap-1 font-bold text-xs md:text-sm tabular-nums transition-colors duration-300",
            isPositive ? 'text-success' : 'text-destructive'
          )}>
            {isPositive ? <TrendingUp className="w-3 h-3 md:w-3.5 md:h-3.5" /> : <TrendingDown className="w-3 h-3 md:w-3.5 md:h-3.5" />}
            {isPositive ? '+' : ''}{pool.priceChange24h.toFixed(1)}%
          </div>
          <div className="text-[10px] md:text-xs text-muted-foreground tabular-nums font-medium">
            {formatLiquidity(pool.liquidity)}
          </div>
        </div>
      </div>
      
      {/* Expanded Criteria Details */}
      {expanded && (
        <div className="px-4 pb-3 pt-1 bg-secondary/20 animate-fade-in">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-background/50 rounded-lg text-xs">
            <div>
              <span className="text-muted-foreground block mb-0.5">Source</span>
              <span className={cn(
                "font-semibold",
                isPumpFun ? "text-orange-400" : "text-purple-400"
              )}>
                {pool.source || (isPumpFun ? 'Pump.fun' : 'DexScreener')}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block mb-0.5">Liquidity</span>
              <span className="text-foreground font-semibold">{formatLiquidity(pool.liquidity)}</span>
            </div>
            <div>
              <span className="text-muted-foreground block mb-0.5">Position</span>
              <span className="text-primary font-semibold">#{pool.buyerPosition || '-'}</span>
            </div>
            <div>
              <span className="text-muted-foreground block mb-0.5">Risk Score</span>
              <span className={cn(
                "font-semibold",
                pool.riskScore < 40 ? 'text-success' : pool.riskScore < 70 ? 'text-warning' : 'text-destructive'
              )}>
                {pool.riskScore}/100
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block mb-0.5">Can Buy</span>
              <span className={cn("font-semibold", canBuy ? 'text-success' : 'text-destructive')}>
                {canBuy ? '✓ Yes' : '✗ No'}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block mb-0.5">Can Sell</span>
              <span className={cn("font-semibold", canSell ? 'text-success' : 'text-destructive')}>
                {canSell ? '✓ Yes' : '✗ No'}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block mb-0.5">Lock %</span>
              <span className="text-foreground font-semibold">{pool.lockPercentage || 0}%</span>
            </div>
            <div>
              <span className="text-muted-foreground block mb-0.5">Holders</span>
              <span className="text-foreground font-semibold">{pool.holders || '-'}</span>
            </div>
          </div>
          {/* Safety Reasons */}
          {pool.safetyReasons && pool.safetyReasons.length > 0 && (
            <div className="mt-2 p-2 bg-background/30 rounded text-xs">
              <span className="text-muted-foreground block mb-1">Safety Checks:</span>
              <div className="flex flex-wrap gap-1">
                {/* Deduplicate and sort safety reasons */}
                {[...new Set(pool.safetyReasons)]
                  .sort((a, b) => {
                    // Priority: ✅ first, then ⚠️, then ❌, then others
                    const priority = (s: string) => s.startsWith('✅') ? 0 : s.startsWith('⚠️') ? 1 : s.startsWith('❌') ? 2 : 3;
                    return priority(a) - priority(b);
                  })
                  .slice(0, 5) // Limit to 5 most important
                  .map((reason, idx) => (
                    <Badge 
                      key={idx} 
                      variant="outline" 
                      className={cn(
                        "text-[10px] px-1.5 py-0 h-5",
                        reason.startsWith('✅') && "border-success/40 text-success bg-success/5",
                        reason.startsWith('⚠️') && "border-warning/40 text-warning bg-warning/5",
                        reason.startsWith('❌') && "border-destructive/40 text-destructive bg-destructive/5"
                      )}
                    >
                      {reason}
                    </Badge>
                  ))}
              </div>
            </div>
          )}
          
          {/* Action Buttons */}
          <div className="flex items-center gap-2 mt-3">
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-8 text-xs gap-1.5"
              onClick={handleViewDetails}
            >
              <Eye className="w-3.5 h-3.5" />
              View Details
            </Button>
            <a 
              href={`https://solscan.io/token/${pool.address}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                <ExternalLink className="w-3.5 h-3.5" />
              </Button>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.pool.id === nextProps.pool.id &&
    prevProps.pool.priceChange24h === nextProps.pool.priceChange24h &&
    prevProps.pool.liquidity === nextProps.pool.liquidity &&
    prevProps.pool.riskScore === nextProps.pool.riskScore &&
    prevProps.pool.priceUsd === nextProps.pool.priceUsd &&
    prevProps.colorIndex === nextProps.colorIndex &&
    prevProps.isNew === nextProps.isNew
  );
});

PoolRow.displayName = 'PoolRow';

// Import formatters
import { 
  formatPercentage, 
  formatCurrency as formatCurrencyValue, 
  calculatePnLValue, 
  getTokenDisplayName, 
  getTokenDisplaySymbol,
  isPlaceholderText,
  shortAddress as formatShortAddress 
} from '@/lib/formatters';

// Legacy helpers (kept for pools display)
const shortAddress = (address: string) => formatShortAddress(address);
const isPlaceholder = (val: string | null | undefined) => isPlaceholderText(val);

// Memoized Trade Row with improved visibility - shows accurate USD values like Phantom
// CRITICAL: Derives USD values from amount × price to prevent 1000x magnitude bugs
const TradeRow = memo(({ trade, colorIndex, onExit }: { 
  trade: ActiveTradePosition; 
  colorIndex: number; 
  onExit?: (id: string, price: number) => void 
}) => {
  const actualTokenAmount = trade.amount;
  
  // CRITICAL FIX: Derive USD values from amount × price (source of truth)
  // entry_value/current_value fields can have mixed units causing 1000x errors
  // Use entry_price_usd when available (USD), fallback to entry_price
  const entryPriceUsd = trade.entry_price_usd ?? trade.entry_price;
  const currentPriceUsd = trade.current_price || entryPriceUsd;
  
  // Derive values consistently from amount × price (both in USD)
  const derivedEntryUsdValue = actualTokenAmount * entryPriceUsd;
  const derivedCurrentUsdValue = actualTokenAmount * currentPriceUsd;
  
  // Use derived values, with sanity check for reasonable values
  const entryUsdValue = Number.isFinite(derivedEntryUsdValue) && derivedEntryUsdValue > 0 
    ? derivedEntryUsdValue 
    : (trade.entry_value || 0);
  const currentUsdValue = Number.isFinite(derivedCurrentUsdValue) && derivedCurrentUsdValue > 0 
    ? derivedCurrentUsdValue 
    : (trade.current_value || 0);
  
  // USE the pre-calculated P&L from the hook - this is the source of truth
  const pnlPercent = trade.profit_loss_percent ?? 0;
  const isPositive = pnlPercent >= 0;
  
  // Use actual token name/symbol, fallback to formatted address
  const displaySymbol = getTokenDisplaySymbol(trade.token_symbol, trade.token_address);
  const displayName = getTokenDisplayName(trade.token_name, trade.token_address);
    
  const initials = displaySymbol.slice(0, 2).toUpperCase();
  const avatarClass = avatarColors[colorIndex % avatarColors.length];

  const handleExit = useCallback(() => {
    onExit?.(trade.id, trade.current_price);
  }, [onExit, trade.id, trade.current_price]);
  
  // Format token amount with appropriate precision
  const formatTokenAmount = (amount: number) => {
    if (amount >= 1000000) return `${(amount / 1000000).toFixed(2)}M`;
    if (amount >= 1000) return `${(amount / 1000).toFixed(2)}K`;
    if (amount >= 1) return amount.toFixed(2);
    if (amount >= 0.001) return amount.toFixed(5);
    return amount.toFixed(8);
  };
  
  // Format USD value with appropriate precision
  const formatUsdValue = (val: number) => {
    if (val >= 1000) return `$${val.toFixed(0)}`;
    if (val >= 1) return `$${val.toFixed(2)}`;
    if (val >= 0.01) return `$${val.toFixed(3)}`;
    return `$${val.toFixed(4)}`;
  };

  return (
    <div className="grid grid-cols-[40px_1fr_auto_auto] items-center gap-3 px-3 py-2.5 border-b border-border/20 hover:bg-secondary/30 transition-colors">
      {/* Avatar */}
      <div className={cn(
        "w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs border border-white/5",
        avatarClass
      )}>
        {initials}
      </div>
      
      {/* Token Info - Simplified: quantity + entry/current price */}
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground text-sm truncate">{displayName}</span>
          <span className="text-muted-foreground text-xs">{displaySymbol}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {/* Token quantity */}
          <span className="tabular-nums font-medium text-foreground/80">
            {formatTokenAmount(actualTokenAmount)} {displaySymbol}
          </span>
          <span className="text-muted-foreground/40">•</span>
          {/* Entry → Current price (not value, to avoid confusion) */}
          <span className="tabular-nums">
            {formatPrice(entryPriceUsd)} → {formatPrice(currentPriceUsd)}
          </span>
        </div>
      </div>
      
      {/* Current Value + P&L like Phantom wallet */}
      <div className="text-right min-w-[80px]">
        {/* Current USD value prominently */}
        <div className="font-bold text-sm tabular-nums text-foreground">
          ${currentUsdValue >= 1000 ? currentUsdValue.toFixed(0) : currentUsdValue >= 1 ? currentUsdValue.toFixed(2) : currentUsdValue.toFixed(4)}
        </div>
        {/* Simple P&L percentage only */}
        <div className={cn(
          "text-xs tabular-nums font-medium transition-all duration-300",
          isPositive ? 'text-success' : 'text-destructive'
        )}>
          {isPositive ? '+' : ''}{pnlPercent.toFixed(2)}%
        </div>
      </div>
      
      {/* Exit Button */}
      <Button
        variant="outline"
        size="sm"
        className="h-8 px-3 text-destructive border-destructive/30 hover:bg-destructive/10 hover:border-destructive/50"
        onClick={handleExit}
      >
        <LogOut className="w-3.5 h-3.5 mr-1.5" />
        <span className="text-xs font-medium">Exit</span>
      </Button>
    </div>
  );
}, (prevProps, nextProps) => {
  // STABLE COMPARISON: Only re-render when source-of-truth values change
  // entry_price_usd is primary for USD values, current_price for live updates
  return (
    prevProps.trade.id === nextProps.trade.id &&
    prevProps.trade.amount === nextProps.trade.amount &&
    prevProps.trade.current_price === nextProps.trade.current_price &&
    prevProps.trade.entry_price === nextProps.trade.entry_price &&
    prevProps.trade.entry_price_usd === nextProps.trade.entry_price_usd &&
    prevProps.trade.profit_loss_percent === nextProps.trade.profit_loss_percent &&
    prevProps.trade.token_name === nextProps.trade.token_name &&
    prevProps.trade.token_symbol === nextProps.trade.token_symbol &&
    prevProps.colorIndex === nextProps.colorIndex
  );
});

TradeRow.displayName = 'TradeRow';

// Initial loading skeleton
const PoolSkeleton = memo(() => (
  <div className="grid grid-cols-[40px_1fr_auto_auto] items-center gap-3 px-3 py-2.5 border-b border-border/20 animate-pulse">
    <div className="w-9 h-9 rounded-lg bg-secondary/60" />
    <div className="space-y-1.5">
      <div className="h-4 w-28 bg-secondary/60 rounded" />
      <div className="h-3 w-20 bg-secondary/40 rounded" />
    </div>
    <div className="flex gap-1.5">
      <div className="w-7 h-7 rounded bg-secondary/40" />
      <div className="w-10 h-5 rounded bg-secondary/40" />
    </div>
    <div className="text-right space-y-1">
      <div className="h-4 w-14 bg-secondary/60 rounded ml-auto" />
      <div className="h-3 w-12 bg-secondary/40 rounded ml-auto" />
    </div>
  </div>
));

PoolSkeleton.displayName = 'PoolSkeleton';

const LiquidityMonitor = forwardRef<HTMLDivElement, LiquidityMonitorProps>(function LiquidityMonitor({ 
  pools, 
  activeTrades, 
  waitingPositions = [],
  walletTokens = [],
  loadingWalletTokens = false,
  loading,
  apiStatus = 'waiting',
  onExitTrade,
  onRetryLiquidityCheck,
  onMoveBackFromWaiting,
  onManualSellWaiting,
  onRefreshWalletTokens,
  checkingLiquidity = false,
}, ref) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("pools");
  const [searchTerm, setSearchTerm] = useState("");
  const [isExpanded, setIsExpanded] = useState(true);
  const [displayCount, setDisplayCount] = useState(10);
  
  // Handle navigation to token detail page
  const handleViewDetails = useCallback((pool: ScannedToken) => {
    const tokenDataParam = encodeURIComponent(JSON.stringify(pool));
    navigate(`/token/${pool.address}?data=${tokenDataParam}`);
  }, [navigate]);
  
  // Track new tokens (added in last 5 seconds) - using refs to avoid re-renders
  const [newTokenIds, setNewTokenIds] = useState<Set<string>>(new Set());
  const prevPoolsLengthRef = useRef(pools.length);
  const clearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Update new token tracking with useEffect (proper side effect handling)
  useEffect(() => {
    // Only process when pools length increases (new tokens added)
    if (pools.length <= prevPoolsLengthRef.current) {
      prevPoolsLengthRef.current = pools.length;
      return;
    }
    prevPoolsLengthRef.current = pools.length;
    
    const now = Date.now();
    const fiveSecondsAgo = now - 5000;
    const newIds = new Set<string>();
    
    pools.forEach(pool => {
      const createdTime = new Date(pool.createdAt).getTime();
      if (createdTime > fiveSecondsAgo) {
        newIds.add(pool.id);
      }
    });
    
    if (newIds.size > 0) {
      setNewTokenIds(newIds);
      // Clear previous timeout
      if (clearTimeoutRef.current) {
        clearTimeout(clearTimeoutRef.current);
      }
      // Clear after 5 seconds
      clearTimeoutRef.current = setTimeout(() => setNewTokenIds(new Set()), 5000);
    }
    
    return () => {
      if (clearTimeoutRef.current) {
        clearTimeout(clearTimeoutRef.current);
      }
    };
  }, [pools]);
  
  // Memoize filtered pools
  const filteredPools = useMemo(() => 
    pools.filter(p => 
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.symbol.toLowerCase().includes(searchTerm.toLowerCase())
    ), [pools, searchTerm]
  );

  // Displayed pools based on display count
  const displayedPools = useMemo(() => 
    filteredPools.slice(0, displayCount), 
    [filteredPools, displayCount]
  );

  const hasMore = filteredPools.length > displayCount;

  // Memoize open trades - CRITICAL: Include both 'open' and 'pending', exclude 'closed'
  // This ensures the Active Trades list never shows closed positions
  const openTrades = useMemo(() => 
    activeTrades.filter(t => t.status === 'open' || t.status === 'pending'), 
    [activeTrades]
  );

  // Create set of active token addresses for exclusion in Waiting tab
  const activeTokenAddresses = useMemo(() => {
    const addresses = new Set<string>();
    for (const trade of openTrades) {
      addresses.add(trade.token_address.toLowerCase());
    }
    return addresses;
  }, [openTrades]);

  // Calculate combined waiting items count (positions + wallet tokens, excluding active and duplicates)
  const waitingItemsCount = useMemo(() => {
    const seenAddresses = new Set<string>();
    let count = 0;
    
    // Count waiting positions not in active trades
    for (const pos of waitingPositions) {
      const addr = pos.token_address.toLowerCase();
      if (!activeTokenAddresses.has(addr)) {
        seenAddresses.add(addr);
        count++;
      }
    }
    
    // Count wallet tokens not already counted or in active trades
    for (const token of (walletTokens || [])) {
      const addr = token.mint.toLowerCase();
      if (!seenAddresses.has(addr) && !activeTokenAddresses.has(addr)) {
        seenAddresses.add(addr);
        count++;
      }
    }
    
    return count;
  }, [waitingPositions, walletTokens, activeTokenAddresses]);

  // Memoize total P&L in actual USD (amount × current_price - amount × entry_price)
  const totalPnL = useMemo(() => 
    openTrades.reduce((sum, t) => {
      const currentVal = t.amount * t.current_price;
      const entryVal = t.amount * t.entry_price;
      return sum + (currentVal - entryVal);
    }, 0),
    [openTrades]
  );

  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
    setDisplayCount(10);
  }, []);

  const loadMore = useCallback(() => {
    setDisplayCount(prev => prev + 10);
  }, []);

  const getStatusBadge = () => {
    switch (apiStatus) {
      case 'active':
        return (
          <Badge className="bg-success/20 text-success border-success/30 text-[10px] px-2 py-0.5 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            Scanning
          </Badge>
        );
      case 'error':
        return <Badge className="bg-destructive/20 text-destructive border-destructive/30 text-[10px] px-2 py-0.5">Error</Badge>;
      case 'rate_limited':
        return <Badge className="bg-warning/20 text-warning border-warning/30 text-[10px] px-2 py-0.5">Rate Limited</Badge>;
      default:
        return <Badge className="bg-muted text-muted-foreground text-[10px] px-2 py-0.5">Idle</Badge>;
    }
  };

  return (
    <Card ref={ref} className="bg-card/80 backdrop-blur-sm border-border/50">
      <CardHeader className="pb-2 px-4 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20">
              <Zap className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">Liquidity Monitor</CardTitle>
              <p className="text-xs text-muted-foreground tabular-nums">
                {pools.length} pools detected • {openTrades.length} active trades
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {getStatusBadge()}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>
      
      {isExpanded && (
        <CardContent className="p-0">
          <Tabs value={activeTab} onValueChange={(val) => {
            setActiveTab(val);
            // Trigger wallet refresh when switching to waiting tab
            if (val === 'waiting' && onRefreshWalletTokens) {
              onRefreshWalletTokens();
            }
          }}>
            <div className="px-4 pb-2">
              <TabsList className="w-full bg-secondary/60 h-9">
                <TabsTrigger 
                  value="pools" 
                  className="flex-1 text-xs h-8 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  Pools ({filteredPools.length})
                </TabsTrigger>
                <TabsTrigger 
                  value="trades" 
                  className="flex-1 text-xs h-8 data-[state=active]:bg-success data-[state=active]:text-success-foreground"
                >
                  Active ({openTrades.length})
                </TabsTrigger>
                <TabsTrigger 
                  value="waiting" 
                  className={cn(
                    "flex-1 text-xs h-8 gap-1",
                    waitingItemsCount > 0 
                      ? "data-[state=active]:bg-warning data-[state=active]:text-warning-foreground"
                      : "data-[state=active]:bg-muted data-[state=active]:text-muted-foreground"
                  )}
                >
                  <Clock className="w-3 h-3" />
                  Waiting ({waitingItemsCount})
                </TabsTrigger>
              </TabsList>
            </div>
            
            <TabsContent value="pools" className="mt-0">
              {/* Search */}
              <div className="px-4 pb-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or symbol..."
                    value={searchTerm}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="pl-9 bg-secondary/40 border-border/30 h-9 text-sm"
                  />
                </div>
              </div>
              
              {/* Column Headers */}
              <div className="grid grid-cols-[40px_1fr_auto_auto] items-center gap-3 px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground border-y border-border/30 bg-secondary/20">
                <div></div>
                <div>Token</div>
                <div>Safety</div>
                <div className="text-right">24h / Liquidity</div>
              </div>
              
              {/* Pool List - No scroll, auto expand */}
              <div className="divide-y divide-border/10">
                {loading && pools.length === 0 ? (
                  // Only show skeleton on initial load
                  <>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <PoolSkeleton key={i} />
                    ))}
                  </>
                ) : displayedPools.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Zap className="w-10 h-10 mb-3 opacity-20" />
                    <p className="font-medium text-sm mb-1">
                      {searchTerm ? 'No matching pools' : 'No pools detected yet'}
                    </p>
                    <p className="text-xs text-muted-foreground/70">
                      {searchTerm ? 'Try a different search term' : 'Enable the bot to start scanning'}
                    </p>
                  </div>
                ) : (
                  displayedPools.map((pool, idx) => (
                    <PoolRow 
                      key={pool.id} 
                      pool={pool} 
                      colorIndex={idx}
                      isNew={newTokenIds.has(pool.id)}
                      onViewDetails={handleViewDetails}
                    />
                  ))
                )}
              </div>

              {/* Load More */}
              {hasMore && (
                <div className="px-4 py-3 border-t border-border/30">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadMore}
                    className="w-full h-8 text-xs"
                  >
                    Show more ({filteredPools.length - displayCount} remaining)
                  </Button>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="trades" className="mt-0">
              {/* Trade List - No scroll, auto expand */}
              <div className="divide-y divide-border/10">
                {openTrades.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <DollarSign className="w-10 h-10 mb-3 opacity-20" />
                    <p className="font-medium text-sm mb-1">No active trades</p>
                    <p className="text-xs text-muted-foreground/70">Trades will appear here when executed</p>
                  </div>
                ) : (
                  openTrades.map((trade, idx) => (
                    <TradeRow 
                      key={trade.id} 
                      trade={trade} 
                      colorIndex={idx} 
                      onExit={onExitTrade} 
                    />
                  ))
                )}
              </div>
              
              {/* Trades Summary */}
              {openTrades.length > 0 && (
                <div className="px-4 py-3 border-t border-border/30 bg-secondary/10">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Total P&L</span>
                    <span className={cn(
                      "font-bold text-sm tabular-nums",
                      totalPnL >= 0 ? 'text-success' : 'text-destructive'
                    )}>
                      {totalPnL >= 0 ? '+' : ''}{Math.abs(totalPnL) < 0.01 ? '<$0.01' : `$${totalPnL.toFixed(2)}`}
                    </span>
                  </div>
                </div>
              )}
            </TabsContent>
            
            {/* Waiting for Liquidity Tab */}
            <TabsContent value="waiting" className="mt-0">
              <WaitingLiquidityTab
                positions={waitingPositions}
                walletTokens={walletTokens}
                activeTokenAddresses={activeTokenAddresses}
                checking={checkingLiquidity}
                loadingWalletTokens={loadingWalletTokens}
                onRetryCheck={onRetryLiquidityCheck || (() => {})}
                onMoveBack={onMoveBackFromWaiting || (() => {})}
                onManualSell={onManualSellWaiting || (() => {})}
                onRefreshWalletTokens={onRefreshWalletTokens}
                isTabActive={activeTab === 'waiting'}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      )}
    </Card>
  );
});

LiquidityMonitor.displayName = 'LiquidityMonitor';

export default LiquidityMonitor;
