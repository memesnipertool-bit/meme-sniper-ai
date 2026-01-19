import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bot, Play, Pause, Settings, Activity, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface BotStatusCardProps {
  isActive?: boolean;
  onToggle?: (active: boolean) => void;
  tokensScanned?: number;
  tradesExecuted?: number;
}

export default function BotStatusCard({
  isActive = false,
  onToggle,
  tokensScanned = 0,
  tradesExecuted = 0,
}: BotStatusCardProps) {
  const [active, setActive] = useState(isActive);

  const handleToggle = () => {
    const newState = !active;
    setActive(newState);
    onToggle?.(newState);
  };

  return (
    <Card className={cn(
      "relative overflow-hidden border-0 backdrop-blur-xl transition-all duration-500",
      active
        ? "bg-gradient-to-br from-success/10 via-card/90 to-card/60 shadow-lg shadow-success/10"
        : "bg-gradient-to-br from-card/90 to-card/60"
    )}>
      {/* Animated background when active */}
      {active && (
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-success/20 rounded-full blur-3xl animate-pulse" />
          <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-primary/10 rounded-full blur-2xl animate-pulse" style={{ animationDelay: '1s' }} />
        </div>
      )}
      
      <CardContent className="relative p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              "relative p-3 rounded-2xl transition-all duration-300",
              active
                ? "bg-gradient-to-br from-success/30 to-success/10 border border-success/30"
                : "bg-gradient-to-br from-muted/30 to-muted/10 border border-muted/30"
            )}>
              <Bot className={cn("w-6 h-6 transition-colors", active ? "text-success" : "text-muted-foreground")} />
              {active && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-success"></span>
                </span>
              )}
            </div>
            <div>
              <h3 className="font-semibold text-base">Liquidity Bot</h3>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge 
                  variant="outline" 
                  className={cn(
                    "text-[10px] px-2 py-0",
                    active
                      ? "bg-success/20 text-success border-success/30"
                      : "bg-muted/20 text-muted-foreground border-muted/30"
                  )}
                >
                  {active ? "● Running" : "○ Stopped"}
                </Badge>
              </div>
            </div>
          </div>
          
          <Link to="/sniper-settings">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
              <Settings className="w-4 h-4" />
            </Button>
          </Link>
        </div>
        
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="p-3 rounded-xl bg-secondary/40 border border-border/30">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Activity className="w-3.5 h-3.5" />
              <span className="text-[10px] font-medium uppercase tracking-wider">Scanned</span>
            </div>
            <p className="text-lg font-bold">{tokensScanned.toLocaleString()}</p>
          </div>
          <div className="p-3 rounded-xl bg-secondary/40 border border-border/30">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Zap className="w-3.5 h-3.5" />
              <span className="text-[10px] font-medium uppercase tracking-wider">Trades</span>
            </div>
            <p className="text-lg font-bold">{tradesExecuted}</p>
          </div>
        </div>
        
        {/* Toggle Button */}
        <Button
          onClick={handleToggle}
          className={cn(
            "w-full gap-2 font-medium transition-all duration-300",
            active
              ? "bg-destructive/90 hover:bg-destructive text-destructive-foreground"
              : "bg-gradient-to-r from-success to-success/80 hover:from-success/90 hover:to-success/70 text-success-foreground shadow-lg shadow-success/25"
          )}
        >
          {active ? (
            <>
              <Pause className="w-4 h-4" />
              Stop Bot
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Start Bot
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
