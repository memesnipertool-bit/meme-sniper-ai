import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Activity, Loader2, TrendingUp, TrendingDown, ArrowRight, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

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

const formatCurrency = (value: number) => {
  if (Math.abs(value) >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
  if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
};

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
  'from-primary/30 to-primary/10 text-primary border-primary/20',
  'from-blue-500/30 to-blue-500/10 text-blue-400 border-blue-500/20',
  'from-purple-500/30 to-purple-500/10 text-purple-400 border-purple-500/20',
  'from-orange-500/30 to-orange-500/10 text-orange-400 border-orange-500/20',
  'from-pink-500/30 to-pink-500/10 text-pink-400 border-pink-500/20',
  'from-cyan-500/30 to-cyan-500/10 text-cyan-400 border-cyan-500/20',
];

export default function ActiveTradesCard({ positions, loading, onStartSnipping }: ActiveTradesCardProps) {
  return (
    <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-card/90 to-card/60 backdrop-blur-xl animate-fade-in">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-accent/5 rounded-full blur-3xl" />
      </div>
      
      <CardHeader className="relative pb-2 flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/10">
            <Activity className="w-4 h-4 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base font-semibold">Active Trades</CardTitle>
            <p className="text-xs text-muted-foreground">{positions.length} open positions</p>
          </div>
        </div>
        <Link to="/portfolio">
          <Button variant="ghost" size="sm" className="text-xs gap-1.5 text-muted-foreground hover:text-primary group">
            View All 
            <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
          </Button>
        </Link>
      </CardHeader>
      
      <CardContent className="relative pt-2">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
              <Loader2 className="w-8 h-8 animate-spin text-primary relative" />
            </div>
          </div>
        ) : positions.length === 0 ? (
          <div className="text-center py-10">
            <div className="relative inline-flex mb-4">
              <div className="absolute inset-0 bg-muted/30 rounded-2xl blur-xl" />
              <div className="relative p-4 rounded-2xl bg-gradient-to-br from-muted/20 to-muted/5 border border-border/50">
                <Sparkles className="w-8 h-8 text-muted-foreground/50" />
              </div>
            </div>
            <p className="text-sm font-medium text-muted-foreground mb-1">No active trades</p>
            <p className="text-xs text-muted-foreground/70 mb-4">Start trading to see your positions here</p>
            {onStartSnipping && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onStartSnipping} 
                className="gap-2 border-primary/30 text-primary hover:bg-primary/10"
              >
                <TrendingUp className="w-4 h-4" />
                Start Trading
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {positions.slice(0, 4).map((position, index) => {
              const isProfit = (position.profit_loss_percent || 0) >= 0;
              const pnlPercent = position.profit_loss_percent || 0;
              const colorClass = avatarColors[index % avatarColors.length];
              
              return (
                <div 
                  key={position.id} 
                  className="group flex items-center justify-between p-3.5 bg-secondary/30 hover:bg-secondary/50 rounded-xl border border-transparent hover:border-border/50 transition-all duration-300 animate-fade-in"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* Token Avatar */}
                    <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${colorClass} border flex items-center justify-center font-bold text-xs transition-transform group-hover:scale-105`}>
                      {(isPlaceholder(position.token_symbol) ? shortAddress(position.token_address) : position.token_symbol).slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-semibold text-sm text-foreground truncate">
                          {isPlaceholder(position.token_symbol) ? shortAddress(position.token_address) : position.token_symbol}
                        </p>
                      </div>
                      <p className="text-[10px] text-muted-foreground tabular-nums">
                        Entry: {formatPrice(position.entry_price || 0)}
                      </p>
                    </div>
                  </div>
                  
                  {/* Live Current Price */}
                  <div className="text-right min-w-[70px]">
                    <div className="font-bold text-sm text-foreground tabular-nums">
                      {formatPrice(position.current_price || 0)}
                    </div>
                    <div className={`flex items-center justify-end gap-0.5 text-xs tabular-nums ${isProfit ? 'text-success' : 'text-destructive'}`}>
                      {isProfit ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : (
                        <TrendingDown className="w-3 h-3" />
                      )}
                      {isProfit ? '+' : ''}{pnlPercent.toFixed(1)}%
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
