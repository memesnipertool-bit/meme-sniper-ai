import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';

interface PriceChartProps {
  data: { time: string; price: number }[];
  height?: number;
  showGrid?: boolean;
  color?: string;
  loading?: boolean;
}

// Skeleton loader for charts
const ChartSkeleton = ({ height }: { height: number }) => (
  <div className="w-full animate-pulse" style={{ height }}>
    <div className="h-full flex flex-col justify-end gap-1 p-2">
      {/* Simulated chart lines */}
      <div className="flex items-end gap-1 h-full">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 bg-muted/50 rounded-t"
            style={{
              height: `${20 + Math.sin(i * 0.5) * 30 + Math.random() * 30}%`,
            }}
          />
        ))}
      </div>
      {/* X-axis skeleton */}
      <div className="flex justify-between pt-2 border-t border-border/30">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-8" />
        ))}
      </div>
    </div>
  </div>
);

export const PriceChart = ({ 
  data, 
  height = 120, 
  showGrid = false, 
  color = '#22c55e',
  loading = false 
}: PriceChartProps) => {
  // Show skeleton while loading or if no data
  if (loading || !data || data.length === 0) {
    return <ChartSkeleton height={height} />;
  }

  const isPositive = data.length >= 2 && data[data.length - 1].price >= data[0].price;
  const chartColor = color || (isPositive ? '#22c55e' : '#ef4444');

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
        {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />}
        <XAxis 
          dataKey="time" 
          axisLine={false} 
          tickLine={false} 
          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
        />
        <YAxis 
          hide 
          domain={['auto', 'auto']}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
            fontSize: '12px',
          }}
          labelStyle={{ color: 'hsl(var(--foreground))' }}
          formatter={(value: number) => [`$${value.toFixed(8)}`, 'Price']}
        />
        <defs>
          <linearGradient id={`gradient-${chartColor}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={chartColor} stopOpacity={0.3}/>
            <stop offset="95%" stopColor={chartColor} stopOpacity={0}/>
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="price"
          stroke={chartColor}
          strokeWidth={2}
          fill={`url(#gradient-${chartColor})`}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
};

interface PortfolioChartProps {
  data: { date: string; value: number; pnl: number }[];
  height?: number;
  loading?: boolean;
}

// Portfolio chart skeleton
const PortfolioChartSkeleton = ({ height }: { height: number }) => (
  <div className="w-full animate-pulse" style={{ height }}>
    <div className="h-full flex gap-2 p-2">
      {/* Y-axis skeleton */}
      <div className="flex flex-col justify-between py-2 w-12">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-10" />
        ))}
      </div>
      {/* Chart area */}
      <div className="flex-1 flex flex-col">
        <div className="flex-1 flex items-end gap-0.5">
          {Array.from({ length: 30 }).map((_, i) => (
            <div
              key={i}
              className="flex-1 bg-primary/20 rounded-t"
              style={{
                height: `${30 + Math.sin(i * 0.3) * 25 + Math.random() * 25}%`,
              }}
            />
          ))}
        </div>
        {/* X-axis skeleton */}
        <div className="flex justify-between pt-2 border-t border-border/30">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-10" />
          ))}
        </div>
      </div>
    </div>
  </div>
);

export const PortfolioChart = ({ data, height = 200, loading = false }: PortfolioChartProps) => {
  // Show skeleton while loading or if no data
  if (loading || !data || data.length === 0) {
    return <PortfolioChartSkeleton height={height} />;
  }

  // Calculate proper Y-axis domain with padding
  const values = data.map(d => d.value).filter(v => Number.isFinite(v));
  const minValue = values.length > 0 ? Math.min(...values) : 0;
  const maxValue = values.length > 0 ? Math.max(...values) : 100;
  const padding = (maxValue - minValue) * 0.1 || 10; // 10% padding or minimum 10
  const yMin = Math.max(0, minValue - padding);
  const yMax = maxValue + padding;

  // Format Y-axis ticks based on value magnitude
  const formatYAxis = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
    if (value >= 1) return `$${value.toFixed(0)}`;
    return `$${value.toFixed(2)}`;
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis 
          dataKey="date" 
          axisLine={false} 
          tickLine={false}
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
        />
        <YAxis 
          axisLine={false} 
          tickLine={false}
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          tickFormatter={formatYAxis}
          domain={[yMin, yMax]}
          width={60}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
          }}
          labelStyle={{ color: 'hsl(var(--foreground))' }}
          formatter={(value: number, name: string) => [
            formatYAxis(value),
            name === 'value' ? 'Portfolio Value' : 'P&L'
          ]}
        />
        <defs>
          <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4}/>
            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="value"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          fill="url(#portfolioGradient)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
};
