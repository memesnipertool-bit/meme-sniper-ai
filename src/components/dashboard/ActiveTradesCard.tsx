import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Activity, Loader2, TrendingUp, TrendingDown, ArrowRight, Sparkles, Clock } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useMemo } from "react";

interface Position {
  id: string;
  token_symbol: string;
  token_name?: string;
  token_address?: string;
  created_at: string;
  entry_price?: number;
  current_price?: number;
  profit_loss_percent: number | null;
  current_value: number;
}

interface ActiveTradesCardProps {
  positions: Position[];
  loading: boolean;
  onStartSnipping?: () => void;
}

const formatPrice = (value: number) => {
  if (!value || value === 0) return '$0.00';
  if (value < 0.00001) return `$${value.toExponential(2)}`;
  if (value < 0.01) return `$${value.toFixed(6)}`;
  if (value < 1) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
};

const shortAddress = (addr: string | undefined) => 
  addr && addr.length > 10 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : 'TOKEN';

const isPlaceholder = (val: string | null | undefined) => {
  if (!val) return true;
  return /^(unknown|unknown token|\?\?\?|n\/a)$/i.test(val.trim());
};

const avatarColors = [
  'from-primary/40 to-primary/20 text-primary',
  'from-blue-500/40 to-blue-500/20 text-blue-400',
  'from-purple-500/40 to-purple-500/20 text-purple-400',
  'from-orange-500/40 to-orange-500/20 text-orange-400',
  'from-pink-500/40 to-pink-500/20 text-pink-400',
  'from-cyan-500/40 to-cyan-500/20 text-cyan-400',
];

export default function ActiveTradesCard({ positions, loading, onStartSnipping }: ActiveTradesCardProps) {
  // Calculate time held for each position
  const positionsWithTime = useMemo(() => 
    positions.slice(0, 4).map(p => {
      const created = new Date(p.created_at).getTime();
      const now = Date.now();
      const diffMs = now - created;
      const diffMins = Math.floor(diffMs / 60000);
      let timeHeld = `${diffMins}m`;
      if (diffMins >= 60) {
        const diffHours = Math.floor(diffMins / 60);
        timeHeld = diffHours >= 24 ? `${Math.floor(diffHours / 24)}d` : `${diffHours}h`;
      }
      return { ...p, timeHeld };
    }),
    [positions]
  );

  return (
    <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-card/90 to-card/60 backdrop-blur-xl">      
      <CardHeader className="relative pb-2 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/10">
            <Activity className="w-4 h-4 text-primary" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">Active Trades</CardTitle>
            <p className="text-[10px] text-muted-foreground">{positions.length} open</p>
          </div>
        </div>
        <Link to="/portfolio">
          <Button variant="ghost" size="sm" className="text-[10px] gap-1 text-muted-foreground hover:text-primary h-7 px-2">
            View All <ArrowRight className="w-3 h-3" />
          </Button>
        </Link>
      </CardHeader>
      
      <CardContent className="relative pt-1 pb-3 px-3">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : positions.length === 0 ? (
          <div className="text-center py-6">
            <div className="relative inline-flex mb-3">
              <div className="relative p-3 rounded-xl bg-gradient-to-br from-muted/20 to-muted/5 border border-border/50">
                <Sparkles className="w-6 h-6 text-muted-foreground/50" />
              </div>
            </div>
            <p className="text-xs font-medium text-muted-foreground mb-0.5">No active trades</p>
            <p className="text-[10px] text-muted-foreground/70 mb-3">Start trading to see positions</p>
            {onStartSnipping && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onStartSnipping} 
                className="gap-1.5 h-7 text-xs border-primary/30 text-primary hover:bg-primary/10"
              >
                <TrendingUp className="w-3 h-3" />
                Start Trading
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            {positionsWithTime.map((position, index) => {
              const isProfit = (position.profit_loss_percent || 0) >= 0;
              const pnlPercent = position.profit_loss_percent || 0;
              const colorClass = avatarColors[index % avatarColors.length];
              const displaySymbol = isPlaceholder(position.token_symbol) 
                ? shortAddress(position.token_address) 
                : position.token_symbol;
              
              return (
                <div 
                  key={position.id} 
                  className="group grid grid-cols-[28px_1fr] gap-2 p-2 bg-secondary/30 hover:bg-secondary/50 rounded-lg transition-colors"
                >
                  {/* Avatar */}
                  <div className={cn(
                    "w-7 h-7 rounded-md bg-gradient-to-br border border-white/10 flex items-center justify-center font-bold text-[9px]",
                    colorClass
                  )}>
                    {displaySymbol.slice(0, 2).toUpperCase()}
                  </div>
                  
                  {/* Info */}
                  <div className="min-w-0 flex flex-col justify-center gap-0.5">
                    {/* Row 1: Symbol + Price + P&L */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="font-bold text-foreground text-xs truncate">{displaySymbol}</span>
                        <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 text-muted-foreground shrink-0">
                          <Clock className="w-2 h-2 mr-0.5" />{position.timeHeld}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-bold text-xs tabular-nums text-foreground">
                          {formatPrice(position.current_price || 0)}
                        </span>
                        <span className={cn(
                          "text-[10px] tabular-nums font-bold min-w-[38px] text-right flex items-center gap-0.5",
                          isProfit ? 'text-success' : 'text-destructive'
                        )}>
                          {isProfit ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                          {isProfit ? '+' : ''}{pnlPercent.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    
                    {/* Row 2: Entry + Value */}
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>
                        Entry: <span className="text-foreground/80 tabular-nums">{formatPrice(position.entry_price || 0)}</span>
                      </span>
                      <span className="tabular-nums text-foreground/80">
                        ${position.current_value.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}