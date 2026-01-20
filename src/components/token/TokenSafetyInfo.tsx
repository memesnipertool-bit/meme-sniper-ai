import { Shield, AlertTriangle, Check, X, Info, Lock, Unlock, Users, Clock, Droplets } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';

interface TokenSafetyInfoProps {
  token: {
    address: string;
    riskScore: number;
    liquidityLocked: boolean;
    lockPercentage: number | null;
    holders: number;
    createdAt: string;
    liquidity: number;
    freezeAuthority?: string | null;
    mintAuthority?: string | null;
    safetyReasons?: string[];
    isPumpFun?: boolean;
    isTradeable?: boolean;
    canBuy?: boolean;
    canSell?: boolean;
  };
}

interface SafetyCheck {
  label: string;
  status: 'pass' | 'warning' | 'fail';
  description: string;
  icon: typeof Check;
}

export function TokenSafetyInfo({ token }: TokenSafetyInfoProps) {
  const getRiskLevel = (score: number): { label: string; color: string; bgColor: string } => {
    if (score <= 30) return { label: 'Low Risk', color: 'text-success', bgColor: 'bg-success' };
    if (score <= 60) return { label: 'Medium Risk', color: 'text-warning', bgColor: 'bg-warning' };
    return { label: 'High Risk', color: 'text-destructive', bgColor: 'bg-destructive' };
  };

  const riskLevel = getRiskLevel(token.riskScore);

  // Generate safety checks based on token data
  const safetyChecks: SafetyCheck[] = [
    {
      label: 'Liquidity Locked',
      status: token.liquidityLocked ? 'pass' : 'warning',
      description: token.liquidityLocked 
        ? `${token.lockPercentage || 0}% of liquidity is locked` 
        : 'Liquidity is not locked - higher rug risk',
      icon: token.liquidityLocked ? Lock : Unlock,
    },
    {
      label: 'Freeze Authority',
      status: token.freezeAuthority ? 'fail' : 'pass',
      description: token.freezeAuthority 
        ? 'Developer can freeze transfers' 
        : 'No freeze authority - safe',
      icon: token.freezeAuthority ? AlertTriangle : Check,
    },
    {
      label: 'Mint Authority',
      status: token.mintAuthority ? 'warning' : 'pass',
      description: token.mintAuthority 
        ? 'Developer can mint new tokens' 
        : 'No mint authority - supply is fixed',
      icon: token.mintAuthority ? AlertTriangle : Check,
    },
    {
      label: 'Holder Distribution',
      status: token.holders > 100 ? 'pass' : token.holders > 30 ? 'warning' : 'fail',
      description: `${token.holders.toLocaleString()} holders`,
      icon: Users,
    },
    {
      label: 'Liquidity Depth',
      status: token.liquidity > 50000 ? 'pass' : token.liquidity > 10000 ? 'warning' : 'fail',
      description: `$${token.liquidity.toLocaleString()} liquidity`,
      icon: Droplets,
    },
    {
      label: 'Trading Enabled',
      status: token.isTradeable && token.canBuy && token.canSell ? 'pass' : 'fail',
      description: token.isTradeable 
        ? 'Token is tradeable' 
        : 'Trading may be restricted',
      icon: token.isTradeable ? Check : X,
    },
  ];

  const passedChecks = safetyChecks.filter(c => c.status === 'pass').length;
  const totalChecks = safetyChecks.length;
  const safetyScore = Math.round((passedChecks / totalChecks) * 100);

  return (
    <Card className="glass">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Shield className="w-5 h-5" />
          Safety Analysis
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overall Risk Score */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Risk Score</span>
            <Badge className={`${riskLevel.color} bg-opacity-10`}>
              {riskLevel.label}
            </Badge>
          </div>
          <div className="space-y-2">
            <Progress 
              value={100 - token.riskScore} 
              className="h-3"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>High Risk</span>
              <span className="font-mono font-medium">{token.riskScore}%</span>
              <span>Low Risk</span>
            </div>
          </div>
        </div>

        <Separator />

        {/* Safety Checks */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Safety Checks</span>
            <span className="text-muted-foreground">{passedChecks}/{totalChecks} passed</span>
          </div>
          
          <div className="space-y-2">
            {safetyChecks.map((check, index) => {
              const IconComponent = check.icon;
              const statusColors = {
                pass: 'text-success bg-success/10 border-success/30',
                warning: 'text-warning bg-warning/10 border-warning/30',
                fail: 'text-destructive bg-destructive/10 border-destructive/30',
              };
              const statusIcons = {
                pass: Check,
                warning: AlertTriangle,
                fail: X,
              };
              const StatusIcon = statusIcons[check.status];

              return (
                <div
                  key={index}
                  className={`flex items-center justify-between p-3 rounded-lg border ${statusColors[check.status]}`}
                >
                  <div className="flex items-center gap-3">
                    <IconComponent className="w-4 h-4" />
                    <div>
                      <p className="text-sm font-medium">{check.label}</p>
                      <p className="text-xs opacity-80">{check.description}</p>
                    </div>
                  </div>
                  <StatusIcon className="w-4 h-4" />
                </div>
              );
            })}
          </div>
        </div>

        {/* Safety Reasons from Scanner */}
        {token.safetyReasons && token.safetyReasons.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Info className="w-4 h-4" />
                Scanner Results
              </div>
              <div className="space-y-1">
                {token.safetyReasons.map((reason, index) => (
                  <p key={index} className="text-sm text-muted-foreground pl-6">
                    {reason}
                  </p>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Pump.fun Badge */}
        {token.isPumpFun && (
          <>
            <Separator />
            <div className="flex items-center gap-2 p-3 rounded-lg bg-gradient-to-r from-pink-500/10 to-purple-500/10 border border-pink-500/30">
              <span className="text-2xl">🎉</span>
              <div>
                <p className="text-sm font-medium">Pump.fun Token</p>
                <p className="text-xs text-muted-foreground">
                  Listed on Pump.fun bonding curve
                </p>
              </div>
            </div>
          </>
        )}

        {/* Safety Score Summary */}
        <div className="p-4 rounded-lg bg-secondary/50 text-center">
          <p className="text-sm text-muted-foreground mb-1">Safety Score</p>
          <p className={`text-3xl font-bold ${
            safetyScore >= 70 ? 'text-success' : safetyScore >= 40 ? 'text-warning' : 'text-destructive'
          }`}>
            {safetyScore}%
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
