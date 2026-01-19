import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

export interface RiskSettings {
  emergency_stop_active: boolean;
  circuit_breaker_enabled: boolean;
  circuit_breaker_loss_threshold: number;
  circuit_breaker_time_window_minutes: number;
  circuit_breaker_triggered_at: string | null;
  max_risk_score: number;
  require_ownership_renounced: boolean;
  require_liquidity_locked: boolean;
  max_tax_percent: number;
}

export interface RiskCheckResult {
  token: { address: string; symbol?: string; chain?: string };
  passed: boolean;
  riskScore: number;
  checks: {
    honeypot: { passed: boolean; detected: boolean };
    blacklist: { passed: boolean; blacklisted: boolean };
    ownershipRenounced: { passed: boolean; renounced: boolean };
    liquidityLocked: { passed: boolean; locked: boolean; percentage: number | null };
    taxCheck: { passed: boolean; buyTax: number; sellTax: number };
  };
  rejectionReasons: string[];
  circuitBreakerTriggered: boolean;
  emergencyStopActive: boolean;
}

export interface RiskCheckLog {
  id: string;
  token_address: string;
  token_symbol: string | null;
  chain: string;
  is_honeypot: boolean;
  is_blacklisted: boolean;
  owner_renounced: boolean;
  liquidity_locked: boolean;
  lock_percentage: number | null;
  buy_tax: number;
  sell_tax: number;
  risk_score: number;
  passed_checks: boolean;
  rejection_reasons: string[];
  checked_at: string;
}

const defaultSettings: RiskSettings = {
  emergency_stop_active: false,
  circuit_breaker_enabled: true,
  circuit_breaker_loss_threshold: 20,
  circuit_breaker_time_window_minutes: 60,
  circuit_breaker_triggered_at: null,
  max_risk_score: 70,
  require_ownership_renounced: true,
  require_liquidity_locked: true,
  max_tax_percent: 10,
};

export function useRiskCompliance() {
  const [settings, setSettings] = useState<RiskSettings>(defaultSettings);
  const [loading, setLoading] = useState(false);
  const [checkLoading, setCheckLoading] = useState(false);
  const [logs, setLogs] = useState<RiskCheckLog[]>([]);
  const { toast } = useToast();
  const { user } = useAuth();

  const fetchSettings = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('risk-check', {
        body: { action: 'get_settings' },
      });
      if (error) throw error;
      if (data.settings) setSettings(data.settings);
    } catch (err: any) {
      console.error('Failed to fetch risk settings:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const updateSettings = useCallback(async (updates: Partial<RiskSettings>) => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('risk-check', {
        body: { action: 'update_settings', updates },
      });
      if (error) throw error;
      if (data.settings) setSettings(data.settings);
      toast({ title: 'Settings Updated', description: 'Risk settings saved successfully' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  const toggleEmergencyStop = useCallback(async (active: boolean) => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('risk-check', {
        body: { action: 'emergency_stop', active },
      });
      if (error) throw error;
      setSettings(prev => ({ ...prev, emergency_stop_active: active }));
      toast({
        title: active ? '🚨 EMERGENCY STOP ACTIVATED' : 'Emergency Stop Deactivated',
        description: active ? 'All trading has been halted immediately' : 'Trading can now resume',
        variant: active ? 'destructive' : 'default',
      });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  const resetCircuitBreaker = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke('risk-check', {
        body: { action: 'reset_circuit_breaker' },
      });
      if (error) throw error;
      setSettings(prev => ({ ...prev, circuit_breaker_triggered_at: null }));
      toast({ title: 'Circuit Breaker Reset', description: 'Trading can now resume' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  const checkTokens = useCallback(async (
    tokens: { address: string; symbol?: string; chain?: string }[]
  ): Promise<{ canTrade: boolean; results: RiskCheckResult[]; reason?: string }> => {
    if (!user) return { canTrade: false, results: [], reason: 'Not authenticated' };
    setCheckLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('risk-check', {
        body: { action: 'check_tokens', tokens },
      });
      if (error) throw error;
      return {
        canTrade: data.canTrade,
        results: data.results || [],
        reason: data.reason,
      };
    } catch (err: any) {
      toast({ title: 'Risk Check Failed', description: err.message, variant: 'destructive' });
      return { canTrade: false, results: [], reason: err.message };
    } finally {
      setCheckLoading(false);
    }
  }, [user, toast]);

  const fetchLogs = useCallback(async (limit = 50) => {
    if (!user) return;
    try {
      const { data, error } = await supabase.functions.invoke('risk-check', {
        body: { action: 'get_logs', limit },
      });
      if (error) throw error;
      setLogs(data.logs || []);
    } catch (err: any) {
      console.error('Failed to fetch risk logs:', err);
    }
  }, [user]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  return {
    settings,
    loading,
    checkLoading,
    logs,
    fetchSettings,
    updateSettings,
    toggleEmergencyStop,
    resetCircuitBreaker,
    checkTokens,
    fetchLogs,
    isEmergencyStopActive: settings.emergency_stop_active,
    isCircuitBreakerTriggered: !!settings.circuit_breaker_triggered_at,
  };
}
