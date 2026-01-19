import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wallet, Loader2, ExternalLink, Check } from "lucide-react";
import { useWallet } from "@/hooks/useWallet";
import { useWalletModal } from "@/hooks/useWalletModal";
import { cn } from "@/lib/utils";

interface WalletOption {
  id: string;
  name: string;
  icon: string;
  description: string;
  popular?: boolean;
  connectFn: () => Promise<void>;
}

interface WalletConnectionModalProps {
  trigger?: React.ReactNode;
}

export default function WalletConnectionModal({ trigger }: WalletConnectionModalProps) {
  const {
    wallet,
    isConnecting,
    connectPhantom,
    connectSolflare,
    connectBackpack,
    disconnect,
  } = useWallet();
  
  // Use global modal state for programmatic control
  const { isOpen, setOpen } = useWalletModal();
  const [connectingWallet, setConnectingWallet] = useState<string | null>(null);

  const walletOptions: WalletOption[] = [
    {
      id: 'phantom',
      name: 'Phantom',
      icon: 'https://phantom.app/img/phantom-logo.svg',
      description: 'The most popular Solana wallet',
      popular: true,
      connectFn: connectPhantom,
    },
    {
      id: 'solflare',
      name: 'Solflare',
      icon: 'https://solflare.com/favicon.ico',
      description: 'Secure & user-friendly wallet',
      connectFn: connectSolflare,
    },
    {
      id: 'backpack',
      name: 'Backpack',
      icon: 'https://backpack.app/favicon.ico',
      description: 'xNFT-enabled wallet',
      connectFn: connectBackpack,
    },
  ];

  const handleConnect = async (walletOption: WalletOption) => {
    setConnectingWallet(walletOption.id);
    try {
      await walletOption.connectFn();
      setOpen(false);
    } catch (error) {
      console.error('Connection error:', error);
    } finally {
      setConnectingWallet(null);
    }
  };

  const handleDisconnect = async () => {
    await disconnect();
    setOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button
            variant={wallet.isConnected ? "outline" : "default"}
            size="sm"
            className={cn(
              "gap-2 rounded-xl font-medium transition-all duration-300",
              wallet.isConnected
                ? "border-success/30 bg-success/10 text-success hover:bg-success/20"
                : "bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg shadow-primary/25"
            )}
          >
            {wallet.isConnected ? (
              <>
                <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                {wallet.address?.slice(0, 4)}...{wallet.address?.slice(-4)}
              </>
            ) : (
              <>
                <Wallet className="w-4 h-4" />
                Connect Wallet
              </>
            )}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md border-border/50 bg-card/95 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/20">
              <Wallet className="w-5 h-5 text-primary" />
            </div>
            {wallet.isConnected ? 'Wallet Connected' : 'Connect Wallet'}
          </DialogTitle>
        </DialogHeader>

        {wallet.isConnected ? (
          <div className="space-y-4">
            {/* Connected Wallet Info */}
            <div className="p-4 rounded-xl bg-gradient-to-br from-success/10 to-success/5 border border-success/20">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-success/20">
                  <Check className="w-5 h-5 text-success" />
                </div>
                <div>
                  <p className="font-medium text-sm capitalize">{wallet.walletType}</p>
                  <p className="text-xs text-muted-foreground">Connected</p>
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Address</span>
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-secondary/50 px-2 py-0.5 rounded">
                      {wallet.address?.slice(0, 8)}...{wallet.address?.slice(-6)}
                    </code>
                    <a
                      href={`https://solscan.io/account/${wallet.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-primary transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Balance</span>
                  <span className="font-medium">{wallet.balance}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Network</span>
                  <Badge variant="outline" className="capitalize bg-success/10 text-success border-success/30">
                    {wallet.network}
                  </Badge>
                </div>
              </div>
            </div>

            <Button
              variant="outline"
              onClick={handleDisconnect}
              className="w-full border-destructive/30 text-destructive hover:bg-destructive/10"
            >
              Disconnect Wallet
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Connect your Solana wallet to start trading
            </p>
            
            <div className="space-y-2">
              {walletOptions.map((walletOpt) => (
                <button
                  key={walletOpt.id}
                  onClick={() => handleConnect(walletOpt)}
                  disabled={isConnecting}
                  className={cn(
                    "w-full flex items-center gap-3 p-3.5 rounded-xl border border-border/50 bg-secondary/30",
                    "hover:bg-secondary/50 hover:border-primary/30 transition-all duration-200",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    "group"
                  )}
                >
                  <div className="w-10 h-10 rounded-lg bg-secondary/50 flex items-center justify-center overflow-hidden">
                    <img
                      src={walletOpt.icon}
                      alt={walletOpt.name}
                      className="w-6 h-6 object-contain"
                      onError={(e) => {
                        e.currentTarget.src = '';
                        e.currentTarget.className = 'hidden';
                      }}
                    />
                  </div>
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{walletOpt.name}</span>
                      {walletOpt.popular && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-primary/20 text-primary">
                          Popular
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{walletOpt.description}</p>
                  </div>
                  {connectingWallet === walletOpt.id ? (
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  ) : (
                    <div className="w-5 h-5 rounded-full border-2 border-border group-hover:border-primary transition-colors" />
                  )}
                </button>
              ))}
            </div>

            <p className="text-xs text-center text-muted-foreground pt-2">
              By connecting, you agree to our Terms of Service
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}