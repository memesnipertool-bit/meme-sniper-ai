import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Wallet, Activity, Zap, ArrowUpRight, ArrowDownRight } from "lucide-react";

interface StatsGridProps {
  totalValue: number;
  totalPnL: number;
  totalPnLPercent: number;
  openPositionsCount: number;
  closedPositionsCount: number;
}

const formatCurrency = (value: number) => {
  if (Math.abs(value) >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
  if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
};

interface StatCardProps {
  title: string;
  value: string;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon: React.ElementType;
  iconColor: string;
  bgGradient: string;
  delay?: number;
}

const StatCard = ({ 
  title, 
  value, 
  change, 
  changeType = 'neutral', 
  icon: Icon, 
  iconColor, 
  bgGradient,
  delay = 0 
}: StatCardProps) => {
  return (
    <Card 
      className="group relative overflow-hidden border-0 bg-gradient-to-br from-card/90 to-card/60 backdrop-blur-xl hover:shadow-lg hover:shadow-primary/5 transition-all duration-500 animate-fade-in"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Gradient overlay on hover */}
      <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 ${bgGradient}`} />
      
      {/* Glow effect */}
      <div className="absolute -top-20 -right-20 w-40 h-40 bg-primary/10 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
      
      <CardContent className="relative p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
            <p className="text-2xl font-bold text-foreground tracking-tight">{value}</p>
            {change && (
              <div className="flex items-center gap-1.5">
                {changeType === 'positive' ? (
                  <ArrowUpRight className="w-3.5 h-3.5 text-success" />
                ) : changeType === 'negative' ? (
                  <ArrowDownRight className="w-3.5 h-3.5 text-destructive" />
                ) : null}
                <span className={`text-xs font-medium ${
                  changeType === 'positive' ? 'text-success' : 
                  changeType === 'negative' ? 'text-destructive' : 
                  'text-muted-foreground'
                }`}>
                  {change}
                </span>
              </div>
            )}
          </div>
          <div className={`p-3 rounded-2xl ${iconColor} transition-transform duration-300 group-hover:scale-110`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
        
        {/* Bottom accent line */}
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      </CardContent>
    </Card>
  );
};

interface StatsGridPropsExtended extends StatsGridProps {
  winCount?: number;
}

export default function StatsGrid({
  totalValue,
  totalPnL,
  totalPnLPercent,
  openPositionsCount,
  closedPositionsCount,
  winCount = 0,
}: StatsGridPropsExtended) {
  // Calculate actual win rate from real closed positions
  const winRate = closedPositionsCount > 0 
    ? Math.round((winCount / closedPositionsCount) * 100) 
    : 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        title="Total P&L"
        value={`${totalPnL >= 0 ? '+' : ''}${formatCurrency(totalPnL)}`}
        change={`${totalPnLPercent >= 0 ? '+' : ''}${totalPnLPercent.toFixed(1)}% all time`}
        changeType={totalPnL >= 0 ? 'positive' : 'negative'}
        icon={totalPnL >= 0 ? TrendingUp : TrendingDown}
        iconColor={totalPnL >= 0 ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive"}
        bgGradient={totalPnL >= 0 ? "bg-gradient-to-br from-success/5 to-transparent" : "bg-gradient-to-br from-destructive/5 to-transparent"}
        delay={0}
      />

      <StatCard
        title="Open Value"
        value={formatCurrency(totalValue)}
        change={openPositionsCount > 0 ? `${openPositionsCount} active` : 'No open positions'}
        changeType={openPositionsCount > 0 ? 'positive' : 'neutral'}
        icon={Wallet}
        iconColor="bg-blue-500/20 text-blue-400"
        bgGradient="bg-gradient-to-br from-blue-500/5 to-transparent"
        delay={50}
      />

      <StatCard
        title="Total Trades"
        value={(openPositionsCount + closedPositionsCount).toString()}
        change={`${openPositionsCount} open, ${closedPositionsCount} closed`}
        changeType={openPositionsCount > 0 ? 'positive' : 'neutral'}
        icon={Activity}
        iconColor="bg-primary/20 text-primary"
        bgGradient="bg-gradient-to-br from-primary/5 to-transparent"
        delay={100}
      />

      <StatCard
        title="Win Rate"
        value={`${winRate}%`}
        change={`${closedPositionsCount} trades`}
        changeType={winRate >= 50 ? 'positive' : winRate > 0 ? 'negative' : 'neutral'}
        icon={Zap}
        iconColor="bg-warning/20 text-warning"
        bgGradient="bg-gradient-to-br from-warning/5 to-transparent"
        delay={150}
      />
    </div>
  );
}
