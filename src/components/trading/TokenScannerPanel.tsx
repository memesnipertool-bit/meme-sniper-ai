import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScannedToken } from "@/hooks/useTokenScanner";
import { 
  Search, 
  Filter, 
  Pause, 
  Play,
  ExternalLink,
  Shield,
  ShieldCheck,
  ShieldX,
  Lock,
  RefreshCw,
  ChevronDown,
  Loader2,
  TrendingUp,
  TrendingDown,
  Zap,
} from "lucide-react";

interface TokenScannerPanelProps {
  tokens: ScannedToken[];
  loading: boolean;
  onScan: () => void;
  scanSpeed: 'slow' | 'normal' | 'fast';
  onSpeedChange: (speed: 'slow' | 'normal' | 'fast') => void;
  isPaused: boolean;
  onPauseToggle: () => void;
}

const formatLiquidity = (value: number) => {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
};

const TokenRow = ({ token, index }: { token: ScannedToken; index: number }) => {
  const [expanded, setExpanded] = useState(false);
  const isPositive = token.priceChange24h >= 0;
  
  const initials = token.symbol.slice(0, 2).toUpperCase();
  
  const getSafetyStatus = () => {
    const honeypotSafe = token.riskScore < 50;
    const taxSafe = token.riskScore < 40;
    const liquidityLocked = token.liquidityLocked;
    
    return (
      <div className="flex items-center gap-1">
        {honeypotSafe ? (
          <div className="p-1 rounded bg-success/20">
            <ShieldCheck className="w-3.5 h-3.5 text-success" />
          </div>
        ) : (
          <div className="p-1 rounded bg-destructive/20">
            <ShieldX className="w-3.5 h-3.5 text-destructive" />
          </div>
        )}
        {liquidityLocked ? (
          <div className="p-1 rounded bg-success/20">
            <Lock className="w-3.5 h-3.5 text-success" />
          </div>
        ) : (
          <div className="p-1 rounded bg-muted">
            <Lock className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
        )}
        {taxSafe && (
          <div className="p-1 rounded bg-primary/20">
            <Zap className="w-3.5 h-3.5 text-primary" />
          </div>
        )}
      </div>
    );
  };

  const avatarColors = [
    'bg-primary/20 text-primary',
    'bg-blue-500/20 text-blue-400',
    'bg-purple-500/20 text-purple-400',
    'bg-orange-500/20 text-orange-400',
    'bg-pink-500/20 text-pink-400',
    'bg-cyan-500/20 text-cyan-400',
  ];
  const avatarClass = avatarColors[index % avatarColors.length];

  const getDexBadge = () => {
    const dex = token.source?.toLowerCase() || 'raydium';
    if (dex.includes('jupiter')) return { name: 'Jupiter', class: 'bg-success/15 text-success border-success/30' };
    if (dex.includes('raydium')) return { name: 'Raydium', class: 'bg-purple-500/15 text-purple-400 border-purple-500/30' };
    if (dex.includes('orca')) return { name: 'Orca', class: 'bg-blue-500/15 text-blue-400 border-blue-500/30' };
    return { name: 'DEX', class: 'bg-muted text-muted-foreground' };
  };

  const dex = getDexBadge();

  return (
    <div className="border-b border-border/30 last:border-b-0">
      <div 
        className="flex items-center gap-2 md:gap-3 p-3 md:p-3.5 hover:bg-secondary/40 transition-colors cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Avatar */}
        <div className={`w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl flex items-center justify-center font-bold text-[10px] md:text-sm shrink-0 ${avatarClass}`}>
          {initials}
        </div>
        
        {/* Token Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 md:gap-2 mb-0.5">
            <span className="font-semibold text-foreground text-xs md:text-sm truncate max-w-[100px] md:max-w-[150px]">{token.name.slice(0, 14)}</span>
            <span className="text-muted-foreground text-[10px] md:text-xs shrink-0">{token.symbol}</span>
            <Badge variant="outline" className={`text-[9px] md:text-[10px] px-1 md:px-1.5 py-0 shrink-0 ${dex.class}`}>
              {dex.name}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] md:text-xs text-muted-foreground">
            <span className="font-mono truncate">{token.address.slice(0, 4)}...{token.address.slice(-4)}</span>
            <ExternalLink className="w-3 h-3 hover:text-primary cursor-pointer shrink-0" />
          </div>
        </div>
        
        {/* Safety Icons */}
        <div className="hidden sm:flex">
          {getSafetyStatus()}
        </div>
        
        {/* Price Change */}
        <div className="text-right min-w-[60px] md:min-w-[80px]">
          <div className={`flex items-center justify-end gap-0.5 md:gap-1 font-bold text-xs md:text-sm ${isPositive ? 'text-success' : 'text-destructive'}`}>
            {isPositive ? <TrendingUp className="w-3 h-3 md:w-3.5 md:h-3.5 shrink-0" /> : <TrendingDown className="w-3 h-3 md:w-3.5 md:h-3.5 shrink-0" />}
            <span className="tabular-nums">{isPositive ? '+' : ''}{token.priceChange24h.toFixed(1)}%</span>
          </div>
          <div className="text-[10px] md:text-xs text-muted-foreground tabular-nums">
            {formatLiquidity(token.liquidity)}
          </div>
        </div>
        
        {/* Expand Arrow */}
        <ChevronDown className={`w-3.5 h-3.5 md:w-4 md:h-4 text-muted-foreground transition-transform shrink-0 ${expanded ? 'rotate-180' : ''}`} />
      </div>
      
      {/* Expanded Details */}
      {expanded && (
        <div className="px-3 md:px-4 pb-3 md:pb-4 pl-[44px] md:pl-[60px] animate-fade-in">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 p-2 md:p-3 bg-secondary/30 rounded-lg text-[10px] md:text-xs">
            <div>
              <span className="text-muted-foreground block mb-0.5">Buyers</span>
              <span className="text-foreground font-semibold tabular-nums">{token.earlyBuyers}</span>
            </div>
            <div>
              <span className="text-muted-foreground block mb-0.5">Lock %</span>
              <span className="text-foreground font-semibold tabular-nums">{token.lockPercentage || 0}%</span>
            </div>
            <div>
              <span className="text-muted-foreground block mb-0.5">Position</span>
              <span className="text-primary font-semibold tabular-nums">#{token.buyerPosition || '-'}</span>
            </div>
            <div>
              <span className="text-muted-foreground block mb-0.5">Risk</span>
              <span className={`font-semibold tabular-nums ${token.riskScore < 40 ? 'text-success' : token.riskScore < 70 ? 'text-warning' : 'text-destructive'}`}>
                {token.riskScore}/100
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default function TokenScannerPanel({
  tokens,
  loading,
  onScan,
  scanSpeed,
  onSpeedChange,
  isPaused,
  onPauseToggle,
}: TokenScannerPanelProps) {
  const [searchTerm, setSearchTerm] = useState("");
  
  const filteredTokens = tokens.filter(t => 
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.address.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="bg-card/80 backdrop-blur-sm rounded-xl border border-border/50 overflow-hidden h-full flex flex-col">
      {/* Header */}
      <div className="p-3 md:p-4 border-b border-border/50">
        <div className="flex items-center justify-between gap-2 mb-3 md:mb-4">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <div className="w-9 h-9 md:w-11 md:h-11 rounded-lg md:rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20 shrink-0">
              <Shield className="w-4 h-4 md:w-5 md:h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-foreground text-sm md:text-lg truncate">Token Scanner</h2>
              <p className="text-[10px] md:text-xs text-muted-foreground truncate">Real-time DEX monitoring</p>
            </div>
          </div>
          
          {/* Controls */}
          <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
            <div className="hidden sm:flex bg-secondary/60 rounded-lg p-0.5">
              {(['slow', 'normal', 'fast'] as const).map((speed) => (
                <button
                  key={speed}
                  onClick={() => onSpeedChange(speed)}
                  className={`px-2 md:px-3 py-1 md:py-1.5 text-[10px] md:text-xs font-medium rounded-md transition-all ${
                    scanSpeed === speed 
                      ? 'bg-primary text-primary-foreground shadow-sm' 
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {speed.charAt(0).toUpperCase() + speed.slice(1)}
                </button>
              ))}
            </div>
            
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground w-8 h-8 md:w-9 md:h-9">
              <Filter className="w-3.5 h-3.5 md:w-4 md:h-4" />
            </Button>
            
            <Button 
              variant={isPaused ? "default" : "outline"} 
              size="sm"
              onClick={onPauseToggle}
              className={`h-8 md:h-9 text-xs md:text-sm px-2 md:px-3 ${isPaused ? "bg-warning hover:bg-warning/90 text-warning-foreground" : ""}`}
            >
              {isPaused ? <Play className="w-3.5 h-3.5 md:w-4 md:h-4 md:mr-1.5" /> : <Pause className="w-3.5 h-3.5 md:w-4 md:h-4 md:mr-1.5" />}
              <span className="hidden md:inline">{isPaused ? "Resume" : "Pause"}</span>
            </Button>
          </div>
        </div>
        
        {/* Status Bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 md:gap-3 text-xs md:text-sm">
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 md:w-2.5 md:h-2.5 rounded-full ${loading ? 'bg-success animate-pulse' : isPaused ? 'bg-warning' : 'bg-success'}`} />
              <span className="text-muted-foreground font-medium text-xs md:text-sm">
                {loading ? 'Scanning...' : isPaused ? 'Paused' : 'Active'}
              </span>
            </div>
          </div>
          <span className="text-foreground font-semibold text-xs md:text-sm tabular-nums">{tokens.length} tokens</span>
        </div>
        
        {/* Progress Bar */}
        <div className="mt-2 md:mt-3 h-1 bg-secondary rounded-full overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all duration-500 ${loading ? 'bg-primary animate-pulse' : 'bg-success'}`}
            style={{ width: loading ? '60%' : '100%' }}
          />
        </div>
      </div>
      
      {/* Search */}
      <div className="p-2 md:p-3 border-b border-border/30">
        <div className="relative">
          <Search className="absolute left-2.5 md:left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 md:w-4 md:h-4 text-muted-foreground" />
          <Input
            placeholder="Search tokens, addresses..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 md:pl-10 bg-secondary/40 border-border/30 h-9 md:h-10 text-sm"
          />
        </div>
      </div>
      
      {/* Token List */}
      <div className="flex-1 overflow-y-auto">
        {loading && tokens.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 md:py-16">
            <Loader2 className="w-6 h-6 md:w-8 md:h-8 animate-spin text-primary mb-2 md:mb-3" />
            <p className="text-xs md:text-sm text-muted-foreground">Scanning for new tokens...</p>
          </div>
        ) : filteredTokens.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 md:py-16 text-muted-foreground">
            <Shield className="w-10 h-10 md:w-12 md:h-12 mb-2 md:mb-3 opacity-30" />
            <p className="font-medium text-sm mb-1">No tokens found</p>
            <p className="text-xs text-muted-foreground mb-3">Try adjusting your filters</p>
            <Button variant="outline" size="sm" onClick={onScan} className="h-8 text-xs">
              <RefreshCw className="w-3.5 h-3.5 md:w-4 md:h-4 mr-2" />
              Scan Now
            </Button>
          </div>
        ) : (
          filteredTokens.map((token, idx) => (
            <TokenRow key={token.id} token={token} index={idx} />
          ))
        )}
      </div>
    </div>
  );
}
