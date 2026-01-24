import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Activity, Loader2, TrendingUp, TrendingDown, ArrowRight, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";

interface Position {
  id: string;
  token_symbol: string;
  token_name?: string;
  created_at: string;
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
                  <div className="flex items-center gap-3">
                    {/* Token Avatar */}
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${colorClass} border flex items-center justify-center font-bold text-sm transition-transform group-hover:scale-105`}>
                      {position.token_symbol.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm text-foreground">{position.token_symbol}</p>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-secondary/50">
                          SOL
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(position.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className={`flex items-center justify-end gap-1 font-bold text-sm ${isProfit ? 'text-success' : 'text-destructive'}`}>
                      {isProfit ? (
                        <TrendingUp className="w-3.5 h-3.5" />
                      ) : (
                        <TrendingDown className="w-3.5 h-3.5" />
                      )}
                      {isProfit ? '+' : ''}{pnlPercent.toFixed(2)}%
                    </div>
                    <p className="text-xs text-muted-foreground font-medium">
                      {formatCurrency(position.current_value)}
                    </p>
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
