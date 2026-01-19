import React, { forwardRef, useState } from "react";
import TradingHeader from "@/components/trading/TradingHeader";
import { useWallet } from "@/hooks/useWallet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAdminAnalytics, ApiConfig } from "@/hooks/useAdminAnalytics";
import { formatDistanceToNow } from "date-fns";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, Legend
} from "recharts";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle,
  Clock,
  Copy,
  Crown,
  Database,
  Loader2,
  RefreshCw,
  Server,
  Shield,
  TrendingDown,
  TrendingUp,
  Users,
  Wifi,
  XCircle,
  Zap,
  AlertOctagon,
  Ban,
} from "lucide-react";

const CHART_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const formatCurrency = (value: number) => {
  if (Math.abs(value) >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
  if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
};

const AdminAnalytics = forwardRef<HTMLDivElement, object>(function AdminAnalytics(_props, ref) {
  // All hooks must be called first, before any conditional logic
  const { wallet, connectPhantom, disconnect } = useWallet();
  const {
    analytics,
    apiConfigs,
    loading,
    timeRange,
    setTimeRange,
    fetchAnalytics,
  } = useAdminAnalytics();

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-500 bg-green-500/20';
      case 'inactive': return 'text-muted-foreground bg-muted';
      case 'error': return 'text-red-500 bg-red-500/20';
      case 'rate_limited': return 'text-yellow-500 bg-yellow-500/20';
      default: return 'text-muted-foreground bg-muted';
    }
  };

  const tradeStatusData = Object.entries(analytics.tradeStats.byStatus).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    value,
  }));

  const copyStatusData = Object.entries(analytics.copyTradingStats.byStatus).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    value,
  }));

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
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-primary/10">
                <BarChart3 className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-foreground">
                  Admin Analytics
                </h1>
                <p className="text-muted-foreground">
                  Real-time platform metrics and monitoring
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex bg-secondary/50 rounded-lg p-1">
                {(['1h', '24h', '7d', '30d'] as const).map((range) => (
                  <button
                    key={range}
                    onClick={() => setTimeRange(range)}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      timeRange === range
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {range}
                  </button>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={() => fetchAnalytics()} disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          {/* Quick Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${analytics.apiHealth.errors === 0 ? 'bg-green-500/20' : 'bg-yellow-500/20'}`}>
                    <Server className={`w-5 h-5 ${analytics.apiHealth.errors === 0 ? 'text-green-500' : 'text-yellow-500'}`} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">API Health</p>
                    <p className="font-semibold text-foreground">
                      {analytics.apiHealth.total > 0 
                        ? `${Math.round((analytics.apiHealth.healthy / analytics.apiHealth.total) * 100)}%`
                        : 'N/A'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-red-500/20">
                    <XCircle className="w-5 h-5 text-red-500" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">API Errors</p>
                    <p className="font-semibold text-foreground">{analytics.apiHealth.errors}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/20">
                    <Zap className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Sniper Events</p>
                    <p className="font-semibold text-foreground">{analytics.sniperEvents.total}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${analytics.tradeStats.successRate >= 50 ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                    {analytics.tradeStats.successRate >= 50 ? (
                      <TrendingUp className="w-5 h-5 text-green-500" />
                    ) : (
                      <TrendingDown className="w-5 h-5 text-red-500" />
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Success Rate</p>
                    <p className="font-semibold text-foreground">{analytics.tradeStats.successRate}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/20">
                    <Users className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Active Traders</p>
                    <p className="font-semibold text-foreground">{analytics.userVolume.activeTraders}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-yellow-500/20">
                    <Shield className="w-5 h-5 text-yellow-500" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Risk Alerts</p>
                    <p className="font-semibold text-foreground">{analytics.riskAlerts.total}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList className="bg-secondary/50">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="api">API Health</TabsTrigger>
              <TabsTrigger value="sniper">Sniper Engine</TabsTrigger>
              <TabsTrigger value="trades">Trading</TabsTrigger>
              <TabsTrigger value="copy">Copy Trading</TabsTrigger>
              <TabsTrigger value="risk">Risk Alerts</TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-6">
              <div className="grid lg:grid-cols-2 gap-6">
                {/* RPC Latency Chart */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Wifi className="w-5 h-5" />
                      RPC Latency
                    </CardTitle>
                    <CardDescription>Response time over last 24 hours</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={analytics.rpcLatency}>
                        <defs>
                          <linearGradient id="latencyGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis 
                          dataKey="timestamp" 
                          tick={{ fill: '#888', fontSize: 10 }}
                          tickFormatter={(val) => new Date(val).getHours() + 'h'}
                        />
                        <YAxis tick={{ fill: '#888', fontSize: 10 }} unit="ms" />
                        <Tooltip
                          contentStyle={{ background: '#1a1a1a', border: '1px solid #333' }}
                          labelFormatter={(val) => new Date(val).toLocaleTimeString()}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="latency" 
                          stroke="#3b82f6" 
                          fill="url(#latencyGradient)"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Trading Volume Chart */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <BarChart3 className="w-5 h-5" />
                      Trading Volume
                    </CardTitle>
                    <CardDescription>Volume by day</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={analytics.userVolume.volumeByDay}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis dataKey="date" tick={{ fill: '#888', fontSize: 10 }} />
                        <YAxis tick={{ fill: '#888', fontSize: 10 }} tickFormatter={(val) => `$${val}`} />
                        <Tooltip
                          contentStyle={{ background: '#1a1a1a', border: '1px solid #333' }}
                          formatter={(value: number) => [formatCurrency(value), 'Volume']}
                        />
                        <Bar dataKey="volume" fill="#22c55e" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              {/* Trade Status Distribution */}
              <div className="grid lg:grid-cols-3 gap-6">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Trade Status</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {tradeStatusData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={180}>
                        <PieChart>
                          <Pie
                            data={tradeStatusData}
                            cx="50%"
                            cy="50%"
                            innerRadius={40}
                            outerRadius={70}
                            paddingAngle={2}
                            dataKey="value"
                          >
                            {tradeStatusData.map((_, index) => (
                              <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333' }} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-[180px] flex items-center justify-center text-muted-foreground">
                        No trade data
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Sniper Events</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-2 bg-secondary/30 rounded">
                        <span className="text-sm text-muted-foreground">Approved</span>
                        <span className="font-semibold text-green-500">{analytics.sniperEvents.approved}</span>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-secondary/30 rounded">
                        <span className="text-sm text-muted-foreground">Rejected</span>
                        <span className="font-semibold text-red-500">{analytics.sniperEvents.rejected}</span>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-secondary/30 rounded">
                        <span className="text-sm text-muted-foreground">Executed</span>
                        <span className="font-semibold text-primary">{analytics.sniperEvents.executed}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Risk Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-2 bg-secondary/30 rounded">
                        <span className="text-sm flex items-center gap-2">
                          <AlertOctagon className="w-4 h-4 text-red-500" /> Honeypots
                        </span>
                        <span className="font-semibold text-red-500">{analytics.riskAlerts.honeypotDetected}</span>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-secondary/30 rounded">
                        <span className="text-sm flex items-center gap-2">
                          <Ban className="w-4 h-4 text-orange-500" /> Blacklisted
                        </span>
                        <span className="font-semibold text-orange-500">{analytics.riskAlerts.blacklistDetected}</span>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-secondary/30 rounded">
                        <span className="text-sm flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-yellow-500" /> High Risk
                        </span>
                        <span className="font-semibold text-yellow-500">{analytics.riskAlerts.highRisk}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* API Health Tab */}
            <TabsContent value="api" className="space-y-6">
              <div className="grid lg:grid-cols-2 gap-6">
                {/* API Status Cards */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Server className="w-5 h-5" />
                      API Status
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {apiConfigs.length === 0 ? (
                      <p className="text-muted-foreground text-center py-4">No APIs configured</p>
                    ) : (
                      apiConfigs.map((api: ApiConfig) => (
                        <div key={api.api_type} className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${getStatusColor(api.status)}`}>
                              {api.status === 'active' ? (
                                <CheckCircle className="w-4 h-4" />
                              ) : api.status === 'error' ? (
                                <XCircle className="w-4 h-4" />
                              ) : (
                                <Clock className="w-4 h-4" />
                              )}
                            </div>
                            <div>
                              <p className="font-medium">{api.api_name}</p>
                              <p className="text-xs text-muted-foreground">{api.api_type}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <Badge variant="outline" className={getStatusColor(api.status)}>
                              {api.status}
                            </Badge>
                            {api.last_checked_at && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {formatDistanceToNow(new Date(api.last_checked_at), { addSuffix: true })}
                              </p>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                {/* API Latency by Type */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="w-5 h-5" />
                      API Performance
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {Object.keys(analytics.apiHealth.byType).length === 0 ? (
                      <p className="text-muted-foreground text-center py-4">No API data available</p>
                    ) : (
                      <div className="space-y-3">
                        {Object.entries(analytics.apiHealth.byType).map(([type, data]) => (
                          <div key={type} className="p-3 bg-secondary/30 rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium">{type}</span>
                              <span className="text-sm text-muted-foreground">{data.avgLatency}ms avg</span>
                            </div>
                            <div className="flex items-center gap-4 text-sm">
                              <span className="text-green-500">{data.total - data.errors} success</span>
                              <span className="text-red-500">{data.errors} errors</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Error Distribution by API Type */}
              <div className="grid lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-yellow-500" />
                      Error Distribution by API
                    </CardTitle>
                    <CardDescription>Breakdown of errors per API type</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {Object.keys(analytics.apiErrors.byType).length === 0 ? (
                      <div className="text-center py-6 text-muted-foreground">
                        <CheckCircle className="w-10 h-10 mx-auto mb-2 text-green-500/50" />
                        <p>No errors recorded</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {Object.entries(analytics.apiErrors.byType).map(([type, count]) => {
                          const typeData = analytics.apiHealth.byType[type];
                          const errorRate = typeData ? Math.round((count / typeData.total) * 100) : 0;
                          return (
                            <div key={type} className="p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <XCircle className="w-4 h-4 text-red-500" />
                                  <span className="font-medium capitalize">{type}</span>
                                </div>
                                <Badge variant="destructive">{count} errors</Badge>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-red-500 transition-all"
                                    style={{ width: `${Math.min(errorRate, 100)}%` }}
                                  />
                                </div>
                                <span className="text-xs text-muted-foreground w-12">{errorRate}% fail</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Recent Errors - Detailed View */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <XCircle className="w-5 h-5 text-red-500" />
                      Recent API Errors
                    </CardTitle>
                    <CardDescription>Latest failed API calls with details</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {analytics.apiErrors.recent.length === 0 ? (
                      <div className="text-center py-6 text-muted-foreground">
                        <CheckCircle className="w-10 h-10 mx-auto mb-2 text-green-500/50" />
                        <p>No recent errors</p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                        {analytics.apiErrors.recent.map((error, i) => (
                          <div key={i} className="flex items-start gap-3 p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
                            <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="outline" className="text-xs capitalize">{error.api_type}</Badge>
                                <span className="text-xs text-muted-foreground">
                                  {formatDistanceToNow(new Date(error.created_at), { addSuffix: true })}
                                </span>
                              </div>
                              <p className="text-sm text-red-400 break-words">{error.error_message}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Scanner API Health Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="w-5 h-5" />
                    Scanner API Health Summary
                  </CardTitle>
                  <CardDescription>
                    Real-time health status of token scanner APIs (DexScreener, GeckoTerminal, Birdeye, Raydium)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {['dexscreener', 'geckoterminal', 'birdeye', 'raydium'].map((apiType) => {
                      const apiData = analytics.apiHealth.byType[apiType];
                      const config = apiConfigs.find((c: ApiConfig) => c.api_type === apiType);
                      const errorCount = analytics.apiErrors.byType[apiType] || 0;
                      const successRate = apiData ? Math.round(((apiData.total - apiData.errors) / apiData.total) * 100) : 0;
                      
                      return (
                        <div 
                          key={apiType} 
                          className={`p-4 rounded-lg border ${
                            errorCount > 0 
                              ? 'bg-red-500/5 border-red-500/20' 
                              : apiData?.total > 0 
                                ? 'bg-green-500/5 border-green-500/20'
                                : 'bg-secondary/30 border-border/50'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            {errorCount > 0 ? (
                              <XCircle className="w-5 h-5 text-red-500" />
                            ) : apiData?.total > 0 ? (
                              <CheckCircle className="w-5 h-5 text-green-500" />
                            ) : (
                              <Clock className="w-5 h-5 text-muted-foreground" />
                            )}
                            <span className="font-medium capitalize">{apiType}</span>
                          </div>
                          <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Calls</span>
                              <span>{apiData?.total || 0}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Success</span>
                              <span className={successRate >= 90 ? 'text-green-500' : successRate >= 50 ? 'text-yellow-500' : 'text-red-500'}>
                                {successRate || 0}%
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Latency</span>
                              <span>{apiData?.avgLatency || 0}ms</span>
                            </div>
                            {config && (
                              <Badge 
                                variant="outline" 
                                className={`mt-2 w-full justify-center ${getStatusColor(config.status)}`}
                              >
                                {config.status}
                              </Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Sniper Engine Tab */}
            <TabsContent value="sniper" className="space-y-6">
              <div className="grid lg:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-3xl font-bold text-foreground">{analytics.sniperEvents.total}</p>
                    <p className="text-sm text-muted-foreground">Total Events</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-3xl font-bold text-green-500">{analytics.sniperEvents.approved}</p>
                    <p className="text-sm text-muted-foreground">Approved</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-3xl font-bold text-red-500">{analytics.sniperEvents.rejected}</p>
                    <p className="text-sm text-muted-foreground">Rejected</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-3xl font-bold text-primary">{analytics.sniperEvents.executed}</p>
                    <p className="text-sm text-muted-foreground">Executed</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="w-5 h-5" />
                    Recent Sniper Events
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {analytics.sniperEvents.recent.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground">
                      <Zap className="w-10 h-10 mx-auto mb-2 opacity-50" />
                      <p>No recent sniper events</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {analytics.sniperEvents.recent.map((event, i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
                          <div className="flex items-center gap-3">
                            <Badge 
                              variant="outline" 
                              className={
                                event.event_type === 'approved' ? 'bg-green-500/20 text-green-500' :
                                event.event_type === 'rejected' ? 'bg-red-500/20 text-red-500' :
                                'bg-primary/20 text-primary'
                              }
                            >
                              {event.event_type}
                            </Badge>
                            <span className="text-sm">{event.message || 'No details'}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Trading Tab */}
            <TabsContent value="trades" className="space-y-6">
              <div className="grid lg:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-6">
                    <div className="text-center">
                      <p className="text-4xl font-bold text-foreground">{analytics.tradeStats.total}</p>
                      <p className="text-muted-foreground">Total Trades</p>
                    </div>
                    <div className="mt-4 flex justify-center gap-6 text-sm">
                      <div className="text-center">
                        <p className="font-semibold text-green-500">{analytics.tradeStats.successful}</p>
                        <p className="text-muted-foreground">Profitable</p>
                      </div>
                      <div className="text-center">
                        <p className="font-semibold text-red-500">{analytics.tradeStats.failed}</p>
                        <p className="text-muted-foreground">Loss</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6 text-center">
                    <p className="text-4xl font-bold text-primary">{formatCurrency(analytics.tradeStats.totalVolume)}</p>
                    <p className="text-muted-foreground">Total Volume</p>
                    <p className="text-sm text-muted-foreground mt-2">
                      Avg: {formatCurrency(analytics.tradeStats.avgTradeSize)}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6 text-center">
                    <p className={`text-4xl font-bold ${analytics.tradeStats.successRate >= 50 ? 'text-green-500' : 'text-red-500'}`}>
                      {analytics.tradeStats.successRate}%
                    </p>
                    <p className="text-muted-foreground">Success Rate</p>
                    <div className="mt-3 h-2 bg-secondary rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-green-500 to-green-400"
                        style={{ width: `${analytics.tradeStats.successRate}%` }}
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>User Trading Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-3 gap-4 mb-6">
                    <div className="p-4 bg-secondary/30 rounded-lg text-center">
                      <p className="text-2xl font-bold">{analytics.userVolume.totalUsers}</p>
                      <p className="text-sm text-muted-foreground">Total Users</p>
                    </div>
                    <div className="p-4 bg-secondary/30 rounded-lg text-center">
                      <p className="text-2xl font-bold text-primary">{analytics.userVolume.activeTraders}</p>
                      <p className="text-sm text-muted-foreground">Active Traders</p>
                    </div>
                    <div className="p-4 bg-secondary/30 rounded-lg text-center">
                      <p className="text-2xl font-bold">{formatCurrency(analytics.userVolume.totalVolume)}</p>
                      <p className="text-sm text-muted-foreground">Total Volume</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Copy Trading Tab */}
            <TabsContent value="copy" className="space-y-6">
              <div className="grid lg:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-3xl font-bold">{analytics.copyTradingStats.totalTrades}</p>
                    <p className="text-sm text-muted-foreground">Total Trades</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-3xl font-bold text-primary">{formatCurrency(analytics.copyTradingStats.totalVolume)}</p>
                    <p className="text-sm text-muted-foreground">Total Volume</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-3xl font-bold">{analytics.copyTradingStats.uniqueLeaders}</p>
                    <p className="text-sm text-muted-foreground">Unique Leaders</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-3xl font-bold text-green-500">{analytics.copyTradingStats.byStatus['executed'] || 0}</p>
                    <p className="text-sm text-muted-foreground">Executed</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Copy className="w-5 h-5" />
                    Recent Copy Trades
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {analytics.copyTradingStats.recent.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground">
                      <Copy className="w-10 h-10 mx-auto mb-2 opacity-50" />
                      <p>No recent copy trades</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {analytics.copyTradingStats.recent.map((trade, i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
                          <div className="flex items-center gap-3">
                            <Badge variant="outline" className={trade.action === 'buy' ? 'text-green-500' : 'text-red-500'}>
                              {trade.action}
                            </Badge>
                            <div>
                              <span className="font-medium">{trade.token_symbol}</span>
                              <span className="text-muted-foreground mx-2">→</span>
                              <span className="text-sm text-muted-foreground">{trade.leader_name}</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-mono">{trade.amount.toFixed(4)}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(trade.created_at), { addSuffix: true })}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Risk Alerts Tab */}
            <TabsContent value="risk" className="space-y-6">
              <div className="grid lg:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-3xl font-bold">{analytics.riskAlerts.total}</p>
                    <p className="text-sm text-muted-foreground">Total Checks</p>
                  </CardContent>
                </Card>
                <Card className="border-red-500/20">
                  <CardContent className="p-4 text-center">
                    <p className="text-3xl font-bold text-red-500">{analytics.riskAlerts.honeypotDetected}</p>
                    <p className="text-sm text-muted-foreground">Honeypots</p>
                  </CardContent>
                </Card>
                <Card className="border-orange-500/20">
                  <CardContent className="p-4 text-center">
                    <p className="text-3xl font-bold text-orange-500">{analytics.riskAlerts.blacklistDetected}</p>
                    <p className="text-sm text-muted-foreground">Blacklisted</p>
                  </CardContent>
                </Card>
                <Card className="border-yellow-500/20">
                  <CardContent className="p-4 text-center">
                    <p className="text-3xl font-bold text-yellow-500">{analytics.riskAlerts.highRisk}</p>
                    <p className="text-sm text-muted-foreground">High Risk</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="w-5 h-5 text-yellow-500" />
                    Recent Risk Alerts
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {analytics.riskAlerts.recent.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground">
                      <Shield className="w-10 h-10 mx-auto mb-2 text-green-500/50" />
                      <p>No recent risk alerts</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {analytics.riskAlerts.recent.map((alert, i) => (
                        <div key={i} className="p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{alert.token_symbol}</span>
                              <Badge 
                                className={
                                  alert.risk_score >= 80 ? 'bg-red-500/20 text-red-500' :
                                  alert.risk_score >= 50 ? 'bg-yellow-500/20 text-yellow-500' :
                                  'bg-green-500/20 text-green-500'
                                }
                              >
                                Risk: {alert.risk_score}
                              </Badge>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(alert.checked_at), { addSuffix: true })}
                            </span>
                          </div>
                          {alert.rejection_reasons.length > 0 && (
                            <div className="text-sm text-red-400">
                              {alert.rejection_reasons.slice(0, 2).join(' • ')}
                            </div>
                          )}
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

AdminAnalytics.displayName = 'AdminAnalytics';

export default AdminAnalytics;
