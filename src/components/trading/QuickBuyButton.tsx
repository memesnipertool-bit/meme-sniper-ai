import { useState } from 'react';
import { Zap, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TradeConfirmation } from './TradeConfirmation';
import { useWallet } from '@/hooks/useWallet';
import { useAppMode } from '@/contexts/AppModeContext';
import { useToast } from '@/hooks/use-toast';
import type { VersionedTransaction } from '@solana/web3.js';

interface QuickBuyButtonProps {
  tokenMint: string;
  tokenSymbol: string;
  tokenName: string;
  disabled?: boolean;
  onSuccess?: (result: { signature: string; positionId?: string }) => void;
}

const QUICK_BUY_AMOUNTS = [0.1, 0.25, 0.5, 1.0];

export function QuickBuyButton({
  tokenMint,
  tokenSymbol,
  tokenName,
  disabled,
  onSuccess,
}: QuickBuyButtonProps) {
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const { wallet, signAndSendTransaction } = useWallet();
  const { mode } = useAppMode();
  const { toast } = useToast();

  const handleQuickBuy = (amount: number) => {
    if (!wallet.isConnected) {
      toast({
        title: 'Wallet Required',
        description: 'Please connect your wallet to trade',
        variant: 'destructive',
      });
      return;
    }

    if (wallet.network !== 'solana') {
      toast({
        title: 'Solana Wallet Required',
        description: 'Please connect a Solana wallet (Phantom, Solflare, etc.)',
        variant: 'destructive',
      });
      return;
    }

    // Validate SOL balance before letting the user proceed
    const balanceSol = parseFloat(String(wallet.balance || '').replace(/[^\d.]/g, '')) || 0;
    const feeBufferSol = 0.01; // small buffer for network + priority fees
    const requiredSol = (amount > 0 ? amount : 0) + feeBufferSol;

    if (balanceSol < requiredSol) {
      toast({
        title: 'Insufficient SOL Balance',
        description: `Please add SOL to your wallet (need at least ~${requiredSol.toFixed(3)} SOL) and refresh balance.`,
        variant: 'destructive',
      });
      return;
    }

    setSelectedAmount(amount);
    setShowConfirmation(true);
  };

  const handleSignAndSend = async (transaction: VersionedTransaction) => {
    const result = await signAndSendTransaction(transaction);
    return result;
  };

  const handleSuccess = (result: { signature: string; positionId?: string }) => {
    setShowConfirmation(false);
    setSelectedAmount(null);
    onSuccess?.(result);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            size="sm" 
            variant="default"
            disabled={disabled}
            className="gap-1"
          >
            <Zap className="h-3 w-3" />
            Buy
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {QUICK_BUY_AMOUNTS.map((amount) => (
            <DropdownMenuItem
              key={amount}
              onClick={() => handleQuickBuy(amount)}
            >
              {amount} SOL
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onClick={() => handleQuickBuy(0)}>
            Custom amount...
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {showConfirmation && selectedAmount !== null && wallet.address && (
        <TradeConfirmation
          open={showConfirmation}
          onOpenChange={setShowConfirmation}
          tokenMint={tokenMint}
          tokenSymbol={tokenSymbol}
          tokenName={tokenName}
          amountSol={selectedAmount || 0.1}
          walletAddress={wallet.address}
          signAndSend={handleSignAndSend}
          onSuccess={handleSuccess}
        />
      )}
    </>
  );
}
