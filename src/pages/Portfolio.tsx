import React, { forwardRef, useState, useEffect, useRef } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { useWallet } from "@/hooks/useWallet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { usePositions, Position } from "@/hooks/usePositions";
import { useTradeHistory } from "@/hooks/useTradeHistory";
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
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const formatCurrency = (value: number) => {
  if (Math.abs(value) >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
  if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
};

const PositionCard = ({ position, onClose }: { position: Position; onClose: () => void }) => {
  const isProfit = position.profit_loss_percent >= 0;
  const isPendingTakeProfit = position.profit_loss_percent >= position.profit_take_percent * 0.8;
  const isPendingStopLoss = position.profit_loss_percent <= -position.stop_loss_percent * 0.8;

  return (
    <Card className={`border ${
      isPendingTakeProfit ? 'border-green-500/50 bg-green-500/5' : 
      isPendingStopLoss ? 'border-red-500/50 bg-red-500/5' : 
      'border-border'
    }`}>
      <CardContent className="p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Token Info */}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-foreground">{position.token_symbol}</h3>
              <Badge variant="outline" className="text-xs">{position.token_name}</Badge>
              <Badge variant="outline" className="text-xs capitalize">{position.chain}</Badge>
              {position.status === 'open' ? (
                <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Open</Badge>
              ) : (
                <Badge variant="secondary">Closed</Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              Entry: ${position.entry_price.toFixed(8)} • {formatDistanceToNow(new Date(position.created_at), { addSuffix: true })}
            </div>
          </div>

          {/* P&L Display */}
          <div className="flex items-center gap-6">
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-0.5">Current Price</p>
              <p className="font-semibold text-foreground">${position.current_price.toFixed(8)}</p>
            </div>
            
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-0.5">P&L %</p>
              <div className={`flex items-center gap-1 font-bold ${isProfit ? 'text-green-500' : 'text-red-500'}`}>
                {isProfit ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                {isProfit ? '+' : ''}{position.profit_loss_percent.toFixed(2)}%
              </div>
            </div>

            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-0.5">P&L Value</p>
              <p className={`font-semibold ${isProfit ? 'text-green-500' : 'text-red-500'}`}>
                {isProfit ? '+' : ''}{formatCurrency(position.profit_loss_value)}
              </p>
            </div>

            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-0.5">Targets</p>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-green-500">TP: {position.profit_take_percent}%</span>
                <span className="text-red-500">SL: {position.stop_loss_percent}%</span>
              </div>
            </div>

            {position.status === 'open' && (
              <Button size="sm" variant="outline" onClick={onClose}>
                <XCircle className="w-3 h-3 mr-1" />
                Close
              </Button>
            )}
          </div>
        </div>

        {/* Exit Info for Closed Positions */}
        {position.status === 'closed' && position.exit_reason && (
          <div className="mt-3 pt-3 border-t border-border flex items-center gap-2 text-sm">
            {position.exit_reason === 'take_profit' ? (
              <CheckCircle className="w-4 h-4 text-green-500" />
            ) : position.exit_reason === 'stop_loss' ? (
              <AlertTriangle className="w-4 h-4 text-red-500" />
            ) : (
              <XCircle className="w-4 h-4 text-muted-foreground" />
            )}
            <span className="text-muted-foreground">
              Closed via {position.exit_reason?.replace('_', ' ')} at ${position.exit_price?.toFixed(8)}
              {position.closed_at && ` • ${formatDistanceToNow(new Date(position.closed_at), { addSuffix: true })}`}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const Portfolio = forwardRef<HTMLDivElement, object>(function Portfolio(_props, ref) {
  const { 
    openPositions, 
    closedPositions, 
    loading, 
    checkingExits,
    lastExitCheck,
    exitResults,
    checkExitConditions,
    closePosition,
    fetchPositions,
  } = usePositions();

  const { trades, loading: tradesLoading, refetch: refetchTrades } = useTradeHistory(50);
  const [autoMonitor, setAutoMonitor] = useState(false);
  const [autoExecute, setAutoExecute] = useState(false);
  const monitorInterval = 30; // seconds
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-monitoring effect
  useEffect(() => {
    if (autoMonitor && openPositions.length > 0) {
      intervalRef.current = setInterval(() => {
        checkExitConditions(autoExecute);
      }, monitorInterval * 1000);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }
  }, [autoMonitor, autoExecute, monitorInterval, openPositions.length, checkExitConditions]);

  const handleClosePosition = async (position: Position) => {
    await closePosition(position.id, position.current_price);
  };

  // Calculate totals
  const totalValue = openPositions.reduce((sum, p) => sum + p.current_value, 0);
  const totalPnL = openPositions.reduce((sum, p) => sum + p.profit_loss_value, 0);
  const totalPnLPercent = openPositions.length > 0 
    ? (totalPnL / openPositions.reduce((sum, p) => sum + p.entry_value, 0)) * 100 
    : 0;

  const recentExits = exitResults.filter(r => r.action !== 'hold');

  const { wallet, connectPhantom, disconnect } = useWallet();

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
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
                Portfolio & Auto-Exit
              </h1>
              <p className="text-muted-foreground">
                Track positions and auto-exit on profit/loss targets
                {lastExitCheck && ` • Last check: ${formatDistanceToNow(new Date(lastExitCheck), { addSuffix: true })}`}
              </p>
            </div>
            <Button
              variant="glow"
              onClick={fetchPositions}
              disabled={loading}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Refresh
            </Button>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/20">
                    <DollarSign className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Value</p>
                    <p className="text-xl font-bold text-foreground">{formatCurrency(totalValue)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${totalPnL >= 0 ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                    {totalPnL >= 0 ? (
                      <TrendingUp className="w-5 h-5 text-green-400" />
                    ) : (
                      <TrendingDown className="w-5 h-5 text-red-400" />
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total P&L</p>
                    <p className={`text-xl font-bold ${totalPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {totalPnL >= 0 ? '+' : ''}{formatCurrency(totalPnL)} ({totalPnLPercent.toFixed(2)}%)
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/20">
                    <Target className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Open Positions</p>
                    <p className="text-xl font-bold text-foreground">{openPositions.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-muted">
                    <Clock className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Closed Positions</p>
                    <p className="text-xl font-bold text-foreground">{closedPositions.length}</p>
                  </div>
                </div>
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
                      Continuously tracks prices and triggers exits at TP/SL thresholds
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={autoMonitor}
                      onCheckedChange={setAutoMonitor}
                      disabled={openPositions.length === 0}
                    />
                    <span className="text-sm text-muted-foreground">Monitor</span>
                  </div>

                  {autoMonitor && (
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={autoExecute}
                        onCheckedChange={setAutoExecute}
                      />
                      <span className="text-sm text-muted-foreground">Auto-Execute</span>
                    </div>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => checkExitConditions(autoExecute)}
                    disabled={checkingExits || openPositions.length === 0}
                  >
                    {checkingExits ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-1" />
                    ) : (
                      <Play className="w-4 h-4 mr-1" />
                    )}
                    Check Now
                  </Button>
                </div>
              </div>

              {/* Recent Exit Alerts */}
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

          {/* Open Positions */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-foreground mb-4">Open Positions</h2>
            {loading ? (
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
              <div className="space-y-3">
                {openPositions.map(position => (
                  <PositionCard 
                    key={position.id} 
                    position={position} 
                    onClose={() => handleClosePosition(position)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Closed Positions */}
          {closedPositions.length > 0 && (
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-foreground mb-4">Closed Positions</h2>
              <div className="space-y-3">
                {closedPositions.slice(0, 10).map(position => (
                  <PositionCard 
                    key={position.id} 
                    position={position} 
                    onClose={() => {}}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Transaction History */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/20">
                  <History className="w-5 h-5 text-primary" />
                </div>
                <h2 className="text-lg font-semibold text-foreground">Transaction History</h2>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchTrades()}
                disabled={tradesLoading}
              >
                {tradesLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              </Button>
            </div>

            {tradesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : trades.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <History className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No transactions yet</p>
                  <p className="text-sm text-muted-foreground">Your buy and sell transactions will appear here</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <div className="divide-y divide-border">
                    {trades.map((trade) => (
                      <div 
                        key={trade.id} 
                        className="flex items-center justify-between p-4 hover:bg-secondary/30 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${trade.trade_type === 'buy' ? 'bg-success/20' : 'bg-destructive/20'}`}>
                            {trade.trade_type === 'buy' ? (
                              <ArrowDownRight className="w-4 h-4 text-success" />
                            ) : (
                              <ArrowUpRight className="w-4 h-4 text-destructive" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-foreground">
                                {trade.token_symbol || 'Unknown'}
                              </span>
                              <Badge variant="outline" className="text-xs capitalize">
                                {trade.trade_type}
                              </Badge>
                              <Badge 
                                variant="outline" 
                                className={`text-xs ${
                                  trade.status === 'completed' ? 'bg-success/10 text-success border-success/30' :
                                  trade.status === 'failed' ? 'bg-destructive/10 text-destructive border-destructive/30' :
                                  'bg-warning/10 text-warning border-warning/30'
                                }`}
                              >
                                {trade.status || 'pending'}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {trade.token_name || trade.token_address.slice(0, 8) + '...' + trade.token_address.slice(-6)}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="font-medium text-foreground">
                              {trade.amount.toFixed(4)} {trade.token_symbol || 'tokens'}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              {trade.price_sol && <span>{trade.price_sol.toFixed(6)} SOL</span>}
                              {trade.price_usd && <span>(${trade.price_usd.toFixed(4)})</span>}
                            </div>
                          </div>
                          
                          <div className="text-right min-w-[80px]">
                            <p className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(trade.created_at), { addSuffix: true })}
                            </p>
                            {trade.tx_hash && (
                              <a
                                href={`https://solscan.io/tx/${trade.tx_hash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                              >
                                <ExternalLink className="w-3 h-3" />
                                View
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </AppLayout>
  );
});

Portfolio.displayName = 'Portfolio';

export default Portfolio;
