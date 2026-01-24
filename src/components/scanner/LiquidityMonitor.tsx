import { useState, useMemo, memo, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ScannedToken } from "@/hooks/useTokenScanner";
import { 
  Zap, TrendingUp, TrendingDown, ExternalLink, ShieldCheck, ShieldX, 
  Loader2, Search, LogOut, DollarSign, Eye,
  Activity, Clock, RefreshCw, BarChart3, Users
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
  'bg-gradient-to-br from-primary/40 to-primary/20 text-primary',
  'bg-gradient-to-br from-blue-500/40 to-blue-500/20 text-blue-400',
  'bg-gradient-to-br from-purple-500/40 to-purple-500/20 text-purple-400',
  'bg-gradient-to-br from-orange-500/40 to-orange-500/20 text-orange-400',
  'bg-gradient-to-br from-pink-500/40 to-pink-500/20 text-pink-400',
  'bg-gradient-to-br from-cyan-500/40 to-cyan-500/20 text-cyan-400',
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

// Memoized Pool Row - production-grade design with better info density
const PoolRow = memo(({ 
  pool, 
  colorIndex, 
  isNew,
  revealDelay,
  onViewDetails,
  livePrice 
}: { 
  pool: ScannedToken; 
  colorIndex: number; 
  isNew?: boolean;
  revealDelay?: number;
  onViewDetails: (pool: ScannedToken) => void;
  livePrice?: LivePriceData;
}) => {
  const [isVisible, setIsVisible] = useState(revealDelay === undefined);
  
  // Staggered reveal animation
  useEffect(() => {
    if (revealDelay !== undefined) {
      const timer = setTimeout(() => setIsVisible(true), revealDelay);
      return () => clearTimeout(timer);
    }
  }, [revealDelay]);
  
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

  const handleViewDetails = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onViewDetails(pool);
  }, [onViewDetails, pool]);

  if (!isVisible) {
    return (
      <div className="h-[52px] border-b border-border/10" />
    );
  }

  return (
    <div 
      className={cn(
        "grid grid-cols-[32px_1fr] gap-2 px-2 py-2 border-b border-border/10 hover:bg-secondary/40 transition-all duration-300 cursor-pointer group",
        isNew && "bg-primary/5 border-l-2 border-l-primary",
        flashDirection === 'up' && "bg-success/10",
        flashDirection === 'down' && "bg-destructive/10",
        "animate-fade-in"
      )}
      onClick={handleViewDetails}
    >
      {/* Avatar */}
      <div className={cn(
        "w-8 h-8 rounded-lg flex items-center justify-center font-bold text-[10px] border border-white/10 shrink-0",
        avatarClass
      )}>
        {initials}
      </div>
      
      {/* Token Info - Dense Layout */}
      <div className="min-w-0 flex flex-col justify-center gap-0.5">
        {/* Row 1: Symbol + Price + Change */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-bold text-foreground text-xs truncate">{displaySymbol}</span>
            {isNew && (
              <Badge className="bg-primary/30 text-primary text-[8px] px-1 py-0 h-3.5 shrink-0">NEW</Badge>
            )}
            {honeypotSafe ? (
              <ShieldCheck className="w-3 h-3 text-success shrink-0" />
            ) : (
              <ShieldX className="w-3 h-3 text-destructive shrink-0" />
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={cn(
              "font-bold text-xs tabular-nums transition-colors duration-200",
              flashDirection === 'up' && "text-success",
              flashDirection === 'down' && "text-destructive",
              !flashDirection && "text-foreground"
            )}>
              {formatPrice(currentPrice)}
            </span>
            <span className={cn(
              "text-[10px] tabular-nums font-semibold min-w-[42px] text-right",
              isPositive ? 'text-success' : 'text-destructive'
            )}>
              {isPositive ? '+' : ''}{priceChange.toFixed(1)}%
            </span>
          </div>
        </div>
        
        {/* Row 2: Stats - Liq | Vol | MCap | Risk */}
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground/60">Liq:</span>
            <span className="font-medium text-foreground/80">{formatLiquidity(pool.liquidity)}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground/60">Vol:</span>
            <span className="font-medium text-foreground/80">{formatVolume(pool.volume24h)}</span>
          </div>
          {pool.marketCap > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground/60">MCap:</span>
              <span className="font-medium text-foreground/80">{formatLiquidity(pool.marketCap)}</span>
            </div>
          )}
          <div className="flex items-center gap-1 ml-auto">
            <span className={cn(
              "font-medium px-1.5 py-0.5 rounded text-[9px]",
              pool.riskScore < 30 && "bg-success/20 text-success",
              pool.riskScore >= 30 && pool.riskScore < 60 && "bg-warning/20 text-warning",
              pool.riskScore >= 60 && "bg-destructive/20 text-destructive"
            )}>
              R:{pool.riskScore}
            </span>
            <Badge 
              variant="outline" 
              className={cn(
                "text-[8px] px-1 py-0 h-4",
                isTradeable && canBuy && canSell
                  ? "border-success/50 text-success bg-success/10" 
                  : "border-destructive/50 text-destructive bg-destructive/10"
              )}
            >
              {isTradeable && canBuy && canSell ? '✓ Trade' : '✗'}
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );
});

PoolRow.displayName = 'PoolRow';

// Memoized Trade Row - aligned with Pool row layout
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
  // Use live price if available - no state-based animation to avoid blinking
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
    <div 
      className={cn(
        "grid grid-cols-[32px_1fr_auto] gap-2 px-2 py-2 border-b border-border/10 hover:bg-secondary/40 transition-colors duration-200 group",
        flashDirection === 'up' && "bg-success/10",
        flashDirection === 'down' && "bg-destructive/10"
      )}
    >
      {/* Avatar - same size as Pool */}
      <div className={cn(
        "w-8 h-8 rounded-lg flex items-center justify-center font-bold text-[10px] border border-white/10 shrink-0",
        avatarClass
      )}>
        {initials}
      </div>
      
      {/* Token Info - Dense Layout aligned with Pool */}
      <div className="min-w-0 flex flex-col justify-center gap-0.5">
        {/* Row 1: Symbol + Current Price + P&L % */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-bold text-foreground text-xs truncate">{displaySymbol}</span>
            <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 text-muted-foreground shrink-0">
              <Clock className="w-2 h-2 mr-0.5" />{timeHeld}
            </Badge>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={cn(
              "font-bold text-xs tabular-nums transition-colors duration-200",
              flashDirection === 'up' && "text-success",
              flashDirection === 'down' && "text-destructive",
              !flashDirection && "text-foreground"
            )}>
              {formatPrice(currentPrice)}
            </span>
            <span className={cn(
              "text-[10px] tabular-nums font-bold min-w-[42px] text-right",
              isPositive ? 'text-success' : 'text-destructive'
            )}>
              {isPositive ? '+' : ''}{pnlPercent.toFixed(1)}%
            </span>
          </div>
        </div>
        
        {/* Row 2: Entry | Value | P&L $ */}
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground/60">Entry:</span>
            <span className="font-medium text-foreground/80 tabular-nums">{formatPrice(trade.entry_price)}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground/60">Value:</span>
            <span className="font-medium text-foreground/80 tabular-nums">${currentValue.toFixed(2)}</span>
          </div>
          <div className="flex items-center gap-1 ml-auto">
            <span className={cn(
              "font-bold tabular-nums",
              isPositive ? 'text-success' : 'text-destructive'
            )}>
              {isPositive ? '+' : ''}${Math.abs(pnlValue).toFixed(2)}
            </span>
          </div>
        </div>
      </div>
      
      {/* Exit Button */}
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 text-destructive/70 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity self-center"
        onClick={handleExit}
      >
        <LogOut className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
});

TradeRow.displayName = 'TradeRow';

// Loading skeleton - compact
const PoolSkeleton = memo(() => (
  <div className="grid grid-cols-[32px_1fr] gap-2 px-2 py-2 border-b border-border/10 animate-pulse">
    <div className="w-8 h-8 rounded-lg bg-secondary/60" />
    <div className="space-y-1.5">
      <div className="h-4 w-full max-w-[200px] bg-secondary/60 rounded" />
      <div className="h-3 w-full max-w-[280px] bg-secondary/40 rounded" />
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
  
  // Track revealed pool IDs for staggered animation
  const [revealedPoolIds, setRevealedPoolIds] = useState<Set<string>>(new Set());
  
  // Handle navigation to token detail page
  const handleViewDetails = useCallback((pool: ScannedToken) => {
    const tokenDataParam = encodeURIComponent(JSON.stringify(pool));
    navigate(`/token/${pool.address}?data=${tokenDataParam}`);
  }, [navigate]);
  
  // Track new tokens (added in last 5 seconds)
  const [newTokenIds, setNewTokenIds] = useState<Set<string>>(new Set());
  
  // Update new token tracking and reveal animation
  useEffect(() => {
    const now = Date.now();
    const fiveSecondsAgo = now - 5000;
    const newIds = new Set<string>();
    
    pools.forEach(pool => {
      const createdTime = new Date(pool.createdAt).getTime();
      if (createdTime > fiveSecondsAgo) {
        newIds.add(pool.id);
      }
      
      // Mark as revealed for staggered animation
      if (!revealedPoolIds.has(pool.id)) {
        setRevealedPoolIds(prev => new Set([...prev, pool.id]));
      }
    });
    
    if (newIds.size > 0) {
      setNewTokenIds(newIds);
      const timer = setTimeout(() => setNewTokenIds(new Set()), 5000);
      return () => clearTimeout(timer);
    }
  }, [pools]);

  // Real-time price updates - stable implementation to prevent blinking
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

      // Batch update to prevent multiple re-renders
      const newPrices = new Map<string, LivePriceData>();
      
      priceMap.forEach((data, address) => {
        const previousPrice = previousPricesRef.current.get(address);
        let flashDirection: 'up' | 'down' | null = null;
        
        // Only flash if there's a meaningful price change (> 0.01%)
        if (previousPrice && Math.abs((data.priceUsd - previousPrice) / previousPrice) > 0.0001) {
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
      
      setLivePrices(newPrices);
      setLastPriceUpdate(new Date());
      
      // Clear flash after 800ms
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
      }, 800);
    } catch (err) {
      console.log('Live price update (non-critical):', err);
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
    <Card className="bg-card/90 backdrop-blur-sm border-border/50">
      <CardHeader className="pb-2 px-3 pt-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20">
              <Activity className="w-4 h-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">Liquidity Monitor</CardTitle>
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span className="tabular-nums">{pools.length} pools</span>
                <span className="text-border">•</span>
                <span className="tabular-nums">{openTrades.length} active</span>
                {lastPriceUpdate && (
                  <>
                    <span className="text-border">•</span>
                    <RefreshCw className="w-2.5 h-2.5" />
                    <span>{lastPriceUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          {getStatusBadge()}
        </div>
      </CardHeader>
      
      {isExpanded && (
        <CardContent className="p-0">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="px-3 pb-2">
              <TabsList className="w-full bg-secondary/60 h-8">
                <TabsTrigger 
                  value="pools" 
                  className="flex-1 text-xs h-7 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1"
                >
                  <BarChart3 className="w-3 h-3" />
                  Pools ({filteredPools.length})
                </TabsTrigger>
                <TabsTrigger 
                  value="trades" 
                  className="flex-1 text-xs h-7 data-[state=active]:bg-success data-[state=active]:text-success-foreground gap-1"
                >
                  <DollarSign className="w-3 h-3" />
                  Active ({openTrades.length})
                </TabsTrigger>
              </TabsList>
            </div>
            
            <TabsContent value="pools" className="mt-0">
              {/* Search */}
              <div className="px-3 pb-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search tokens..."
                    value={searchTerm}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="pl-8 bg-secondary/40 border-border/30 h-8 text-xs"
                  />
                </div>
              </div>
              
              {/* Pool List */}
              <div className="max-h-[400px] overflow-y-auto">
                {loading && pools.length === 0 ? (
                  <>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <PoolSkeleton key={i} />
                    ))}
                  </>
                ) : displayedPools.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                    <Zap className="w-8 h-8 mb-2 opacity-20" />
                    <p className="font-medium text-xs mb-0.5">
                      {searchTerm ? 'No matching pools' : 'No pools detected'}
                    </p>
                    <p className="text-[10px] text-muted-foreground/70">
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
                      revealDelay={!revealedPoolIds.has(pool.id) ? idx * 50 : undefined}
                      onViewDetails={handleViewDetails}
                      livePrice={livePrices.get(pool.address)}
                    />
                  ))
                )}
              </div>

              {/* Load More */}
              {hasMore && (
                <div className="px-3 py-2 border-t border-border/30">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={loadMore}
                    className="w-full h-7 text-xs text-muted-foreground"
                  >
                    Show more ({filteredPools.length - displayCount} remaining)
                  </Button>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="trades" className="mt-0">
              {/* Trade List */}
              <div className="max-h-[400px] overflow-y-auto">
                {openTrades.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                    <DollarSign className="w-8 h-8 mb-2 opacity-20" />
                    <p className="font-medium text-xs mb-0.5">No active trades</p>
                    <p className="text-[10px] text-muted-foreground/70">Trades appear here when executed</p>
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
                <div className="px-3 py-2 border-t border-border/30 bg-secondary/20">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">Total P&L (Live)</span>
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
