import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

export interface ScannerSettings {
  scanInterval: string;
  minMarketCap: string;
  maxMarketCap: string;
  minVolume24h: string;
  minHolders: string;
  enableNewPairs: boolean;
  enableTrendingFilter: boolean;
  chains: string[];
}

export interface LiquidityRules {
  minLiquidity: string;
  maxPriceImpact: string;
  minPoolAge: string;
  lockStatus: string;
  burnedLiquidity: boolean;
  lpRatio: string;
}

export interface RiskFilters {
  maxRiskScore: string;
  honeypotCheck: boolean;
  rugPullDetection: boolean;
  contractVerified: boolean;
  mintAuthority: boolean;
  freezeAuthority: boolean;
  topHolderLimit: string;
  devWalletLimit: string;
}

export interface TradingEngine {
  enabled: boolean;
  maxSlippage: string;
  defaultBuyAmount: string;
  maxPositionSize: string;
  gasMultiplier: string;
  priorityFee: string;
  retryAttempts: string;
  autoBuy: boolean;
  autoSell: boolean;
  stopLoss: string;
  takeProfit: string;
  trailingStop: boolean;
  trailingStopPercent: string;
}

export interface CopyTrading {
  enabled: boolean;
  maxWalletsToFollow: string;
  minWalletPnl: string;
  copyDelay: string;
  maxCopyAmount: string;
  blacklistedWallets: string;
  whitelistedTokens: string;
}

export interface AdminSettings {
  scanner_settings: ScannerSettings;
  liquidity_rules: LiquidityRules;
  risk_filters: RiskFilters;
  trading_engine: TradingEngine;
  copy_trading: CopyTrading;
}

const defaultSettings: AdminSettings = {
  scanner_settings: {
    scanInterval: "5",
    minMarketCap: "10000",
    maxMarketCap: "10000000",
    minVolume24h: "5000",
    minHolders: "50",
    enableNewPairs: true,
    enableTrendingFilter: true,
    chains: ["solana", "ethereum"],
  },
  liquidity_rules: {
    minLiquidity: "10000",
    maxPriceImpact: "3",
    minPoolAge: "5",
    lockStatus: "any",
    burnedLiquidity: false,
    lpRatio: "20",
  },
  risk_filters: {
    maxRiskScore: "70",
    honeypotCheck: true,
    rugPullDetection: true,
    contractVerified: true,
    mintAuthority: true,
    freezeAuthority: true,
    topHolderLimit: "15",
    devWalletLimit: "10",
  },
  trading_engine: {
    enabled: true,
    maxSlippage: "5",
    defaultBuyAmount: "0.1",
    maxPositionSize: "1",
    gasMultiplier: "1.5",
    priorityFee: "0.0001",
    retryAttempts: "3",
    autoBuy: false,
    autoSell: true,
    stopLoss: "20",
    takeProfit: "100",
    trailingStop: false,
    trailingStopPercent: "10",
  },
  copy_trading: {
    enabled: false,
    maxWalletsToFollow: "10",
    minWalletPnl: "50",
    copyDelay: "0",
    maxCopyAmount: "0.5",
    blacklistedWallets: "",
    whitelistedTokens: "",
  },
};

export function useAdminSettings() {
  const [settings, setSettings] = useState<AdminSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { isAdmin, user } = useAuth();

  const fetchSettings = useCallback(async () => {
    if (!isAdmin) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('admin_settings')
        .select('setting_key, setting_value');

      if (error) throw error;

      const loadedSettings: Partial<AdminSettings> = {};
      (data || []).forEach((row: any) => {
        if (row.setting_key in defaultSettings) {
          loadedSettings[row.setting_key as keyof AdminSettings] = row.setting_value;
        }
      });

      setSettings({
        ...defaultSettings,
        ...loadedSettings,
      });
    } catch (err) {
      console.error('Failed to fetch admin settings:', err);
      toast({
        title: 'Error',
        description: 'Failed to load admin settings',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [isAdmin, toast]);

  const updateSetting = useCallback(async <K extends keyof AdminSettings>(
    key: K,
    value: AdminSettings[K]
  ): Promise<boolean> => {
    if (!isAdmin || !user) return false;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('admin_settings')
        .upsert({
          setting_key: key,
          setting_value: value as any,
          updated_by: user.id,
          category: key.split('_')[0],
        }, {
          onConflict: 'setting_key',
        });

      if (error) throw error;

      setSettings(prev => ({
        ...prev,
        [key]: value,
      }));

      toast({
        title: 'Settings Saved',
        description: `${key.replace(/_/g, ' ')} updated successfully`,
      });

      return true;
    } catch (err) {
      console.error('Failed to save setting:', err);
      toast({
        title: 'Error',
        description: 'Failed to save settings',
        variant: 'destructive',
      });
      return false;
    } finally {
      setSaving(false);
    }
  }, [isAdmin, user, toast]);

  const updateScannerSettings = useCallback((value: ScannerSettings) => {
    return updateSetting('scanner_settings', value);
  }, [updateSetting]);

  const updateLiquidityRules = useCallback((value: LiquidityRules) => {
    return updateSetting('liquidity_rules', value);
  }, [updateSetting]);

  const updateRiskFilters = useCallback((value: RiskFilters) => {
    return updateSetting('risk_filters', value);
  }, [updateSetting]);

  const updateTradingEngine = useCallback((value: TradingEngine) => {
    return updateSetting('trading_engine', value);
  }, [updateSetting]);

  const updateCopyTrading = useCallback((value: CopyTrading) => {
    return updateSetting('copy_trading', value);
  }, [updateSetting]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  return {
    settings,
    loading,
    saving,
    fetchSettings,
    updateScannerSettings,
    updateLiquidityRules,
    updateRiskFilters,
    updateTradingEngine,
    updateCopyTrading,
    // Expose individual settings for convenience
    scannerSettings: settings.scanner_settings,
    liquidityRules: settings.liquidity_rules,
    riskFilters: settings.risk_filters,
    tradingEngine: settings.trading_engine,
    copyTrading: settings.copy_trading,
  };
}