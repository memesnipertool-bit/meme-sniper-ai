import { useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, BarChart3 } from 'lucide-react';

interface TokenPriceChartProps {
  token: {
    priceUsd: number;
    priceChange24h: number;
    symbol: string;
  };
}

type TimeFrame = '1H' | '4H' | '24H' | '7D';

export function TokenPriceChart({ token }: TokenPriceChartProps) {
  const [timeframe, setTimeframe] = useState<TimeFrame>('24H');
  
  // Generate mock price data based on current price and change
  const chartData = useMemo(() => {
    const points: { time: string; price: number; volume: number }[] = [];
    const basePrice = token.priceUsd;
    const changePercent = token.priceChange24h / 100;
    
    const numPoints = timeframe === '1H' ? 12 : timeframe === '4H' ? 24 : timeframe === '24H' ? 24 : 7 * 24;
    const interval = timeframe === '1H' ? 5 : timeframe === '4H' ? 10 : timeframe === '24H' ? 60 : 360;
    
    // Calculate starting price based on change
    const startPrice = basePrice / (1 + changePercent);
    
    for (let i = 0; i < numPoints; i++) {
      const progress = i / numPoints;
      // Add some randomness but trend towards current price
      const noise = (Math.random() - 0.5) * 0.02 * basePrice;
      const trendPrice = startPrice + (basePrice - startPrice) * progress;
      const price = trendPrice + noise;
      
      const time = new Date(Date.now() - (numPoints - i) * interval * 60 * 1000);
      const timeStr = timeframe === '7D' 
        ? time.toLocaleDateString('en-US', { weekday: 'short' })
        : time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      
      points.push({
        time: timeStr,
        price: Math.max(0, price),
        volume: Math.floor(Math.random() * 10000) + 1000,
      });
    }
    
    return points;
  }, [token.priceUsd, token.priceChange24h, timeframe]);

  const isPositive = token.priceChange24h >= 0;
  const chartColor = isPositive ? 'hsl(160, 100%, 50%)' : 'hsl(0, 72%, 51%)';

  const formatPrice = (price: number): string => {
    if (price < 0.0001) return price.toExponential(2);
    if (price < 0.01) return price.toFixed(6);
    if (price < 1) return price.toFixed(4);
    return price.toFixed(2);
  };

  const minPrice = Math.min(...chartData.map(d => d.price));
  const maxPrice = Math.max(...chartData.map(d => d.price));
  const priceRange = maxPrice - minPrice;

  return (
    <Card className="glass">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Price Chart
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge className={isPositive ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}>
              {isPositive ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
              {isPositive ? '+' : ''}{token.priceChange24h.toFixed(2)}%
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Timeframe Selector */}
        <div className="flex gap-1 mb-4">
          {(['1H', '4H', '24H', '7D'] as TimeFrame[]).map((tf) => (
            <Button
              key={tf}
              variant={timeframe === tf ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setTimeframe(tf)}
              className="flex-1"
            >
              {tf}
            </Button>
          ))}
        </div>

        {/* Chart */}
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={chartColor} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis 
                dataKey="time" 
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(215, 20%, 55%)', fontSize: 10 }}
                interval="preserveStartEnd"
              />
              <YAxis 
                domain={[minPrice - priceRange * 0.1, maxPrice + priceRange * 0.1]}
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(215, 20%, 55%)', fontSize: 10 }}
                tickFormatter={(value) => `$${formatPrice(value)}`}
                width={60}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(220, 20%, 10%)',
                  border: '1px solid hsl(220, 15%, 20%)',
                  borderRadius: '8px',
                  color: 'hsl(210, 40%, 98%)',
                }}
                formatter={(value: number) => [`$${formatPrice(value)}`, 'Price']}
                labelStyle={{ color: 'hsl(215, 20%, 55%)' }}
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke={chartColor}
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorPrice)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Price Stats */}
        <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-border/50">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">High</p>
            <p className="font-mono text-sm font-medium text-success">
              ${formatPrice(maxPrice)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Low</p>
            <p className="font-mono text-sm font-medium text-destructive">
              ${formatPrice(minPrice)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Current</p>
            <p className="font-mono text-sm font-medium">
              ${formatPrice(token.priceUsd)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
