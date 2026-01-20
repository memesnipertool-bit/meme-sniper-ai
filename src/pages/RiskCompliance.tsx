import React, { forwardRef, useState } from "react";
import TradingHeader from "@/components/trading/TradingHeader";
import { useWallet } from "@/hooks/useWallet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRiskCompliance, RiskCheckLog } from "@/hooks/useRiskCompliance";
import { formatDistanceToNow } from "date-fns";
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  AlertTriangle,
  Ban,
  Lock,
  LockOpen,
  Percent,
  Activity,
  RefreshCw,
  Search,
  Loader2,
  XOctagon,
  Zap,
  History,
  Settings,
  Check,
  X,
  AlertOctagon,
} from "lucide-react";

const RiskCompliance = forwardRef<HTMLDivElement, object>(function RiskCompliance(_props, ref) {
  const {
    settings,
    loading,
    checkLoading,
    logs,
    updateSettings,
    toggleEmergencyStop,
    resetCircuitBreaker,
    checkTokens,
    fetchLogs,
    isEmergencyStopActive,
    isCircuitBreakerTriggered,
  } = useRiskCompliance();

  const [tokenAddress, setTokenAddress] = useState("");
  const [checkResult, setCheckResult] = useState<any>(null);

  const handleManualCheck = async () => {
    if (!tokenAddress.trim()) return;
    const result = await checkTokens([{ address: tokenAddress.trim() }]);
    setCheckResult(result);
    fetchLogs(20);
  };

  const getRiskColor = (score: number) => {
    if (score < 40) return "text-green-500";
    if (score < 70) return "text-yellow-500";
    return "text-red-500";
  };

  const getRiskBadge = (score: number) => {
    if (score < 40) return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Low Risk</Badge>;
    if (score < 70) return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Medium</Badge>;
    return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">High Risk</Badge>;
  };

  const CheckIcon = ({ passed }: { passed: boolean }) => 
    passed ? <Check className="w-4 h-4 text-green-500" /> : <X className="w-4 h-4 text-red-500" />;

  const { wallet, connectPhantom, disconnect } = useWallet();

  const handleConnectWallet = async () => {
    if (wallet.isConnected) {
      await disconnect();
    } else {
      await connectPhantom();
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <TradingHeader
        walletConnected={wallet.isConnected}
        walletAddress={wallet.address || undefined}
        network={wallet.network}
        onConnectWallet={handleConnectWallet}
      />

      <main className="relative pt-20 md:pt-24 pb-8">
        <div className="container mx-auto px-4">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-1 flex items-center gap-2">
                <Shield className="w-8 h-8 text-primary" />
                Risk & Compliance
              </h1>
              <p className="text-muted-foreground">
                Token safety checks, circuit breakers, and trading safeguards
              </p>
            </div>
          </div>

          {/* Emergency Stop Banner */}
          {isEmergencyStopActive && (
            <Card className="mb-6 border-red-500 bg-red-500/10">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <XOctagon className="w-8 h-8 text-red-500 animate-pulse" />
                    <div>
                      <p className="font-bold text-red-500 text-lg">EMERGENCY STOP ACTIVE</p>
                      <p className="text-sm text-muted-foreground">All trading has been halted</p>
                    </div>
                  </div>
                  <Button 
                    variant="outline" 
                    className="border-red-500 text-red-500 hover:bg-red-500/20"
                    onClick={() => toggleEmergencyStop(false)}
                    disabled={loading}
                  >
                    Deactivate
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Circuit Breaker Banner */}
          {isCircuitBreakerTriggered && !isEmergencyStopActive && (
            <Card className="mb-6 border-yellow-500 bg-yellow-500/10">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Zap className="w-8 h-8 text-yellow-500" />
                    <div>
                      <p className="font-bold text-yellow-500">Circuit Breaker Triggered</p>
                      <p className="text-sm text-muted-foreground">Trading paused due to loss threshold</p>
                    </div>
                  </div>
                  <Button 
                    variant="outline" 
                    onClick={resetCircuitBreaker}
                    disabled={loading}
                  >
                    Reset
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quick Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${isEmergencyStopActive ? 'bg-red-500/20' : 'bg-green-500/20'}`}>
                    {isEmergencyStopActive ? (
                      <ShieldX className="w-5 h-5 text-red-500" />
                    ) : (
                      <ShieldCheck className="w-5 h-5 text-green-500" />
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">System Status</p>
                    <p className={`font-semibold ${isEmergencyStopActive ? 'text-red-500' : 'text-green-500'}`}>
                      {isEmergencyStopActive ? 'STOPPED' : 'Active'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${isCircuitBreakerTriggered ? 'bg-yellow-500/20' : 'bg-primary/20'}`}>
                    <Zap className={`w-5 h-5 ${isCircuitBreakerTriggered ? 'text-yellow-500' : 'text-primary'}`} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Circuit Breaker</p>
                    <p className="font-semibold text-foreground">
                      {isCircuitBreakerTriggered ? 'Triggered' : 'Ready'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/20">
                    <AlertTriangle className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Max Risk Score</p>
                    <p className="font-semibold text-foreground">{settings.max_risk_score}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/20">
                    <Percent className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Max Tax Allowed</p>
                    <p className="font-semibold text-foreground">{settings.max_tax_percent}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="check" className="space-y-6">
            <TabsList className="bg-secondary/50">
              <TabsTrigger value="check" className="flex items-center gap-2">
                <Search className="w-4 h-4" /> Token Check
              </TabsTrigger>
              <TabsTrigger value="settings" className="flex items-center gap-2">
                <Settings className="w-4 h-4" /> Settings
              </TabsTrigger>
              <TabsTrigger value="logs" className="flex items-center gap-2">
                <History className="w-4 h-4" /> Check History
              </TabsTrigger>
            </TabsList>

            {/* Token Check Tab */}
            <TabsContent value="check" className="space-y-6">
              <div className="grid lg:grid-cols-2 gap-6">
                {/* Manual Check */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Search className="w-5 h-5" />
                      Manual Token Check
                    </CardTitle>
                    <CardDescription>
                      Enter a token address to run all risk checks
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Enter token address..."
                        value={tokenAddress}
                        onChange={(e) => setTokenAddress(e.target.value)}
                        className="font-mono text-sm"
                      />
                      <Button onClick={handleManualCheck} disabled={checkLoading || !tokenAddress.trim()}>
                        {checkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                      </Button>
                    </div>

                    {/* Check Result */}
                    {checkResult && checkResult.results?.[0] && (
                      <div className="mt-4 space-y-4 p-4 bg-secondary/30 rounded-lg">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {checkResult.canTrade ? (
                              <ShieldCheck className="w-6 h-6 text-green-500" />
                            ) : (
                              <ShieldX className="w-6 h-6 text-red-500" />
                            )}
                            <span className={`font-semibold ${checkResult.canTrade ? 'text-green-500' : 'text-red-500'}`}>
                              {checkResult.canTrade ? 'APPROVED' : 'REJECTED'}
                            </span>
                          </div>
                          {getRiskBadge(checkResult.results[0].riskScore)}
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div className="flex items-center justify-between p-2 bg-background/50 rounded">
                            <span className="flex items-center gap-2">
                              <AlertOctagon className="w-4 h-4" /> Honeypot
                            </span>
                            <CheckIcon passed={checkResult.results[0].checks.honeypot.passed} />
                          </div>
                          <div className="flex items-center justify-between p-2 bg-background/50 rounded">
                            <span className="flex items-center gap-2">
                              <Ban className="w-4 h-4" /> Blacklist
                            </span>
                            <CheckIcon passed={checkResult.results[0].checks.blacklist.passed} />
                          </div>
                          <div className="flex items-center justify-between p-2 bg-background/50 rounded">
                            <span className="flex items-center gap-2">
                              <LockOpen className="w-4 h-4" /> Owner Renounced
                            </span>
                            <CheckIcon passed={checkResult.results[0].checks.ownershipRenounced.passed} />
                          </div>
                          <div className="flex items-center justify-between p-2 bg-background/50 rounded">
                            <span className="flex items-center gap-2">
                              <Lock className="w-4 h-4" /> Liquidity Locked
                            </span>
                            <CheckIcon passed={checkResult.results[0].checks.liquidityLocked.passed} />
                          </div>
                          <div className="flex items-center justify-between p-2 bg-background/50 rounded col-span-2">
                            <span className="flex items-center gap-2">
                              <Percent className="w-4 h-4" /> Tax Check
                            </span>
                            <span className="flex items-center gap-2">
                              <span className="text-muted-foreground text-xs">
                                Buy: {checkResult.results[0].checks.taxCheck.buyTax}% | Sell: {checkResult.results[0].checks.taxCheck.sellTax}%
                              </span>
                              <CheckIcon passed={checkResult.results[0].checks.taxCheck.passed} />
                            </span>
                          </div>
                        </div>

                        {checkResult.results[0].rejectionReasons.length > 0 && (
                          <div className="mt-3 p-3 bg-red-500/10 rounded-lg border border-red-500/20">
                            <p className="text-sm font-medium text-red-500 mb-2">Rejection Reasons:</p>
                            <ul className="text-sm text-red-400 space-y-1">
                              {checkResult.results[0].rejectionReasons.map((reason: string, i: number) => (
                                <li key={i} className="flex items-start gap-2">
                                  <X className="w-4 h-4 mt-0.5 shrink-0" />
                                  {reason}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Emergency Controls */}
                <Card className="border-red-500/20">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-red-500">
                      <XOctagon className="w-5 h-5" />
                      Emergency Controls
                    </CardTitle>
                    <CardDescription>
                      Immediately halt all trading activity
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <Button
                      variant={isEmergencyStopActive ? "outline" : "destructive"}
                      size="lg"
                      className="w-full h-16 text-lg"
                      onClick={() => toggleEmergencyStop(!isEmergencyStopActive)}
                      disabled={loading}
                    >
                      {loading ? (
                        <Loader2 className="w-6 h-6 animate-spin mr-2" />
                      ) : isEmergencyStopActive ? (
                        <>
                          <ShieldCheck className="w-6 h-6 mr-2" />
                          Resume Trading
                        </>
                      ) : (
                        <>
                          <XOctagon className="w-6 h-6 mr-2" />
                          EMERGENCY STOP
                        </>
                      )}
                    </Button>

                    <div className="text-sm text-muted-foreground">
                      <p className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-yellow-500" />
                        When activated, ALL trading will be immediately halted.
                      </p>
                    </div>

                    {isCircuitBreakerTriggered && (
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={resetCircuitBreaker}
                        disabled={loading}
                      >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Reset Circuit Breaker
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Settings Tab */}
            <TabsContent value="settings" className="space-y-6">
              <div className="grid lg:grid-cols-2 gap-6">
                {/* Risk Thresholds */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="w-5 h-5" />
                      Risk Thresholds
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label>Maximum Risk Score</Label>
                        <span className={`font-mono ${getRiskColor(settings.max_risk_score)}`}>
                          {settings.max_risk_score}
                        </span>
                      </div>
                      <Slider
                        value={[settings.max_risk_score]}
                        onValueChange={([value]) => updateSettings({ max_risk_score: value })}
                        max={100}
                        min={10}
                        step={5}
                        disabled={loading}
                      />
                      <p className="text-xs text-muted-foreground">
                        Tokens with risk scores above this will be rejected
                      </p>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label>Maximum Tax Percentage</Label>
                        <span className="font-mono">{settings.max_tax_percent}%</span>
                      </div>
                      <Slider
                        value={[settings.max_tax_percent]}
                        onValueChange={([value]) => updateSettings({ max_tax_percent: value })}
                        max={50}
                        min={1}
                        step={1}
                        disabled={loading}
                      />
                      <p className="text-xs text-muted-foreground">
                        Reject tokens with buy/sell tax higher than this
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Safety Requirements */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Lock className="w-5 h-5" />
                      Safety Requirements
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
                      <div className="flex items-center gap-3">
                        <LockOpen className="w-5 h-5 text-primary" />
                        <div>
                          <p className="font-medium">Require Ownership Renounced</p>
                          <p className="text-xs text-muted-foreground">Owner cannot modify contract</p>
                        </div>
                      </div>
                      <Switch
                        checked={settings.require_ownership_renounced}
                        onCheckedChange={(checked) => updateSettings({ require_ownership_renounced: checked })}
                        disabled={loading}
                      />
                    </div>

                    <div className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Lock className="w-5 h-5 text-primary" />
                        <div>
                          <p className="font-medium">Require Liquidity Locked</p>
                          <p className="text-xs text-muted-foreground">Prevents rug pulls</p>
                        </div>
                      </div>
                      <Switch
                        checked={settings.require_liquidity_locked}
                        onCheckedChange={(checked) => updateSettings({ require_liquidity_locked: checked })}
                        disabled={loading}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Circuit Breaker */}
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Zap className="w-5 h-5" />
                      Circuit Breaker Settings
                    </CardTitle>
                    <CardDescription>
                      Automatically pause trading after significant losses
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Activity className="w-5 h-5 text-primary" />
                        <div>
                          <p className="font-medium">Enable Circuit Breaker</p>
                          <p className="text-xs text-muted-foreground">Automatically halt trading on losses</p>
                        </div>
                      </div>
                      <Switch
                        checked={settings.circuit_breaker_enabled}
                        onCheckedChange={(checked) => updateSettings({ circuit_breaker_enabled: checked })}
                        disabled={loading}
                      />
                    </div>

                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label>Loss Threshold (%)</Label>
                          <span className="font-mono text-red-500">{settings.circuit_breaker_loss_threshold}%</span>
                        </div>
                        <Slider
                          value={[settings.circuit_breaker_loss_threshold]}
                          onValueChange={([value]) => updateSettings({ circuit_breaker_loss_threshold: value })}
                          max={100}
                          min={5}
                          step={5}
                          disabled={loading || !settings.circuit_breaker_enabled}
                        />
                        <p className="text-xs text-muted-foreground">
                          Cumulative loss that triggers the circuit breaker
                        </p>
                      </div>

                      <div className="space-y-3">
                        <Label>Time Window (minutes)</Label>
                        <Input
                          type="number"
                          value={settings.circuit_breaker_time_window_minutes}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            // Validate range 15-1440 (15 minutes to 24 hours)
                            if (!isNaN(val) && val >= 15 && val <= 1440) {
                              updateSettings({ circuit_breaker_time_window_minutes: val });
                            } else if (e.target.value === '') {
                              updateSettings({ circuit_breaker_time_window_minutes: 60 });
                            }
                          }}
                          min={15}
                          max={1440}
                          disabled={loading || !settings.circuit_breaker_enabled}
                        />
                        <p className="text-xs text-muted-foreground">
                          Period over which losses are calculated
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Logs Tab */}
            <TabsContent value="logs">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <History className="w-5 h-5" />
                      Risk Check History
                    </CardTitle>
                    <CardDescription>Recent token risk assessments</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => fetchLogs()}>
                    <RefreshCw className="w-4 h-4 mr-1" /> Refresh
                  </Button>
                </CardHeader>
                <CardContent>
                  {logs.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <History className="w-10 h-10 mx-auto mb-2 opacity-50" />
                      <p>No risk checks performed yet</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {logs.map((log: RiskCheckLog) => (
                        <div key={log.id} className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg hover:bg-secondary/50 transition-colors">
                          <div className="flex items-center gap-3">
                            {log.passed_checks ? (
                              <ShieldCheck className="w-5 h-5 text-green-500" />
                            ) : (
                              <ShieldX className="w-5 h-5 text-red-500" />
                            )}
                            <div>
                              <p className="font-medium flex items-center gap-2">
                                <span className="font-mono text-sm">{log.token_symbol || log.token_address.slice(0, 8) + '...'}</span>
                                <Badge variant="outline" className="text-xs capitalize">{log.chain}</Badge>
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(log.checked_at), { addSuffix: true })}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 text-sm">
                            <div className="text-center">
                              <p className="text-xs text-muted-foreground">Risk</p>
                              <p className={`font-semibold ${getRiskColor(log.risk_score)}`}>{log.risk_score}</p>
                            </div>
                            <div className="flex gap-1">
                              {!log.is_honeypot ? <Check className="w-4 h-4 text-green-500" /> : <AlertOctagon className="w-4 h-4 text-red-500" />}
                              {!log.is_blacklisted ? <Check className="w-4 h-4 text-green-500" /> : <Ban className="w-4 h-4 text-red-500" />}
                              {log.owner_renounced ? <Check className="w-4 h-4 text-green-500" /> : <X className="w-4 h-4 text-yellow-500" />}
                              {log.liquidity_locked ? <Lock className="w-4 h-4 text-green-500" /> : <LockOpen className="w-4 h-4 text-yellow-500" />}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
});

RiskCompliance.displayName = 'RiskCompliance';

export default RiskCompliance;
