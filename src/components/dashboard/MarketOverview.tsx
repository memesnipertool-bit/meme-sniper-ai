import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Flame, Sparkles, Loader2, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScannedToken } from "@/hooks/useTokenScanner";

interface MarketOverviewProps {
  tokens?: ScannedToken[];
  loading?: boolean;
}

// Fallback static data when no tokens available
const fallbackTokens = [
  { symbol: "BONK", name: "Bonk", price: "$0.00003241", change24h: 15.4, volume: "$125M", hot: true },
  { symbol: "WIF", name: "dogwifhat", price: "$2.45", change24h: 8.2, volume: "$89M", hot: true },
  { symbol: "MYRO", name: "Myro", price: "$0.156", change24h: -3.5, volume: "$42M" },
  { symbol: "POPCAT", name: "Popcat", price: "$0.892", change24h: 22.1, volume: "$67M", hot: true },
  { symbol: "BOME", name: "Book of Meme", price: "$0.0123", change24h: -1.2, volume: "$35M" },
];

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

export default function MarketOverview({ tokens = [], loading = false }: MarketOverviewProps) {
  const navigate = useNavigate();
  
  // Use scanned tokens if available, otherwise use fallback
  const displayTokens = tokens.length > 0 
    ? tokens.slice(0, 5).map(t => ({
        symbol: t.symbol,
        name: t.name,
        address: t.address,
        price: formatPrice(t.priceUsd),
        change24h: t.priceChange24h,
        volume: formatVolume(t.volume24h),
        hot: t.priceChange24h > 10 || t.riskScore < 40,
        tokenData: t, // Keep full token data for navigation
      }))
    : fallbackTokens.map(t => ({ ...t, address: '', tokenData: null }));

  const handleTokenClick = (token: typeof displayTokens[0]) => {
    if (token.address && token.tokenData) {
      // Pass token data via URL params for immediate display
      const tokenDataParam = encodeURIComponent(JSON.stringify(token.tokenData));
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
                {tokens.length > 0 ? 'Recently scanned tokens' : 'Hot tokens on Solana'}
              </p>
            </div>
          </div>
          <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-orange-500/10 text-orange-400 border-orange-500/30">
            {loading ? 'Scanning...' : 'Live'}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="relative pt-0">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-2">
            {displayTokens.map((token, index) => (
              <div
                key={token.symbol + index}
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
                    <p className="font-medium text-sm">{token.price}</p>
                    <div className={cn(
                      "flex items-center justify-end gap-1 text-xs font-medium",
                      token.change24h >= 0 ? "text-success" : "text-destructive"
                    )}>
                      {token.change24h >= 0 ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : (
                        <TrendingDown className="w-3 h-3" />
                      )}
                      {token.change24h >= 0 ? "+" : ""}{token.change24h.toFixed(1)}%
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
