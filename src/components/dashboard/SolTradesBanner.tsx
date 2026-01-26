import { Coins } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useDisplayUnit } from "@/contexts/DisplayUnitContext";

export default function SolTradesBanner() {
  const { solPrice, solPriceLoading } = useDisplayUnit();

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-gradient-to-r from-primary/10 via-transparent to-accent/10 rounded-lg border border-border/50">
      <div className="flex items-center gap-2">
        <Coins className="w-4 h-4 text-primary" />
        <span className="text-xs font-medium text-muted-foreground">
          All trades executed in SOL
        </span>
      </div>
      <Badge 
        variant="outline" 
        className="text-xs bg-background/50 border-border/50"
      >
        <span className="text-muted-foreground mr-1">SOL:</span>
        <span className="text-foreground font-mono">
          {solPriceLoading ? '...' : `$${solPrice.toFixed(2)}`}
        </span>
      </Badge>
    </div>
  );
}
