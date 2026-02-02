import React, { useState, useMemo } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { useWallet } from "@/hooks/useWallet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePositions, Position } from "@/hooks/usePositions";
import { useTradeHistory } from "@/hooks/useTradeHistory";
import { useAutoExit } from "@/hooks/useAutoExit";
import { useDisplayUnit } from "@/contexts/DisplayUnitContext";
import SolTradesBanner from "@/components/dashboard/SolTradesBanner";
import { TransactionHistory } from "@/components/portfolio/TransactionHistory";
import { isPlaceholderTokenText } from "@/lib/dexscreener";
import { 
  TrendingUp, 
  TrendingDown,
  RefreshCw,
  Loader2,
  DollarSign,
  Target,
  ShieldAlert,
  Clock,
  Play,
  XCircle,
  CheckCircle,
  AlertTriangle,
  History,
  ArrowUpRight,
  ArrowDownRight,
  ExternalLink,
  Wallet,
  BarChart3,
  Activity,
  Zap,
  Trophy,
  PieChart,
  Coins,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

import { 
  formatCurrency as formatCurrencyUtil, 
  formatPercentage, 
  formatPrice, 
  calculatePnLValue,
  getTokenDisplayName,
  getTokenDisplaySymbol 
} from "@/lib/formatters";

const shortAddress = (address: string) =>
  address && address.length > 10
    ? `${address.slice(0, 4)}…${address.slice(-4)}`
    : address || 'Token';

const getExitReasonDisplay = (reason: string | null | undefined) => {
  if (!reason) return { label: 'Manual', icon: XCircle, color: 'text-muted-foreground' };
  switch (reason) {
    case 'take_profit': return { label: 'Take Profit', icon: CheckCircle, color: 'text-green-500' };
    case 'stop_loss': return { label: 'Stop Loss', icon: AlertTriangle, color: 'text-red-500' };
    case 'sold_externally': return { label: 'External Sale', icon: ArrowUpRight, color: 'text-blue-500' };
    case 'force_closed_manual': 
    case 'force_closed_cleanup': return { label: 'Force Closed', icon: XCircle, color: 'text-orange-500' };
    case 'force_closed_dead_token': return { label: 'Dead Token', icon: AlertTriangle, color: 'text-red-500' };
    default: return { label: reason.replace(/_/g, ' '), icon: XCircle, color: 'text-muted-foreground' };
  }
};

interface PositionRowProps {
  position: Position;
  onClose?: () => void;
  compact?: boolean;
  formatValue: (usd: number, options?: { showSign?: boolean }) => string;
}

const PositionRow = ({ position, onClose, compact = false, formatValue }: PositionRowProps) => {
  const isProfit = (position.profit_loss_percent ?? 0) >= 0;
  const isPendingTakeProfit = (position.profit_loss_percent ?? 0) >= (position.profit_take_percent ?? 100) * 0.8;
  const isPendingStopLoss = (position.profit_loss_percent ?? 0) <= -(position.stop_loss_percent ?? 20) * 0.8;

  const displaySymbol = getTokenDisplaySymbol(position.token_symbol, position.token_address);
  const displayName = getTokenDisplayName(position.token_name, position.token_address);
  
  // Calculate P&L value properly
  const pnlValue = position.profit_loss_value ?? calculatePnLValue(
    position.entry_value,
    position.profit_loss_percent,
    position.entry_price,
    position.amount
  );

  const exitInfo = position.status === 'closed' ? getExitReasonDisplay(position.exit_reason) : null;
  const ExitIcon = exitInfo?.icon || XCircle;

  return (
    <div className={`flex items-center justify-between p-4 hover:bg-secondary/30 transition-colors ${
      isPendingTakeProfit ? 'bg-green-500/5 border-l-2 border-green-500' : 
      isPendingStopLoss ? 'bg-red-500/5 border-l-2 border-red-500' : ''
    }`}>
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className={`p-2 rounded-lg ${isProfit ? 'bg-success/20' : 'bg-destructive/20'}`}>
          {isProfit ? (
            <TrendingUp className="w-4 h-4 text-success" />
          ) : (
            <TrendingDown className="w-4 h-4 text-destructive" />
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-foreground truncate">{displaySymbol}</span>
            <Badge variant="outline" className="text-xs">{displayName}</Badge>
            {position.status === 'open' ? (
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">Open</Badge>
            ) : (
              <Badge variant="secondary" className="text-xs flex items-center gap-1">
                <ExitIcon className={`w-3 h-3 ${exitInfo?.color}`} />
                {exitInfo?.label}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">
            Entry: ${position.entry_price.toFixed(8)} • {formatDistanceToNow(new Date(position.created_at), { addSuffix: true })}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4 md:gap-6">
        {!compact && (
          <div className="text-right hidden md:block">
            <p className="text-xs text-muted-foreground">Current</p>
            <p className="font-medium text-foreground text-sm">${(position.current_price ?? 0).toFixed(8)}</p>
          </div>
        )}
        
        <div className="text-right min-w-[80px]">
          <p className="text-xs text-muted-foreground">P&L</p>
          <div className={`flex items-center justify-end gap-1 font-bold text-sm ${isProfit ? 'text-green-500' : 'text-red-500'}`}>
            {formatPercentage(position.profit_loss_percent ?? 0)}
          </div>
          <p className={`text-xs ${isProfit ? 'text-green-500' : 'text-red-500'}`}>
            {formatValue(pnlValue, { showSign: true })}
          </p>
        </div>

        {!compact && (
          <div className="text-right hidden lg:block min-w-[100px]">
            <p className="text-xs text-muted-foreground">Entry Value</p>
            <p className="font-medium text-foreground text-sm">{formatValue(position.entry_value ?? 0)}</p>
          </div>
        )}

        {position.status === 'open' && onClose && (
          <Button size="sm" variant="outline" onClick={onClose} className="shrink-0">
            <XCircle className="w-3 h-3 mr-1" />
            Close
          </Button>
        )}
        
        {position.status === 'closed' && position.closed_at && (
          <div className="text-right min-w-[80px] hidden sm:block">
            <p className="text-xs text-muted-foreground">Closed</p>
            <p className="text-xs text-foreground">{format(new Date(position.closed_at), 'MMM d, HH:mm')}</p>
          </div>
        )}
      </div>
    </div>
  );
};

function Portfolio() {
  const { 
    openPositions, 
    closedPositions, 
    loading, 
    closePosition,
    fetchPositions,
  } = usePositions();

  const {
    checking: checkingExits,
    lastCheck: lastExitCheck,
    results: exitResults,
    pendingExits,
    checkExitConditions,
    startAutoExitMonitor,
    stopAutoExitMonitor,
    isMonitoring,
  } = useAutoExit();

  const { formatPrimaryValue, formatDualValue, solPrice } = useDisplayUnit();

  // Fetch up to the backend max (1000) so the table always shows the full history.
  const { trades, loading: tradesLoading, refetch: refetchTrades, forceSync } = useTradeHistory(1000);
  const [autoMonitor, setAutoMonitor] = useState(false);
  const [autoExecute, setAutoExecute] = useState(true);
  const { wallet, connectPhantom, disconnect } = useWallet();

  // Sync auto monitor state with hook
  React.useEffect(() => {
    if (autoMonitor && openPositions.length > 0 && wallet.isConnected) {
      startAutoExitMonitor(30000);
    } else {
      stopAutoExitMonitor();
    }
  }, [autoMonitor, openPositions.length, wallet.isConnected, startAutoExitMonitor, stopAutoExitMonitor]);

  const handleClosePosition = async (position: Position) => {
    await closePosition(position.id, position.current_price ?? position.entry_price);
  };

  const handleCheckNow = () => {
    checkExitConditions(autoExecute);
  };

  // Calculate comprehensive stats
  // ROOT FIX: Always recalculate values from amount × prices instead of using stored values
  // This ensures accuracy regardless of any inconsistencies in stored fields
  const stats = useMemo(() => {
    // ROOT FIX: Open Value = sum of (amount × current_price) - recalculated, not stored
    const openValue = openPositions.reduce((sum, p) => {
      const currentPrice = p.current_price ?? p.entry_price ?? 0;
      return sum + (p.amount * currentPrice);
    }, 0);
    
    // ROOT FIX: Entry Value = sum of (amount × entry_price_usd) - recalculated
    const openEntryValue = openPositions.reduce((sum, p) => {
      const entryPriceUsd = p.entry_price_usd ?? p.entry_price;
      return sum + (p.amount * entryPriceUsd);
    }, 0);
    
    // ROOT FIX: Open P&L = Open Value - Entry Value (recalculated)
    const openPnL = openValue - openEntryValue;
    
    // For closed positions, recalculate similarly
    const closedEntryValue = closedPositions.reduce((sum, p) => {
      const entryPriceUsd = p.entry_price_usd ?? p.entry_price;
      return sum + (p.amount * entryPriceUsd);
    }, 0);
    
    const closedExitValue = closedPositions.reduce((sum, p) => {
      const exitPrice = p.exit_price ?? p.current_price ?? p.entry_price ?? 0;
      return sum + (p.amount * exitPrice);
    }, 0);
    
    const closedPnL = closedExitValue - closedEntryValue;
    
    const totalPnL = openPnL + closedPnL;
    const totalEntryValue = openEntryValue + closedEntryValue;
    const totalPnLPercent = totalEntryValue > 0 ? (totalPnL / totalEntryValue) * 100 : 0;
    
    const wins = closedPositions.filter(p => (p.profit_loss_percent ?? 0) > 0).length;
    const losses = closedPositions.filter(p => (p.profit_loss_percent ?? 0) < 0).length;
    const winRate = closedPositions.length > 0 ? (wins / closedPositions.length) * 100 : 0;
    
    const takeProfitExits = closedPositions.filter(p => p.exit_reason === 'take_profit').length;
    const stopLossExits = closedPositions.filter(p => p.exit_reason === 'stop_loss').length;
    const externalExits = closedPositions.filter(p => p.exit_reason === 'sold_externally').length;
    
    const avgWinPercent = wins > 0 
      ? closedPositions.filter(p => (p.profit_loss_percent ?? 0) > 0).reduce((sum, p) => sum + (p.profit_loss_percent ?? 0), 0) / wins 
      : 0;
    const avgLossPercent = losses > 0 
      ? closedPositions.filter(p => (p.profit_loss_percent ?? 0) < 0).reduce((sum, p) => sum + (p.profit_loss_percent ?? 0), 0) / losses 
      : 0;
    
    return {
      openValue,
      openEntryValue,
      openPnL,
      closedPnL,
      totalPnL,
      totalPnLPercent,
      wins,
      losses,
      winRate,
      takeProfitExits,
      stopLossExits,
      externalExits,
      avgWinPercent,
      avgLossPercent,
      totalTrades: openPositions.length + closedPositions.length,
    };
  }, [openPositions, closedPositions]);

  const recentExits = exitResults.filter(r => r.action !== 'hold');

  const handleConnectWallet = async () => {
    if (wallet.isConnected) {
      await disconnect();
    } else {
      await connectPhantom();
    }
  };

  return (
    <AppLayout>
      <div className="container mx-auto px-4">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-1">
              Portfolio
            </h1>
            <p className="text-muted-foreground text-sm">
              Track all positions and auto-exit management
              {lastExitCheck && ` • Last check: ${formatDistanceToNow(new Date(lastExitCheck), { addSuffix: true })}`}
            </p>
          </div>
          <Button
            variant="glow"
            onClick={() => fetchPositions(true)}
            disabled={loading}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Refresh
          </Button>
        </div>

        {/* SOL Trades Banner */}
        <div className="mb-6">
          <SolTradesBanner />
        </div>

        {/* Stats Overview - Comprehensive Grid */}
        {/* Apply ×1000 display scaling for better readability of micro-cap values */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
          {/* Invested Card - Total Entry Value computed from amount × entry_price_usd */}
          <Card className="bg-gradient-to-br from-blue-500/10 to-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Coins className="w-4 h-4 text-blue-500" />
                <span className="text-xs text-muted-foreground">Invested</span>
              </div>
              <p className="text-xl font-bold text-foreground">{formatDualValue(stats.openEntryValue * 1000).primary}</p>
              <p className="text-xs text-muted-foreground">{formatDualValue(stats.openEntryValue * 1000).secondary}</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-card to-card/80">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-4 h-4 text-primary" />
                <span className="text-xs text-muted-foreground">Open Value</span>
              </div>
              <p className="text-xl font-bold text-foreground">{formatDualValue(stats.openValue * 1000).primary}</p>
              <p className="text-xs text-muted-foreground">{formatDualValue(stats.openValue * 1000).secondary}</p>
            </CardContent>
          </Card>

          <Card className={`bg-gradient-to-br ${stats.totalPnL >= 0 ? 'from-green-500/10 to-card' : 'from-red-500/10 to-card'}`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                {stats.totalPnL >= 0 ? <TrendingUp className="w-4 h-4 text-green-500" /> : <TrendingDown className="w-4 h-4 text-red-500" />}
                <span className="text-xs text-muted-foreground">Total P&L</span>
              </div>
              <p className={`text-xl font-bold ${stats.totalPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {formatDualValue(stats.totalPnL * 1000, { showSign: true }).primary}
              </p>
              <p className={`text-xs ${stats.totalPnL >= 0 ? 'text-green-500/70' : 'text-red-500/70'}`}>
                {formatDualValue(stats.totalPnL * 1000, { showSign: true }).secondary}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-card to-card/80">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Activity className="w-4 h-4 text-primary" />
                <span className="text-xs text-muted-foreground">Total Trades</span>
              </div>
              <p className="text-xl font-bold text-foreground">{stats.totalTrades}</p>
              <p className="text-xs text-muted-foreground">{closedPositions.length} closed</p>
            </CardContent>
          </Card>

          <Card className={`bg-gradient-to-br ${stats.winRate >= 50 ? 'from-green-500/10 to-card' : 'from-yellow-500/10 to-card'}`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Trophy className="w-4 h-4 text-yellow-500" />
                <span className="text-xs text-muted-foreground">Win Rate</span>
              </div>
              <p className={`text-xl font-bold ${stats.winRate >= 50 ? 'text-green-500' : 'text-yellow-500'}`}>
                {stats.winRate.toFixed(0)}%
              </p>
              <p className="text-xs text-muted-foreground">{stats.wins}W / {stats.losses}L</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-500/10 to-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span className="text-xs text-muted-foreground">Avg Win</span>
              </div>
              <p className="text-xl font-bold text-green-500">+{stats.avgWinPercent.toFixed(1)}%</p>
              <p className="text-xs text-muted-foreground">{stats.takeProfitExits} TP exits</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-red-500/10 to-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <span className="text-xs text-muted-foreground">Avg Loss</span>
              </div>
              <p className="text-xl font-bold text-red-500">{stats.avgLossPercent.toFixed(1)}%</p>
              <p className="text-xs text-muted-foreground">{stats.stopLossExits} SL exits</p>
            </CardContent>
          </Card>
        </div>

        {/* Auto-Exit Control Panel */}
        <Card className="mb-6 border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
          <CardContent className="p-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/20">
                  <ShieldAlert className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Auto-Exit Monitor</h3>
                  <p className="text-xs text-muted-foreground">
                    {wallet.isConnected 
                      ? 'Continuously tracks prices and executes real exits via Jupiter'
                      : 'Connect wallet to enable real auto-exit execution'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 flex-wrap">
                {!wallet.isConnected ? (
                  <Button variant="outline" size="sm" onClick={handleConnectWallet}>
                    <Wallet className="w-4 h-4 mr-2" />
                    Connect Wallet
                  </Button>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={autoMonitor}
                        onCheckedChange={setAutoMonitor}
                        disabled={openPositions.length === 0}
                      />
                      <span className="text-sm text-muted-foreground">Monitor</span>
                      {isMonitoring && (
                        <span className="flex items-center gap-1 text-xs text-green-500">
                          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                          Active
                        </span>
                      )}
                    </div>

                    {autoMonitor && (
                      <div className="flex items-center gap-2">
                        <Switch checked={autoExecute} onCheckedChange={setAutoExecute} />
                        <span className="text-sm text-muted-foreground">Auto-Execute</span>
                      </div>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCheckNow}
                      disabled={checkingExits || openPositions.length === 0}
                    >
                      {checkingExits ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Play className="w-4 h-4 mr-1" />}
                      Check Now
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Pending Exits */}
            {pendingExits.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-sm font-medium text-yellow-400 mb-2 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Pending Wallet Signatures:
                </p>
                <div className="flex flex-wrap gap-2">
                  {pendingExits.map((exit, idx) => (
                    <Badge key={idx} className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                      {exit.symbol}: {exit.action === 'take_profit' ? 'TP' : 'SL'} @ {exit.profitLossPercent.toFixed(2)}%
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Exit Triggers */}
            {recentExits.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-sm font-medium text-foreground mb-2">Recent Exit Triggers:</p>
                <div className="flex flex-wrap gap-2">
                  {recentExits.map((exit, idx) => (
                    <Badge
                      key={idx}
                      className={exit.action === 'take_profit' 
                        ? 'bg-green-500/20 text-green-400 border-green-500/30'
                        : 'bg-red-500/20 text-red-400 border-red-500/30'
                      }
                    >
                      {exit.symbol}: {exit.action === 'take_profit' ? 'TP' : 'SL'} @ {exit.profitLossPercent.toFixed(2)}%
                      {exit.executed && ' ✓'}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Positions Tabs */}
        <Tabs defaultValue="open" className="space-y-4">
          <TabsList className="bg-secondary/50">
            <TabsTrigger value="open" className="gap-2">
              <Target className="w-4 h-4" />
              Open ({openPositions.length})
            </TabsTrigger>
            <TabsTrigger value="closed" className="gap-2">
              <CheckCircle className="w-4 h-4" />
              Closed ({closedPositions.length})
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <History className="w-4 h-4" />
              Transactions
            </TabsTrigger>
          </TabsList>

          {/* Open Positions Tab */}
          <TabsContent value="open">
            {loading && openPositions.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : openPositions.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <Target className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No open positions</p>
                  <p className="text-sm text-muted-foreground">Snipe tokens from the Scanner to track them here</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0 divide-y divide-border">
                  {openPositions.map(position => (
                    <PositionRow 
                      key={position.id} 
                      position={position} 
                      onClose={() => handleClosePosition(position)}
                      formatValue={formatPrimaryValue}
                    />
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Closed Positions Tab */}
          <TabsContent value="closed">
            {closedPositions.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <History className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No closed positions yet</p>
                  <p className="text-sm text-muted-foreground">Your completed trades will appear here</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Position History</CardTitle>
                    <div className="flex gap-2 text-xs">
                      <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">
                        {stats.takeProfitExits} TP
                      </Badge>
                      <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/30">
                        {stats.stopLossExits} SL
                      </Badge>
                      <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/30">
                        {stats.externalExits} External
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0 divide-y divide-border max-h-[600px] overflow-y-auto">
                  {closedPositions.map(position => (
                    <PositionRow 
                      key={position.id} 
                      position={position}
                      formatValue={formatPrimaryValue}
                    />
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Transaction History Tab */}
          <TabsContent value="history">
            <TransactionHistory 
              trades={trades} 
              loading={tradesLoading} 
              onRefetch={() => refetchTrades({ forceBackfill: true })} 
              onForceSync={forceSync}
            />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

export default Portfolio;
