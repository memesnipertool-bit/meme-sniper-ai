import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { formatPercentage } from "@/lib/formatters";

interface PerformancePanelProps {
  winRate: number;
  totalPnL: number;
  avgPnL: number;
  bestTrade: number;
  worstTrade: number;
  totalTrades: number;
  wins?: number;
  losses?: number;
}

export default function PerformancePanel({
  winRate = 0,
  totalPnL = 0,
  avgPnL = 0,
  bestTrade = 0,
  worstTrade = 0,
  totalTrades = 0,
  wins = 0,
  losses = 0,
}: Partial<PerformancePanelProps>) {
  return (
    <Card className="bg-card/80 backdrop-blur-sm border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" />
          Performance
        </CardTitle>
        <p className="text-xs text-muted-foreground">{totalTrades} total trades</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Win Rate & Total PnL */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <div className="w-2 h-2 rounded-full bg-success" />
              Win Rate
            </div>
            <div className="text-2xl font-bold text-success font-mono">
              {formatPercentage(winRate, false)}
            </div>
            <p className="text-xs text-muted-foreground">{wins}W / {losses}L</p>
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <span className="text-primary">$</span>
              Total PnL
            </div>
            <div className={`text-2xl font-bold font-mono ${totalPnL >= 0 ? 'text-success' : 'text-destructive'}`}>
              {formatPercentage(totalPnL)}
            </div>
            <p className="text-xs text-muted-foreground">Avg: {formatPercentage(avgPnL)}</p>
          </div>
        </div>

        {/* Best & Worst Trade */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-success/10 rounded-lg border border-success/20">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <TrendingUp className="w-3 h-3 text-success" />
              Best Trade
            </div>
            <div className="text-lg font-bold text-success font-mono">
              {formatPercentage(bestTrade)}
            </div>
          </div>
          <div className="p-3 bg-destructive/10 rounded-lg border border-destructive/20">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <TrendingDown className="w-3 h-3 text-destructive" />
              Worst Trade
            </div>
            <div className="text-lg font-bold text-destructive font-mono">
              {formatPercentage(worstTrade)}
            </div>
          </div>
        </div>

        {/* Empty State Message */}
        {totalTrades === 0 && (
          <div className="p-4 bg-secondary/30 rounded-lg text-center">
            <AlertTriangle className="w-5 h-5 text-muted-foreground mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">
              No trades yet. Enable the bot to start tracking performance.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
