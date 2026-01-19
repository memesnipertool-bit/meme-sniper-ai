import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  Server, 
  Zap, 
  Check, 
  X, 
  Loader2, 
  RefreshCw,
  ExternalLink,
  AlertTriangle 
} from 'lucide-react';

interface RpcEndpoints {
  primary: string;
  helius: string | null;
  quicknode: string | null;
  useHelius: boolean;
}

interface TradeExecutionSettings {
  enabled: boolean;
  autoExecute: boolean;
  signalExpiry: number;
  maxPendingSignals: number;
}

interface EndpointStatus {
  url: string;
  latency: number | null;
  status: 'online' | 'offline' | 'checking';
  blockHeight: number | null;
}

export function RpcSettingsPanel() {
  const [rpcSettings, setRpcSettings] = useState<RpcEndpoints>({
    primary: 'https://api.mainnet-beta.solana.com',
    helius: null,
    quicknode: null,
    useHelius: false,
  });
  const [tradeSettings, setTradeSettings] = useState<TradeExecutionSettings>({
    enabled: false,
    autoExecute: false,
    signalExpiry: 300,
    maxPendingSignals: 10,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [endpointStatus, setEndpointStatus] = useState<Record<string, EndpointStatus>>({});
  const { toast } = useToast();

  // Fetch settings
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const { data, error } = await supabase
          .from('admin_settings')
          .select('*')
          .in('setting_key', ['rpc_endpoints', 'trade_execution']);

        if (error) throw error;

        data?.forEach((setting: any) => {
          if (setting.setting_key === 'rpc_endpoints') {
            setRpcSettings(setting.setting_value);
          } else if (setting.setting_key === 'trade_execution') {
            setTradeSettings(setting.setting_value);
          }
        });
      } catch (error: any) {
        console.error('Error fetching settings:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

  // Test RPC endpoint
  const testEndpoint = async (name: string, url: string) => {
    if (!url) return;

    setEndpointStatus(prev => ({
      ...prev,
      [name]: { url, latency: null, status: 'checking', blockHeight: null }
    }));

    try {
      const startTime = Date.now();
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getBlockHeight',
        }),
      });

      const latency = Date.now() - startTime;
      const data = await response.json();

      if (data.result) {
        setEndpointStatus(prev => ({
          ...prev,
          [name]: { url, latency, status: 'online', blockHeight: data.result }
        }));
      } else {
        throw new Error('Invalid response');
      }
    } catch {
      setEndpointStatus(prev => ({
        ...prev,
        [name]: { url, latency: null, status: 'offline', blockHeight: null }
      }));
    }
  };

  // Test all endpoints
  const testAllEndpoints = async () => {
    const endpoints = [
      { name: 'primary', url: rpcSettings.primary },
      { name: 'helius', url: rpcSettings.helius },
      { name: 'quicknode', url: rpcSettings.quicknode },
    ].filter(e => e.url);

    await Promise.all(endpoints.map(e => testEndpoint(e.name, e.url!)));
  };

  // Save settings
  const saveSettings = async () => {
    setSaving(true);
    try {
      const { error: rpcError } = await supabase
        .from('admin_settings')
        .upsert(
          {
            setting_key: 'rpc_endpoints',
            setting_value: rpcSettings as any,
            category: 'infrastructure',
          }, 
          { onConflict: 'setting_key' }
        );

      if (rpcError) throw rpcError;

      const { error: tradeError } = await supabase
        .from('admin_settings')
        .upsert(
          {
            setting_key: 'trade_execution',
            setting_value: tradeSettings as any,
            category: 'trading',
          }, 
          { onConflict: 'setting_key' }
        );

      if (tradeError) throw tradeError;

      toast({
        title: 'Settings Saved',
        description: 'RPC and trade execution settings updated.',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            RPC Endpoints
          </CardTitle>
          <CardDescription>
            Configure Solana RPC endpoints for faster transaction speeds. 
            Helius and QuickNode offer lower latency for production sniping.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Primary RPC */}
          <div className="space-y-2">
            <Label>Primary RPC (Free - Fallback)</Label>
            <div className="flex gap-2">
              <Input
                value={rpcSettings.primary}
                onChange={e => setRpcSettings(prev => ({ ...prev, primary: e.target.value }))}
                placeholder="https://api.mainnet-beta.solana.com"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => testEndpoint('primary', rpcSettings.primary)}
              >
                {endpointStatus['primary']?.status === 'checking' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </div>
            {endpointStatus['primary'] && (
              <div className="flex items-center gap-2 text-sm">
                {endpointStatus['primary'].status === 'online' ? (
                  <>
                    <Check className="h-4 w-4 text-green-500" />
                    <span className="text-green-600">
                      Online - {endpointStatus['primary'].latency}ms
                    </span>
                  </>
                ) : endpointStatus['primary'].status === 'offline' ? (
                  <>
                    <X className="h-4 w-4 text-red-500" />
                    <span className="text-red-600">Offline</span>
                  </>
                ) : null}
              </div>
            )}
          </div>

          {/* Helius RPC */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Helius RPC (Recommended for Production)</Label>
              <a 
                href="https://helius.dev" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                Get API Key <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="flex gap-2">
              <Input
                value={rpcSettings.helius || ''}
                onChange={e => setRpcSettings(prev => ({ ...prev, helius: e.target.value || null }))}
                placeholder="https://mainnet.helius-rpc.com/?api-key=YOUR_KEY"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => rpcSettings.helius && testEndpoint('helius', rpcSettings.helius)}
                disabled={!rpcSettings.helius}
              >
                {endpointStatus['helius']?.status === 'checking' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </div>
            {endpointStatus['helius'] && (
              <div className="flex items-center gap-2 text-sm">
                {endpointStatus['helius'].status === 'online' ? (
                  <>
                    <Check className="h-4 w-4 text-green-500" />
                    <span className="text-green-600">
                      Online - {endpointStatus['helius'].latency}ms
                    </span>
                  </>
                ) : endpointStatus['helius'].status === 'offline' ? (
                  <>
                    <X className="h-4 w-4 text-red-500" />
                    <span className="text-red-600">Offline or Invalid API Key</span>
                  </>
                ) : null}
              </div>
            )}
          </div>

          {/* QuickNode RPC */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>QuickNode RPC (Alternative)</Label>
              <a 
                href="https://quicknode.com" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                Get API Key <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="flex gap-2">
              <Input
                value={rpcSettings.quicknode || ''}
                onChange={e => setRpcSettings(prev => ({ ...prev, quicknode: e.target.value || null }))}
                placeholder="https://your-endpoint.solana-mainnet.quiknode.pro/YOUR_KEY"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => rpcSettings.quicknode && testEndpoint('quicknode', rpcSettings.quicknode)}
                disabled={!rpcSettings.quicknode}
              >
                {endpointStatus['quicknode']?.status === 'checking' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Use Helius Toggle */}
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div>
              <p className="font-medium">Use Helius as Primary</p>
              <p className="text-sm text-muted-foreground">
                Enable for faster transaction speeds (5-20ms vs 50-100ms)
              </p>
            </div>
            <Switch
              checked={rpcSettings.useHelius}
              onCheckedChange={checked => setRpcSettings(prev => ({ ...prev, useHelius: checked }))}
              disabled={!rpcSettings.helius}
            />
          </div>

          <Button onClick={testAllEndpoints} variant="outline" className="w-full">
            <RefreshCw className="h-4 w-4 mr-2" />
            Test All Endpoints
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Trade Execution Settings
          </CardTitle>
          <CardDescription>
            Configure how trade signals are created and executed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div>
              <p className="font-medium">Enable Trade Signals</p>
              <p className="text-sm text-muted-foreground">
                Auto-sniper will create trade signals for approved tokens
              </p>
            </div>
            <Switch
              checked={tradeSettings.enabled}
              onCheckedChange={checked => setTradeSettings(prev => ({ ...prev, enabled: checked }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Signal Expiry (seconds)</Label>
              <Input
                type="number"
                value={tradeSettings.signalExpiry}
                onChange={e => setTradeSettings(prev => ({ 
                  ...prev, 
                  signalExpiry: parseInt(e.target.value) || 300 
                }))}
                min={60}
                max={600}
              />
            </div>

            <div className="space-y-2">
              <Label>Max Pending Signals</Label>
              <Input
                type="number"
                value={tradeSettings.maxPendingSignals}
                onChange={e => setTradeSettings(prev => ({ 
                  ...prev, 
                  maxPendingSignals: parseInt(e.target.value) || 10 
                }))}
                min={1}
                max={50}
              />
            </div>
          </div>

          <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5" />
              <div>
                <p className="font-medium text-yellow-600">Production Requirements</p>
                <ul className="text-sm text-muted-foreground mt-1 space-y-1">
                  <li>• Helius or QuickNode RPC required for speed</li>
                  <li>• Jupiter paid API recommended for reliability</li>
                  <li>• Wallet must be connected to execute trades</li>
                  <li>• Each trade requires manual wallet signature</li>
                </ul>
              </div>
            </div>
          </div>

          <Button onClick={saveSettings} disabled={saving} className="w-full">
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Settings'
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
