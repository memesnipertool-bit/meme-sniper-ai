import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, Users, Droplets, Clock, ExternalLink, Eye } from "lucide-react";

interface TokenCardProps {
  name: string;
  symbol: string;
  price: string;
  priceChange: number;
  volume: string;
  liquidity: string;
  holders: number;
  age: string;
  riskScore: "low" | "medium" | "high";
  imageUrl?: string;
  address?: string;
}

const TokenCard = ({
  name,
  symbol,
  price,
  priceChange,
  volume,
  liquidity,
  holders,
  age,
  riskScore,
  imageUrl,
  address,
}: TokenCardProps) => {
  const navigate = useNavigate();
  const isPositive = priceChange >= 0;

  const riskColors = {
    low: "text-success bg-success/10 border-success/20",
    medium: "text-warning bg-warning/10 border-warning/20",
    high: "text-destructive bg-destructive/10 border-destructive/20",
  };

  return (
    <div className="glass rounded-xl p-4 md:p-5 hover:border-primary/30 transition-all duration-300 animate-fade-in group">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center overflow-hidden">
            {imageUrl ? (
              <img src={imageUrl} alt={name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-lg font-bold text-primary">{symbol[0]}</span>
            )}
          </div>
          <div>
            <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
              {name}
            </h3>
            <p className="text-sm text-muted-foreground font-mono">${symbol}</p>
          </div>
        </div>
        <span className={`px-2 py-1 rounded-md text-xs font-medium border ${riskColors[riskScore]}`}>
          {riskScore.toUpperCase()}
        </span>
      </div>

      {/* Price Section */}
      <div className="flex items-end justify-between mb-4">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Price</p>
          <p className="text-xl md:text-2xl font-bold text-foreground font-mono">{price}</p>
        </div>
        <div className={`flex items-center gap-1 ${isPositive ? "text-success" : "text-destructive"}`}>
          {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          <span className="font-semibold font-mono">
            {isPositive ? "+" : ""}{priceChange.toFixed(2)}%
          </span>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-secondary/50 rounded-lg p-2.5">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <Droplets className="w-3.5 h-3.5" />
            <span className="text-xs">Volume 24h</span>
          </div>
          <p className="font-semibold text-sm font-mono">{volume}</p>
        </div>
        <div className="bg-secondary/50 rounded-lg p-2.5">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <Droplets className="w-3.5 h-3.5" />
            <span className="text-xs">Liquidity</span>
          </div>
          <p className="font-semibold text-sm font-mono">{liquidity}</p>
        </div>
        <div className="bg-secondary/50 rounded-lg p-2.5">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <Users className="w-3.5 h-3.5" />
            <span className="text-xs">Holders</span>
          </div>
          <p className="font-semibold text-sm font-mono">{holders.toLocaleString()}</p>
        </div>
        <div className="bg-secondary/50 rounded-lg p-2.5">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <Clock className="w-3.5 h-3.5" />
            <span className="text-xs">Age</span>
          </div>
          <p className="font-semibold text-sm font-mono">{age}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button variant="glow" className="flex-1" size="sm">
          Quick Buy
        </Button>
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => address && navigate(`/token/${address}`)}
        >
          <Eye className="w-4 h-4" />
        </Button>
        <Button variant="outline" size="sm">
          <ExternalLink className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};

export default TokenCard;
