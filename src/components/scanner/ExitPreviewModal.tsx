import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle, ExternalLink, Wallet, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { formatCurrency, formatPrice } from "@/lib/formatters";

interface Position {
  id: string;
  token_name: string;
  token_symbol: string;
  token_address: string;
  amount: number;
  entry_price: number;
  current_price: number;
  profit_loss_percent: number | null;
}

interface ExitPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  position: Position | null;
  walletAddress: string;
  onConfirmExit: (positionId: string, amountToSell: number, currentPrice: number) => Promise<void>;
}

interface OnChainData {
  balanceUi: number;
  decimals: number;
  loading: boolean;
  error: string | null;
}

export default function ExitPreviewModal({
  open,
  onOpenChange,
  position,
  walletAddress,
  onConfirmExit,
}: ExitPreviewModalProps) {
  const [onChainData, setOnChainData] = useState<OnChainData>({
    balanceUi: 0,
    decimals: 6,
    loading: true,
    error: null,
  });
  const [isExiting, setIsExiting] = useState(false);
  const [exitStatus, setExitStatus] = useState<'idle' | 'pending' | 'confirming' | 'success' | 'failed'>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);

  // Fetch on-chain balance when modal opens
  useEffect(() => {
    if (!open || !position || !walletAddress) {
      setOnChainData({ balanceUi: 0, decimals: 6, loading: false, error: null });
      setExitStatus('idle');
      setTxHash(null);
      return;
    }

    const fetchOnChainData = async () => {
      setOnChainData(prev => ({ ...prev, loading: true, error: null }));
      
      try {
        const { data, error } = await supabase.functions.invoke('token-metadata', {
          body: { mint: position.token_address, owner: walletAddress },
        });

        if (error) {
          throw new Error(error.message || 'Failed to fetch token metadata');
        }

        const balanceUi = Number((data as any)?.balanceUi);
        const decimals = Number((data as any)?.decimals);

        if (!Number.isFinite(balanceUi)) {
          throw new Error('Invalid balance returned');
        }

        setOnChainData({
          balanceUi,
          decimals: Number.isFinite(decimals) ? decimals : 6,
          loading: false,
          error: null,
        });
      } catch (err) {
        setOnChainData({
          balanceUi: 0,
          decimals: 6,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to fetch on-chain data',
        });
      }
    };

    fetchOnChainData();
  }, [open, position, walletAddress]);

  const handleConfirmExit = useCallback(async () => {
    if (!position || onChainData.balanceUi <= 0) return;

    setIsExiting(true);
    setExitStatus('pending');

    try {
      await onConfirmExit(position.id, onChainData.balanceUi, position.current_price);
      setExitStatus('success');
      // Close modal after short delay on success
      setTimeout(() => {
        onOpenChange(false);
      }, 1500);
    } catch (err) {
      setExitStatus('failed');
    } finally {
      setIsExiting(false);
    }
  }, [position, onChainData.balanceUi, onConfirmExit, onOpenChange]);

  if (!position) return null;

  const estimatedSolReceived = onChainData.balanceUi * position.current_price;
  
  // Use percentage-based tolerance (5%) to ignore minor rounding differences
  // Only show mismatch if difference is > 5% AND > 1 token absolute difference
  const percentDiff = position.amount > 0 
    ? Math.abs(onChainData.balanceUi - position.amount) / position.amount 
    : 0;
  const absoluteDiff = Math.abs(onChainData.balanceUi - position.amount);
  const balanceMismatch = percentDiff > 0.05 && absoluteDiff > 1;
  
  const hasNoBalance = onChainData.balanceUi <= 0 && !onChainData.loading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-primary" />
            Exit Preview
          </DialogTitle>
          <DialogDescription>
            Review the on-chain data before confirming the sale
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Token Info */}
          <div className="p-4 rounded-lg bg-secondary/30 border border-border/50">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">{position.token_name}</h3>
                <p className="text-sm text-muted-foreground">{position.token_symbol}</p>
              </div>
              <a
                href={`https://solscan.io/token/${position.token_address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary flex items-center gap-1 hover:underline"
              >
                View on Solscan
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* On-Chain Data */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground">On-Chain Data</h4>
            
            {onChainData.loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Fetching wallet balance...</span>
              </div>
            ) : onChainData.error ? (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-destructive">Failed to fetch data</p>
                    <p className="text-xs text-muted-foreground">{onChainData.error}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex justify-between items-center p-3 rounded-lg bg-secondary/20">
                  <span className="text-sm text-muted-foreground">Wallet Balance</span>
                  <span className="font-mono font-semibold tabular-nums">
                    {onChainData.balanceUi.toLocaleString(undefined, { maximumFractionDigits: 6 })} tokens
                  </span>
                </div>
                
                <div className="flex justify-between items-center p-3 rounded-lg bg-secondary/20">
                  <span className="text-sm text-muted-foreground">Token Decimals</span>
                  <Badge variant="outline" className="font-mono">
                    {onChainData.decimals}
                  </Badge>
                </div>

                <div className="flex justify-between items-center p-3 rounded-lg bg-secondary/20">
                  <span className="text-sm text-muted-foreground">Current Price</span>
                  <span className="font-mono font-semibold tabular-nums">
                    {formatPrice(position.current_price)}
                  </span>
                </div>

                <div className="flex justify-between items-center p-3 rounded-lg bg-primary/10 border border-primary/20">
                  <span className="text-sm font-medium">Est. SOL Received</span>
                  <span className="font-mono font-bold tabular-nums text-primary">
                    ~{estimatedSolReceived.toFixed(6)} SOL
                  </span>
                </div>
              </div>
            )}

            {/* Warnings */}
            {balanceMismatch && !onChainData.loading && !onChainData.error && (
              <div className="p-3 rounded-lg bg-warning/10 border border-warning/30">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-warning mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-warning">Balance Mismatch Detected</p>
                    <p className="text-xs text-muted-foreground">
                      Database shows {position.amount.toLocaleString()} tokens, but wallet has {onChainData.balanceUi.toLocaleString()}. 
                      The on-chain balance will be used.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {hasNoBalance && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                <div className="flex items-start gap-2">
                  <XCircle className="w-4 h-4 text-destructive mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-destructive">No Token Balance</p>
                    <p className="text-xs text-muted-foreground">
                      Your wallet doesn't hold this token. It may have been sold already.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Exit Status */}
            {exitStatus !== 'idle' && (
              <div className={cn(
                "p-3 rounded-lg border flex items-center gap-3",
                exitStatus === 'success' ? 'bg-success/10 border-success/30' :
                exitStatus === 'failed' ? 'bg-destructive/10 border-destructive/30' :
                'bg-primary/10 border-primary/30'
              )}>
                {exitStatus === 'pending' && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                {exitStatus === 'confirming' && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                {exitStatus === 'success' && <CheckCircle2 className="w-4 h-4 text-success" />}
                {exitStatus === 'failed' && <XCircle className="w-4 h-4 text-destructive" />}
                <span className="text-sm font-medium">
                  {exitStatus === 'pending' && 'Waiting for wallet approval...'}
                  {exitStatus === 'confirming' && 'Confirming transaction...'}
                  {exitStatus === 'success' && 'Position closed successfully!'}
                  {exitStatus === 'failed' && 'Exit failed. Check console for details.'}
                </span>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isExiting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirmExit}
            disabled={onChainData.loading || hasNoBalance || isExiting || exitStatus === 'success'}
          >
            {isExiting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Selling...
              </>
            ) : (
              <>Sell {onChainData.balanceUi.toFixed(2)} Tokens</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
