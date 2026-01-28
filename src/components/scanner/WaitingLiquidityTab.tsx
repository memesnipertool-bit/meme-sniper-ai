import { memo, useCallback, useMemo, useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Clock, RefreshCw, ArrowLeft, Zap, Wallet, ChevronDown, ChevronUp, ExternalLink, Check, X, AlertCircle, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import type { WaitingPosition } from "@/hooks/useLiquidityRetryWorker";
import type { WalletToken } from "@/hooks/useWalletTokens";
import { fetchDexScreenerTokenMetadata, fetchDexScreenerPrices, isPlaceholderTokenText } from "@/lib/dexscreener";

export interface CombinedWaitingItem {
  id: string;
  token_address: string;
  token_symbol: string | null;
  token_name: string | null;
  amount: number;
  entry_price: number;
  current_price: number;
  profit_loss_percent: number | null;
  priceChange24h: number | null; // NEW: 24h price change from DexScreener
  liquidity_last_checked_at: string | null;
  liquidity_check_count: number;
  waiting_for_liquidity_since: string | null;
  status: string;
  isWalletToken: boolean;
  valueUsd: number | null;
}

interface RouteStatus {
  jupiter: 'checking' | 'available' | 'unavailable' | 'unknown';
  raydium: 'checking' | 'available' | 'unavailable' | 'unknown';
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
  isTabActive?: boolean;
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

const formatAmount = (value: number) => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
};

const shortAddress = (address: string) => `${address.slice(0, 4)}...${address.slice(-4)}`;

// Route status indicator component
const RouteIndicator = memo(({ status, label }: { status: 'checking' | 'available' | 'unavailable' | 'unknown'; label: string }) => {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground text-xs">{label}:</span>
      {status === 'checking' && (
        <span className="flex items-center gap-1 text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span className="text-xs">Checking</span>
        </span>
      )}
      {status === 'available' && (
        <span className="flex items-center gap-1 text-success">
          <Check className="w-3.5 h-3.5" />
          <span className="text-xs font-medium">Available</span>
        </span>
      )}
      {status === 'unavailable' && (
        <span className="flex items-center gap-1 text-destructive">
          <X className="w-3.5 h-3.5" />
          <span className="text-xs font-medium">No Route</span>
        </span>
      )}
      {status === 'unknown' && (
        <span className="flex items-center gap-1 text-muted-foreground">
          <AlertCircle className="w-3.5 h-3.5" />
          <span className="text-xs">Unknown</span>
        </span>
      )}
    </div>
  );
});
RouteIndicator.displayName = 'RouteIndicator';

// Check Jupiter route availability
async function checkJupiterRoute(tokenAddress: string): Promise<boolean> {
  try {
    const SOL_MINT = 'So11111111111111111111111111111111111111112';
    const url = `https://lite-api.jup.ag/swap/v1/quote?inputMint=${tokenAddress}&outputMint=${SOL_MINT}&amount=1000000&slippageBps=1500`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return false;
    const data = await res.json();
    return !!data?.routePlan && data.routePlan.length > 0;
  } catch {
    return false;
  }
}

// Check Raydium route availability
async function checkRaydiumRoute(tokenAddress: string): Promise<boolean> {
  try {
    const SOL_MINT = 'So11111111111111111111111111111111111111112';
    const url = `https://transaction-v1.raydium.io/compute/swap-base-in?inputMint=${tokenAddress}&outputMint=${SOL_MINT}&amount=1000000&slippageBps=1500&txVersion=V0`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return false;
    const data = await res.json();
    return data?.success === true;
  } catch {
    return false;
  }
}

const WaitingPositionRow = memo(({ 
  item, 
  colorIndex, 
  onMoveBack, 
  onManualSell,
  routeStatus,
  onCheckRoutes,
}: { 
  item: CombinedWaitingItem; 
  colorIndex: number;
  onMoveBack: (id: string) => void;
  onManualSell: (item: CombinedWaitingItem) => void;
  routeStatus: RouteStatus;
  onCheckRoutes: () => void;
}) => {
  const [expanded, setExpanded] = useState(false);
  
  // Better display logic - prioritize actual names over placeholders
  const hasRealSymbol = item.token_symbol && 
                        !item.token_symbol.includes('...') && 
                        !isPlaceholderTokenText(item.token_symbol);
  const hasRealName = item.token_name && 
                      !item.token_name.startsWith('Token ') && 
                      !isPlaceholderTokenText(item.token_name);
  
  const displaySymbol = hasRealSymbol ? item.token_symbol! : shortAddress(item.token_address);
  const displayName = hasRealName ? item.token_name! : (hasRealSymbol ? item.token_symbol! : shortAddress(item.token_address));
  const initials = hasRealSymbol 
    ? item.token_symbol!.slice(0, 2).toUpperCase() 
    : item.token_address.slice(0, 2).toUpperCase();
  const avatarClass = avatarColors[colorIndex % avatarColors.length];

  const waitingSince = item.waiting_for_liquidity_since 
    ? formatDistanceToNow(new Date(item.waiting_for_liquidity_since), { addSuffix: true })
    : null;

  const lastChecked = item.liquidity_last_checked_at
    ? formatDistanceToNow(new Date(item.liquidity_last_checked_at), { addSuffix: true })
    : 'Never';

  const handleMoveBack = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onMoveBack(item.id);
  }, [onMoveBack, item.id]);

  const handleManualSell = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onManualSell(item);
  }, [onManualSell, item]);

  const hasRoute = routeStatus.jupiter === 'available' || routeStatus.raydium === 'available';

  return (
    <div className="border-b border-border/20">
      <div 
        className={cn(
          "grid grid-cols-[40px_1fr_auto] items-center gap-3 px-3 py-3 hover:bg-secondary/30 transition-colors cursor-pointer",
          expanded && "bg-secondary/20"
        )}
        onClick={() => setExpanded(!expanded)}
      >
        {/* Avatar */}
        <div className={cn(
          "w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs border border-white/5",
          avatarClass
        )}>
          {initials}
        </div>
        
        {/* Token Info */}
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-foreground text-sm truncate max-w-[180px]">{displayName}</span>
            {hasRealSymbol && displayName !== displaySymbol && (
              <span className="text-muted-foreground text-xs">${displaySymbol}</span>
            )}
            {!hasRealSymbol && (
              <span className="text-muted-foreground text-xs font-mono">{shortAddress(item.token_address)}</span>
            )}
            {item.isWalletToken ? (
              <Badge variant="outline" className="bg-blue-500/10 border-blue-500/30 text-blue-400 text-[9px] px-1.5 shrink-0">
                <Wallet className="w-3 h-3 mr-1" />
                Wallet
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-warning/10 border-warning/30 text-warning text-[9px] px-1.5 shrink-0">
                <Clock className="w-3 h-3 mr-1" />
                Waiting
              </Badge>
            )}
            {/* Route status indicator */}
            {hasRoute && (
              <Badge variant="outline" className="bg-success/10 border-success/30 text-success text-[9px] px-1.5 shrink-0">
                <Check className="w-3 h-3 mr-1" />
                Route
              </Badge>
            )}
          </div>
          
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{formatAmount(item.amount)} tokens</span>
            {item.current_price > 0 && (
              <>
                <span className="text-muted-foreground/40">•</span>
                <span>{formatPrice(item.current_price)}</span>
              </>
            )}
            {/* 24h Price Change - show accurate data like Phantom */}
            {item.priceChange24h !== null && (
              <>
                <span className="text-muted-foreground/40">•</span>
                <span className={cn(
                  "flex items-center gap-0.5 font-medium",
                  item.priceChange24h >= 0 ? "text-success" : "text-destructive"
                )}>
                  {item.priceChange24h >= 0 ? (
                    <TrendingUp className="w-3 h-3" />
                  ) : (
                    <TrendingDown className="w-3 h-3" />
                  )}
                  {item.priceChange24h >= 0 ? '+' : ''}{item.priceChange24h.toFixed(2)}%
                </span>
              </>
            )}
            {item.valueUsd !== null && item.valueUsd > 0 && (
              <>
                <span className="text-muted-foreground/40">•</span>
                <span className="text-foreground font-medium">{formatValue(item.valueUsd)}</span>
              </>
            )}
            {!item.isWalletToken && waitingSince && (
              <>
                <span className="text-muted-foreground/40">•</span>
                <span className="text-warning/70">Waiting {waitingSince}</span>
              </>
            )}
          </div>
        </div>
        
        {/* Expand indicator */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-7 px-2 text-xs gap-1",
              hasRoute 
                ? "border-success/30 text-success hover:bg-success/10" 
                : "border-warning/30 text-warning hover:bg-warning/10"
            )}
            onClick={handleManualSell}
          >
            <Zap className="w-3 h-3" />
            Exit
          </Button>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </div>
      
      {/* Expanded Details */}
      {expanded && (
        <div className="px-4 pb-3 pt-1 bg-secondary/20 animate-fade-in">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-background/50 rounded-lg text-xs">
            <div>
              <span className="text-muted-foreground block mb-0.5">Token Address</span>
              <span className="font-mono text-foreground text-[11px]">{shortAddress(item.token_address)}</span>
            </div>
            <div>
              <span className="text-muted-foreground block mb-0.5">Amount</span>
              <span className="text-foreground font-semibold">{formatAmount(item.amount)}</span>
            </div>
            <div>
              <span className="text-muted-foreground block mb-0.5">Value</span>
              <span className="text-foreground font-semibold">{formatValue(item.valueUsd)}</span>
            </div>
            <div>
              <span className="text-muted-foreground block mb-0.5">Current Price</span>
              <span className="text-foreground font-semibold">{formatPrice(item.current_price)}</span>
            </div>
            {!item.isWalletToken && (
              <>
                <div>
                  <span className="text-muted-foreground block mb-0.5">Entry Price</span>
                  <span className="text-foreground font-semibold">{formatPrice(item.entry_price)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block mb-0.5">Checks</span>
                  <span className="text-foreground font-semibold">{item.liquidity_check_count}x</span>
                </div>
                <div>
                  <span className="text-muted-foreground block mb-0.5">Last Check</span>
                  <span className="text-foreground font-semibold">{lastChecked}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block mb-0.5">P&L</span>
                  <span className={cn(
                    "font-semibold",
                    (item.profit_loss_percent || 0) >= 0 ? 'text-success' : 'text-destructive'
                  )}>
                    {item.profit_loss_percent !== null ? `${item.profit_loss_percent >= 0 ? '+' : ''}${item.profit_loss_percent.toFixed(1)}%` : '-'}
                  </span>
                </div>
              </>
            )}
          </div>
          
          {/* Swap Route Status */}
          <div className="mt-2 p-3 bg-background/30 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-muted-foreground text-xs font-medium">Swap Route Availability</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs gap-1"
                onClick={(e) => {
                  e.stopPropagation();
                  onCheckRoutes();
                }}
                disabled={routeStatus.jupiter === 'checking' || routeStatus.raydium === 'checking'}
              >
                {(routeStatus.jupiter === 'checking' || routeStatus.raydium === 'checking') ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )}
                Check
              </Button>
            </div>
            <div className="flex flex-wrap gap-4">
              <RouteIndicator status={routeStatus.jupiter} label="Jupiter" />
              <RouteIndicator status={routeStatus.raydium} label="Raydium" />
            </div>
          </div>
          
          {/* Action Buttons */}
          <div className="flex items-center gap-2 mt-3">
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "flex-1 h-8 text-xs gap-1.5",
                hasRoute 
                  ? "border-success/30 text-success hover:bg-success/10" 
                  : "border-warning/30 text-warning hover:bg-warning/10"
              )}
              onClick={handleManualSell}
            >
              <Zap className="w-3.5 h-3.5" />
              {hasRoute ? 'Exit Now' : 'Try Exit'}
            </Button>
            {!item.isWalletToken && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3 text-xs gap-1.5 text-muted-foreground"
                onClick={handleMoveBack}
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Move Back
              </Button>
            )}
            <a 
              href={`https://solscan.io/token/${item.token_address}`}
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
  // Custom comparison - ensure re-render when token metadata changes
  if (prevProps.item.id !== nextProps.item.id) return false;
  if (prevProps.item.token_name !== nextProps.item.token_name) return false;
  if (prevProps.item.token_symbol !== nextProps.item.token_symbol) return false;
  if (prevProps.item.amount !== nextProps.item.amount) return false;
  if (prevProps.item.current_price !== nextProps.item.current_price) return false;
  if (prevProps.item.valueUsd !== nextProps.item.valueUsd) return false;
  if (prevProps.routeStatus.jupiter !== nextProps.routeStatus.jupiter) return false;
  if (prevProps.routeStatus.raydium !== nextProps.routeStatus.raydium) return false;
  if (prevProps.colorIndex !== nextProps.colorIndex) return false;
  return true;
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
  isTabActive = false,
}: WaitingLiquidityTabProps) {
  
  // Track route status for each token
  const [routeStatuses, setRouteStatuses] = useState<Record<string, RouteStatus>>({});
  
  // Track enriched metadata for tokens (name, symbol, priceChange24h)
  const [enrichedMetadata, setEnrichedMetadata] = useState<Record<string, { 
    name: string; 
    symbol: string; 
    priceChange24h?: number;
    priceUsd?: number;
  }>>({});
  const enrichmentInProgressRef = useRef<Set<string>>(new Set());
  
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
      
      // Use enriched metadata if available
      const enriched = enrichedMetadata[pos.token_address];
      
      items.push({
        id: pos.id,
        token_address: pos.token_address,
        token_symbol: enriched?.symbol || pos.token_symbol,
        token_name: enriched?.name || pos.token_name,
        amount: pos.amount,
        entry_price: pos.entry_price,
        current_price: enriched?.priceUsd ?? pos.current_price,
        profit_loss_percent: pos.profit_loss_percent,
        priceChange24h: enriched?.priceChange24h ?? null,
        liquidity_last_checked_at: pos.liquidity_last_checked_at,
        liquidity_check_count: pos.liquidity_check_count,
        waiting_for_liquidity_since: pos.waiting_for_liquidity_since,
        status: pos.status,
        isWalletToken: false,
        valueUsd: (enriched?.priceUsd ?? pos.current_price) * pos.amount,
      });
    }
    
    // Add wallet tokens that are not duplicates or active
    for (const token of walletTokens) {
      const addr = token.mint.toLowerCase();
      
      // Skip if already added from positions or in active trades
      if (seenAddresses.has(addr)) continue;
      if (activeTokenAddresses.has(addr)) continue;
      
      seenAddresses.add(addr);
      
      // Use enriched metadata if available
      const enriched = enrichedMetadata[token.mint];
      
      items.push({
        id: `wallet-${token.mint}`,
        token_address: token.mint,
        token_symbol: enriched?.symbol || token.symbol,
        token_name: enriched?.name || token.name,
        amount: token.balance,
        entry_price: token.priceUsd || 0,
        current_price: enriched?.priceUsd ?? (token.priceUsd || 0),
        profit_loss_percent: null,
        priceChange24h: enriched?.priceChange24h ?? null,
        liquidity_last_checked_at: null,
        liquidity_check_count: 0,
        waiting_for_liquidity_since: null,
        status: 'wallet',
        isWalletToken: true,
        valueUsd: enriched?.priceUsd ? (enriched.priceUsd * token.balance) : token.valueUsd,
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
  }, [positions, walletTokens, activeTokenAddresses, enrichedMetadata]);
  
  // Enrich metadata AND prices for tokens - runs once per token per session
  useEffect(() => {
    if (!isTabActive) return;
    if (combinedItems.length === 0) return;
    
    // Find all token addresses that need enrichment (metadata or prices)
    const allAddresses = combinedItems.map(item => item.token_address);
    const needsEnrichment = allAddresses.filter(addr => {
      // Skip if already fully enriched (has name, symbol, and price data)
      if (enrichedMetadata[addr]?.priceChange24h !== undefined) return false;
      if (enrichmentInProgressRef.current.has(addr)) return false;
      return true;
    });
    
    if (needsEnrichment.length === 0) return;
    
    // Mark all as in progress
    needsEnrichment.forEach(addr => enrichmentInProgressRef.current.add(addr));
    
    console.log(`[WaitingLiquidityTab] Enriching ${needsEnrichment.length} tokens with DexScreener`);
    
    // Use DexScreener prices API (returns metadata + 24h change + price in one call)
    fetchDexScreenerPrices(needsEnrichment, { timeoutMs: 8000, chunkSize: 30 })
      .then((priceMap) => {
        const updates: Record<string, { 
          name: string; 
          symbol: string; 
          priceChange24h?: number;
          priceUsd?: number;
        }> = {};
        
        for (const [addr, priceData] of priceMap.entries()) {
          const symbol = priceData.symbol || '';
          const name = priceData.name || '';
          
          // Only include if we got valid data
          if (symbol && !isPlaceholderTokenText(symbol)) {
            updates[addr] = { 
              name: name || symbol, 
              symbol,
              priceChange24h: priceData.priceChange24h,
              priceUsd: priceData.priceUsd,
            };
            console.log(`[WaitingLiquidityTab] Enriched: ${addr.slice(0, 8)} -> ${symbol} (${priceData.priceChange24h >= 0 ? '+' : ''}${priceData.priceChange24h?.toFixed(2)}%)`);
          }
          enrichmentInProgressRef.current.delete(addr);
        }
        
        // Clear remaining addresses
        for (const addr of needsEnrichment) {
          enrichmentInProgressRef.current.delete(addr);
        }
        
        if (Object.keys(updates).length > 0) {
          setEnrichedMetadata(prev => ({ ...prev, ...updates }));
        }
      })
      .catch((err) => {
        console.error('[WaitingLiquidityTab] DexScreener enrichment error:', err);
        // Clear in-progress state
        for (const addr of needsEnrichment) {
          enrichmentInProgressRef.current.delete(addr);
        }
      });
  }, [combinedItems, isTabActive, enrichedMetadata]);

  // Check routes for a specific token
  const checkRoutesForToken = useCallback(async (tokenAddress: string) => {
    setRouteStatuses(prev => ({
      ...prev,
      [tokenAddress]: { jupiter: 'checking', raydium: 'checking' },
    }));

    const [jupiterAvailable, raydiumAvailable] = await Promise.all([
      checkJupiterRoute(tokenAddress),
      checkRaydiumRoute(tokenAddress),
    ]);

    setRouteStatuses(prev => ({
      ...prev,
      [tokenAddress]: {
        jupiter: jupiterAvailable ? 'available' : 'unavailable',
        raydium: raydiumAvailable ? 'available' : 'unavailable',
      },
    }));
  }, []);

  // Auto-refresh wallet tokens when tab becomes active
  useEffect(() => {
    if (isTabActive && onRefreshWalletTokens) {
      onRefreshWalletTokens();
    }
  }, [isTabActive, onRefreshWalletTokens]);

  // Auto-check routes for items that don't have status yet
  useEffect(() => {
    if (!isTabActive) return;
    
    for (const item of combinedItems) {
      if (!routeStatuses[item.token_address]) {
        checkRoutesForToken(item.token_address);
      }
    }
  }, [combinedItems, routeStatuses, checkRoutesForToken, isTabActive]);

  const waitingCount = positions.filter(p => !activeTokenAddresses.has(p.token_address.toLowerCase())).length;
  const walletCount = combinedItems.filter(i => i.isWalletToken).length;

  const getRouteStatus = useCallback((tokenAddress: string): RouteStatus => {
    return routeStatuses[tokenAddress] || { jupiter: 'unknown', raydium: 'unknown' };
  }, [routeStatuses]);

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
            routeStatus={getRouteStatus(item.token_address)}
            onCheckRoutes={() => checkRoutesForToken(item.token_address)}
          />
        ))}
      </div>

      {/* Info footer */}
      <div className="px-4 py-3 bg-muted/30 border-t border-border/30">
        <p className="text-xs text-muted-foreground">
          💡 Click a token to expand details. Exit attempts Jupiter first, then Raydium fallback. Auto-checks routes every 30s.
        </p>
      </div>
    </div>
  );
}
