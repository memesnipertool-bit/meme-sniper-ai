import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Clock, ArrowRight } from "lucide-react";

interface NoRouteExitModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tokenSymbol: string;
  tokenName: string;
  onMoveToWaiting: () => void;
  onKeepInList: () => void;
}

export default function NoRouteExitModal({
  open,
  onOpenChange,
  tokenSymbol,
  tokenName,
  onMoveToWaiting,
  onKeepInList,
}: NoRouteExitModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-warning">
            <AlertTriangle className="w-5 h-5" />
            No Swap Route Found
          </DialogTitle>
          <DialogDescription>
            {tokenName} ({tokenSymbol}) cannot be traded right now
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="p-4 rounded-lg bg-warning/10 border border-warning/30">
            <p className="text-sm text-foreground mb-3">
              Neither Jupiter nor Raydium has a swap route for this token. This usually means:
            </p>
            <ul className="text-sm text-muted-foreground space-y-1.5 list-disc list-inside">
              <li>The token has very low or no liquidity</li>
              <li>The liquidity pool was removed</li>
              <li>The token is temporarily unlisted</li>
            </ul>
          </div>

          <div className="p-4 rounded-lg bg-secondary/30 border border-border/50">
            <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              Waiting Liquidity Pool
            </h4>
            <p className="text-xs text-muted-foreground">
              Move this token to a special waiting queue. The bot will check every 30 seconds 
              and automatically sell when a swap route becomes available.
            </p>
          </div>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={onKeepInList}
            className="flex-1"
          >
            Keep in Active Trades
          </Button>
          <Button
            onClick={onMoveToWaiting}
            className="flex-1 bg-warning hover:bg-warning/90 text-warning-foreground gap-2"
          >
            <Clock className="w-4 h-4" />
            Move to Waiting Pool
            <ArrowRight className="w-4 h-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
