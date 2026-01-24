import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Flame, Sparkles, Loader2, Eye, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTrendingTokens } from "@/hooks/useTrendingTokens";
import { Button } from "@/components/ui/button";

const formatPrice = (price: number) => {
  if (price < 0.00001) return `$${price.toFixed(8)}`;
  if (price < 0.01) return `$${price.toFixed(6)}`;
  if (price < 1) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(2)}`;
};

const formatVolume = (volume: number) => {
  if (volume >= 1000000) return `$${(volume / 1000000).toFixed(1)}M`;
  if (volume >= 1000) return `$${(volume / 1000).toFixed(1)}K`;
  return `$${volume.toFixed(0)}`;
};

export default function MarketOverview() {
  const navigate = useNavigate();
  const { tokens, loading, refetch } = useTrendingTokens();
  
  const handleTokenClick = (token: typeof tokens[0]) => {
    if (token.address) {
      const tokenData = {
        address: token.address,
        name: token.name,
        symbol: token.symbol,
        priceUsd: token.priceUsd,
        priceChange24h: token.priceChange24h,
        volume24h: token.volume24h,
        liquidity: token.liquidity,
      };
      const tokenDataParam = encodeURIComponent(JSON.stringify(tokenData));
      navigate(`/token/${token.address}?data=${tokenDataParam}`);
    }
  };

  return (
    <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-card/90 to-card/60 backdrop-blur-xl">
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-0 right-0 w-48 h-48 bg-primary/10 rounded-full blur-3xl" />
      </div>
      
      <CardHeader className="relative pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-orange-500/20 to-orange-500/5 border border-orange-500/10">
              <Flame className="w-4 h-4 text-orange-400" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">Trending Now</CardTitle>
              <p className="text-xs text-muted-foreground">
                Live Solana token prices
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => refetch()}
              disabled={loading}
            >
              <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            </Button>
            <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-orange-500/10 text-orange-400 border-orange-500/30">
              {loading ? 'Updating...' : 'Live'}
            </Badge>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="relative pt-0">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : tokens.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-sm text-muted-foreground">No tokens available</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              className="mt-2"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {tokens.map((token, index) => (
              <div
                key={token.address + index}
                className="group flex items-center justify-between p-3 bg-secondary/30 hover:bg-secondary/50 rounded-xl transition-all duration-200 cursor-pointer animate-fade-in"
                style={{ animationDelay: `${index * 50}ms` }}
                onClick={() => handleTokenClick(token)}
              >
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className={cn(
                      "w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs",
                      "bg-gradient-to-br from-primary/30 to-primary/10 border border-primary/20 text-primary"
                    )}>
                      {token.symbol.slice(0, 2)}
                    </div>
                    {token.hot && (
                      <div className="absolute -top-1 -right-1">
                        <Sparkles className="w-3 h-3 text-orange-400" />
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm">{token.symbol}</p>
                      {token.hot && (
                        <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4 bg-orange-500/20 text-orange-400">
                          🔥 Hot
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{token.name}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="font-medium text-sm">{formatPrice(token.priceUsd)}</p>
                    <div className={cn(
                      "flex items-center justify-end gap-1 text-xs font-medium",
                      token.priceChange24h >= 0 ? "text-success" : "text-destructive"
                    )}>
                      {token.priceChange24h >= 0 ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : (
                        <TrendingDown className="w-3 h-3" />
                      )}
                      {token.priceChange24h >= 0 ? "+" : ""}{token.priceChange24h.toFixed(1)}%
                    </div>
                  </div>
                  {token.address && (
                    <Eye className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
