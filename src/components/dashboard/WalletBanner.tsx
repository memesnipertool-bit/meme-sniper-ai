import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wallet, ExternalLink, Copy, Check } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface WalletBannerProps {
  address: string;
  balance: string;
  network: string;
}

export default function WalletBanner({ address, balance, network }: WalletBannerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="relative overflow-hidden border-0 bg-gradient-to-r from-primary/10 via-primary/5 to-accent/5 backdrop-blur-xl animate-fade-in">
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-accent/5 animate-shimmer" />
      
      {/* Glow effects */}
      <div className="absolute -top-10 -left-10 w-32 h-32 bg-primary/20 rounded-full blur-3xl" />
      <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-accent/10 rounded-full blur-3xl" />
      
      <CardContent className="relative p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* Animated wallet icon */}
            <div className="relative">
              <div className="absolute inset-0 bg-primary/30 rounded-2xl blur animate-pulse-glow" />
              <div className="relative p-3.5 rounded-2xl bg-gradient-to-br from-primary/30 to-primary/10 border border-primary/20">
                <Wallet className="w-6 h-6 text-primary" />
              </div>
            </div>
            
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Connected Wallet</span>
                <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
              </div>
              <div className="flex items-center gap-2">
                <p className="font-mono text-sm font-medium text-foreground">
                  {address.slice(0, 6)}...{address.slice(-4)}
                </p>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  onClick={handleCopy}
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-success" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </Button>
                <a 
                  href={`https://solscan.io/account/${address}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-primary transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-6 sm:gap-8">
            {/* Balance */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Balance</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-bold text-foreground">{balance || '0'}</span>
                <span className="text-sm font-medium text-muted-foreground">SOL</span>
              </div>
            </div>
            
            {/* Network */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Network</p>
              <Badge 
                variant="outline" 
                className="capitalize bg-success/10 text-success border-success/30 font-medium"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-success mr-1.5 animate-pulse" />
                {network}
              </Badge>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
