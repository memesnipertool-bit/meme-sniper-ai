import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useApiConfigurations, ApiConfiguration, ApiType, ApiStatus } from '@/hooks/useApiConfigurations';
import { useApiSecrets } from '@/hooks/useApiSecrets';
import { Plus, Pencil, Trash2, RefreshCw, Loader2, HelpCircle, CheckCircle2, AlertCircle, Info, Key, ShieldCheck, ShieldAlert, Eye, EyeOff } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

// API Documentation with requirement levels, help notes, and error solutions
const API_INFO: Record<ApiType, {
  label: string;
  required: boolean;
  description: string;
  helpNotes: string;
  defaultUrl: string;
  requiresKey: boolean;
  secretName: string;
  alternatives?: string[];
  commonErrors: { pattern: string; solution: string }[];
}> = {
  dexscreener: {
    label: 'DexScreener API',
    required: true,
    description: 'Primary API for fetching real-time token data, pairs, and liquidity information across multiple chains.',
    helpNotes: 'Free tier available. No API key required for basic usage. Rate limit: 300 requests/min. Get from: https://docs.dexscreener.com',
    defaultUrl: 'https://api.dexscreener.com',
    requiresKey: false,
    secretName: 'DEXSCREENER_API_KEY',
    commonErrors: [
      { pattern: 'pairs.slice is not a function', solution: 'API response format changed. The scanner has been updated to handle different response structures. Try running a scan again.' },
      { pattern: 'rate limit', solution: 'Reduce scan frequency or wait a few minutes. DexScreener allows 300 requests/min.' },
      { pattern: '429', solution: 'Rate limited. Wait 1-2 minutes before scanning again.' },
      { pattern: '503', solution: 'DexScreener is temporarily unavailable. Try again in a few minutes.' },
    ],
  },
  geckoterminal: {
    label: 'GeckoTerminal API',
    required: false,
    description: 'Alternative/backup API for token data. Provides OHLCV data and pool information.',
    helpNotes: 'Free API, no key required. Good backup for DexScreener. Rate limit: 30 requests/min. Docs: https://www.geckoterminal.com/dex-api',
    defaultUrl: 'https://api.geckoterminal.com',
    requiresKey: false,
    secretName: 'GECKOTERMINAL_API_KEY',
    alternatives: ['dexscreener'],
    commonErrors: [
      { pattern: '429', solution: 'Rate limited. GeckoTerminal has a 30 req/min limit. Wait before retrying.' },
      { pattern: 'timeout', solution: 'Network timeout. Check your internet connection or try again.' },
    ],
  },
  birdeye: {
    label: 'Birdeye API',
    required: true,
    description: 'Essential for Solana token analytics, price feeds, and wallet tracking.',
    helpNotes: 'API key required. Free tier: 100 req/min. Get your key at: https://birdeye.so/api (requires Solana wallet to sign up)',
    defaultUrl: 'https://public-api.birdeye.so',
    requiresKey: true,
    secretName: 'BIRDEYE_API_KEY',
    commonErrors: [
      { pattern: '401', solution: 'Invalid or missing API key. Get a free key at birdeye.so/api and configure it.' },
      { pattern: '403', solution: 'API key expired or revoked. Generate a new key at birdeye.so/api.' },
      { pattern: 'API key required', solution: 'Add your Birdeye API key in the configuration. Sign up at birdeye.so to get one.' },
    ],
  },
  dextools: {
    label: 'Dextools / RapidAPI',
    required: false,
    description: 'Optional premium API for advanced token scoring and pair analysis.',
    helpNotes: 'Paid API via RapidAPI. Subscribe at: https://rapidapi.com/dextools. Use X-RapidAPI-Key header.',
    defaultUrl: 'https://public-api.dextools.io',
    requiresKey: true,
    secretName: 'DEXTOOLS_API_KEY',
    alternatives: ['dexscreener', 'geckoterminal'],
    commonErrors: [
      { pattern: '401', solution: 'Invalid RapidAPI key. Subscribe at rapidapi.com/dextools and add your key.' },
      { pattern: '402', solution: 'RapidAPI subscription required or quota exceeded. Check your subscription.' },
    ],
  },
  honeypot_rugcheck: {
    label: 'Honeypot/Rugcheck API',
    required: true,
    description: 'Critical for token safety checks - detects honeypots, rugs, and malicious contracts.',
    helpNotes: 'Free API, no key needed. Essential for risk management. Docs: https://honeypot.is/docs',
    defaultUrl: 'https://api.honeypot.is',
    requiresKey: false,
    secretName: 'HONEYPOT_API_KEY',
    commonErrors: [
      { pattern: 'timeout', solution: 'Honeypot API can be slow. The scanner will continue with other tokens.' },
      { pattern: '503', solution: 'Service temporarily unavailable. Token risk scores may be estimated.' },
    ],
  },
  liquidity_lock: {
    label: 'Liquidity Lock API',
    required: false,
    description: 'Verifies if token liquidity is locked. Used for additional safety scoring.',
    helpNotes: 'Optional but recommended. Team Finance API key may be needed for full access. Alternative: Check on-chain directly.',
    defaultUrl: 'https://api.team.finance',
    requiresKey: true,
    secretName: 'LIQUIDITY_LOCK_API_KEY',
    alternatives: ['On-chain verification'],
    commonErrors: [
      { pattern: '401', solution: 'API key may be required for Team Finance. Consider on-chain verification as alternative.' },
    ],
  },
  jupiter: {
    label: 'Jupiter Aggregator',
    required: true,
    description: 'Primary DEX aggregator for Solana. Finds best swap routes across all DEXs.',
    helpNotes: 'Free API, no key needed. Best price routing, supports all Solana tokens. Rate limit: ~600 req/min.',
    defaultUrl: 'https://quote-api.jup.ag/v6',
    requiresKey: false,
    secretName: 'JUPITER_API_KEY',
    commonErrors: [
      { pattern: 'ROUTE_NOT_FOUND', solution: 'No liquidity route found. Token may not be tradeable or has very low liquidity.' },
      { pattern: '403', solution: 'Access denied. Wait a moment and try again.' },
      { pattern: '429', solution: 'Rate limited. Reduce request frequency.' },
    ],
  },
  raydium: {
    label: 'Raydium DEX',
    required: false,
    description: 'Fallback DEX for tokens not available on Jupiter. Direct AMM access for Raydium pools.',
    helpNotes: 'Free API, no key needed. Used as fallback when Jupiter has no route. Supports V0 transactions.',
    defaultUrl: 'https://transaction-v1.raydium.io',
    requiresKey: false,
    secretName: 'RAYDIUM_API_KEY',
    alternatives: ['jupiter'],
    commonErrors: [
      { pattern: 'REQ_INPUT_ACCOUNT_ERROR', solution: "Token not in wallet. May have been sold or transferred already." },
      { pattern: '429', solution: 'Rate limited. Reduce request frequency.' },
    ],
  },
  pumpfun: {
    label: 'Pump.fun API',
    required: false,
    description: 'Discover and trade new meme tokens on Pump.fun bonding curves before they graduate to Raydium.',
    helpNotes: 'Free API, no key needed. Fetches new tokens and enables bonding curve trading for early entry.',
    defaultUrl: 'https://frontend-api.pump.fun',
    requiresKey: false,
    secretName: 'PUMPFUN_API_KEY',
    commonErrors: [
      { pattern: 'timeout', solution: 'Pump.fun API can be slow during high traffic. Try again.' },
      { pattern: '503', solution: 'Service temporarily unavailable. Wait and retry.' },
    ],
  },
  rpc_provider: {
    label: 'Solana RPC Provider',
    required: true,
    description: 'Required for all blockchain interactions - reading data and sending transactions.',
    helpNotes: 'Free public RPC has rate limits. For production, use: Helius, QuickNode, or Alchemy. Get free RPC at: https://helius.xyz',
    defaultUrl: 'https://api.mainnet-beta.solana.com',
    requiresKey: false,
    secretName: 'RPC_PROVIDER_API_KEY',
    commonErrors: [
      { pattern: '429', solution: 'Public RPC rate limited. Consider using Helius or QuickNode for better limits.' },
      { pattern: 'timeout', solution: 'RPC node is slow. Try a different provider like helius.xyz or quicknode.com.' },
    ],
  },
};

// Fallback for unknown/legacy API types
const getApiInfo = (apiType: string): typeof API_INFO[ApiType] => {
  if (apiType in API_INFO) {
    return API_INFO[apiType as ApiType];
  }
  // Fallback for legacy types like 'trade_execution'
  return {
    label: apiType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    required: false,
    description: 'Legacy API configuration. Consider updating to the new API type.',
    helpNotes: 'This API type is deprecated. Please delete and reconfigure with the correct type.',
    defaultUrl: '',
    requiresKey: false,
    secretName: '',
    commonErrors: [],
  };
};

const STATUS_COLORS: Record<ApiStatus, string> = {
  active: 'bg-green-500/20 text-green-400 border-green-500/30',
  inactive: 'bg-muted text-muted-foreground border-muted',
  error: 'bg-destructive/20 text-destructive border-destructive/30',
  rate_limited: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
};

interface ApiFormData {
  api_type: ApiType;
  api_name: string;
  base_url: string;
  is_enabled: boolean;
  rate_limit_per_minute: number;
  status: ApiStatus;
  api_key: string;
}

const defaultFormData: ApiFormData = {
  api_type: 'dexscreener',
  api_name: '',
  base_url: '',
  is_enabled: true,
  rate_limit_per_minute: 60,
  status: 'inactive',
  api_key: '',
};

export function ApiSettingsModule() {
  const { configurations, loading, addConfiguration, updateConfiguration, deleteConfiguration, toggleEnabled, fetchConfigurations } = useApiConfigurations();
  const { secretStatus, loading: secretsLoading, fetchSecretStatus, validateSecret, saveApiKey } = useApiSecrets();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ApiConfiguration | null>(null);
  const [formData, setFormData] = useState<ApiFormData>(defaultFormData);
  const [isSaving, setIsSaving] = useState(false);
  const [validatingSecrets, setValidatingSecrets] = useState<Record<string, boolean>>({});
  const [showApiKey, setShowApiKey] = useState(false);

  const handleOpenDialog = (config?: ApiConfiguration) => {
    if (config) {
      setEditingConfig(config);
      setFormData({
        api_type: config.api_type,
        api_name: config.api_name,
        base_url: config.base_url,
        is_enabled: config.is_enabled,
        rate_limit_per_minute: config.rate_limit_per_minute,
        status: config.status,
        api_key: '',
      });
    } else {
      setEditingConfig(null);
      setFormData(defaultFormData);
    }
    setShowApiKey(false);
    setIsDialogOpen(true);
  };

  const handleApiTypeChange = (value: ApiType) => {
    const info = API_INFO[value];
    setFormData(prev => ({
      ...prev,
      api_type: value,
      api_name: prev.api_name || info.label,
      base_url: prev.base_url || info.defaultUrl,
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Extract API key from form data before saving configuration
      const { api_key, ...configData } = formData;
      
      // Save configuration first (API key is stored separately as secret)
      const saveData = {
        ...configData,
        api_key_encrypted: null,
      };

      if (editingConfig) {
        await updateConfiguration(editingConfig.id, saveData);
      } else {
        await addConfiguration(saveData);
      }
      
      // Now save API key AFTER configuration exists
      if (api_key && api_key.trim()) {
        const result = await saveApiKey(formData.api_type, api_key.trim());
        if (!result.success) {
          // Configuration saved but API key failed - notify user
          console.error('Failed to save API key after configuration');
        }
      }
      
      setIsDialogOpen(false);
      setFormData(defaultFormData);
      setEditingConfig(null);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this API configuration?')) {
      await deleteConfiguration(id);
    }
  };

  const handleValidateSecret = async (apiType: ApiType) => {
    setValidatingSecrets(prev => ({ ...prev, [apiType]: true }));
    try {
      await validateSecret(apiType);
    } finally {
      setValidatingSecrets(prev => ({ ...prev, [apiType]: false }));
    }
  };

  // Check which required APIs are configured
  const requiredApis = Object.entries(API_INFO).filter(([_, info]) => info.required);
  const configuredTypes = configurations.map(c => c.api_type);
  const missingRequired = requiredApis.filter(([type]) => !configuredTypes.includes(type as ApiType));

  // Check which required APIs need API keys but don't have secrets configured
  const missingSecrets = Object.entries(API_INFO)
    .filter(([type, info]) => info.requiresKey && !secretStatus[type]?.configured)
    .map(([type, info]) => ({ type, info }));

  if (loading || secretsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">API Settings</h2>
            <p className="text-muted-foreground">Manage external API configurations for the application</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { fetchConfigurations(); fetchSecretStatus(); }}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => handleOpenDialog()}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add API
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[550px]">
                <DialogHeader>
                  <DialogTitle>{editingConfig ? 'Edit API Configuration' : 'Add New API Configuration'}</DialogTitle>
                  <DialogDescription>
                    Configure the API settings. API keys are stored securely as secrets.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="api_type">API Type</Label>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>Select the type of API you want to configure. Required APIs are essential for core functionality.</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Select
                      value={formData.api_type}
                      onValueChange={handleApiTypeChange}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select API type" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(API_INFO).map(([value, info]) => (
                          <SelectItem key={value} value={value}>
                            <div className="flex items-center gap-2">
                              <span>{info.label}</span>
                              {info.required ? (
                                <Badge variant="destructive" className="text-[10px] px-1 py-0">Required</Badge>
                              ) : (
                                <Badge variant="secondary" className="text-[10px] px-1 py-0">Optional</Badge>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {/* Show API info box */}
                    {formData.api_type && (() => {
                      const typeInfo = getApiInfo(formData.api_type);
                      return (
                        <div className="rounded-md border border-border bg-muted/30 p-3 text-sm space-y-2">
                          <div className="flex items-start gap-2">
                            <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                            <div>
                              <p className="text-foreground font-medium">{typeInfo.description}</p>
                              <p className="text-muted-foreground mt-1">{typeInfo.helpNotes}</p>
                              {typeInfo.requiresKey && (
                                <div className="mt-2 flex items-center gap-2">
                                  <Key className="h-4 w-4 text-yellow-500" />
                                  <span className="text-yellow-500 text-xs">
                                    API key required - Configure via Secrets ({typeInfo.secretName})
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="api_name">API Name</Label>
                    <Input
                      id="api_name"
                      value={formData.api_name}
                      onChange={(e) => setFormData(prev => ({ ...prev, api_name: e.target.value }))}
                      placeholder="e.g., DexScreener Main API"
                    />
                  </div>
                  <div className="grid gap-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="base_url">Base URL</Label>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Default: {getApiInfo(formData.api_type).defaultUrl}</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Input
                      id="base_url"
                      value={formData.base_url}
                      onChange={(e) => setFormData(prev => ({ ...prev, base_url: e.target.value }))}
                      placeholder={getApiInfo(formData.api_type).defaultUrl || "https://api.example.com"}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="rate_limit">Rate Limit (per minute)</Label>
                    <Input
                      id="rate_limit"
                      type="number"
                      value={formData.rate_limit_per_minute}
                      onChange={(e) => setFormData(prev => ({ ...prev, rate_limit_per_minute: parseInt(e.target.value) || 60 }))}
                      min={1}
                    />
                  </div>
                  
                  {/* API Key Input - Show for ALL APIs */}
                  {(() => {
                    const keyInfo = getApiInfo(formData.api_type);
                    return (
                      <div className="grid gap-2">
                        <div className="flex items-center gap-2">
                          <Label htmlFor="api_key">API Key</Label>
                          {keyInfo.requiresKey ? (
                            <Badge variant="destructive" className="text-[10px] px-1 py-0">Required</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px] px-1 py-0">Optional</Badge>
                          )}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p>Enter your API key. It will be securely stored as {keyInfo.secretName}</p>
                            </TooltipContent>
                          </Tooltip>
                          {secretStatus[formData.api_type]?.configured && (
                            <Badge variant="outline" className="text-xs text-green-500 border-green-500/30">
                              <Key className="h-3 w-3 mr-1" />
                              Already configured
                            </Badge>
                          )}
                        </div>
                        <div className="relative">
                          <Input
                            id="api_key"
                            type={showApiKey ? 'text' : 'password'}
                            value={formData.api_key}
                            onChange={(e) => setFormData(prev => ({ ...prev, api_key: e.target.value }))}
                            placeholder={secretStatus[formData.api_type]?.configured ? 'Leave empty to keep current key' : 'Enter API key'}
                            className="pr-10"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                            onClick={() => setShowApiKey(!showApiKey)}
                          >
                            {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {keyInfo.requiresKey 
                            ? keyInfo.helpNotes
                            : `Optional: ${keyInfo.helpNotes || 'API key can be added for enhanced features.'}`
                          }
                        </p>
                      </div>
                    );
                  })()}
                  
                  <div className="flex items-center gap-2">
                    <Switch
                      id="is_enabled"
                      checked={formData.is_enabled}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_enabled: checked }))}
                    />
                    <Label htmlFor="is_enabled">Enabled</Label>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleSave} disabled={isSaving || !formData.api_name || !formData.base_url}>
                    {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {editingConfig ? 'Update' : 'Add'} API
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Secrets Status Card */}
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="h-5 w-5 text-primary" />
              API Secrets Status
            </CardTitle>
            <CardDescription>
              API keys are securely stored as secrets. Contact your administrator to add or update API keys.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(API_INFO).filter(([_, info]) => info.requiresKey).map(([type, info]) => {
                const isConfigured = secretStatus[type]?.configured;
                return (
                  <div
                    key={type}
                    className={`flex items-center gap-2 p-3 rounded-lg border ${
                      isConfigured 
                        ? 'border-green-500/30 bg-green-500/10' 
                        : 'border-destructive/30 bg-destructive/10'
                    }`}
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium">{info.label}</p>
                      <p className="text-xs text-muted-foreground">{info.secretName}</p>
                    </div>
                    {isConfigured ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-destructive" />
                    )}
                  </div>
                );
              })}
            </div>
            {missingSecrets.length > 0 && (
              <Alert variant="destructive" className="mt-4">
                <ShieldAlert className="h-4 w-4" />
                <AlertTitle>Missing API Keys</AlertTitle>
                <AlertDescription>
                  The following required API keys need to be configured: {missingSecrets.map(s => s.info.secretName).join(', ')}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* API Requirements Info */}
        <Alert className="border-primary/30 bg-primary/5">
          <Info className="h-4 w-4" />
          <AlertTitle>API Configuration Guide</AlertTitle>
          <AlertDescription className="mt-2">
            <div className="grid gap-2">
              <div className="flex items-center gap-2">
                <Badge variant="destructive" className="text-[10px]">Required</Badge>
                <span className="text-sm">DexScreener, Birdeye, Honeypot/Rugcheck, Jupiter Trade, Solana RPC</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">Optional</Badge>
                <span className="text-sm">GeckoTerminal (backup), Dextools (premium), Liquidity Lock</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Status shows "inactive" until the API is successfully called. Run a token scan to verify API connectivity.
              </p>
            </div>
          </AlertDescription>
        </Alert>

        {/* Missing Required APIs Warning */}
        {missingRequired.length > 0 && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Missing Required APIs</AlertTitle>
            <AlertDescription>
              The following required APIs are not configured: {missingRequired.map(([_, info]) => info.label).join(', ')}
            </AlertDescription>
          </Alert>
        )}

        {/* APIs with Errors - Show solutions */}
        {configurations.filter(c => c.status === 'error').length > 0 && (
          <Card className="border-destructive/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-destructive flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                API Errors Detected
              </CardTitle>
              <CardDescription>
                The following APIs have errors. Review the suggested solutions below.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {configurations
                  .filter(c => c.status === 'error')
                  .map((config) => {
                    const apiInfo = getApiInfo(config.api_type);
                    return (
                      <div key={config.id} className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="font-medium text-foreground">{config.api_name}</span>
                              <Badge variant="outline" className="text-xs">{apiInfo.label}</Badge>
                              <Badge className="bg-destructive/20 text-destructive border-destructive/30">
                                Error
                              </Badge>
                            </div>
                            <div className="space-y-2">
                              <div>
                                <p className="text-sm font-medium text-muted-foreground">Possible Solutions:</p>
                                <ul className="mt-1 space-y-1">
                                  {apiInfo.commonErrors.map((err, idx) => (
                                    <li key={idx} className="text-sm flex items-start gap-2">
                                      <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                                      <span>{err.solution}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                              {config.last_checked_at && (
                                <p className="text-xs text-muted-foreground">
                                  Last checked: {new Date(config.last_checked_at).toLocaleString()}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 ml-4">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenDialog(config)}
                            >
                              <Pencil className="h-3 w-3 mr-1" />
                              Edit
                            </Button>
                            <Switch
                              checked={config.is_enabled}
                              onCheckedChange={(checked) => toggleEnabled(config.id, checked)}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Configured APIs</CardTitle>
            <CardDescription>All external APIs used by the application. API keys are managed via secrets.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>API Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Base URL</TableHead>
                  <TableHead>
                    <div className="flex items-center gap-1">
                      Secret Status
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>API keys are stored securely as secrets</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </TableHead>
                  <TableHead>Rate Limit</TableHead>
                  <TableHead>
                    <div className="flex items-center gap-1">
                      Status
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Status updates when API is called during token scanning</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </TableHead>
                  <TableHead>Enabled</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configurations.map((config) => {
                  const apiInfo = getApiInfo(config.api_type);
                  const hasSecret = secretStatus[config.api_type]?.configured;
                  const needsKey = apiInfo.requiresKey;
                  
                  return (
                    <TableRow key={config.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{config.api_name}</span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p className="font-medium">{apiInfo.description}</p>
                              <p className="text-xs mt-1 text-muted-foreground">{apiInfo.helpNotes}</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Badge variant="outline" className="text-xs">
                            {apiInfo.label}
                          </Badge>
                          {apiInfo.required ? (
                            <Tooltip>
                              <TooltipTrigger>
                                <CheckCircle2 className="h-3 w-3 text-green-500" />
                              </TooltipTrigger>
                              <TooltipContent>Required API</TooltipContent>
                            </Tooltip>
                          ) : (
                            <Tooltip>
                              <TooltipTrigger>
                                <Info className="h-3 w-3 text-muted-foreground" />
                              </TooltipTrigger>
                              <TooltipContent>Optional API</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs max-w-[200px] truncate">
                        {config.base_url}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {needsKey ? (
                            hasSecret ? (
                              <div className="flex items-center gap-1">
                                <Key className="h-4 w-4 text-green-500" />
                                <span className="text-xs text-green-500">Configured</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <AlertCircle className="h-4 w-4 text-destructive" />
                                <span className="text-xs text-destructive">Missing</span>
                              </div>
                            )
                          ) : (
                            <span className="text-xs text-muted-foreground">Not required</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{config.rate_limit_per_minute}/min</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge className={STATUS_COLORS[config.status]}>
                            {config.status}
                          </Badge>
                          {config.status === 'error' && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <AlertCircle className="h-4 w-4 text-destructive cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-sm">
                                <p className="font-medium text-destructive">API Error</p>
                                <p className="text-xs mt-1">
                                  Check the API Health tab for detailed error messages and solutions.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={config.is_enabled}
                            onCheckedChange={(checked) => toggleEnabled(config.id, checked)}
                          />
                          <span className="text-xs text-muted-foreground">
                            {config.is_enabled ? 'On' : 'Off'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleOpenDialog(config)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleDelete(config.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {configurations.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No API configurations found. Add your first API to get started.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
