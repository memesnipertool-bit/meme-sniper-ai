import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  RefreshCw, 
  Zap, 
  Trash2, 
  Play, 
  Loader2,
  AlertTriangle,
  XCircle,
  Wallet,
} from "lucide-react";

interface RecoveryControlsProps {
  onForceScan: () => void;
  onForceEvaluate: () => void;
  onClearProcessed: () => void;
  onResetBot: () => void;
  onCleanupStuck?: () => void;
  onSyncPositions?: () => Promise<void>;
  scanning: boolean;
  evaluating: boolean;
  cleaningUp?: boolean;
  syncingPositions?: boolean;
  processedCount: number;
  stuckPositionsCount?: number;
  openPositionsCount?: number;
  botActive: boolean;
}

export default function RecoveryControls({
  onForceScan,
  onForceEvaluate,
  onClearProcessed,
  onResetBot,
  onCleanupStuck,
  onSyncPositions,
  scanning,
  evaluating,
  cleaningUp = false,
  syncingPositions = false,
  processedCount,
  stuckPositionsCount = 0,
  openPositionsCount = 0,
  botActive,
}: RecoveryControlsProps) {
  const [scanCooldown, setScanCooldown] = useState(false);
  const [evalCooldown, setEvalCooldown] = useState(false);

  const handleForceScan = useCallback(() => {
    if (scanCooldown) return;
    onForceScan();
    setScanCooldown(true);
    setTimeout(() => setScanCooldown(false), 5000);
  }, [onForceScan, scanCooldown]);

  const handleForceEvaluate = useCallback(() => {
    if (evalCooldown) return;
    onForceEvaluate();
    setEvalCooldown(true);
    setTimeout(() => setEvalCooldown(false), 10000);
  }, [onForceEvaluate, evalCooldown]);

  return (
    <Card className="bg-card/80 backdrop-blur-sm border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-warning" />
            Recovery Controls
          </div>
          <Badge variant="outline" className="text-[10px] h-4">
            {processedCount} processed
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-9 text-xs"
            onClick={handleForceScan}
            disabled={scanning || scanCooldown}
          >
            {scanning ? (
              <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3 mr-1.5" />
            )}
            {scanCooldown ? 'Wait...' : 'Force Scan'}
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            className="h-9 text-xs"
            onClick={handleForceEvaluate}
            disabled={evaluating || evalCooldown || !botActive}
          >
            {evaluating ? (
              <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
            ) : (
              <Zap className="w-3 h-3 mr-1.5" />
            )}
            {evalCooldown ? 'Wait...' : 'Force Eval'}
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            className="h-9 text-xs"
            onClick={onClearProcessed}
          >
            <Trash2 className="w-3 h-3 mr-1.5" />
            Clear Cache
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            className="h-9 text-xs text-destructive hover:text-destructive"
            onClick={onResetBot}
          >
            <Play className="w-3 h-3 mr-1.5" />
            Reset Bot
          </Button>
        </div>
        
        {/* Sync Positions with On-Chain Balances */}
        {onSyncPositions && openPositionsCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="w-full h-9 text-xs mt-2 border-primary/50 text-primary hover:bg-primary/10 hover:text-primary"
            onClick={onSyncPositions}
            disabled={syncingPositions}
          >
            {syncingPositions ? (
              <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
            ) : (
              <Wallet className="w-3 h-3 mr-1.5" />
            )}
            {syncingPositions ? 'Syncing...' : `Sync ${openPositionsCount} Position${openPositionsCount > 1 ? 's' : ''} with Wallet`}
          </Button>
        )}
        
        {/* Cleanup Stuck Positions - Full width button */}
        {onCleanupStuck && stuckPositionsCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="w-full h-9 text-xs mt-2 border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={onCleanupStuck}
            disabled={cleaningUp}
          >
            {cleaningUp ? (
              <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
            ) : (
              <XCircle className="w-3 h-3 mr-1.5" />
            )}
            {cleaningUp ? 'Cleaning...' : `Cleanup ${stuckPositionsCount} Stuck Position${stuckPositionsCount > 1 ? 's' : ''}`}
          </Button>
        )}
        
        <p className="text-[10px] text-muted-foreground mt-2 text-center">
          Use if bot appears stuck or not trading.
        </p>
      </CardContent>
    </Card>
  );
}
