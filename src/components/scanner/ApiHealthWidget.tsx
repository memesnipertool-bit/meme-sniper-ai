import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, CheckCircle, XCircle, Clock, Wifi, WifiOff, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface ApiStatus {
  name: string;
  status: 'online' | 'degraded' | 'offline' | 'unknown';
  latency: number | null;
  lastCheck: Date | null;
  lastError?: string;
}

interface ApiHealthWidgetProps {
  isDemo?: boolean;
}

const DEFAULT_APIS = ['Jupiter', 'Raydium', 'Pump.fun', 'DexScreener'];

export default function ApiHealthWidget({ isDemo = false }: ApiHealthWidgetProps) {
  const [statuses, setStatuses] = useState<ApiStatus[]>(
    DEFAULT_APIS.map(name => ({
      name,
      status: 'unknown',
      latency: null,
      lastCheck: null,
    }))
  );
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checkingRef = useRef(false);

  const checkHealth = useCallback(async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    setChecking(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('api-health');
      
      if (fnError) {
        throw new Error(fnError.message || 'Failed to check API health');
      }

      if (data?.statuses) {
        setStatuses(data.statuses.map((s: any) => ({
          name: s.name,
          status: s.status,
          latency: s.latency,
          lastCheck: s.lastCheck ? new Date(s.lastCheck) : new Date(),
          lastError: s.lastError,
        })));
      }
    } catch (err: any) {
      console.error('[ApiHealthWidget] Error:', err);
      setError(err.message || 'Health check failed');
      // Keep existing statuses but mark as unknown on error
      setStatuses(prev => prev.map(s => ({
        ...s,
        status: 'unknown' as const,
        lastError: 'Check failed',
      })));
    } finally {
      setChecking(false);
      checkingRef.current = false;
    }
  }, []);

  // Check on mount and every 60 seconds
  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 60000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  const statusConfig = {
    online: { color: 'text-success', bg: 'bg-success/20', icon: CheckCircle },
    degraded: { color: 'text-warning', bg: 'bg-warning/20', icon: Clock },
    offline: { color: 'text-destructive', bg: 'bg-destructive/20', icon: XCircle },
    unknown: { color: 'text-muted-foreground', bg: 'bg-muted/20', icon: WifiOff },
  };

  const overallStatus = statuses.every(s => s.status === 'online')
    ? 'online'
    : statuses.some(s => s.status === 'offline')
      ? 'degraded'
      : statuses.every(s => s.status === 'unknown')
        ? 'unknown'
        : 'online';

  return (
    <Card className="bg-card/80 backdrop-blur-sm border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wifi className={`w-4 h-4 ${overallStatus === 'online' ? 'text-success' : overallStatus === 'unknown' ? 'text-muted-foreground' : 'text-warning'}`} />
            API Health
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={checkHealth}
            disabled={checking}
          >
            <RefreshCw className={`w-3 h-3 ${checking ? 'animate-spin' : ''}`} />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {error && (
          <div className="flex items-center gap-1 text-[10px] text-warning mb-2 p-1.5 bg-warning/10 rounded">
            <AlertTriangle className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{error}</span>
          </div>
        )}
        
        <div className="grid grid-cols-2 gap-2">
          {statuses.map((api) => {
            const config = statusConfig[api.status];
            const Icon = config.icon;
            
            return (
              <div
                key={api.name}
                className={`p-2 rounded-lg ${config.bg} border border-transparent`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium">{api.name}</span>
                  <Icon className={`w-3 h-3 ${config.color}`} />
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className={config.color}>
                    {api.status === 'unknown' ? 'Checking...' : api.status}
                  </span>
                  {api.latency !== null && (
                    <span className="text-muted-foreground">{api.latency}ms</span>
                  )}
                </div>
                {api.lastError && api.status !== 'online' && (
                  <p className="text-[9px] text-destructive/80 mt-0.5 truncate">
                    {api.lastError}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        
        {statuses[0]?.lastCheck && (
          <p className="text-[9px] text-muted-foreground text-center mt-2">
            Last check: {statuses[0].lastCheck.toLocaleTimeString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
