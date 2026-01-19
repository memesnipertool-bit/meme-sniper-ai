import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useWallet, BlockchainNetwork } from '@/hooks/useWallet';
import { Wallet, Copy, ExternalLink, RefreshCw, LogOut, Loader2, CheckCircle, Shield } from 'lucide-react';
import { toast } from 'sonner';

const NETWORK_COLORS: Record<BlockchainNetwork, string> = {
  solana: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  ethereum: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  bsc: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
};

const NETWORK_LABELS: Record<BlockchainNetwork, string> = {
  solana: 'Solana',
  ethereum: 'Ethereum',
  bsc: 'BSC',
};

const WALLET_INFO = {
  phantom: { name: 'Phantom', icon: '👻', description: 'Popular Solana wallet' },
  solflare: { name: 'Solflare', icon: '🔥', description: 'Feature-rich Solana wallet' },
  backpack: { name: 'Backpack', icon: '🎒', description: 'xNFT-enabled wallet' },
  metamask: { name: 'MetaMask', icon: '🦊', description: 'EVM wallet' },
  walletconnect: { name: 'WalletConnect', icon: '🔗', description: 'Mobile wallet bridge' },
};

interface WalletOption {
  id: string;
  name: string;
  icon: string;
  description: string;
  networks: BlockchainNetwork[];
  action: (network?: BlockchainNetwork) => void;
  recommended?: boolean;
}

export function WalletConnect() {
  const {
    wallet,
    isConnecting,
    formatAddress,
    connectPhantom,
    connectSolflare,
    connectBackpack,
    connectMetaMask,
    connectWalletConnect,
    disconnect,
    requestDisconnect,
    cancelDisconnect,
    showDisconnectConfirm,
    pendingDisconnect,
    refreshBalance,
  } = useWallet();
  const [isOpen, setIsOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);

  const walletOptions: WalletOption[] = [
    {
      id: 'phantom',
      name: 'Phantom',
      icon: '👻',
      description: 'Most popular Solana wallet',
      networks: ['solana'],
      recommended: true,
      action: () => {
        connectPhantom();
        setIsOpen(false);
      },
    },
    {
      id: 'solflare',
      name: 'Solflare',
      icon: '🔥',
      description: 'Feature-rich Solana wallet',
      networks: ['solana'],
      action: () => {
        connectSolflare();
        setIsOpen(false);
      },
    },
    {
      id: 'backpack',
      name: 'Backpack',
      icon: '🎒',
      description: 'xNFT-enabled wallet',
      networks: ['solana'],
      action: () => {
        connectBackpack();
        setIsOpen(false);
      },
    },
    {
      id: 'metamask-eth',
      name: 'MetaMask (Ethereum)',
      icon: '🦊',
      description: 'Connect via MetaMask',
      networks: ['ethereum'],
      action: () => {
        connectMetaMask('ethereum');
        setIsOpen(false);
      },
    },
    {
      id: 'metamask-bsc',
      name: 'MetaMask (BSC)',
      icon: '🦊',
      description: 'Connect via MetaMask',
      networks: ['bsc'],
      action: () => {
        connectMetaMask('bsc');
        setIsOpen(false);
      },
    },
  ];

  const handleCopyAddress = () => {
    if (wallet.address) {
      navigator.clipboard.writeText(wallet.address);
      setCopied(true);
      toast.success('Address copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRefreshBalance = async () => {
    setIsRefreshing(true);
    await refreshBalance();
    setIsRefreshing(false);
  };

  const getExplorerUrl = () => {
    if (!wallet.address || !wallet.network) return '';
    switch (wallet.network) {
      case 'solana':
        return `https://solscan.io/account/${wallet.address}`;
      case 'ethereum':
        return `https://etherscan.io/address/${wallet.address}`;
      case 'bsc':
        return `https://bscscan.com/address/${wallet.address}`;
      default:
        return '';
    }
  };

  const getWalletInfo = () => {
    if (!wallet.walletType) return null;
    return WALLET_INFO[wallet.walletType];
  };

  if (wallet.isConnected && wallet.address) {
    const walletInfo = getWalletInfo();
    
    return (
      <>
        <ConfirmDialog
          open={showDisconnectConfirm}
          onOpenChange={cancelDisconnect}
          title="Disconnect Wallet?"
          description="Are you sure you want to disconnect your wallet? You'll need to reconnect to perform any transactions."
          confirmLabel="Disconnect"
          variant="warning"
          onConfirm={disconnect}
          loading={pendingDisconnect}
        />
        <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <span className="text-xl">{walletInfo?.icon || '💼'}</span>
              {walletInfo?.name || 'Connected Wallet'}
            </CardTitle>
            <Badge className={wallet.network ? NETWORK_COLORS[wallet.network] : ''}>
              {wallet.network ? NETWORK_LABELS[wallet.network] : 'Unknown'}
            </Badge>
          </div>
          <CardDescription className="flex items-center gap-1">
            <Shield className="h-3 w-3 text-green-500" />
            <span className="text-green-500 text-xs">Secure connection</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Address */}
          <div className="p-3 bg-secondary/50 rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">Wallet Address</p>
            <div className="flex items-center justify-between gap-2">
              <code className="text-sm font-mono text-foreground">
                {formatAddress(wallet.address)}
              </code>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleCopyAddress}
                >
                  {copied ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => window.open(getExplorerUrl(), '_blank')}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Balance */}
          <div className="p-3 bg-secondary/50 rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">Balance</p>
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold text-foreground">
                {wallet.balance || '0'}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleRefreshBalance}
                disabled={isRefreshing}
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>

          {/* Security Notice */}
          <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
            <p className="text-xs text-green-400 flex items-center gap-1">
              <Shield className="h-3 w-3" />
              Your private keys never leave your wallet. All transactions require your approval.
            </p>
          </div>

          {/* Disconnect Button */}
          <Button
            variant="outline"
            className="w-full"
            onClick={requestDisconnect}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Disconnect Wallet
          </Button>
        </CardContent>
      </Card>
      </>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Wallet className="h-4 w-4" />
          Connect Wallet
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect Wallet</DialogTitle>
          <DialogDescription>
            Choose a wallet to connect. Your private keys never leave your wallet.
          </DialogDescription>
        </DialogHeader>
        
        {/* Solana Wallets Section */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Solana Wallets (Recommended)
          </p>
          <div className="grid gap-2">
            {walletOptions.filter(o => o.networks.includes('solana')).map((option) => (
              <button
                key={option.id}
                onClick={() => option.action()}
                disabled={isConnecting}
                className={`flex items-center gap-4 p-4 rounded-lg border transition-all disabled:opacity-50 disabled:cursor-not-allowed text-left ${
                  option.recommended 
                    ? 'border-primary/50 bg-primary/5 hover:bg-primary/10' 
                    : 'border-border bg-secondary/30 hover:bg-secondary/50'
                }`}
              >
                <span className="text-2xl">{option.icon}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-foreground">{option.name}</p>
                    {option.recommended && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        Recommended
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{option.description}</p>
                </div>
                {isConnecting && (
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* EVM Wallets Section */}
        <div className="space-y-2 pt-2 border-t border-border">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            EVM Wallets
          </p>
          <div className="grid gap-2">
            {walletOptions.filter(o => !o.networks.includes('solana')).map((option) => (
              <button
                key={option.id}
                onClick={() => option.action()}
                disabled={isConnecting}
                className="flex items-center gap-4 p-3 rounded-lg border border-border bg-secondary/30 hover:bg-secondary/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-left"
              >
                <span className="text-xl">{option.icon}</span>
                <div className="flex-1">
                  <p className="font-medium text-foreground text-sm">{option.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {option.networks.map(n => NETWORK_LABELS[n]).join(', ')}
                  </p>
                </div>
                {isConnecting && (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1">
            <Shield className="h-3 w-3" />
            Your private keys never leave your wallet. We only request signing permissions.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}