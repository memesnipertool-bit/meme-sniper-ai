import { useState } from 'react';
import { VersionedTransaction } from '@solana/web3.js';
import { AlertTriangle, Zap, Shield, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { TransactionStatus } from './TransactionStatus';
import { 
  useTradeExecution, 
  SOL_MINT,
  type TradeParams,
  type PriorityLevel,
  type TransactionStatus as TxStatus,
} from '@/hooks/useTradeExecution';

interface TradeConfirmationProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tokenMint: string;
  tokenSymbol: string;
  tokenName: string;
  amountSol: number;
  walletAddress: string;
  signAndSend: (transaction: VersionedTransaction) => Promise<{ signature: string; success: boolean; error?: string }>;
  onSuccess?: (result: { signature: string; positionId?: string }) => void;
}

const PRIORITY_OPTIONS: { value: PriorityLevel; label: string; fee: string }[] = [
  { value: 'low', label: 'Low', fee: '~0.00001 SOL' },
  { value: 'medium', label: 'Medium', fee: '~0.0001 SOL' },
  { value: 'high', label: 'High', fee: '~0.001 SOL' },
  { value: 'veryHigh', label: 'Turbo', fee: '~0.005 SOL' },
];

export function TradeConfirmation({
  open,
  onOpenChange,
  tokenMint,
  tokenSymbol,
  tokenName,
  amountSol,
  walletAddress,
  signAndSend,
  onSuccess,
}: TradeConfirmationProps) {
  const [slippageBps, setSlippageBps] = useState(100); // 1%
  const [profitTake, setProfitTake] = useState(50);
  const [stopLoss, setStopLoss] = useState(20);
  const [priorityLevel, setPriorityLevel] = useState<PriorityLevel>('medium');

  const {
    status,
    currentQuote,
    error,
    txSignature,
    isDemo,
    executeTrade,
    reset,
  } = useTradeExecution();

  const isTrading = !['idle', 'confirmed', 'failed'].includes(status);
  const amountLamports = Math.floor(amountSol * 1e9);

  const handleExecute = async () => {
    const params: TradeParams = {
      inputMint: SOL_MINT,
      outputMint: tokenMint,
      amount: amountLamports.toString(),
      slippageBps,
      priorityLevel,
      tokenSymbol,
      tokenName,
      profitTakePercent: profitTake,
      stopLossPercent: stopLoss,
    };

    const result = await executeTrade(params, walletAddress, signAndSend);

    if (result.success && onSuccess) {
      onSuccess({
        signature: result.signature!,
        positionId: result.positionId,
      });
    }
  };

  const handleClose = () => {
    if (!isTrading) {
      reset();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Confirm Trade
            {isDemo && (
              <Badge variant="secondary" className="ml-2">Demo</Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Buy {tokenSymbol} ({tokenName})
          </DialogDescription>
        </DialogHeader>

        {/* Show transaction status when trading */}
        {status !== 'idle' && (
          <TransactionStatus
            status={status}
            quote={currentQuote}
            signature={txSignature}
            error={error}
            tokenSymbol={tokenSymbol}
            onRetry={handleExecute}
            onClose={handleClose}
          />
        )}

        {/* Show configuration when idle */}
        {status === 'idle' && (
          <div className="space-y-6">
            {/* Trade Summary */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-mono font-medium">{amountSol} SOL</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Token</span>
                <span className="font-medium">{tokenSymbol}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Slippage</span>
                <span className="font-mono">{(slippageBps / 100).toFixed(1)}%</span>
              </div>
            </div>

            {/* Slippage Slider */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Slippage Tolerance
              </Label>
              <Slider
                value={[slippageBps]}
                onValueChange={([v]) => setSlippageBps(v)}
                min={50}
                max={500}
                step={10}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0.5%</span>
                <span className={cn(
                  'font-mono',
                  slippageBps > 300 && 'text-yellow-500'
                )}>
                  {(slippageBps / 100).toFixed(1)}%
                </span>
                <span>5%</span>
              </div>
            </div>

            {/* Exit Strategy */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Exit Strategy
              </Label>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Take Profit</span>
                    <span className="text-green-500 font-mono">+{profitTake}%</span>
                  </div>
                  <Slider
                    value={[profitTake]}
                    onValueChange={([v]) => setProfitTake(v)}
                    min={10}
                    max={500}
                    step={10}
                    className="w-full"
                  />
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Stop Loss</span>
                    <span className="text-destructive font-mono">-{stopLoss}%</span>
                  </div>
                  <Slider
                    value={[stopLoss]}
                    onValueChange={([v]) => setStopLoss(v)}
                    min={5}
                    max={50}
                    step={5}
                    className="w-full"
                  />
                </div>
              </div>
            </div>

            {/* Priority Fee */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Transaction Priority
              </Label>
              <div className="grid grid-cols-4 gap-2">
                {PRIORITY_OPTIONS.map((option) => (
                  <Button
                    key={option.value}
                    variant={priorityLevel === option.value ? 'default' : 'outline'}
                    size="sm"
                    className="flex-col h-auto py-2"
                    onClick={() => setPriorityLevel(option.value)}
                  >
                    <span className="text-xs font-medium">{option.label}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {option.fee}
                    </span>
                  </Button>
                ))}
              </div>
            </div>

            {/* Warnings */}
            {slippageBps > 300 && (
              <div className="flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5" />
                <p className="text-sm text-yellow-600 dark:text-yellow-400">
                  High slippage increases risk of unfavorable pricing
                </p>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        {status === 'idle' && (
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button onClick={handleExecute} className="gap-2">
              <Zap className="h-4 w-4" />
              {isDemo ? 'Simulate Trade' : 'Execute Trade'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
