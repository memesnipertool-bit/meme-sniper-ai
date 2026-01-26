import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateAdminAnalyticsInput } from "../_shared/validation.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UserStats {
  userId: string;
  email: string | null;
  displayName: string | null;
  totalTrades: number;
  openPositions: number;
  closedPositions: number;
  totalPnL: number;
  winRate: number;
  totalVolume: number;
  lastActive: string | null;
}

interface AnalyticsData {
  apiHealth: {
    total: number;
    healthy: number;
    errors: number;
    avgLatency: number;
    byType: Record<string, { total: number; errors: number; avgLatency: number }>;
  };
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
  tradeStats: {
    total: number;
    successful: number;
    failed: number;
    successRate: number;
    totalVolume: number;
    avgTradeSize: number;
    byStatus: Record<string, number>;
    byExitReason: Record<string, number>;
  };
  userVolume: {
    totalUsers: number;
    activeTraders: number;
    totalVolume: number;
    volumeByDay: Array<{ date: string; volume: number; trades: number }>;
  };
  userStats: UserStats[];
  platformPnL: {
    totalRealizedPnL: number;
    totalUnrealizedPnL: number;
    winningTrades: number;
    losingTrades: number;
    avgWinPercent: number;
    avgLossPercent: number;
  };
  copyTradingStats: {
    totalTrades: number;
    totalVolume: number;
    uniqueLeaders: number;
    byStatus: Record<string, number>;
    recent: Array<{ leader_name: string; token_symbol: string; action: string; amount: number; created_at: string }>;
  };
  riskAlerts: {
    total: number;
    honeypotDetected: number;
    blacklistDetected: number;
    highRisk: number;
    recent: Array<{ token_symbol: string; risk_score: number; rejection_reasons: string[]; checked_at: string }>;
  };
  rpcLatency: Array<{ timestamp: string; latency: number }>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if user is admin
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (roleData?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse and validate request body
    const rawBody = await req.json().catch(() => ({}));
    const validationResult = validateAdminAnalyticsInput(rawBody);
    
    if (!validationResult.success) {
      return new Response(JSON.stringify({ error: validationResult.error }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const validatedInput = validationResult.data!;
    const { action, timeRange } = validatedInput;

    // Calculate time range
    const now = new Date();
    let startDate = new Date();
    switch (timeRange) {
      case '1h': startDate.setHours(now.getHours() - 1); break;
      case '24h': startDate.setHours(now.getHours() - 24); break;
      case '7d': startDate.setDate(now.getDate() - 7); break;
      case '30d': startDate.setDate(now.getDate() - 30); break;
      default: startDate.setHours(now.getHours() - 24);
    }
    const startDateStr = startDate.toISOString();

    if (action === 'get_analytics') {
      // Fetch API health metrics
      const { data: apiHealthData } = await supabase
        .from('api_health_metrics')
        .select('*')
        .gte('created_at', startDateStr)
        .order('created_at', { ascending: false });

      const apiHealthByType: Record<string, { total: number; errors: number; totalLatency: number }> = {};
      let totalApiCalls = 0;
      let totalErrors = 0;
      let totalLatency = 0;

      (apiHealthData || []).forEach((record: any) => {
        totalApiCalls++;
        if (!record.is_success) totalErrors++;
        totalLatency += record.response_time_ms || 0;

        if (!apiHealthByType[record.api_type]) {
          apiHealthByType[record.api_type] = { total: 0, errors: 0, totalLatency: 0 };
        }
        apiHealthByType[record.api_type].total++;
        if (!record.is_success) apiHealthByType[record.api_type].errors++;
        apiHealthByType[record.api_type].totalLatency += record.response_time_ms || 0;
      });

      // Fetch API configurations for health status
      const { data: apiConfigs } = await supabase
        .from('api_configurations')
        .select('api_type, api_name, status, is_enabled, last_checked_at');

      // Fetch sniper events from system logs
      const { data: sniperLogs } = await supabase
        .from('system_logs')
        .select('*')
        .eq('event_category', 'sniper')
        .gte('created_at', startDateStr)
        .order('created_at', { ascending: false })
        .limit(50);

      const sniperEventCounts = {
        total: sniperLogs?.length || 0,
        approved: sniperLogs?.filter((l: any) => l.event_type === 'approved').length || 0,
        rejected: sniperLogs?.filter((l: any) => l.event_type === 'rejected').length || 0,
        executed: sniperLogs?.filter((l: any) => l.event_type === 'executed').length || 0,
      };

      // Fetch ALL positions for comprehensive stats
      const { data: allPositionsData } = await supabase
        .from('positions')
        .select('*');

      // Fetch time-filtered positions
      const { data: positions } = await supabase
        .from('positions')
        .select('*')
        .gte('created_at', startDateStr);

      const closedPositions = positions?.filter((p: any) => p.status === 'closed') || [];
      const successfulTrades = closedPositions.filter((p: any) => (p.profit_loss_percent || 0) > 0);
      const totalVolume = positions?.reduce((sum: number, p: any) => sum + (p.entry_value || 0), 0) || 0;

      const tradesByStatus: Record<string, number> = {};
      positions?.forEach((p: any) => {
        tradesByStatus[p.status] = (tradesByStatus[p.status] || 0) + 1;
      });

      // Exit reason breakdown
      const tradesByExitReason: Record<string, number> = {};
      closedPositions.forEach((p: any) => {
        const reason = p.exit_reason || 'unknown';
        tradesByExitReason[reason] = (tradesByExitReason[reason] || 0) + 1;
      });

      // Calculate platform-wide P&L stats
      const allClosed = (allPositionsData || []).filter((p: any) => p.status === 'closed');
      const allOpen = (allPositionsData || []).filter((p: any) => p.status === 'open');
      
      const totalRealizedPnL = allClosed.reduce((sum: number, p: any) => sum + (p.profit_loss_value || 0), 0);
      const totalUnrealizedPnL = allOpen.reduce((sum: number, p: any) => sum + (p.profit_loss_value || 0), 0);
      
      const winningTrades = allClosed.filter((p: any) => (p.profit_loss_percent || 0) > 0);
      const losingTrades = allClosed.filter((p: any) => (p.profit_loss_percent || 0) < 0);
      
      const avgWinPercent = winningTrades.length > 0 
        ? winningTrades.reduce((sum: number, p: any) => sum + (p.profit_loss_percent || 0), 0) / winningTrades.length 
        : 0;
      const avgLossPercent = losingTrades.length > 0 
        ? losingTrades.reduce((sum: number, p: any) => sum + (p.profit_loss_percent || 0), 0) / losingTrades.length 
        : 0;

      // Fetch user volume by day
      const volumeByDay: Record<string, { volume: number; trades: number }> = {};
      const activeUserIds = new Set<string>();

      (positions || []).forEach((p: any) => {
        const date = new Date(p.created_at).toISOString().split('T')[0];
        if (!volumeByDay[date]) {
          volumeByDay[date] = { volume: 0, trades: 0 };
        }
        volumeByDay[date].volume += p.entry_value || 0;
        volumeByDay[date].trades++;
        activeUserIds.add(p.user_id);
      });

      const { count: totalUsers } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      // Fetch user profiles for stats
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, email, display_name, updated_at');

      // Build user statistics
      const userStatsMap: Record<string, UserStats> = {};
      
      (allPositionsData || []).forEach((p: any) => {
        if (!userStatsMap[p.user_id]) {
          const profile = (profiles || []).find((pr: any) => pr.user_id === p.user_id);
          userStatsMap[p.user_id] = {
            userId: p.user_id,
            email: profile?.email || null,
            displayName: profile?.display_name || null,
            totalTrades: 0,
            openPositions: 0,
            closedPositions: 0,
            totalPnL: 0,
            winRate: 0,
            totalVolume: 0,
            lastActive: profile?.updated_at || p.created_at,
          };
        }
        
        const stats = userStatsMap[p.user_id];
        stats.totalTrades++;
        stats.totalVolume += p.entry_value || 0;
        stats.totalPnL += p.profit_loss_value || 0;
        
        if (p.status === 'open') {
          stats.openPositions++;
        } else {
          stats.closedPositions++;
        }
        
        if (new Date(p.created_at) > new Date(stats.lastActive || 0)) {
          stats.lastActive = p.created_at;
        }
      });

      // Calculate win rates for each user
      Object.values(userStatsMap).forEach((stats) => {
        const userClosed = (allPositionsData || []).filter(
          (p: any) => p.user_id === stats.userId && p.status === 'closed'
        );
        const userWins = userClosed.filter((p: any) => (p.profit_loss_percent || 0) > 0).length;
        stats.winRate = userClosed.length > 0 ? Math.round((userWins / userClosed.length) * 100) : 0;
      });

      const userStats = Object.values(userStatsMap)
        .sort((a, b) => b.totalVolume - a.totalVolume)
        .slice(0, 20);

      // Fetch copy trading stats
      const { data: copyTrades } = await supabase
        .from('copy_trades')
        .select('*')
        .gte('created_at', startDateStr)
        .order('created_at', { ascending: false });

      const copyByStatus: Record<string, number> = {};
      const uniqueLeaders = new Set<string>();
      let copyVolume = 0;

      (copyTrades || []).forEach((t: any) => {
        copyByStatus[t.status] = (copyByStatus[t.status] || 0) + 1;
        uniqueLeaders.add(t.leader_address);
        copyVolume += t.amount * t.price;
      });

      // Fetch risk alerts (use system_logs as fallback if risk_check_logs doesn't exist)
      let riskLogs: any[] = [];
      try {
        const { data } = await supabase
          .from('system_logs')
          .select('*')
          .eq('event_category', 'risk')
          .gte('created_at', startDateStr)
          .order('created_at', { ascending: false })
          .limit(100);
        riskLogs = data || [];
      } catch {
        riskLogs = [];
      }

      const honeypotCount = riskLogs.filter((r: any) => r.metadata?.is_honeypot).length;
      const blacklistCount = riskLogs.filter((r: any) => r.metadata?.is_blacklisted).length;
      const highRiskCount = riskLogs.filter((r: any) => (r.metadata?.risk_score || 0) >= 70).length;

      // Generate mock RPC latency data
      const rpcLatencyData = [];
      for (let i = 23; i >= 0; i--) {
        const timestamp = new Date();
        timestamp.setHours(timestamp.getHours() - i);
        rpcLatencyData.push({
          timestamp: timestamp.toISOString(),
          latency: Math.floor(Math.random() * 100) + 50,
        });
      }

      const analytics: AnalyticsData = {
        apiHealth: {
          total: totalApiCalls,
          healthy: totalApiCalls - totalErrors,
          errors: totalErrors,
          avgLatency: totalApiCalls > 0 ? Math.round(totalLatency / totalApiCalls) : 0,
          byType: Object.entries(apiHealthByType).reduce((acc, [type, data]) => {
            acc[type] = {
              total: data.total,
              errors: data.errors,
              avgLatency: data.total > 0 ? Math.round(data.totalLatency / data.total) : 0,
            };
            return acc;
          }, {} as Record<string, { total: number; errors: number; avgLatency: number }>),
        },
        apiErrors: {
          recent: (apiHealthData || [])
            .filter((r: any) => !r.is_success)
            .slice(0, 10)
            .map((r: any) => ({
              api_type: r.api_type,
              error_message: r.error_message || 'Unknown error',
              created_at: r.created_at,
            })),
          byType: (apiHealthData || [])
            .filter((r: any) => !r.is_success)
            .reduce((acc: Record<string, number>, r: any) => {
              acc[r.api_type] = (acc[r.api_type] || 0) + 1;
              return acc;
            }, {}),
        },
        sniperEvents: {
          ...sniperEventCounts,
          recent: (sniperLogs || []).slice(0, 10).map((l: any) => ({
            event_type: l.event_type,
            message: l.message || '',
            created_at: l.created_at,
          })),
        },
        tradeStats: {
          total: positions?.length || 0,
          successful: successfulTrades.length,
          failed: closedPositions.length - successfulTrades.length,
          successRate: closedPositions.length > 0 
            ? Math.round((successfulTrades.length / closedPositions.length) * 100) 
            : 0,
          totalVolume,
          avgTradeSize: positions?.length ? totalVolume / positions.length : 0,
          byStatus: tradesByStatus,
          byExitReason: tradesByExitReason,
        },
        userVolume: {
          totalUsers: totalUsers || 0,
          activeTraders: activeUserIds.size,
          totalVolume,
          volumeByDay: Object.entries(volumeByDay).map(([date, data]) => ({
            date,
            ...data,
          })).sort((a, b) => a.date.localeCompare(b.date)),
        },
        userStats,
        platformPnL: {
          totalRealizedPnL,
          totalUnrealizedPnL,
          winningTrades: winningTrades.length,
          losingTrades: losingTrades.length,
          avgWinPercent,
          avgLossPercent,
        },
        copyTradingStats: {
          totalTrades: copyTrades?.length || 0,
          totalVolume: copyVolume,
          uniqueLeaders: uniqueLeaders.size,
          byStatus: copyByStatus,
          recent: (copyTrades || []).slice(0, 10).map((t: any) => ({
            leader_name: t.leader_name || t.leader_address.slice(0, 8) + '...',
            token_symbol: t.token_symbol,
            action: t.action,
            amount: t.amount,
            created_at: t.created_at,
          })),
        },
        riskAlerts: {
          total: riskLogs.length,
          honeypotDetected: honeypotCount,
          blacklistDetected: blacklistCount,
          highRisk: highRiskCount,
          recent: riskLogs
            .slice(0, 10)
            .map((r: any) => ({
              token_symbol: r.metadata?.token_symbol || 'Unknown',
              risk_score: r.metadata?.risk_score || 0,
              rejection_reasons: r.metadata?.rejection_reasons || [],
              checked_at: r.created_at,
            })),
        },
        rpcLatency: rpcLatencyData,
      };

      return new Response(JSON.stringify({ 
        analytics, 
        apiConfigs: apiConfigs || [],
        timeRange,
        generatedAt: new Date().toISOString(),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'log_event') {
      const { eventType, eventCategory, message, metadata, severity } = validatedInput;
      
      await supabase.from('system_logs').insert({
        event_type: eventType,
        event_category: eventCategory,
        message,
        metadata: metadata || {},
        severity: severity || 'info',
        user_id: user.id,
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'log_api_health') {
      const { apiType, endpoint, responseTimeMs, statusCode, isSuccess, errorMessage } = validatedInput;
      
      await supabase.from('api_health_metrics').insert({
        api_type: apiType,
        endpoint,
        response_time_ms: responseTimeMs,
        status_code: statusCode,
        is_success: isSuccess,
        error_message: errorMessage,
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('Admin analytics error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
