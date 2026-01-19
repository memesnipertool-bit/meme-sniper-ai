import { RateLimitState } from "@/hooks/useTokenScanner";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface RateLimitIndicatorProps {
  rateLimit: RateLimitState;
  maxScans?: number;
}

export function RateLimitIndicator({ rateLimit, maxScans = 10 }: RateLimitIndicatorProps) {
  const { isLimited, remainingScans, countdown } = rateLimit;
  const usedScans = maxScans - remainingScans;
  const progress = (usedScans / maxScans) * 100;

  if (isLimited) {
    return (
      <div className="flex items-center gap-3 px-3 py-2 bg-destructive/10 border border-destructive/30 rounded-lg animate-pulse">
        <AlertCircle className="w-4 h-4 text-destructive" />
        <div className="flex-1">
          <p className="text-xs font-medium text-destructive">Rate Limited</p>
          <p className="text-xs text-destructive/80">
            Wait <span className="font-mono font-bold">{countdown}s</span> before scanning
          </p>
        </div>
        <div className="w-12 h-12 rounded-full border-2 border-destructive flex items-center justify-center">
          <span className="text-sm font-mono font-bold text-destructive">{countdown}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-secondary/30 rounded-lg">
      <Clock className="w-4 h-4 text-muted-foreground" />
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-muted-foreground">Scans remaining</span>
          <span className={cn(
            "text-xs font-medium",
            remainingScans <= 3 ? "text-warning" : "text-muted-foreground"
          )}>
            {remainingScans}/{maxScans}
          </span>
        </div>
        <Progress 
          value={100 - progress} 
          className={cn(
            "h-1",
            remainingScans <= 3 && "bg-warning/20"
          )}
        />
      </div>
    </div>
  );
}
