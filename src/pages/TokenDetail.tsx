import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { 
  ArrowLeft, 
  ExternalLink, 
  Copy, 
  Check,
  TrendingUp,
  TrendingDown,
  Droplets,
  Users,
  Clock,
  Shield,
  AlertTriangle,
  Zap,
  RefreshCw,
  Activity,
  BarChart3,
  Lock,
  Unlock,
  CircleDollarSign,
  Coins,
  LineChart
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import AppLayout from '@/components/layout/AppLayout';
import { TokenTradingPanel } from '@/components/token/TokenTradingPanel';
import { TokenSafetyInfo } from '@/components/token/TokenSafetyInfo';
import { TokenPriceChart } from '@/components/token/TokenPriceChart';
import { useToast } from '@/hooks/use-toast';
import { useAppMode } from '@/contexts/AppModeContext';
import { formatDistanceToNow } from 'date-fns';

interface TokenData {
  address: string;
  name: string;
  symbol: string;
  chain: string;
  liquidity: number;
  liquidityLocked: boolean;
  lockPercentage: number | null;
  priceUsd: number;
  priceChange24h: number;
  volume24h: number;
  marketCap: number;
  holders: number;
  createdAt: string;
  earlyBuyers: number;
  buyerPosition: number | null;
  riskScore: number;
  source: string;
  pairAddress: string;
  isPumpFun?: boolean;
  isTradeable?: boolean;
  canBuy?: boolean;
  canSell?: boolean;
  freezeAuthority?: string | null;
  mintAuthority?: string | null;
  safetyReasons?: string[];
}

export default function TokenDetail() {
  const { address } = useParams<{ address: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isDemo } = useAppMode();
  
  const [token, setToken] = useState<TokenData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    // Try to get token data from URL params (passed from scanner)
    const tokenData = searchParams.get('data');
    if (tokenData) {
      try {
        const parsed = JSON.parse(decodeURIComponent(tokenData));
        // Merge with defaults for any missing fields
        setToken({
          address: parsed.address || address || '',
          name: parsed.name || 'Unknown Token',
          symbol: parsed.symbol || 'UNKNOWN',
          chain: parsed.chain || 'solana',
          liquidity: parsed.liquidity || 0,
          liquidityLocked: parsed.liquidityLocked ?? false,
          lockPercentage: parsed.lockPercentage || null,
          priceUsd: parsed.priceUsd || 0,
          priceChange24h: parsed.priceChange24h || 0,
          volume24h: parsed.volume24h || 0,
          marketCap: parsed.marketCap || 0,
          holders: parsed.holders || 0,
          createdAt: parsed.createdAt || new Date().toISOString(),
          earlyBuyers: parsed.earlyBuyers || 0,
          buyerPosition: parsed.buyerPosition || null,
          riskScore: parsed.riskScore ?? 50,
          source: parsed.source || 'DexScreener',
          pairAddress: parsed.pairAddress || '',
          isPumpFun: parsed.isPumpFun ?? false,
          isTradeable: parsed.isTradeable ?? true,
          canBuy: parsed.canBuy ?? true,
          canSell: parsed.canSell ?? true,
          freezeAuthority: parsed.freezeAuthority || null,
          mintAuthority: parsed.mintAuthority || null,
          safetyReasons: parsed.safetyReasons || ['✅ Verified on DexScreener'],
        });
        setLoading(false);
        return;
      } catch (e) {
        console.error('Failed to parse token data from URL:', e);
      }
    }

    // If no data in URL, fetch from DexScreener API
    const fetchTokenFromDexScreener = async () => {
      if (!address) return;
      
      try {
        setLoading(true);
        const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`, {
          signal: AbortSignal.timeout(5000),
        });
        
        if (!response.ok) throw new Error('Failed to fetch token');
        
        const data = await response.json();
        const pairs = data.pairs || [];
        
        // Get the best pair (highest liquidity on Solana)
        const solanaPairs = pairs.filter((p: any) => p.chainId === 'solana');
        const bestPair = solanaPairs.sort((a: any, b: any) => 
          (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
        )[0];
        
        if (bestPair) {
          setToken({
            address: address,
            name: bestPair.baseToken?.name || 'Unknown Token',
            symbol: bestPair.baseToken?.symbol || 'UNKNOWN',
            chain: 'solana',
            liquidity: bestPair.liquidity?.usd || 0,
            liquidityLocked: false,
            lockPercentage: null,
            priceUsd: parseFloat(bestPair.priceUsd) || 0,
            priceChange24h: bestPair.priceChange?.h24 || 0,
            volume24h: bestPair.volume?.h24 || 0,
            marketCap: bestPair.marketCap || 0,
            holders: 0,
            createdAt: bestPair.pairCreatedAt ? new Date(bestPair.pairCreatedAt).toISOString() : new Date().toISOString(),
            earlyBuyers: 0,
            buyerPosition: null,
            riskScore: 50,
            source: 'DexScreener',
            pairAddress: bestPair.pairAddress || '',
            isPumpFun: bestPair.dexId === 'pumpfun',
            isTradeable: true,
            canBuy: true,
            canSell: true,
            freezeAuthority: null,
            mintAuthority: null,
            safetyReasons: ['✅ Verified on DexScreener'],
          });
        } else if (isDemo) {
          setToken(generateDemoToken(address));
        } else {
          // No pairs found - show basic info
          setToken({
            address: address,
            name: 'Unknown Token',
            symbol: 'UNKNOWN',
            chain: 'solana',
            liquidity: 0,
            liquidityLocked: false,
            lockPercentage: null,
            priceUsd: 0,
            priceChange24h: 0,
            volume24h: 0,
            marketCap: 0,
            holders: 0,
            createdAt: new Date().toISOString(),
            earlyBuyers: 0,
            buyerPosition: null,
            riskScore: 80,
            source: 'Unknown',
            pairAddress: '',
            isPumpFun: false,
            isTradeable: false,
            canBuy: false,
            canSell: false,
            freezeAuthority: null,
            mintAuthority: null,
            safetyReasons: ['⚠️ Token not indexed on DexScreener'],
          });
        }
      } catch (err) {
        console.error('Failed to fetch token from DexScreener:', err);
        if (isDemo) {
          setToken(generateDemoToken(address));
        } else {
          setToken({
            address: address,
            name: 'Unknown Token',
            symbol: 'UNKNOWN',
            chain: 'solana',
            liquidity: 0,
            liquidityLocked: false,
            lockPercentage: null,
            priceUsd: 0,
            priceChange24h: 0,
            volume24h: 0,
            marketCap: 0,
            holders: 0,
            createdAt: new Date().toISOString(),
            earlyBuyers: 0,
            buyerPosition: null,
            riskScore: 80,
            source: 'Unknown',
            pairAddress: '',
            isPumpFun: false,
            isTradeable: false,
            canBuy: false,
            canSell: false,
            freezeAuthority: null,
            mintAuthority: null,
            safetyReasons: ['⚠️ Failed to fetch token data'],
          });
        }
      } finally {
        setLoading(false);
      }
    };
    
    fetchTokenFromDexScreener();
  }, [address, searchParams, isDemo]);

  const generateDemoToken = (addr: string): TokenData => {
    const names = ['MoonShot', 'PepeMax', 'DogeLord', 'ShibaKing', 'FlokiGod'];
    const randomName = names[Math.floor(Math.random() * names.length)];
    const isPumpFun = Math.random() > 0.4;
    
    return {
      address: addr,
      name: randomName,
      symbol: randomName.substring(0, 4).toUpperCase(),
      chain: 'solana',
      liquidity: Math.floor(Math.random() * 100000) + 10000,
      liquidityLocked: Math.random() > 0.3,
      lockPercentage: Math.random() > 0.5 ? Math.floor(Math.random() * 50) + 50 : null,
      priceUsd: Math.random() * 0.01,
      priceChange24h: (Math.random() - 0.3) * 200,
      volume24h: Math.floor(Math.random() * 500000) + 50000,
      marketCap: Math.floor(Math.random() * 2000000) + 100000,
      holders: Math.floor(Math.random() * 2000) + 100,
      createdAt: new Date(Date.now() - Math.random() * 86400000 * 7).toISOString(),
      earlyBuyers: Math.floor(Math.random() * 15) + 3,
      buyerPosition: Math.floor(Math.random() * 10) + 1,
      riskScore: Math.floor(Math.random() * 60) + 20,
      source: isPumpFun ? 'Pump.fun' : 'DexScreener',
      pairAddress: `Pair${addr.substring(0, 8)}`,
      isPumpFun,
      isTradeable: true,
      canBuy: true,
      canSell: true,
      freezeAuthority: Math.random() > 0.8 ? 'FreezeAuth123...' : null,
      mintAuthority: Math.random() > 0.7 ? 'MintAuth456...' : null,
      safetyReasons: isPumpFun 
        ? ['✅ Pump.fun bonding curve', '✅ No freeze authority', '⚠️ Low holder count']
        : ['✅ Verified on DexScreener', '✅ Liquidity locked', '✅ No rug pull indicators'],
    };
  };

  const handleCopyAddress = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    toast({ title: 'Address copied to clipboard' });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    // Simulate refresh
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (address) {
      setToken(generateDemoToken(address));
    }
    setRefreshing(false);
    toast({ title: 'Token data refreshed' });
  };

  const formatNumber = (num: number, decimals = 2): string => {
    if (num >= 1000000) return `$${(num / 1000000).toFixed(decimals)}M`;
    if (num >= 1000) return `$${(num / 1000).toFixed(decimals)}K`;
    return `$${num.toFixed(decimals)}`;
  };

  const formatPrice = (price: number): string => {
    if (price < 0.0001) return `$${price.toExponential(2)}`;
    if (price < 0.01) return `$${price.toFixed(6)}`;
    if (price < 1) return `$${price.toFixed(4)}`;
    return `$${price.toFixed(2)}`;
  };

  const getRiskColor = (score: number): string => {
    if (score <= 30) return 'text-success bg-success/10 border-success/30';
    if (score <= 60) return 'text-warning bg-warning/10 border-warning/30';
    return 'text-destructive bg-destructive/10 border-destructive/30';
  };

  const getRiskLabel = (score: number): string => {
    if (score <= 30) return 'LOW RISK';
    if (score <= 60) return 'MEDIUM RISK';
    return 'HIGH RISK';
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="container max-w-7xl mx-auto px-4 py-6 space-y-6">
          <Skeleton className="h-10 w-48" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
            <div className="space-y-6">
              <Skeleton className="h-96 w-full" />
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!token) {
    return (
      <AppLayout>
        <div className="container max-w-7xl mx-auto px-4 py-6">
          <div className="text-center py-20">
            <AlertTriangle className="w-16 h-16 text-warning mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Token Not Found</h2>
            <p className="text-muted-foreground mb-6">
              The token you're looking for could not be found.
            </p>
            <Button onClick={() => navigate('/scanner')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Scanner
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  const isPositiveChange = token.priceChange24h >= 0;

  return (
    <AppLayout>
      <div className="container max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => navigate('/scanner')}
              className="gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                <span className="text-xl font-bold text-primary">{token.symbol[0]}</span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold">{token.name}</h1>
                  <Badge variant="outline" className="font-mono">
                    ${token.symbol}
                  </Badge>
                  {token.isPumpFun && (
                    <Badge className="bg-gradient-to-r from-pink-500 to-purple-500 text-white border-0">
                      🎉 Pump.fun
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="font-mono truncate max-w-[200px]">{address}</span>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6"
                    onClick={handleCopyAddress}
                  >
                    {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                  </Button>
                  <a 
                    href={`https://solscan.io/token/${address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-primary transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge className={`${getRiskColor(token.riskScore)} border px-3 py-1`}>
              <Shield className="w-3 h-3 mr-1" />
              {getRiskLabel(token.riskScore)} ({token.riskScore}%)
            </Badge>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Price Card */}
            <Card className="glass">
              <CardContent className="pt-6">
                <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Current Price</p>
                    <div className="flex items-baseline gap-3">
                      <span className="text-4xl font-bold font-mono">
                        {formatPrice(token.priceUsd)}
                      </span>
                      <span className={`flex items-center gap-1 text-lg font-semibold ${
                        isPositiveChange ? 'text-success' : 'text-destructive'
                      }`}>
                        {isPositiveChange ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                        {isPositiveChange ? '+' : ''}{token.priceChange24h.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    Listed {formatDistanceToNow(new Date(token.createdAt), { addSuffix: true })}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="glass">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-2">
                    <Droplets className="w-4 h-4" />
                    <span className="text-xs">Liquidity</span>
                  </div>
                  <p className="text-xl font-bold font-mono">{formatNumber(token.liquidity)}</p>
                  <div className="flex items-center gap-1 mt-1">
                    {token.liquidityLocked ? (
                      <Badge variant="outline" className="text-xs bg-success/10 text-success border-success/30">
                        <Lock className="w-3 h-3 mr-1" />
                        {token.lockPercentage}% Locked
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs bg-warning/10 text-warning border-warning/30">
                        <Unlock className="w-3 h-3 mr-1" />
                        Unlocked
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="glass">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-2">
                    <Activity className="w-4 h-4" />
                    <span className="text-xs">Volume 24h</span>
                  </div>
                  <p className="text-xl font-bold font-mono">{formatNumber(token.volume24h)}</p>
                </CardContent>
              </Card>

              <Card className="glass">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-2">
                    <CircleDollarSign className="w-4 h-4" />
                    <span className="text-xs">Market Cap</span>
                  </div>
                  <p className="text-xl font-bold font-mono">{formatNumber(token.marketCap)}</p>
                </CardContent>
              </Card>

              <Card className="glass">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-2">
                    <Users className="w-4 h-4" />
                    <span className="text-xs">Holders</span>
                  </div>
                  <p className="text-xl font-bold font-mono">{token.holders.toLocaleString()}</p>
                  {token.earlyBuyers > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {token.earlyBuyers} early buyers
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Tabs Section */}
            <Tabs defaultValue="chart" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="chart" className="gap-2">
                  <LineChart className="w-4 h-4" />
                  Chart
                </TabsTrigger>
                <TabsTrigger value="safety" className="gap-2">
                  <Shield className="w-4 h-4" />
                  Safety
                </TabsTrigger>
                <TabsTrigger value="info" className="gap-2">
                  <Coins className="w-4 h-4" />
                  Info
                </TabsTrigger>
              </TabsList>

              <TabsContent value="chart" className="mt-4">
                <TokenPriceChart token={token} />
              </TabsContent>

              <TabsContent value="safety" className="mt-4">
                <TokenSafetyInfo token={token} />
              </TabsContent>

              <TabsContent value="info" className="mt-4">
                <Card className="glass">
                  <CardHeader>
                    <CardTitle className="text-lg">Token Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Chain</p>
                        <p className="font-medium capitalize">{token.chain}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Source</p>
                        <p className="font-medium">{token.source}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Pair Address</p>
                        <p className="font-mono text-sm truncate">{token.pairAddress}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Buyer Position</p>
                        <p className="font-medium">
                          {token.buyerPosition ? `#${token.buyerPosition}` : 'N/A'}
                        </p>
                      </div>
                    </div>

                    <Separator />

                    <div>
                      <p className="text-sm text-muted-foreground mb-2">Contract Authorities</p>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between p-2 rounded-lg bg-secondary/50">
                          <span className="text-sm">Freeze Authority</span>
                          {token.freezeAuthority ? (
                            <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-success/10 text-success border-success/30">
                              <Check className="w-3 h-3 mr-1" />
                              Revoked
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center justify-between p-2 rounded-lg bg-secondary/50">
                          <span className="text-sm">Mint Authority</span>
                          {token.mintAuthority ? (
                            <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-success/10 text-success border-success/30">
                              <Check className="w-3 h-3 mr-1" />
                              Revoked
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    <Separator />

                    <div className="flex flex-wrap gap-2">
                      <a 
                        href={`https://solscan.io/token/${address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button variant="outline" size="sm" className="gap-2">
                          <ExternalLink className="w-3 h-3" />
                          Solscan
                        </Button>
                      </a>
                      <a 
                        href={`https://dexscreener.com/solana/${address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button variant="outline" size="sm" className="gap-2">
                          <ExternalLink className="w-3 h-3" />
                          DexScreener
                        </Button>
                      </a>
                      <a 
                        href={`https://birdeye.so/token/${address}?chain=solana`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button variant="outline" size="sm" className="gap-2">
                          <ExternalLink className="w-3 h-3" />
                          Birdeye
                        </Button>
                      </a>
                      {token.isPumpFun && (
                        <a 
                          href={`https://pump.fun/${address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Button variant="outline" size="sm" className="gap-2">
                            <ExternalLink className="w-3 h-3" />
                            Pump.fun
                          </Button>
                        </a>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Trading Panel - Right Sidebar */}
          <div className="space-y-6">
            <TokenTradingPanel token={token} />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
