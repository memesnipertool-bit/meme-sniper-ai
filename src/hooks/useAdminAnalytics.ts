import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

export interface ApiHealthData {
  total: number;
  healthy: number;
  errors: number;
  avgLatency: number;
  byType: Record<string, { total: number; errors: number; avgLatency: number }>;
}

export interface TradeStats {
  total: number;
  successful: number;
  failed: number;
  successRate: number;
  totalVolume: number;
  avgTradeSize: number;
  byStatus: Record<string, number>;
}

export interface UserVolumeData {
  totalUsers: number;
  activeTraders: number;
  totalVolume: number;
  volumeByDay: Array<{ date: string; volume: number; trades: number }>;
}

export interface CopyTradingStats {
  totalTrades: number;
  totalVolume: number;
  uniqueLeaders: number;
  byStatus: Record<string, number>;
  recent: Array<{ leader_name: string; token_symbol: string; action: string; amount: number; created_at: string }>;
}

export interface RiskAlerts {
  total: number;
  honeypotDetected: number;
  blacklistDetected: number;
  highRisk: number;
  recent: Array<{ token_symbol: string; risk_score: number; rejection_reasons: string[]; checked_at: string }>;
}

export interface AnalyticsData {
  apiHealth: ApiHealthData;
  apiErrors: {
    recent: Array<{ api_type: string; error_message: string; created_at: string }>;
    byType: Record<string, number>;
  };
  sniperEvents: {
    total: number;
    approved: number;
    rejected: number;
    executed: number;
    recent: Array<{ event_type: string; message: string; created_at: string }>;
  };
  tradeStats: TradeStats;
  userVolume: UserVolumeData;
  copyTradingStats: CopyTradingStats;
  riskAlerts: RiskAlerts;
  rpcLatency: Array<{ timestamp: string; latency: number }>;
}

export interface ApiConfig {
  api_type: string;
  api_name: string;
  status: string;
  is_enabled: boolean;
  last_checked_at: string | null;
}

const defaultAnalytics: AnalyticsData = {
  apiHealth: { total: 0, healthy: 0, errors: 0, avgLatency: 0, byType: {} },
  apiErrors: { recent: [], byType: {} },
  sniperEvents: { total: 0, approved: 0, rejected: 0, executed: 0, recent: [] },
  tradeStats: { total: 0, successful: 0, failed: 0, successRate: 0, totalVolume: 0, avgTradeSize: 0, byStatus: {} },
  userVolume: { totalUsers: 0, activeTraders: 0, totalVolume: 0, volumeByDay: [] },
  copyTradingStats: { totalTrades: 0, totalVolume: 0, uniqueLeaders: 0, byStatus: {}, recent: [] },
  riskAlerts: { total: 0, honeypotDetected: 0, blacklistDetected: 0, highRisk: 0, recent: [] },
  rpcLatency: [],
};

export function useAdminAnalytics() {
  const [analytics, setAnalytics] = useState<AnalyticsData>(defaultAnalytics);
  const [apiConfigs, setApiConfigs] = useState<ApiConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d' | '30d'>('24h');
  const { toast } = useToast();
  const { isAdmin } = useAuth();

  const fetchAnalytics = useCallback(async (range?: '1h' | '24h' | '7d' | '30d') => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-analytics', {
        body: { action: 'get_analytics', timeRange: range || timeRange },
      });
      if (error) throw error;
      if (data.analytics) setAnalytics(data.analytics);
      if (data.apiConfigs) setApiConfigs(data.apiConfigs);
    } catch (err: any) {
      console.error('Failed to fetch analytics:', err);
      toast({ title: 'Error', description: 'Failed to load analytics data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [isAdmin, timeRange, toast]);

  const logEvent = useCallback(async (
    eventType: string,
    eventCategory: string,
    message?: string,
    metadata?: Record<string, any>,
    severity?: 'info' | 'warn' | 'error'
  ) => {
    try {
      await supabase.functions.invoke('admin-analytics', {
        body: { action: 'log_event', eventType, eventCategory, message, metadata, severity },
      });
    } catch (err) {
      console.error('Failed to log event:', err);
    }
  }, []);

  const logApiHealth = useCallback(async (
    apiType: string,
    endpoint: string,
    responseTimeMs: number,
    statusCode: number,
    isSuccess: boolean,
    errorMessage?: string
  ) => {
    try {
      await supabase.functions.invoke('admin-analytics', {
        body: { action: 'log_api_health', apiType, endpoint, responseTimeMs, statusCode, isSuccess, errorMessage },
      });
    } catch (err) {
      console.error('Failed to log API health:', err);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      fetchAnalytics();
    }
  }, [isAdmin, fetchAnalytics]);

  return {
    analytics,
    apiConfigs,
    loading,
    timeRange,
    setTimeRange: (range: '1h' | '24h' | '7d' | '30d') => {
      setTimeRange(range);
      fetchAnalytics(range);
    },
    fetchAnalytics,
    logEvent,
    logApiHealth,
  };
}
