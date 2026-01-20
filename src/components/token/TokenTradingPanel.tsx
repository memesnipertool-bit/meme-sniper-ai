import { useState } from 'react';
import { Zap, ArrowDownUp, TrendingUp, TrendingDown, Loader2, AlertTriangle, Wallet, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { TradeConfirmation } from '@/components/trading/TradeConfirmation';
import { useWallet } from '@/hooks/useWallet';
import { useAppMode } from '@/contexts/AppModeContext';
import { useToast } from '@/hooks/use-toast';
import { useSniperSettings } from '@/hooks/useSniperSettings';
import type { VersionedTransaction } from '@solana/web3.js';

interface TokenTradingPanelProps {
  token: {
    address: string;
    name: string;
    symbol: string;
    priceUsd: number;
    isTradeable?: boolean;
    canBuy?: boolean;
    canSell?: boolean;
    isPumpFun?: boolean;
    liquidity: number;
  };
}

const QUICK_AMOUNTS = [0.1, 0.25, 0.5, 1.0, 2.0];

export function TokenTradingPanel({ token }: TokenTradingPanelProps) {
  const { wallet, signAndSendTransaction } = useWallet();
  const { mode, isDemo } = useAppMode();
  const { toast } = useToast();
  const { settings } = useSniperSettings();
  
  const [activeTab, setActiveTab] = useState<'buy' | 'sell' | 'swap'>('buy');
  const [buyAmount, setBuyAmount] = useState('0.1');
  const [sellPercentage, setSellPercentage] = useState([50]);
  const [swapFromAmount, setSwapFromAmount] = useState('');
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [tradeAction, setTradeAction] = useState<'buy' | 'sell'>('buy');

  const walletBalance = parseFloat(String(wallet.balance || '0').replace(/[^\d.]/g, '')) || 0;
  
  const handleQuickBuy = (amount: number) => {
    setBuyAmount(amount.toString());
    initiateTradeAction('buy', amount);
  };

  const initiateTradeAction = (action: 'buy' | 'sell', amount?: number) => {
    if (!wallet.isConnected) {
      toast({
        title: 'Wallet Required',
        description: 'Please connect your Solana wallet to trade',
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

    const tradeAmount = action === 'buy' ? parseFloat(buyAmount) : (amount || 0);
    const feeBuffer = 0.01;
    
    if (action === 'buy' && walletBalance < tradeAmount + feeBuffer) {
      toast({
        title: 'Insufficient Balance',
        description: `You need at least ${(tradeAmount + feeBuffer).toFixed(3)} SOL`,
        variant: 'destructive',
      });
      return;
    }

    setTradeAction(action);
    setShowConfirmation(true);
  };

  const handleSignAndSend = async (transaction: VersionedTransaction) => {
    return await signAndSendTransaction(transaction);
  };

  const handleTradeSuccess = (result: { signature: string; positionId?: string }) => {
    setShowConfirmation(false);
    toast({
      title: tradeAction === 'buy' ? 'Buy Order Executed!' : 'Sell Order Executed!',
      description: `Transaction: ${result.signature.substring(0, 8)}...`,
    });
  };

  const handleDemoTrade = async (action: 'buy' | 'sell') => {
    setIsExecuting(true);
    
    // Simulate trade execution in demo mode
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    toast({
      title: `Demo ${action === 'buy' ? 'Buy' : 'Sell'} Executed!`,
      description: `Simulated ${action} of ${token.symbol}`,
    });
    
    setIsExecuting(false);
  };

  const handleSwap = async () => {
    if (!swapFromAmount || parseFloat(swapFromAmount) <= 0) {
      toast({
        title: 'Invalid Amount',
        description: 'Please enter a valid amount to swap',
        variant: 'destructive',
      });
      return;
    }

    if (isDemo) {
      await handleDemoTrade('buy');
      return;
    }

    initiateTradeAction('buy', parseFloat(swapFromAmount));
  };

  const estimatedTokens = buyAmount && token.priceUsd > 0 
    ? (parseFloat(buyAmount) * 150) / token.priceUsd // Assuming ~$150/SOL
    : 0;

  const canTrade = token.isTradeable !== false && (token.canBuy || token.canSell);

  return (
    <>
      <Card className="glass sticky top-24">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              Trade {token.symbol}
            </CardTitle>
            <Badge variant={mode === 'demo' ? 'secondary' : 'default'}>
              {mode === 'demo' ? 'Demo' : 'Live'}
            </Badge>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Wallet Status */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">Balance</span>
            </div>
            <span className="font-mono font-medium">
              {wallet.isConnected ? `${walletBalance.toFixed(4)} SOL` : 'Not connected'}
            </span>
          </div>

          {!canTrade && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                <AlertTriangle className="w-4 h-4 text-destructive" />
                <span className="text-sm text-destructive">
                  {token.isPumpFun 
                    ? "Token is still on Pump.fun bonding curve"
                    : "Trading not available for this token"}
                </span>
              </div>
              
              {token.isPumpFun && (
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full gap-2 border-primary/50 hover:bg-primary/10"
                  onClick={() => window.open(`https://pump.fun/coin/${token.address}`, '_blank')}
                >
                  <img 
                    src="https://pump.fun/icon.png" 
                    alt="Pump.fun" 
                    className="w-4 h-4"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                  Trade on Pump.fun
                  <ExternalLink className="w-3 h-3 ml-auto" />
                </Button>
              )}
            </div>
          )}

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'buy' | 'sell' | 'swap')}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="buy" className="gap-1">
                <TrendingUp className="w-3 h-3" />
                Buy
              </TabsTrigger>
              <TabsTrigger value="sell" className="gap-1">
                <TrendingDown className="w-3 h-3" />
                Sell
              </TabsTrigger>
              <TabsTrigger value="swap" className="gap-1">
                <ArrowDownUp className="w-3 h-3" />
                Swap
              </TabsTrigger>
            </TabsList>

            {/* BUY TAB */}
            <TabsContent value="buy" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Amount (SOL)</Label>
                <Input
                  type="number"
                  placeholder="0.1"
                  value={buyAmount}
                  onChange={(e) => setBuyAmount(e.target.value)}
                  className="font-mono"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {QUICK_AMOUNTS.map((amount) => (
                  <Button
                    key={amount}
                    variant={buyAmount === amount.toString() ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setBuyAmount(amount.toString())}
                    className="flex-1 min-w-[60px]"
                  >
                    {amount} SOL
                  </Button>
                ))}
              </div>

              <Separator />

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Est. Tokens</span>
                  <span className="font-mono">
                    ~{estimatedTokens.toLocaleString(undefined, { maximumFractionDigits: 0 })} {token.symbol}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Slippage</span>
                  <span className="font-mono">15%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Priority</span>
                  <span className="font-mono capitalize">{settings?.priority || 'high'}</span>
                </div>
              </div>

              <Button 
                className="w-full gap-2" 
                size="lg"
                variant="glow"
                disabled={!canTrade || isExecuting || (!wallet.isConnected && !isDemo)}
                onClick={() => isDemo ? handleDemoTrade('buy') : initiateTradeAction('buy')}
              >
                {isExecuting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Executing...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    Buy {token.symbol}
                  </>
                )}
              </Button>
            </TabsContent>

            {/* SELL TAB */}
            <TabsContent value="sell" className="space-y-4 mt-4">
              <div className="space-y-3">
                <Label>Sell Percentage</Label>
                <Slider
                  value={sellPercentage}
                  onValueChange={setSellPercentage}
                  max={100}
                  step={25}
                  className="py-2"
                />
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Selling</span>
                  <span className="font-mono font-medium">{sellPercentage[0]}%</span>
                </div>
              </div>

              <div className="flex gap-2">
                {[25, 50, 75, 100].map((pct) => (
                  <Button
                    key={pct}
                    variant={sellPercentage[0] === pct ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSellPercentage([pct])}
                    className="flex-1"
                  >
                    {pct}%
                  </Button>
                ))}
              </div>

              <Separator />

              <div className="p-3 rounded-lg bg-secondary/50 text-sm">
                <p className="text-muted-foreground">
                  You need to hold {token.symbol} tokens in your wallet to sell.
                </p>
              </div>

              <Button 
                className="w-full gap-2" 
                size="lg"
                variant="destructive"
                disabled={!canTrade || isExecuting || (!wallet.isConnected && !isDemo)}
                onClick={() => isDemo ? handleDemoTrade('sell') : initiateTradeAction('sell')}
              >
                {isExecuting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Executing...
                  </>
                ) : (
                  <>
                    <TrendingDown className="w-4 h-4" />
                    Sell {sellPercentage[0]}%
                  </>
                )}
              </Button>
            </TabsContent>

            {/* SWAP TAB */}
            <TabsContent value="swap" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>From (SOL)</Label>
                <Input
                  type="number"
                  placeholder="0.0"
                  value={swapFromAmount}
                  onChange={(e) => setSwapFromAmount(e.target.value)}
                  className="font-mono"
                />
              </div>

              <div className="flex justify-center">
                <div className="p-2 rounded-full bg-secondary">
                  <ArrowDownUp className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>

              <div className="space-y-2">
                <Label>To ({token.symbol})</Label>
                <div className="p-3 rounded-lg bg-secondary/50 font-mono text-lg">
                  {swapFromAmount && token.priceUsd > 0
                    ? ((parseFloat(swapFromAmount) * 150) / token.priceUsd).toLocaleString(undefined, { maximumFractionDigits: 2 })
                    : '0.00'
                  }
                </div>
              </div>

              <Separator />

              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Rate</span>
                  <span className="font-mono">
                    1 SOL ≈ {token.priceUsd > 0 ? (150 / token.priceUsd).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '...'} {token.symbol}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Route</span>
                  <span className="font-mono">Jupiter</span>
                </div>
              </div>

              <Button 
                className="w-full gap-2" 
                size="lg"
                variant="default"
                disabled={!canTrade || isExecuting || !swapFromAmount || (!wallet.isConnected && !isDemo)}
                onClick={handleSwap}
              >
                {isExecuting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Swapping...
                  </>
                ) : (
                  <>
                    <ArrowDownUp className="w-4 h-4" />
                    Swap via Jupiter
                  </>
                )}
              </Button>
            </TabsContent>
          </Tabs>

          {/* Liquidity Info */}
          <div className="pt-2 border-t border-border/50">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Liquidity</span>
              <span className="font-mono">
                ${token.liquidity.toLocaleString()}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Trade Confirmation Modal */}
      {showConfirmation && wallet.address && (
        <TradeConfirmation
          open={showConfirmation}
          onOpenChange={setShowConfirmation}
          tokenMint={token.address}
          tokenSymbol={token.symbol}
          tokenName={token.name}
          amountSol={parseFloat(buyAmount) || 0.1}
          walletAddress={wallet.address}
          signAndSend={handleSignAndSend}
          onSuccess={handleTradeSuccess}
        />
      )}
    </>
  );
}
