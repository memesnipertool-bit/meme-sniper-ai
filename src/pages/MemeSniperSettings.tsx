import React, { forwardRef, useState, useEffect, useCallback } from 'react';
import TradingHeader from "@/components/trading/TradingHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { useSniperSettings, SnipingPriority } from "@/hooks/useSniperSettings";
import { useWallet } from "@/hooks/useWallet";
import { useDebouncedCallback } from "@/hooks/useDebounce";
import { validateSettings, isValidSolanaAddress, validateField } from "@/lib/sniperValidation";
import {
  Crosshair,
  Save,
  Loader2,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Zap,
  Filter,
  Shield,
  Plus,
  X,
  Users,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

const CATEGORY_OPTIONS = [
  { id: 'animals', label: 'Animals', emoji: '🐕' },
  { id: 'parody', label: 'Parody', emoji: '🎭' },
  { id: 'trend', label: 'Trend', emoji: '📈' },
  { id: 'utility', label: 'Utility', emoji: '⚙️' },
];

const PRIORITY_OPTIONS: { value: SnipingPriority; label: string; description: string }[] = [
  { value: 'normal', label: 'Normal', description: 'Standard priority' },
  { value: 'fast', label: 'Fast', description: 'Higher gas' },
  { value: 'turbo', label: 'Turbo', description: 'Maximum speed' },
];

const MemeSniperSettings = forwardRef<HTMLDivElement, object>(function MemeSniperSettings(_props, ref) {
  const { settings, loading, saving, saveSettings, updateField } = useSniperSettings();
  const { wallet, connectPhantom, disconnect } = useWallet();
  const [newBlacklistToken, setNewBlacklistToken] = useState('');
  const [newWhitelistToken, setNewWhitelistToken] = useState('');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Debounced field update to prevent excessive API calls (300ms delay)
  const debouncedUpdateField = useDebouncedCallback(
    <K extends keyof typeof settings>(field: K, value: (typeof settings)[K]) => {
      if (!settings) return;
      
      // Validate the field
      const validation = validateField(field as any, value as any);
      if (!validation.valid) {
        setValidationErrors(prev => ({ ...prev, [field]: validation.error || 'Invalid' }));
      } else {
        setValidationErrors(prev => {
          const next = { ...prev };
          delete next[field];
          return next;
        });
      }
      
      updateField(field, value);
      setHasUnsavedChanges(true);
    },
    300
  );

  // Immediate update for non-debounced fields (like toggles)
  const immediateUpdateField = useCallback(<K extends keyof typeof settings>(field: K, value: (typeof settings)[K]) => {
    if (!settings) return;
    updateField(field, value);
    setHasUnsavedChanges(true);
  }, [settings, updateField]);

  const handleSave = async () => {
    if (!settings) return;
    
    // Validate all fields before saving
    const validation = validateSettings(settings);
    if (!validation.valid) {
      setValidationErrors(validation.errors);
      toast.error('Please fix validation errors before saving');
      return;
    }
    
    try {
      await saveSettings(settings);
      setValidationErrors({});
      setHasUnsavedChanges(false);
    } catch {
      // Error already handled in hook
    }
  };

  const toggleCategory = (categoryId: string) => {
    if (!settings) return;
    const current = settings.category_filters;
    const updated = current.includes(categoryId)
      ? current.filter(c => c !== categoryId)
      : [...current, categoryId];
    
    // Validate minimum categories
    if (updated.length === 0) {
      toast.error('Select at least one category');
      return;
    }
    
    immediateUpdateField('category_filters', updated);
  };

  const addToBlacklist = () => {
    if (!settings || !newBlacklistToken.trim()) return;
    
    const trimmed = newBlacklistToken.trim();
    
    // Validate address format
    if (!isValidSolanaAddress(trimmed)) {
      toast.error('Invalid Solana token address format');
      return;
    }
    
    if (settings.token_blacklist.includes(trimmed)) {
      toast.error('Token already in blacklist');
      return;
    }
    
    immediateUpdateField('token_blacklist', [...settings.token_blacklist, trimmed]);
    setNewBlacklistToken('');
  };

  const removeFromBlacklist = (token: string) => {
    if (!settings) return;
    immediateUpdateField('token_blacklist', settings.token_blacklist.filter(t => t !== token));
  };

  const addToWhitelist = () => {
    if (!settings || !newWhitelistToken.trim()) return;
    
    const trimmed = newWhitelistToken.trim();
    
    // Validate address format
    if (!isValidSolanaAddress(trimmed)) {
      toast.error('Invalid Solana token address format');
      return;
    }
    
    if (settings.token_whitelist.includes(trimmed)) {
      toast.error('Token already in whitelist');
      return;
    }
    
    immediateUpdateField('token_whitelist', [...settings.token_whitelist, trimmed]);
    setNewWhitelistToken('');
  };

  const removeFromWhitelist = (token: string) => {
    if (!settings) return;
    immediateUpdateField('token_whitelist', settings.token_whitelist.filter(t => t !== token));
  };

  const handleConnectWallet = async () => {
    if (wallet.isConnected) {
      await disconnect();
    } else {
      await connectPhantom();
    }
  };

  // Warn about unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <TradingHeader
          walletConnected={wallet.isConnected}
          walletAddress={wallet.address || undefined}
          network={wallet.network}
          onConnectWallet={handleConnectWallet}
        />
        <div className="flex items-center justify-center pt-32">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="min-h-screen bg-background">
        <TradingHeader
          walletConnected={wallet.isConnected}
          walletAddress={wallet.address || undefined}
          network={wallet.network}
          onConnectWallet={handleConnectWallet}
        />
        <div className="flex items-center justify-center pt-32">
          <p className="text-muted-foreground">Please sign in to access settings.</p>
        </div>
      </div>
    );
  }

  const hasErrors = Object.keys(validationErrors).length > 0;

  return (
    <div className="min-h-screen bg-background">
      <TradingHeader
        walletConnected={wallet.isConnected}
        walletAddress={wallet.address || undefined}
        network={wallet.network}
        onConnectWallet={handleConnectWallet}
      />

      <main className="pt-20 pb-8 px-4">
        <div className="container mx-auto max-w-4xl">
          {/* Page Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-primary/20">
                <Crosshair className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-foreground">
                  Trading Settings
                </h1>
                <p className="text-muted-foreground text-sm">
                  Configure your liquidity-based auto trading parameters
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {hasUnsavedChanges && (
                <Badge variant="outline" className="text-warning border-warning/50">
                  Unsaved changes
                </Badge>
              )}
              <Button 
                onClick={handleSave} 
                disabled={saving || hasErrors} 
                variant="glow"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Save Settings
              </Button>
            </div>
          </div>

          {/* Validation Errors Banner */}
          {hasErrors && (
            <div className="mb-6 p-4 rounded-lg border border-destructive/50 bg-destructive/10">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="w-5 h-5" />
                <span className="font-medium">Please fix the following errors:</span>
              </div>
              <ul className="mt-2 ml-7 list-disc text-sm text-destructive/80">
                {Object.entries(validationErrors).map(([field, error]) => (
                  <li key={field}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-6">
            {/* Liquidity Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-primary" />
                  Liquidity Settings
                </CardTitle>
                <CardDescription>Set minimum liquidity for token detection</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <Label>Minimum Liquidity (SOL)</Label>
                      <span className="text-success font-bold text-xl">{settings.min_liquidity}</span>
                    </div>
                    <Slider
                      value={[settings.min_liquidity]}
                      onValueChange={([v]) => debouncedUpdateField('min_liquidity', v)}
                      min={50}
                      max={1000}
                      step={10}
                      className="[&_[role=slider]]:bg-success [&_[role=slider]]:border-success"
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                      Bot only buys tokens with at least this much liquidity
                    </p>
                    {validationErrors.min_liquidity && (
                      <p className="text-xs text-destructive mt-1">{validationErrors.min_liquidity}</p>
                    )}
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="trade_amount">Buy Amount (SOL)</Label>
                      <div className="flex items-center justify-between mt-2">
                        <Slider
                          value={[settings.trade_amount * 10]}
                          onValueChange={([v]) => debouncedUpdateField('trade_amount', v / 10)}
                          min={1}
                          max={50}
                          step={1}
                          className="flex-1 mr-4"
                        />
                        <span className="font-mono font-bold text-foreground w-12 text-right">
                          {settings.trade_amount}
                        </span>
                      </div>
                      {validationErrors.trade_amount && (
                        <p className="text-xs text-destructive mt-1">{validationErrors.trade_amount}</p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="max_concurrent">Max Concurrent Trades</Label>
                      <div className="flex items-center justify-between mt-2">
                        <Slider
                          value={[settings.max_concurrent_trades]}
                          onValueChange={([v]) => debouncedUpdateField('max_concurrent_trades', v)}
                          min={1}
                          max={10}
                          step={1}
                          className="flex-1 mr-4"
                        />
                        <span className="font-mono font-bold text-foreground w-12 text-right">
                          {settings.max_concurrent_trades}
                        </span>
                      </div>
                      {validationErrors.max_concurrent_trades && (
                        <p className="text-xs text-destructive mt-1">{validationErrors.max_concurrent_trades}</p>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Buyer Position Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  Buyer Position Strategy
                </CardTitle>
                <CardDescription>Enter trades when becoming an early buyer</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  When a new token adds liquidity, if it receives 2nd or 3rd buyer entry, the bot identifies it as a strong momentum token and automatically enters the trade.
                </p>
                <div className="flex gap-3 flex-wrap">
                  {[1, 2, 3, 4, 5].map((pos) => (
                    <div
                      key={pos}
                      className={`px-6 py-3 rounded-lg font-semibold cursor-pointer transition-all ${
                        pos === 2 || pos === 3
                          ? 'bg-success/20 text-success border-2 border-success/50'
                          : 'bg-secondary text-muted-foreground border-2 border-transparent'
                      }`}
                    >
                      Position #{pos}
                      {(pos === 2 || pos === 3) && (
                        <Badge className="ml-2 bg-success/30 text-success text-xs">Recommended</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Profit & Loss Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-success" />
                  Auto Exit Settings
                </CardTitle>
                <CardDescription>Automatic profit taking and stop loss</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid sm:grid-cols-2 gap-6">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <Label className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-success" />
                        Take Profit
                      </Label>
                      <span className="text-success font-bold text-xl">{settings.profit_take_percentage}%</span>
                    </div>
                    <Slider
                      value={[settings.profit_take_percentage]}
                      onValueChange={([v]) => debouncedUpdateField('profit_take_percentage', v)}
                      min={10}
                      max={500}
                      step={5}
                      className="[&_[role=slider]]:bg-success [&_[role=slider]]:border-success"
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                      Auto-sell when profit reaches this percentage
                    </p>
                    {validationErrors.profit_take_percentage && (
                      <p className="text-xs text-destructive mt-1">{validationErrors.profit_take_percentage}</p>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <Label className="flex items-center gap-2">
                        <TrendingDown className="h-4 w-4 text-destructive" />
                        Stop Loss
                      </Label>
                      <span className="text-destructive font-bold text-xl">{settings.stop_loss_percentage}%</span>
                    </div>
                    <Slider
                      value={[settings.stop_loss_percentage]}
                      onValueChange={([v]) => debouncedUpdateField('stop_loss_percentage', v)}
                      min={5}
                      max={50}
                      step={1}
                      className="[&_[role=slider]]:bg-destructive [&_[role=slider]]:border-destructive"
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                      Auto-sell when loss reaches this percentage
                    </p>
                    {validationErrors.stop_loss_percentage && (
                      <p className="text-xs text-destructive mt-1">{validationErrors.stop_loss_percentage}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Sniping Priority */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-warning" />
                  Transaction Priority
                </CardTitle>
                <CardDescription>Set execution speed</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid sm:grid-cols-3 gap-3">
                  {PRIORITY_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => immediateUpdateField('priority', option.value)}
                      className={`p-4 rounded-lg border-2 text-left transition-all ${
                        settings.priority === option.value
                          ? 'border-primary bg-primary/10'
                          : 'border-border bg-secondary/30 hover:bg-secondary/50'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Zap className={`h-4 w-4 ${
                          option.value === 'turbo' ? 'text-destructive' :
                          option.value === 'fast' ? 'text-warning' : 'text-muted-foreground'
                        }`} />
                        <span className="font-semibold text-foreground">{option.label}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{option.description}</p>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Category Filters */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Filter className="h-5 w-5 text-primary" />
                  Token Categories
                </CardTitle>
                <CardDescription>Select which token categories to scan</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3">
                  {CATEGORY_OPTIONS.map((category) => {
                    const isActive = settings.category_filters.includes(category.id);
                    return (
                      <button
                        key={category.id}
                        onClick={() => toggleCategory(category.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-full border-2 transition-all ${
                          isActive
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-secondary/30 text-muted-foreground hover:bg-secondary/50'
                        }`}
                      >
                        <span>{category.emoji}</span>
                        <span className="font-medium">{category.label}</span>
                      </button>
                    );
                  })}
                </div>
                {validationErrors.category_filters && (
                  <p className="text-xs text-destructive mt-2">{validationErrors.category_filters}</p>
                )}
              </CardContent>
            </Card>

            {/* Token Lists */}
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-destructive" />
                    Blacklist
                  </CardTitle>
                  <CardDescription>Tokens to never buy</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Token address..."
                      value={newBlacklistToken}
                      onChange={(e) => setNewBlacklistToken(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addToBlacklist()}
                      className="font-mono text-sm"
                    />
                    <Button size="icon" onClick={addToBlacklist} variant="outline">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                    {settings.token_blacklist.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No tokens blacklisted</p>
                    ) : (
                      settings.token_blacklist.map((token) => (
                        <Badge key={token} variant="destructive" className="gap-1 font-mono text-xs">
                          {token.slice(0, 6)}...{token.slice(-4)}
                          <button onClick={() => removeFromBlacklist(token)}>
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-success" />
                    Whitelist
                  </CardTitle>
                  <CardDescription>Prioritized tokens</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Token address..."
                      value={newWhitelistToken}
                      onChange={(e) => setNewWhitelistToken(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addToWhitelist()}
                      className="font-mono text-sm"
                    />
                    <Button size="icon" onClick={addToWhitelist} variant="outline">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                    {settings.token_whitelist.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No tokens whitelisted</p>
                    ) : (
                      settings.token_whitelist.map((token) => (
                        <Badge key={token} variant="outline" className="gap-1 font-mono text-xs bg-success/20 text-success border-success/30 hover:bg-success/30">
                          {token.slice(0, 6)}...{token.slice(-4)}
                          <button onClick={() => removeFromWhitelist(token)}>
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
});

export default MemeSniperSettings;
