import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  CheckCircle2, 
  XCircle, 
  Wallet, 
  Settings, 
  Coins,
  AlertTriangle,
  Zap
} from "lucide-react";
import { useNavigate } from "react-router-dom";

interface BotPreflightCheckProps {
  isBotActive: boolean;
  isDemo: boolean;
  walletConnected: boolean;
  walletNetwork: string | null;
  walletBalance: string | null;
  tradeAmount: number | null;
  maxConcurrentTrades: number | null;
  autoEntryEnabled: boolean;
  openPositionsCount: number;
  onConnectWallet?: () => void;
}

interface CheckResult {
  passed: boolean;
  label: string;
  detail: string;
  action?: React.ReactNode;
}

export default function BotPreflightCheck({
  isBotActive,
  isDemo,
  walletConnected,
  walletNetwork,
  walletBalance,
  tradeAmount,
  maxConcurrentTrades,
  autoEntryEnabled,
  openPositionsCount,
  onConnectWallet,
}: BotPreflightCheckProps) {
  const navigate = useNavigate();

  // Don't show in demo mode or if bot is not active
  if (isDemo || !isBotActive) return null;

  // Parse balance
  const balanceSol = parseFloat(String(walletBalance || '').replace(/[^\d.]/g, '')) || 0;
  const tradeAmountSol = tradeAmount || 0;
  const feeBuffer = 0.01;
  const requiredBalance = tradeAmountSol + feeBuffer;

  // Available trade slots
  const maxTrades = maxConcurrentTrades ?? 0;
  const availableSlots = Math.max(0, maxTrades - openPositionsCount);

  // Run preflight checks
  const checks: CheckResult[] = [
    {
      passed: walletConnected && walletNetwork === 'solana',
      label: 'Solana Wallet',
      detail: walletConnected && walletNetwork === 'solana' 
        ? `Connected to ${walletNetwork}` 
        : walletConnected 
          ? `Wrong network: ${walletNetwork}` 
          : 'Not connected',
      action: !walletConnected && onConnectWallet && (
        <Button size="sm" variant="outline" onClick={onConnectWallet} className="h-6 text-xs">
          <Wallet className="h-3 w-3 mr-1" />
          Connect
        </Button>
      ),
    },
    {
      passed: balanceSol >= requiredBalance,
      label: 'SOL Balance',
      detail: balanceSol >= requiredBalance 
        ? `${balanceSol.toFixed(4)} SOL available` 
        : `Need ${requiredBalance.toFixed(4)} SOL, have ${balanceSol.toFixed(4)}`,
    },
    {
      passed: autoEntryEnabled,
      label: 'Auto-Entry',
      detail: autoEntryEnabled ? 'Enabled' : 'Disabled - bot will not open trades',
    },
    {
      passed: availableSlots > 0,
      label: 'Trade Slots',
      detail: availableSlots > 0 
        ? `${availableSlots} of ${maxTrades} slots available` 
        : `All ${maxTrades} slots in use (${openPositionsCount} open)`,
    },
    {
      passed: tradeAmountSol > 0,
      label: 'Trade Amount',
      detail: tradeAmountSol > 0 
        ? `${tradeAmountSol} SOL per trade` 
        : 'Not configured',
      action: tradeAmountSol <= 0 && (
        <Button size="sm" variant="outline" onClick={() => navigate('/meme-sniper')} className="h-6 text-xs">
          <Settings className="h-3 w-3 mr-1" />
          Configure
        </Button>
      ),
    },
  ];

  const allPassed = checks.every(c => c.passed);
  const failedCount = checks.filter(c => !c.passed).length;

  // If all checks pass, show a minimal success indicator
  if (allPassed) {
    return (
      <div className="flex items-center gap-2 p-2 bg-success/10 border border-success/30 rounded-lg text-xs">
        <CheckCircle2 className="h-4 w-4 text-success" />
        <span className="text-success font-medium">Bot ready for live trading</span>
        <Badge variant="outline" className="ml-auto text-success border-success/30">
          {availableSlots} slots available
        </Badge>
      </div>
    );
  }

  // Show blocking issues
  return (
    <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle className="flex items-center gap-2">
        <Zap className="h-4 w-4" />
        Bot Cannot Execute Live Trades
        <Badge variant="destructive" className="ml-2">
          {failedCount} issue{failedCount > 1 ? 's' : ''}
        </Badge>
      </AlertTitle>
      <AlertDescription className="mt-3">
        <div className="space-y-2">
          {checks.map((check, idx) => (
            <div 
              key={idx}
              className={`flex items-center justify-between p-2 rounded-lg ${
                check.passed ? 'bg-success/10' : 'bg-destructive/20'
              }`}
            >
              <div className="flex items-center gap-2">
                {check.passed ? (
                  <CheckCircle2 className="h-4 w-4 text-success" />
                ) : (
                  <XCircle className="h-4 w-4 text-destructive" />
                )}
                <span className="font-medium text-sm">{check.label}</span>
                <span className="text-xs text-muted-foreground">— {check.detail}</span>
              </div>
              {check.action}
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Fix the issues above for the bot to execute real trades. The bot is scanning but will skip execution until all checks pass.
        </p>
      </AlertDescription>
    </Alert>
  );
}
