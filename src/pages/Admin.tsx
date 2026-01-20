import React, { forwardRef, useState, useEffect } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { useWallet } from "@/hooks/useWallet";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminSettings } from "@/hooks/useAdminSettings";
import {
  Key,
  Shield,
  Zap,
  Save,
  Users,
  Crown,
  Search,
  Droplets,
  AlertTriangle,
  Copy,
  Activity,
  Server,
  Database,
  Cpu,
  Pause,
  Play,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { ApiSettingsModule } from "@/components/admin/ApiSettingsModule";
import { UserManagementPanel } from "@/components/admin/UserManagementPanel";

const Admin = forwardRef<HTMLDivElement, object>(function Admin(_props, ref) {
  const { isAdmin, user } = useAuth();
  const [activeTab, setActiveTab] = useState("api");
  
  // Use persisted admin settings
  const {
    scannerSettings: persistedScannerSettings,
    liquidityRules: persistedLiquidityRules,
    riskFilters: persistedRiskFilters,
    tradingEngine: persistedTradingEngine,
    copyTrading: persistedCopyTrading,
    loading: settingsLoading,
    saving,
    updateScannerSettings,
    updateLiquidityRules,
    updateRiskFilters,
    updateTradingEngine,
    updateCopyTrading,
  } = useAdminSettings();

  // Local state for editing
  const [scannerSettings, setScannerSettings] = useState(persistedScannerSettings);
  const [liquidityRules, setLiquidityRules] = useState(persistedLiquidityRules);
  const [riskFilters, setRiskFilters] = useState(persistedRiskFilters);
  const [tradingEngine, setTradingEngine] = useState(persistedTradingEngine);
  const [copyTrading, setCopyTrading] = useState(persistedCopyTrading);

  // Sync local state when persisted settings load
  useEffect(() => {
    setScannerSettings(persistedScannerSettings);
  }, [persistedScannerSettings]);
  
  useEffect(() => {
    setLiquidityRules(persistedLiquidityRules);
  }, [persistedLiquidityRules]);
  
  useEffect(() => {
    setRiskFilters(persistedRiskFilters);
  }, [persistedRiskFilters]);
  
  useEffect(() => {
    setTradingEngine(persistedTradingEngine);
  }, [persistedTradingEngine]);
  
  useEffect(() => {
    setCopyTrading(persistedCopyTrading);
  }, [persistedCopyTrading]);

  // System Monitoring
  const [systemStats] = useState({
    cpu: 45,
    memory: 62,
    activeConnections: 234,
    apiCalls24h: 12847,
    tradesExecuted: 156,
    successRate: 89.2,
    uptime: "99.8%",
    lastError: "None",
  });

  const tabs = [
    { id: "api", label: "API Settings", icon: Key },
    { id: "scanner", label: "Market Scanner", icon: Search },
    { id: "liquidity", label: "Liquidity Rules", icon: Droplets },
    { id: "risk", label: "Risk Filters", icon: AlertTriangle },
    { id: "engine", label: "Trading Engine", icon: Zap },
    { id: "copytrade", label: "Copy Trading", icon: Copy },
    { id: "users", label: "User Management", icon: Users },
    { id: "monitoring", label: "System Monitoring", icon: Activity },
  ];

  const { wallet, connectPhantom, disconnect } = useWallet();

  const handleConnectWallet = async () => {
    if (wallet.isConnected) {
      await disconnect();
    } else {
      await connectPhantom();
    }
  };

  return (
    <AppLayout>
      <div className="container mx-auto px-4">
          {/* Page Header */}
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2.5 rounded-lg bg-primary/10">
              <Crown className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">
                Admin Control Panel
              </h1>
              <p className="text-muted-foreground">
                Full platform control — APIs, scanning, risk, trading, and monitoring
              </p>
            </div>
            <div className="ml-auto hidden md:flex items-center gap-2">
              {saving && (
                <span className="px-3 py-1 bg-yellow-500/10 text-yellow-500 text-sm rounded-full border border-yellow-500/20 flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Saving...
                </span>
              )}
              <span className="px-3 py-1 bg-success/10 text-success text-sm rounded-full border border-success/20">
                Admin Access
              </span>
            </div>
          </div>

          {settingsLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="grid lg:grid-cols-5 gap-6">
              {/* Sidebar Tabs */}
              <div className="lg:col-span-1">
                <div className="glass rounded-xl p-2 sticky top-24">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all text-sm ${
                        activeTab === tab.id
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                      }`}
                    >
                      <tab.icon className="w-4 h-4 flex-shrink-0" />
                      <span className="font-medium truncate">{tab.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Content Area */}
              <div className="lg:col-span-4">
                {/* API Settings Tab */}
                {activeTab === "api" && (
                  <div className="animate-fade-in">
                    <ApiSettingsModule />
                  </div>
                )}

                {/* Market Scanner Settings Tab */}
                {activeTab === "scanner" && (
                  <div className="space-y-4 animate-fade-in">
                    <div className="glass rounded-xl p-5">
                      <h2 className="text-lg font-semibold text-foreground mb-2">Market Scanner Settings</h2>
                      <p className="text-sm text-muted-foreground mb-6">Configure token discovery and scanning parameters</p>

                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div>
                          <label className="text-sm text-muted-foreground mb-2 block">Scan Interval (seconds)</label>
                          <input type="number" value={scannerSettings.scanInterval} onChange={(e) => setScannerSettings({ ...scannerSettings, scanInterval: e.target.value })} className="w-full h-11 px-4 bg-secondary/50 border border-border rounded-lg text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50" />
                        </div>
                        <div>
                          <label className="text-sm text-muted-foreground mb-2 block">Min Market Cap ($)</label>
                          <input type="number" value={scannerSettings.minMarketCap} onChange={(e) => setScannerSettings({ ...scannerSettings, minMarketCap: e.target.value })} className="w-full h-11 px-4 bg-secondary/50 border border-border rounded-lg text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50" />
                        </div>
                        <div>
                          <label className="text-sm text-muted-foreground mb-2 block">Max Market Cap ($)</label>
                          <input type="number" value={scannerSettings.maxMarketCap} onChange={(e) => setScannerSettings({ ...scannerSettings, maxMarketCap: e.target.value })} className="w-full h-11 px-4 bg-secondary/50 border border-border rounded-lg text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50" />
                        </div>
                        <div>
                          <label className="text-sm text-muted-foreground mb-2 block">Min 24h Volume ($)</label>
                          <input type="number" value={scannerSettings.minVolume24h} onChange={(e) => setScannerSettings({ ...scannerSettings, minVolume24h: e.target.value })} className="w-full h-11 px-4 bg-secondary/50 border border-border rounded-lg text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50" />
                        </div>
                        <div>
                          <label className="text-sm text-muted-foreground mb-2 block">Min Holders</label>
                          <input type="number" value={scannerSettings.minHolders} onChange={(e) => setScannerSettings({ ...scannerSettings, minHolders: e.target.value })} className="w-full h-11 px-4 bg-secondary/50 border border-border rounded-lg text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50" />
                        </div>
                      </div>

                      <div className="mt-6 pt-6 border-t border-border">
                        <h3 className="font-medium text-foreground mb-4">Scanner Filters</h3>
                        <div className="grid sm:grid-cols-2 gap-4">
                          <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg">
                            <div>
                              <p className="font-medium text-foreground">New Pairs Detection</p>
                              <p className="text-sm text-muted-foreground">Scan for newly created trading pairs</p>
                            </div>
                            <button onClick={() => setScannerSettings({ ...scannerSettings, enableNewPairs: !scannerSettings.enableNewPairs })} className={`w-12 h-7 rounded-full relative transition-colors ${scannerSettings.enableNewPairs ? "bg-primary" : "bg-muted"}`}>
                              <div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-transform ${scannerSettings.enableNewPairs ? "translate-x-6" : "translate-x-1"}`} />
                            </button>
                          </div>
                          <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg">
                            <div>
                              <p className="font-medium text-foreground">Trending Filter</p>
                              <p className="text-sm text-muted-foreground">Include trending tokens in results</p>
                            </div>
                            <button onClick={() => setScannerSettings({ ...scannerSettings, enableTrendingFilter: !scannerSettings.enableTrendingFilter })} className={`w-12 h-7 rounded-full relative transition-colors ${scannerSettings.enableTrendingFilter ? "bg-primary" : "bg-muted"}`}>
                              <div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-transform ${scannerSettings.enableTrendingFilter ? "translate-x-6" : "translate-x-1"}`} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button variant="glow" onClick={() => updateScannerSettings(scannerSettings)} disabled={saving}>
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save Scanner Settings
                      </Button>
                    </div>
                  </div>
                )}

                {/* Liquidity Rules Tab */}
                {activeTab === "liquidity" && (
                  <div className="space-y-4 animate-fade-in">
                    <div className="glass rounded-xl p-5">
                      <h2 className="text-lg font-semibold text-foreground mb-2">Liquidity Rules</h2>
                      <p className="text-sm text-muted-foreground mb-6">Define liquidity requirements for token trading</p>

                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div>
                          <label className="text-sm text-muted-foreground mb-2 block">Min Liquidity ($)</label>
                          <input type="number" value={liquidityRules.minLiquidity} onChange={(e) => setLiquidityRules({ ...liquidityRules, minLiquidity: e.target.value })} className="w-full h-11 px-4 bg-secondary/50 border border-border rounded-lg text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50" />
                        </div>
                        <div>
                          <label className="text-sm text-muted-foreground mb-2 block">Max Price Impact (%)</label>
                          <input type="number" value={liquidityRules.maxPriceImpact} onChange={(e) => setLiquidityRules({ ...liquidityRules, maxPriceImpact: e.target.value })} className="w-full h-11 px-4 bg-secondary/50 border border-border rounded-lg text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50" />
                        </div>
                        <div>
                          <label className="text-sm text-muted-foreground mb-2 block">Min Pool Age (minutes)</label>
                          <input type="number" value={liquidityRules.minPoolAge} onChange={(e) => setLiquidityRules({ ...liquidityRules, minPoolAge: e.target.value })} className="w-full h-11 px-4 bg-secondary/50 border border-border rounded-lg text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50" />
                        </div>
                        <div>
                          <label className="text-sm text-muted-foreground mb-2 block">Min LP Ratio (%)</label>
                          <input type="number" value={liquidityRules.lpRatio} onChange={(e) => setLiquidityRules({ ...liquidityRules, lpRatio: e.target.value })} className="w-full h-11 px-4 bg-secondary/50 border border-border rounded-lg text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50" />
                        </div>
                        <div>
                          <label className="text-sm text-muted-foreground mb-2 block">Lock Status</label>
                          <select value={liquidityRules.lockStatus} onChange={(e) => setLiquidityRules({ ...liquidityRules, lockStatus: e.target.value })} className="w-full h-11 px-4 bg-secondary/50 border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50">
                            <option value="any">Any</option>
                            <option value="locked">Locked Only</option>
                            <option value="unlocked">Unlocked Only</option>
                          </select>
                        </div>
                      </div>

                      <div className="mt-6 pt-6 border-t border-border">
                        <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg">
                          <div>
                            <p className="font-medium text-foreground">Require Burned Liquidity</p>
                            <p className="text-sm text-muted-foreground">Only trade tokens with burned LP tokens</p>
                          </div>
                          <button onClick={() => setLiquidityRules({ ...liquidityRules, burnedLiquidity: !liquidityRules.burnedLiquidity })} className={`w-12 h-7 rounded-full relative transition-colors ${liquidityRules.burnedLiquidity ? "bg-primary" : "bg-muted"}`}>
                            <div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-transform ${liquidityRules.burnedLiquidity ? "translate-x-6" : "translate-x-1"}`} />
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button variant="glow" onClick={() => updateLiquidityRules(liquidityRules)} disabled={saving}>
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save Liquidity Rules
                      </Button>
                    </div>
                  </div>
                )}

                {/* Risk Filters Tab */}
                {activeTab === "risk" && (
                  <div className="space-y-4 animate-fade-in">
                    <div className="glass rounded-xl p-5">
                      <h2 className="text-lg font-semibold text-foreground mb-2">Risk Filters</h2>
                      <p className="text-sm text-muted-foreground mb-6">Configure security checks and risk thresholds</p>

                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                        <div>
                          <label className="text-sm text-muted-foreground mb-2 block">Max Risk Score (0-100)</label>
                          <input type="number" value={riskFilters.maxRiskScore} onChange={(e) => setRiskFilters({ ...riskFilters, maxRiskScore: e.target.value })} className="w-full h-11 px-4 bg-secondary/50 border border-border rounded-lg text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50" />
                        </div>
                        <div>
                          <label className="text-sm text-muted-foreground mb-2 block">Top Holder Limit (%)</label>
                          <input type="number" value={riskFilters.topHolderLimit} onChange={(e) => setRiskFilters({ ...riskFilters, topHolderLimit: e.target.value })} className="w-full h-11 px-4 bg-secondary/50 border border-border rounded-lg text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50" />
                        </div>
                        <div>
                          <label className="text-sm text-muted-foreground mb-2 block">Dev Wallet Limit (%)</label>
                          <input type="number" value={riskFilters.devWalletLimit} onChange={(e) => setRiskFilters({ ...riskFilters, devWalletLimit: e.target.value })} className="w-full h-11 px-4 bg-secondary/50 border border-border rounded-lg text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50" />
                        </div>
                      </div>

                      <h3 className="font-medium text-foreground mb-4">Security Checks</h3>
                      <div className="grid sm:grid-cols-2 gap-4">
                        {[
                          { key: "honeypotCheck", label: "Honeypot Detection", desc: "Check for honeypot contracts" },
                          { key: "rugPullDetection", label: "Rug Pull Detection", desc: "Analyze for rug pull patterns" },
                          { key: "contractVerified", label: "Contract Verification", desc: "Require verified source code" },
                          { key: "mintAuthority", label: "Mint Authority Check", desc: "Flag tokens with active mint" },
                          { key: "freezeAuthority", label: "Freeze Authority Check", desc: "Flag tokens with freeze ability" },
                        ].map((item) => (
                          <div key={item.key} className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg">
                            <div>
                              <p className="font-medium text-foreground">{item.label}</p>
                              <p className="text-sm text-muted-foreground">{item.desc}</p>
                            </div>
                            <button onClick={() => setRiskFilters({ ...riskFilters, [item.key]: !riskFilters[item.key as keyof typeof riskFilters] })} className={`w-12 h-7 rounded-full relative transition-colors ${riskFilters[item.key as keyof typeof riskFilters] ? "bg-primary" : "bg-muted"}`}>
                              <div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-transform ${riskFilters[item.key as keyof typeof riskFilters] ? "translate-x-6" : "translate-x-1"}`} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button variant="glow" onClick={() => updateRiskFilters(riskFilters)} disabled={saving}>
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save Risk Filters
                      </Button>
                    </div>
                  </div>
                )}

                {/* Trading Engine Tab */}
                {activeTab === "engine" && (
                  <div className="space-y-4 animate-fade-in">
                    <div className="glass rounded-xl p-5">
                      <div className="flex items-center justify-between mb-6">
                        <div>
                          <h2 className="text-lg font-semibold text-foreground">Trading Engine Controls</h2>
                          <p className="text-sm text-muted-foreground">Master controls for the trading engine</p>
                        </div>
                        <Button variant={tradingEngine.enabled ? "destructive" : "glow"} onClick={() => setTradingEngine({ ...tradingEngine, enabled: !tradingEngine.enabled })}>
                          {tradingEngine.enabled ? <><Pause className="w-4 h-4" />Stop Engine</> : <><Play className="w-4 h-4" />Start Engine</>}
                        </Button>
                      </div>

                      <div className={`p-4 rounded-lg mb-6 ${tradingEngine.enabled ? "bg-success/10 border border-success/20" : "bg-destructive/10 border border-destructive/20"}`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-3 h-3 rounded-full ${tradingEngine.enabled ? "bg-success animate-pulse" : "bg-destructive"}`} />
                          <span className={tradingEngine.enabled ? "text-success font-medium" : "text-destructive font-medium"}>
                            Trading Engine is {tradingEngine.enabled ? "ACTIVE" : "STOPPED"}
                          </span>
                        </div>
                      </div>

                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                        <div>
                          <label className="text-sm text-muted-foreground mb-2 block">Max Slippage (%)</label>
                          <input type="number" value={tradingEngine.maxSlippage} onChange={(e) => setTradingEngine({ ...tradingEngine, maxSlippage: e.target.value })} className="w-full h-11 px-4 bg-secondary/50 border border-border rounded-lg text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50" />
                        </div>
                        <div>
                          <label className="text-sm text-muted-foreground mb-2 block">Default Buy (SOL)</label>
                          <input type="number" value={tradingEngine.defaultBuyAmount} onChange={(e) => setTradingEngine({ ...tradingEngine, defaultBuyAmount: e.target.value })} className="w-full h-11 px-4 bg-secondary/50 border border-border rounded-lg text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50" />
                        </div>
                        <div>
                          <label className="text-sm text-muted-foreground mb-2 block">Max Position (SOL)</label>
                          <input type="number" value={tradingEngine.maxPositionSize} onChange={(e) => setTradingEngine({ ...tradingEngine, maxPositionSize: e.target.value })} className="w-full h-11 px-4 bg-secondary/50 border border-border rounded-lg text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50" />
                        </div>
                        <div>
                          <label className="text-sm text-muted-foreground mb-2 block">Gas Multiplier</label>
                          <input type="number" value={tradingEngine.gasMultiplier} onChange={(e) => setTradingEngine({ ...tradingEngine, gasMultiplier: e.target.value })} className="w-full h-11 px-4 bg-secondary/50 border border-border rounded-lg text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50" />
                        </div>
                        <div>
                          <label className="text-sm text-muted-foreground mb-2 block">Priority Fee (SOL)</label>
                          <input type="number" value={tradingEngine.priorityFee} onChange={(e) => setTradingEngine({ ...tradingEngine, priorityFee: e.target.value })} className="w-full h-11 px-4 bg-secondary/50 border border-border rounded-lg text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50" />
                        </div>
                        <div>
                          <label className="text-sm text-muted-foreground mb-2 block">Retry Attempts</label>
                          <input type="number" value={tradingEngine.retryAttempts} onChange={(e) => setTradingEngine({ ...tradingEngine, retryAttempts: e.target.value })} className="w-full h-11 px-4 bg-secondary/50 border border-border rounded-lg text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50" />
                        </div>
                      </div>

                      <div className="border-t border-border pt-6">
                        <h3 className="font-medium text-foreground mb-4">Automation & Exits</h3>
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                          <div>
                            <label className="text-sm text-muted-foreground mb-2 block">Stop Loss (%)</label>
                            <input type="number" value={tradingEngine.stopLoss} onChange={(e) => setTradingEngine({ ...tradingEngine, stopLoss: e.target.value })} className="w-full h-11 px-4 bg-secondary/50 border border-border rounded-lg text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50" />
                          </div>
                          <div>
                            <label className="text-sm text-muted-foreground mb-2 block">Take Profit (%)</label>
                            <input type="number" value={tradingEngine.takeProfit} onChange={(e) => setTradingEngine({ ...tradingEngine, takeProfit: e.target.value })} className="w-full h-11 px-4 bg-secondary/50 border border-border rounded-lg text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50" />
                          </div>
                          <div>
                            <label className="text-sm text-muted-foreground mb-2 block">Trailing Stop (%)</label>
                            <input type="number" value={tradingEngine.trailingStopPercent} onChange={(e) => setTradingEngine({ ...tradingEngine, trailingStopPercent: e.target.value })} className="w-full h-11 px-4 bg-secondary/50 border border-border rounded-lg text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50" />
                          </div>
                        </div>
                        <div className="grid sm:grid-cols-3 gap-4">
                          {[
                            { key: "autoBuy", label: "Auto-Buy", desc: "Automatically buy matching tokens" },
                            { key: "autoSell", label: "Auto-Sell", desc: "Sell at stop-loss/take-profit" },
                            { key: "trailingStop", label: "Trailing Stop", desc: "Enable trailing stop orders" },
                          ].map((item) => (
                            <div key={item.key} className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
                              <div>
                                <p className="font-medium text-foreground text-sm">{item.label}</p>
                              </div>
                              <button onClick={() => setTradingEngine({ ...tradingEngine, [item.key]: !tradingEngine[item.key as keyof typeof tradingEngine] })} className={`w-10 h-6 rounded-full relative transition-colors ${tradingEngine[item.key as keyof typeof tradingEngine] ? "bg-primary" : "bg-muted"}`}>
                                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${tradingEngine[item.key as keyof typeof tradingEngine] ? "translate-x-4" : "translate-x-0.5"}`} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button variant="glow" onClick={() => updateTradingEngine(tradingEngine)} disabled={saving}>
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save Engine Settings
                      </Button>
                    </div>
                  </div>
                )}

                {/* Copy Trading Tab */}
                {activeTab === "copytrade" && (
                  <div className="space-y-4 animate-fade-in">
                    <div className="glass rounded-xl p-5">
                      <div className="flex items-center justify-between mb-6">
                        <div>
                          <h2 className="text-lg font-semibold text-foreground">Copy Trading Master Controls</h2>
                          <p className="text-sm text-muted-foreground">Platform-wide copy trading configuration</p>
                        </div>
                        <Button variant={copyTrading.enabled ? "destructive" : "glow"} onClick={() => setCopyTrading({ ...copyTrading, enabled: !copyTrading.enabled })}>
                          {copyTrading.enabled ? "Disable Copy Trading" : "Enable Copy Trading"}
                        </Button>
                      </div>

                      <div className={`p-4 rounded-lg mb-6 ${copyTrading.enabled ? "bg-success/10 border border-success/20" : "bg-muted border border-border"}`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-3 h-3 rounded-full ${copyTrading.enabled ? "bg-success animate-pulse" : "bg-muted-foreground"}`} />
                          <span className={copyTrading.enabled ? "text-success font-medium" : "text-muted-foreground font-medium"}>
                            Copy Trading is {copyTrading.enabled ? "ENABLED" : "DISABLED"} platform-wide
                          </span>
                        </div>
                      </div>

                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                        <div>
                          <label className="text-sm text-muted-foreground mb-2 block">Max Wallets to Follow</label>
                          <input type="number" value={copyTrading.maxWalletsToFollow} onChange={(e) => setCopyTrading({ ...copyTrading, maxWalletsToFollow: e.target.value })} className="w-full h-11 px-4 bg-secondary/50 border border-border rounded-lg text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50" />
                        </div>
                        <div>
                          <label className="text-sm text-muted-foreground mb-2 block">Min Wallet PnL (%)</label>
                          <input type="number" value={copyTrading.minWalletPnl} onChange={(e) => setCopyTrading({ ...copyTrading, minWalletPnl: e.target.value })} className="w-full h-11 px-4 bg-secondary/50 border border-border rounded-lg text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50" />
                        </div>
                        <div>
                          <label className="text-sm text-muted-foreground mb-2 block">Copy Delay (seconds)</label>
                          <input type="number" value={copyTrading.copyDelay} onChange={(e) => setCopyTrading({ ...copyTrading, copyDelay: e.target.value })} className="w-full h-11 px-4 bg-secondary/50 border border-border rounded-lg text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50" />
                        </div>
                        <div>
                          <label className="text-sm text-muted-foreground mb-2 block">Max Copy Amount (SOL)</label>
                          <input type="number" value={copyTrading.maxCopyAmount} onChange={(e) => setCopyTrading({ ...copyTrading, maxCopyAmount: e.target.value })} className="w-full h-11 px-4 bg-secondary/50 border border-border rounded-lg text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50" />
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <label className="text-sm text-muted-foreground mb-2 block">Blacklisted Wallets (comma-separated)</label>
                          <textarea value={copyTrading.blacklistedWallets} onChange={(e) => setCopyTrading({ ...copyTrading, blacklistedWallets: e.target.value })} placeholder="Enter wallet addresses to blacklist..." className="w-full h-24 px-4 py-3 bg-secondary/50 border border-border rounded-lg text-foreground font-mono text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" />
                        </div>
                        <div>
                          <label className="text-sm text-muted-foreground mb-2 block">Whitelisted Tokens (comma-separated)</label>
                          <textarea value={copyTrading.whitelistedTokens} onChange={(e) => setCopyTrading({ ...copyTrading, whitelistedTokens: e.target.value })} placeholder="Enter token addresses to whitelist..." className="w-full h-24 px-4 py-3 bg-secondary/50 border border-border rounded-lg text-foreground font-mono text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" />
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button variant="glow" onClick={() => updateCopyTrading(copyTrading)} disabled={saving}>
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save Copy Trading Settings
                      </Button>
                    </div>
                  </div>
                )}

                {/* User Management Tab */}
                {activeTab === "users" && <UserManagementPanel />}

                {/* System Monitoring Tab */}
                {activeTab === "monitoring" && (
                  <div className="space-y-4 animate-fade-in">
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="glass rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Cpu className="w-4 h-4 text-primary" />
                          <span className="text-sm text-muted-foreground">CPU Usage</span>
                        </div>
                        <p className="text-2xl font-bold text-foreground font-mono">{systemStats.cpu}%</p>
                        <div className="mt-2 h-2 bg-secondary rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${systemStats.cpu}%` }} />
                        </div>
                      </div>
                      <div className="glass rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Database className="w-4 h-4 text-primary" />
                          <span className="text-sm text-muted-foreground">Memory</span>
                        </div>
                        <p className="text-2xl font-bold text-foreground font-mono">{systemStats.memory}%</p>
                        <div className="mt-2 h-2 bg-secondary rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${systemStats.memory}%` }} />
                        </div>
                      </div>
                      <div className="glass rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Server className="w-4 h-4 text-success" />
                          <span className="text-sm text-muted-foreground">Uptime</span>
                        </div>
                        <p className="text-2xl font-bold text-success font-mono">{systemStats.uptime}</p>
                      </div>
                      <div className="glass rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Users className="w-4 h-4 text-primary" />
                          <span className="text-sm text-muted-foreground">Active Users</span>
                        </div>
                        <p className="text-2xl font-bold text-foreground font-mono">{systemStats.activeConnections}</p>
                      </div>
                    </div>

                    <div className="glass rounded-xl p-5">
                      <h2 className="text-lg font-semibold text-foreground mb-4">Platform Metrics</h2>
                      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="p-4 bg-secondary/30 rounded-lg">
                          <p className="text-sm text-muted-foreground mb-1">API Calls (24h)</p>
                          <p className="text-xl font-bold text-foreground font-mono">{systemStats.apiCalls24h.toLocaleString()}</p>
                        </div>
                        <div className="p-4 bg-secondary/30 rounded-lg">
                          <p className="text-sm text-muted-foreground mb-1">Trades Executed</p>
                          <p className="text-xl font-bold text-foreground font-mono">{systemStats.tradesExecuted}</p>
                        </div>
                        <div className="p-4 bg-secondary/30 rounded-lg">
                          <p className="text-sm text-muted-foreground mb-1">Success Rate</p>
                          <p className="text-xl font-bold text-success font-mono">{systemStats.successRate}%</p>
                        </div>
                        <div className="p-4 bg-secondary/30 rounded-lg">
                          <p className="text-sm text-muted-foreground mb-1">Last Error</p>
                          <p className="text-xl font-bold text-foreground">{systemStats.lastError}</p>
                        </div>
                      </div>
                    </div>

                    <div className="glass rounded-xl p-5">
                      <h2 className="text-lg font-semibold text-foreground mb-4">Recent Activity Log</h2>
                      <div className="space-y-2 max-h-[300px] overflow-y-auto">
                        {[
                          { time: "2 min ago", type: "success", message: "Trade executed: PEPE buy 0.1 SOL" },
                          { time: "5 min ago", type: "info", message: "New token detected: WOJAK" },
                          { time: "8 min ago", type: "warning", message: "High slippage detected on MOON" },
                          { time: "12 min ago", type: "success", message: "User john@example.com logged in" },
                          { time: "15 min ago", type: "success", message: "API key validated: DexScreener" },
                          { time: "20 min ago", type: "info", message: "Scanner cycle completed: 45 tokens" },
                        ].map((log, i) => (
                          <div key={i} className="flex items-center gap-3 p-3 bg-secondary/20 rounded-lg">
                            <div className={`w-2 h-2 rounded-full ${log.type === "success" ? "bg-success" : log.type === "warning" ? "bg-warning" : "bg-primary"}`} />
                            <span className="text-xs text-muted-foreground w-20">{log.time}</span>
                            <span className="text-sm text-foreground">{log.message}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </AppLayout>
  );
});

Admin.displayName = 'Admin';

export default Admin;