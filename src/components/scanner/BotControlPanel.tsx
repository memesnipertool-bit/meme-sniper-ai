import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SniperSettings } from "@/hooks/useSniperSettings";
import { useDebouncedCallback } from "@/hooks/useDebounce";
import { TRADING_LIMITS, validateSniperSettings, clampValue } from "@/lib/validation";
import { 
  Bot,
  DollarSign,
  Target,
  TrendingUp,
  TrendingDown,
  Zap,
  Shield,
  Loader2,
  HelpCircle,
  AlertCircle,
  Users,
  Settings2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface BotControlPanelProps {
  settings: SniperSettings | null;
  saving: boolean;
  onUpdateField: <K extends keyof SniperSettings>(field: K, value: SniperSettings[K]) => void;
  onSave: () => void;
  isActive: boolean;
  onToggleActive: (active: boolean) => void;
  autoEntryEnabled: boolean;
  onAutoEntryChange: (enabled: boolean) => void;
  autoExitEnabled: boolean;
  onAutoExitChange: (enabled: boolean) => void;
  isDemo?: boolean;
  walletConnected?: boolean;
  walletAddress?: string | null;
  walletBalance?: string | null;
}

export default function BotControlPanel({
  settings,
  saving,
  onUpdateField,
  onSave,
  isActive,
  onToggleActive,
  autoEntryEnabled,
  onAutoEntryChange,
  autoExitEnabled,
  onAutoExitChange,
  isDemo = false,
  walletConnected = false,
  walletAddress = null,
  walletBalance = null,
}: BotControlPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);

  const debouncedSave = useDebouncedCallback(() => {
    if (settings) {
      const validation = validateSniperSettings(settings);
      if (validation.isValid) {
        setValidationError(null);
      } else {
        setValidationError(validation.error || null);
      }
    }
  }, 500);

  const handleUpdateField = <K extends keyof SniperSettings>(field: K, value: SniperSettings[K]) => {
    let clampedValue = value;
    if (field === 'min_liquidity' && typeof value === 'number') {
      clampedValue = clampValue(value, TRADING_LIMITS.MIN_LIQUIDITY.min, TRADING_LIMITS.MIN_LIQUIDITY.max) as SniperSettings[K];
    } else if (field === 'trade_amount' && typeof value === 'number') {
      clampedValue = clampValue(value, TRADING_LIMITS.TRADE_AMOUNT.min, TRADING_LIMITS.TRADE_AMOUNT.max) as SniperSettings[K];
    } else if (field === 'profit_take_percentage' && typeof value === 'number') {
      clampedValue = clampValue(value, TRADING_LIMITS.TAKE_PROFIT.min, TRADING_LIMITS.TAKE_PROFIT.max) as SniperSettings[K];
    } else if (field === 'stop_loss_percentage' && typeof value === 'number') {
      clampedValue = clampValue(value, TRADING_LIMITS.STOP_LOSS.min, TRADING_LIMITS.STOP_LOSS.max) as SniperSettings[K];
    }
    
    onUpdateField(field, clampedValue);
    debouncedSave();
  };

  if (!settings) {
    return (
      <div className="bg-card/80 backdrop-blur-sm rounded-xl border border-border/50 p-6 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="bg-card/80 backdrop-blur-sm rounded-xl border border-border/50 overflow-hidden">
      {/* Header - Always visible */}
      <div className="p-4 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-colors ${
              isActive 
                ? 'bg-gradient-to-br from-success/20 to-success/5 border-success/30' 
                : 'bg-secondary border-border/50'
            }`}>
              <Bot className={`w-5 h-5 ${isActive ? 'text-success' : 'text-muted-foreground'}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-foreground">Sniper Bot</h2>
                <Badge 
                  variant={isActive ? "default" : "secondary"}
                  className={isActive ? "bg-success/20 text-success border-success/30" : ""}
                >
                  {isActive ? '● Running' : '○ Stopped'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {isDemo ? 'Demo mode' : walletConnected ? `${walletAddress?.slice(0, 4)}...${walletAddress?.slice(-3)}` : 'Connect wallet'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Switch
              checked={isActive}
              onCheckedChange={onToggleActive}
              className="data-[state=checked]:bg-success"
            />
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setExpanded(!expanded)}
              className="h-8 w-8"
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {/* Quick Toggles */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border/30">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Auto Entry</span>
            <Switch
              checked={autoEntryEnabled}
              onCheckedChange={onAutoEntryChange}
              className="data-[state=checked]:bg-primary scale-90"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Auto Exit</span>
            <Switch
              checked={autoExitEnabled}
              onCheckedChange={onAutoExitChange}
              className="data-[state=checked]:bg-primary scale-90"
            />
          </div>
          {walletConnected && walletBalance && (
            <Badge variant="outline" className="ml-auto text-xs">
              {walletBalance}
            </Badge>
          )}
        </div>
      </div>
      
      {/* Expandable Settings */}
      {expanded && (
        <div className="p-4 space-y-4">
          {validationError && (
            <div className="flex items-center gap-2 p-2 bg-destructive/10 rounded-lg border border-destructive/20">
              <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
              <span className="text-xs text-destructive">{validationError}</span>
            </div>
          )}

          {/* Settings Grid - 2x2 layout */}
          <div className="grid grid-cols-2 gap-3">
            {/* Min Liquidity */}
            <div className="p-3 bg-secondary/30 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs">
                  <DollarSign className="w-3.5 h-3.5 text-primary" />
                  <span className="text-muted-foreground">Min Liq</span>
                </div>
                <span className="text-primary font-bold text-sm">{settings.min_liquidity}</span>
              </div>
              <Slider
                value={[settings.min_liquidity]}
                onValueChange={([v]) => handleUpdateField('min_liquidity', v)}
                min={50}
                max={1000}
                step={10}
                className="[&_[role=slider]]:bg-primary [&_[role=slider]]:border-primary"
              />
            </div>

            {/* Buy Amount */}
            <div className="p-3 bg-secondary/30 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs">
                  <Zap className="w-3.5 h-3.5 text-warning" />
                  <span className="text-muted-foreground">Buy SOL</span>
                </div>
                <span className="text-foreground font-bold text-sm">{settings.trade_amount.toFixed(2)}</span>
              </div>
              <Slider
                value={[settings.trade_amount * 100]}
                onValueChange={([v]) => handleUpdateField('trade_amount', v / 100)}
                min={1}
                max={500}
                step={1}
                className="[&_[role=slider]]:bg-warning [&_[role=slider]]:border-warning"
              />
            </div>

            {/* Take Profit */}
            <div className="p-3 bg-success/10 rounded-lg border border-success/20">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs">
                  <TrendingUp className="w-3.5 h-3.5 text-success" />
                  <span className="text-muted-foreground">TP</span>
                </div>
                <span className="text-success font-bold text-sm">{settings.profit_take_percentage}%</span>
              </div>
              <Slider
                value={[settings.profit_take_percentage]}
                onValueChange={([v]) => handleUpdateField('profit_take_percentage', v)}
                min={10}
                max={500}
                step={5}
                className="[&_[role=slider]]:bg-success [&_[role=slider]]:border-success"
              />
            </div>

            {/* Stop Loss */}
            <div className="p-3 bg-destructive/10 rounded-lg border border-destructive/20">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs">
                  <TrendingDown className="w-3.5 h-3.5 text-destructive" />
                  <span className="text-muted-foreground">SL</span>
                </div>
                <span className="text-destructive font-bold text-sm">{settings.stop_loss_percentage}%</span>
              </div>
              <Slider
                value={[settings.stop_loss_percentage]}
                onValueChange={([v]) => handleUpdateField('stop_loss_percentage', v)}
                min={5}
                max={50}
                step={1}
                className="[&_[role=slider]]:bg-destructive [&_[role=slider]]:border-destructive"
              />
            </div>
          </div>

          {/* Buyer Positions - Multi-select */}
          <div className="p-3 bg-secondary/30 rounded-lg">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <Target className="w-3.5 h-3.5 text-primary" />
              <span>Target Buyer Positions</span>
              <span className="text-muted-foreground/60">(multi-select)</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((pos) => {
                const isSelected = settings.target_buyer_positions?.includes(pos);
                return (
                  <button
                    key={pos}
                    onClick={() => {
                      const current = settings.target_buyer_positions || [2, 3];
                      const updated = isSelected
                        ? current.filter(p => p !== pos)
                        : [...current, pos].sort((a, b) => a - b);
                      if (updated.length > 0) {
                        handleUpdateField('target_buyer_positions', updated);
                      }
                    }}
                    className={`w-8 h-8 rounded-lg font-semibold text-xs transition-all ${
                      isSelected
                        ? 'bg-primary text-primary-foreground shadow-md'
                        : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                    }`}
                  >
                    #{pos}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Max Trades & Priority Row */}
          <div className="flex items-center gap-3">
            <div className="flex-1 p-3 bg-secondary/30 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs">
                  <Users className="w-3.5 h-3.5 text-primary" />
                  <span className="text-muted-foreground">Max Trades</span>
                </div>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 5].map((num) => (
                    <button
                      key={num}
                      onClick={() => handleUpdateField('max_concurrent_trades', num)}
                      className={`w-7 h-7 rounded text-xs font-medium transition-all ${
                        settings.max_concurrent_trades === num
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary/50 text-muted-foreground hover:bg-secondary'
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <Button 
            className="w-full" 
            variant="glow"
            onClick={onSave}
            disabled={saving}
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              'Save Settings'
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
