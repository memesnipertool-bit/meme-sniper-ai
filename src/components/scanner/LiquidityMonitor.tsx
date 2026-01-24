import { useState, useMemo, memo, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ScannedToken } from "@/hooks/useTokenScanner";
import { 
  Zap, TrendingUp, TrendingDown, ExternalLink, ShieldCheck, ShieldX, 
  Loader2, Search, LogOut, ChevronDown, ChevronUp, DollarSign, Eye,
  Activity, Clock, RefreshCw
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { fetchDexScreenerPrices, isLikelyRealSolanaMint } from "@/lib/dexscreener";

interface ActiveTradePosition {
  id: string;
  token_address: string;
  token_symbol: string;
  token_name: string;
  chain: string;
  entry_price: number;
  current_price: number;
  amount: number;
  entry_value: number;
  current_value: number;
  profit_loss_percent: number | null;
  profit_loss_value: number | null;
  profit_take_percent: number;
  stop_loss_percent: number;
  status: 'open' | 'closed' | 'pending';
  created_at: string;
}

interface LiquidityMonitorProps {
  pools: ScannedToken[];
  activeTrades: ActiveTradePosition[];
  loading: boolean;
  apiStatus: 'waiting' | 'active' | 'error' | 'rate_limited';
  onExitTrade?: (positionId: string, currentPrice: number) => void;
}

// Real-time price update interval (5 seconds for tick-by-tick feel)
const PRICE_UPDATE_INTERVAL = 5000;

const formatLiquidity = (value: number) => {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
};

const formatPrice = (value: number) => {
  if (!value || value === 0) return '$0.00';
  if (value < 0.00001) return `$${value.toExponential(2)}`;
  if (value < 0.01) return `$${value.toFixed(6)}`;
  if (value < 1) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
};

const formatVolume = (value: number) => {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
};

const avatarColors = [
  'bg-gradient-to-br from-primary/30 to-primary/10 text-primary',
  'bg-gradient-to-br from-blue-500/30 to-blue-500/10 text-blue-400',
  'bg-gradient-to-br from-purple-500/30 to-purple-500/10 text-purple-400',
  'bg-gradient-to-br from-orange-500/30 to-orange-500/10 text-orange-400',
  'bg-gradient-to-br from-pink-500/30 to-pink-500/10 text-pink-400',
  'bg-gradient-to-br from-cyan-500/30 to-cyan-500/10 text-cyan-400',
];

// Helper to generate short address format for fallback
const shortAddress = (address: string) => 
  address && address.length > 10 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address || 'TOKEN';

// Check if text is a placeholder
const isPlaceholder = (val: string | null | undefined) => {
  if (!val) return true;
  const v = val.trim();
  if (!v) return true;
  return /^(unknown|unknown token|token|\?\?\?|n\/a)$/i.test(v);
};

// Live price data type
interface LivePriceData {
  priceUsd: number;
  priceChange24h: number;
  previousPrice?: number;
  flashDirection?: 'up' | 'down' | null;
}

// Memoized Pool Row with live price + flash indicator
const PoolRow = memo(({ 
  pool, 
  colorIndex, 
  isNew, 
  onViewDetails,
  livePrice 
}: { 
  pool: ScannedToken; 
  colorIndex: number; 
  isNew?: boolean; 
  onViewDetails: (pool: ScannedToken) => void;
  livePrice?: LivePriceData;
}) => {
  const [expanded, setExpanded] = useState(false);
  
  // Use live price if available, otherwise fallback to pool data
  const currentPrice = livePrice?.priceUsd ?? pool.priceUsd;
  const priceChange = livePrice?.priceChange24h ?? pool.priceChange24h;
  const isPositive = priceChange >= 0;
  const flashDirection = livePrice?.flashDirection;
  
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
          "grid grid-cols-[36px_1fr_auto_auto] md:grid-cols-[40px_minmax(120px,1fr)_100px_80px_32px] items-center gap-2 md:gap-3 px-2 md:px-3 py-2 hover:bg-secondary/30 transition-all duration-200 cursor-pointer",
          isNew && "animate-fade-in bg-primary/5",
          flashDirection === 'up' && "bg-success/5",
          flashDirection === 'down' && "bg-destructive/5"
        )}
        onClick={() => setExpanded(!expanded)}
      >
        {/* Avatar */}
        <div className={cn(
          "w-9 h-9 rounded-lg flex items-center justify-center font-bold text-[10px] border border-white/5 shrink-0",
          avatarClass
        )}>
          {initials}
        </div>
        
        {/* Token Info */}
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-foreground text-xs truncate max-w-[80px]">{displaySymbol}</span>
            {isNew && (
              <Badge className="bg-primary/20 text-primary text-[8px] px-1 py-0 h-3.5">NEW</Badge>
            )}
            <Badge 
              variant="outline" 
              className={cn(
                "text-[8px] px-1 py-0 h-4 shrink-0",
                isTradeable && canBuy && canSell
                  ? "border-success/40 text-success bg-success/10" 
                  : "border-destructive/40 text-destructive bg-destructive/10"
              )}
            >
              {isTradeable && canBuy && canSell ? '✓' : '✗'}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="font-mono">{pool.address.slice(0, 4)}...{pool.address.slice(-3)}</span>
            {/* Safety indicator */}
            {honeypotSafe ? (
              <ShieldCheck className="w-3 h-3 text-success shrink-0" />
            ) : (
              <ShieldX className="w-3 h-3 text-destructive shrink-0" />
            )}
          </div>
        </div>
        
        {/* LIVE Price - Primary Column */}
        <div className="text-right">
          <div className={cn(
            "font-bold text-sm tabular-nums transition-all duration-300",
            flashDirection === 'up' && "text-success animate-pulse",
            flashDirection === 'down' && "text-destructive animate-pulse",
            !flashDirection && "text-foreground"
          )}>
            {formatPrice(currentPrice)}
          </div>
          <div className={cn(
            "flex items-center justify-end gap-0.5 text-[10px] tabular-nums font-medium",
            isPositive ? 'text-success' : 'text-destructive'
          )}>
            {isPositive ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
            {isPositive ? '+' : ''}{priceChange.toFixed(1)}%
          </div>
        </div>
        
        {/* Liquidity */}
        <div className="text-right">
          <div className="text-xs text-foreground tabular-nums font-semibold">
            {formatLiquidity(pool.liquidity)}
          </div>
          <div className="text-[10px] text-muted-foreground">
            R:{pool.riskScore}
          </div>
        </div>

        {/* Expand */}
        <ChevronDown className={cn(
          "w-4 h-4 text-muted-foreground transition-transform hidden md:block",
          expanded && "rotate-180"
        )} />
      </div>
      
      {/* Expanded Details */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 bg-secondary/20 animate-fade-in">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-2.5 bg-background/50 rounded-lg text-xs">
            <div>
              <span className="text-muted-foreground block text-[10px]">Volume 24h</span>
              <span className="font-semibold text-foreground">{formatVolume(pool.volume24h)}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[10px]">Market Cap</span>
              <span className="font-semibold text-foreground">{formatLiquidity(pool.marketCap)}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[10px]">Holders</span>
              <span className="font-semibold text-foreground">{pool.holders || '-'}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[10px]">Source</span>
              <span className="font-semibold text-purple-400">{pool.source || 'DEX'}</span>
            </div>
          </div>
          
          {/* Safety Reasons - Compact */}
          {pool.safetyReasons && pool.safetyReasons.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {[...new Set(pool.safetyReasons)]
                .slice(0, 3)
                .map((reason, idx) => (
                  <Badge 
                    key={idx} 
                    variant="outline" 
                    className={cn(
                      "text-[9px] px-1.5 py-0 h-4",
                      reason.startsWith('✅') && "border-success/40 text-success bg-success/5",
                      reason.startsWith('⚠️') && "border-warning/40 text-warning bg-warning/5",
                      reason.startsWith('❌') && "border-destructive/40 text-destructive bg-destructive/5"
                    )}
                  >
                    {reason.slice(0, 30)}
                  </Badge>
                ))}
            </div>
          )}
          
          {/* Actions */}
          <div className="flex items-center gap-2 mt-2">
            <Button size="sm" variant="outline" className="flex-1 h-7 text-xs gap-1" onClick={handleViewDetails}>
              <Eye className="w-3 h-3" /> Details
            </Button>
            <a 
              href={`https://solscan.io/token/${pool.address}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                <ExternalLink className="w-3 h-3" />
              </Button>
            </a>
          </div>
        </div>
      )}
    </div>
  );
});

PoolRow.displayName = 'PoolRow';

// Memoized Trade Row with live price + P&L
const TradeRow = memo(({ 
  trade, 
  colorIndex, 
  onExit,
  livePrice 
}: { 
  trade: ActiveTradePosition; 
  colorIndex: number; 
  onExit?: (id: string, price: number) => void;
  livePrice?: LivePriceData;
}) => {
  // Use live price if available
  const currentPrice = livePrice?.priceUsd ?? trade.current_price;
  const flashDirection = livePrice?.flashDirection;
  
  // Calculate real-time P&L
  const currentValue = trade.amount * currentPrice;
  const entryValue = trade.entry_value || trade.amount * trade.entry_price;
  const pnlValue = currentValue - entryValue;
  const pnlPercent = trade.entry_price > 0 
    ? ((currentPrice - trade.entry_price) / trade.entry_price) * 100 
    : 0;
  const isPositive = pnlPercent >= 0;
  
  const displaySymbol = isPlaceholder(trade.token_symbol) 
    ? shortAddress(trade.token_address) 
    : trade.token_symbol;
    
  const initials = displaySymbol.slice(0, 2).toUpperCase();
  const avatarClass = avatarColors[colorIndex % avatarColors.length];

  const handleExit = useCallback(() => {
    onExit?.(trade.id, currentPrice);
  }, [onExit, trade.id, currentPrice]);

  // Time held
  const timeHeld = useMemo(() => {
    const created = new Date(trade.created_at).getTime();
    const now = Date.now();
    const diffMs = now - created;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${diffMins}m`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h`;
    return `${Math.floor(diffHours / 24)}d`;
  }, [trade.created_at]);

  return (
    <div className={cn(
      "grid grid-cols-[36px_1fr_auto_auto] md:grid-cols-[40px_minmax(100px,1fr)_90px_80px_auto] items-center gap-2 md:gap-3 px-2 md:px-3 py-2.5 border-b border-border/20 hover:bg-secondary/30 transition-all duration-200",
      flashDirection === 'up' && "bg-success/5",
      flashDirection === 'down' && "bg-destructive/5"
    )}>
      {/* Avatar */}
      <div className={cn(
        "w-9 h-9 rounded-lg flex items-center justify-center font-bold text-[10px] border border-white/5 shrink-0",
        avatarClass
      )}>
        {initials}
      </div>
      
      {/* Token Info */}
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-foreground text-xs">{displaySymbol}</span>
          <Badge variant="outline" className="text-[8px] px-1 py-0 h-4 text-muted-foreground">
            <Clock className="w-2 h-2 mr-0.5" />{timeHeld}
          </Badge>
        </div>
        <div className="text-[10px] text-muted-foreground tabular-nums flex items-center gap-1">
          <span>Entry: {formatPrice(trade.entry_price)}</span>
        </div>
      </div>
      
      {/* LIVE Current Price */}
      <div className="text-right">
        <div className={cn(
          "font-bold text-sm tabular-nums transition-all duration-300",
          flashDirection === 'up' && "text-success animate-pulse",
          flashDirection === 'down' && "text-destructive animate-pulse",
          !flashDirection && "text-foreground"
        )}>
          {formatPrice(currentPrice)}
        </div>
        <div className={cn(
          "flex items-center justify-end gap-0.5 text-[10px] tabular-nums font-medium",
          isPositive ? 'text-success' : 'text-destructive'
        )}>
          {isPositive ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
          {isPositive ? '+' : ''}{pnlPercent.toFixed(1)}%
        </div>
      </div>
      
      {/* P&L Value */}
      <div className="text-right">
        <div className={cn(
          "font-bold text-sm tabular-nums",
          isPositive ? 'text-success' : 'text-destructive'
        )}>
          {isPositive ? '+' : ''}${Math.abs(pnlValue).toFixed(2)}
        </div>
        <div className="text-[10px] text-muted-foreground tabular-nums">
          ${currentValue.toFixed(2)}
        </div>
      </div>
      
      {/* Exit Button */}
      <Button
        variant="outline"
        size="sm"
        className="h-7 px-2 text-destructive border-destructive/30 hover:bg-destructive/10 shrink-0"
        onClick={handleExit}
      >
        <LogOut className="w-3 h-3" />
      </Button>
    </div>
  );
});

TradeRow.displayName = 'TradeRow';

// Loading skeleton
const PoolSkeleton = memo(() => (
  <div className="grid grid-cols-[40px_1fr_100px_80px] items-center gap-3 px-3 py-2.5 border-b border-border/20 animate-pulse">
    <div className="w-9 h-9 rounded-lg bg-secondary/60" />
    <div className="space-y-1.5">
      <div className="h-4 w-24 bg-secondary/60 rounded" />
      <div className="h-3 w-16 bg-secondary/40 rounded" />
    </div>
    <div className="text-right space-y-1">
      <div className="h-4 w-16 bg-secondary/60 rounded ml-auto" />
      <div className="h-3 w-12 bg-secondary/40 rounded ml-auto" />
    </div>
    <div className="text-right space-y-1">
      <div className="h-4 w-12 bg-secondary/40 rounded ml-auto" />
      <div className="h-3 w-8 bg-secondary/30 rounded ml-auto" />
    </div>
  </div>
));

PoolSkeleton.displayName = 'PoolSkeleton';

export default function LiquidityMonitor({ 
  pools, 
  activeTrades, 
  loading,
  apiStatus = 'waiting',
  onExitTrade
}: LiquidityMonitorProps) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("pools");
  const [searchTerm, setSearchTerm] = useState("");
  const [isExpanded, setIsExpanded] = useState(true);
  const [displayCount, setDisplayCount] = useState(10);
  const [lastPriceUpdate, setLastPriceUpdate] = useState<Date | null>(null);
  
  // Live price state - stores real-time prices for all tokens
  const [livePrices, setLivePrices] = useState<Map<string, LivePriceData>>(new Map());
  const previousPricesRef = useRef<Map<string, number>>(new Map());
  
  // Handle navigation to token detail page
  const handleViewDetails = useCallback((pool: ScannedToken) => {
    const tokenDataParam = encodeURIComponent(JSON.stringify(pool));
    navigate(`/token/${pool.address}?data=${tokenDataParam}`);
  }, [navigate]);
  
  // Track new tokens (added in last 5 seconds)
  const [newTokenIds, setNewTokenIds] = useState<Set<string>>(new Set());
  
  // Update new token tracking
  useMemo(() => {
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
      setTimeout(() => setNewTokenIds(new Set()), 5000);
    }
  }, [pools.length]);

  // Real-time price updates for pools
  const updateLivePrices = useCallback(async () => {
    // Get all unique addresses from pools and active trades
    const allAddresses = [
      ...pools.map(p => p.address),
      ...activeTrades.filter(t => t.status === 'open').map(t => t.token_address)
    ].filter((addr, i, arr) => 
      arr.indexOf(addr) === i && isLikelyRealSolanaMint(addr)
    );

    if (allAddresses.length === 0) return;

    try {
      const priceMap = await fetchDexScreenerPrices(allAddresses, { timeoutMs: 4000 });
      
      if (priceMap.size === 0) return;

      setLivePrices(prev => {
        const newPrices = new Map<string, LivePriceData>();
        
        priceMap.forEach((data, address) => {
          const previousPrice = previousPricesRef.current.get(address);
          let flashDirection: 'up' | 'down' | null = null;
          
          // Determine flash direction based on price change
          if (previousPrice && data.priceUsd !== previousPrice) {
            flashDirection = data.priceUsd > previousPrice ? 'up' : 'down';
          }
          
          newPrices.set(address, {
            priceUsd: data.priceUsd,
            priceChange24h: data.priceChange24h,
            previousPrice,
            flashDirection,
          });
          
          // Update previous prices for next comparison
          previousPricesRef.current.set(address, data.priceUsd);
        });
        
        // Clear flash after 1 second
        setTimeout(() => {
          setLivePrices(current => {
            const clearedPrices = new Map(current);
            clearedPrices.forEach((val, key) => {
              if (val.flashDirection) {
                clearedPrices.set(key, { ...val, flashDirection: null });
              }
            });
            return clearedPrices;
          });
        }, 1000);
        
        return newPrices;
      });
      
      setLastPriceUpdate(new Date());
    } catch (err) {
      console.log('Live price update failed (non-critical):', err);
    }
  }, [pools, activeTrades]);

  // Set up real-time price polling
  useEffect(() => {
    // Initial fetch after 1 second
    const initialTimeout = setTimeout(updateLivePrices, 1000);
    
    // Then poll every 5 seconds
    const interval = setInterval(updateLivePrices, PRICE_UPDATE_INTERVAL);
    
    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [updateLivePrices]);
  
  // Memoize filtered pools
  const filteredPools = useMemo(() => 
    pools.filter(p => 
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.symbol.toLowerCase().includes(searchTerm.toLowerCase())
    ), [pools, searchTerm]
  );

  const displayedPools = useMemo(() => 
    filteredPools.slice(0, displayCount), 
    [filteredPools, displayCount]
  );

  const hasMore = filteredPools.length > displayCount;

  const openTrades = useMemo(() => 
    activeTrades.filter(t => t.status === 'open'), 
    [activeTrades]
  );

  // Calculate total P&L using live prices
  const totalPnL = useMemo(() => 
    openTrades.reduce((sum, t) => {
      const livePrice = livePrices.get(t.token_address);
      const currentPrice = livePrice?.priceUsd ?? t.current_price;
      const currentValue = t.amount * currentPrice;
      const entryValue = t.entry_value || t.amount * t.entry_price;
      return sum + (currentValue - entryValue);
    }, 0),
    [openTrades, livePrices]
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
            Live
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
    <Card className="bg-card/80 backdrop-blur-sm border-border/50">
      <CardHeader className="pb-2 px-4 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20">
              <Activity className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">Liquidity Monitor</CardTitle>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="tabular-nums">{pools.length} pools</span>
                <span>•</span>
                <span className="tabular-nums">{openTrades.length} trades</span>
                {lastPriceUpdate && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <RefreshCw className="w-3 h-3" />
                      {lastPriceUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </>
                )}
              </div>
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
          <Tabs value={activeTab} onValueChange={setActiveTab}>
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
              </TabsList>
            </div>
            
            <TabsContent value="pools" className="mt-0">
              {/* Search */}
              <div className="px-4 pb-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search tokens..."
                    value={searchTerm}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="pl-9 bg-secondary/40 border-border/30 h-9 text-sm"
                  />
                </div>
              </div>
              
              {/* Column Headers */}
              <div className="grid grid-cols-[40px_1fr_100px_80px_32px] items-center gap-3 px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground border-y border-border/30 bg-secondary/20">
                <div></div>
                <div>Token</div>
                <div className="text-right">Price</div>
                <div className="text-right">Liq / Risk</div>
                <div className="hidden md:block"></div>
              </div>
              
              {/* Pool List */}
              <div className="divide-y divide-border/10">
                {loading && pools.length === 0 ? (
                  <>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <PoolSkeleton key={i} />
                    ))}
                  </>
                ) : displayedPools.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Zap className="w-10 h-10 mb-3 opacity-20" />
                    <p className="font-medium text-sm mb-1">
                      {searchTerm ? 'No matching pools' : 'No pools detected'}
                    </p>
                    <p className="text-xs text-muted-foreground/70">
                      {searchTerm ? 'Try a different search' : 'Enable scanner to start'}
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
                      livePrice={livePrices.get(pool.address)}
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
              {/* Column Headers for Trades */}
              <div className="grid grid-cols-[40px_1fr_90px_80px_auto] items-center gap-3 px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground border-y border-border/30 bg-secondary/20">
                <div></div>
                <div>Position</div>
                <div className="text-right">Price</div>
                <div className="text-right">P&L</div>
                <div></div>
              </div>
              
              {/* Trade List */}
              <div className="divide-y divide-border/10">
                {openTrades.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <DollarSign className="w-10 h-10 mb-3 opacity-20" />
                    <p className="font-medium text-sm mb-1">No active trades</p>
                    <p className="text-xs text-muted-foreground/70">Trades appear here when executed</p>
                  </div>
                ) : (
                  openTrades.map((trade, idx) => (
                    <TradeRow 
                      key={trade.id} 
                      trade={trade} 
                      colorIndex={idx} 
                      onExit={onExitTrade}
                      livePrice={livePrices.get(trade.token_address)}
                    />
                  ))
                )}
              </div>
              
              {/* Trades Summary */}
              {openTrades.length > 0 && (
                <div className="px-4 py-3 border-t border-border/30 bg-secondary/10">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Total P&L (Live)</span>
                    <span className={cn(
                      "font-bold text-sm tabular-nums",
                      totalPnL >= 0 ? 'text-success' : 'text-destructive'
                    )}>
                      {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}
                    </span>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      )}
    </Card>
  );
}
