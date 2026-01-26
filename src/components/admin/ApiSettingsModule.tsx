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
import { Plus, Pencil, Trash2, RefreshCw, Loader2, HelpCircle, CheckCircle2, AlertCircle, Info, Key, ShieldCheck, ShieldAlert, Eye, EyeOff, TestTube2, Zap } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

// API Documentation with requirement levels, help notes, example keys, and error solutions
const API_INFO: Record<ApiType, {
  label: string;
  required: boolean;
  description: string;
  helpNotes: string;
  defaultUrl: string;
  requiresKey: boolean;
  secretName: string;
  exampleKey: string;
  keyFormat: string;
  getKeyUrl: string;
  alternatives?: string[];
  commonErrors: { pattern: string; solution: string }[];
}> = {
  dexscreener: {
    label: 'DexScreener API',
    required: true,
    description: 'Primary API for fetching real-time token data, pairs, and liquidity information across multiple chains.',
    helpNotes: 'Free tier available. No API key required for basic usage. Rate limit: 300 requests/min.',
    defaultUrl: 'https://api.dexscreener.com',
    requiresKey: false,
    secretName: 'DEXSCREENER_API_KEY',
    exampleKey: 'dex_xxxx1234abcd5678efgh',
    keyFormat: 'Alphanumeric string (optional for enhanced limits)',
    getKeyUrl: 'https://docs.dexscreener.com',
    commonErrors: [
      { pattern: 'pairs.slice is not a function', solution: 'API response format changed. The scanner handles different response structures automatically.' },
      { pattern: 'rate limit', solution: 'Reduce scan frequency or wait a few minutes. DexScreener allows 300 requests/min.' },
      { pattern: '429', solution: 'Rate limited. Wait 1-2 minutes before scanning again.' },
      { pattern: '503', solution: 'DexScreener is temporarily unavailable. Try again in a few minutes.' },
    ],
  },
  geckoterminal: {
    label: 'GeckoTerminal API',
    required: false,
    description: 'Alternative/backup API for token data. Provides OHLCV data and pool information.',
    helpNotes: 'Free API, no key required. Good backup for DexScreener. Rate limit: 30 requests/min.',
    defaultUrl: 'https://api.geckoterminal.com',
    requiresKey: false,
    secretName: 'GECKOTERMINAL_API_KEY',
    exampleKey: 'CG-xxxxxxxxxxxxxxxxxxxx',
    keyFormat: 'Starts with "CG-" followed by alphanumeric string (optional)',
    getKeyUrl: 'https://www.geckoterminal.com/dex-api',
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
    helpNotes: 'API key required. Free tier: 100 req/min. Sign up requires Solana wallet.',
    defaultUrl: 'https://public-api.birdeye.so',
    requiresKey: true,
    secretName: 'BIRDEYE_API_KEY',
    exampleKey: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
    keyFormat: '32-character alphanumeric string',
    getKeyUrl: 'https://birdeye.so/api',
    commonErrors: [
      { pattern: '401', solution: 'Invalid or missing API key. Get a free key at birdeye.so/api and configure it.' },
      { pattern: '403', solution: 'API key expired or revoked. Generate a new key at birdeye.so/api.' },
      { pattern: 'API key required', solution: 'Add your Birdeye API key in the configuration. Sign up at birdeye.so.' },
    ],
  },
  dextools: {
    label: 'Dextools API',
    required: false,
    description: 'Optional premium API for advanced token scoring and pair analysis.',
    helpNotes: 'Get API key from Dextools. Uses x-api-key header for authentication.',
    defaultUrl: 'https://public-api.dextools.io',
    requiresKey: true,
    secretName: 'DEXTOOLS_API_KEY',
    exampleKey: 'abc123def456ghi789jkl012mno345pqr678',
    keyFormat: 'Dextools API key - alphanumeric string from your Dextools account',
    getKeyUrl: 'https://developer.dextools.io',
    alternatives: ['dexscreener', 'geckoterminal'],
    commonErrors: [
      { pattern: '401', solution: 'Invalid API key. Get your key from developer.dextools.io.' },
      { pattern: '403', solution: 'API access denied. Check your subscription plan at dextools.io.' },
    ],
  },
  honeypot_rugcheck: {
    label: 'Honeypot/Rugcheck API',
    required: true,
    description: 'Critical for token safety checks - detects honeypots, rugs, and malicious contracts.',
    helpNotes: 'Free API, no key needed. Essential for risk management.',
    defaultUrl: 'https://api.rugcheck.xyz',
    requiresKey: false,
    secretName: 'HONEYPOT_API_KEY',
    exampleKey: 'hprc_xxxx1234abcd5678',
    keyFormat: 'Optional - for enhanced rate limits only',
    getKeyUrl: 'https://rugcheck.xyz',
    commonErrors: [
      { pattern: 'timeout', solution: 'Honeypot API can be slow. The scanner will continue with other tokens.' },
      { pattern: '503', solution: 'Service temporarily unavailable. Token risk scores may be estimated.' },
    ],
  },
  liquidity_lock: {
    label: 'Liquidity Lock API',
    required: false,
    description: 'Verifies if token liquidity is locked. Used for additional safety scoring.',
    helpNotes: 'Optional. Team Finance uses on-chain verification. API key for enhanced features only.',
    defaultUrl: 'https://api.team.finance',
    requiresKey: false, // Changed: on-chain verification works without API key
    secretName: 'LIQUIDITY_LOCK_API_KEY',
    exampleKey: 'tf_api_xxxxxxxxxxxxxxxxxxxx',
    keyFormat: 'Optional - for enhanced rate limits only',
    getKeyUrl: 'https://team.finance',
    alternatives: ['On-chain verification (default)'],
    commonErrors: [
      { pattern: '404', solution: 'Team Finance has no public REST API. Uses on-chain verification by default.' },
    ],
  },
  jupiter: {
    label: 'Jupiter Aggregator',
    required: true,
    description: 'Primary DEX aggregator for Solana. Uses free lite-api by default (no key required).',
    helpNotes: 'Free lite-api works without a key. Paid API (jupiterapi.com) has higher limits for production.',
    defaultUrl: 'https://lite-api.jup.ag/swap/v1',
    requiresKey: false,
    secretName: 'JUPITER_API_KEY',
    exampleKey: 'jup_xxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    keyFormat: 'UUID format with "jup_" prefix (optional for paid tier)',
    getKeyUrl: 'https://station.jup.ag/docs/apis/self-hosted',
    commonErrors: [
      { pattern: 'ROUTE_NOT_FOUND', solution: 'No liquidity route found. Token may not be tradeable or has very low liquidity.' },
      { pattern: '403', solution: 'Access denied. Wait a moment and try again.' },
      { pattern: '429', solution: 'Rate limited. Reduce request frequency or use paid API key.' },
      { pattern: 'dns error', solution: 'DNS resolution failed in edge environment. This is handled automatically via fallback.' },
    ],
  },
  raydium: {
    label: 'Raydium DEX',
    required: false,
    description: 'Fallback DEX for tokens not available on Jupiter. Direct AMM access for Raydium pools.',
    helpNotes: 'Free API, no key needed. Used as fallback when Jupiter has no route.',
    defaultUrl: 'https://transaction-v1.raydium.io',
    requiresKey: false,
    secretName: 'RAYDIUM_API_KEY',
    exampleKey: 'ray_xxxxxxxxxxxxxxxxxxxx',
    keyFormat: 'Optional - for enhanced access only',
    getKeyUrl: 'https://raydium.io/developers',
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
    helpNotes: 'Free API, no key needed. Fetches new tokens and enables bonding curve trading.',
    defaultUrl: 'https://frontend-api.pump.fun',
    requiresKey: false,
    secretName: 'PUMPFUN_API_KEY',
    exampleKey: 'pump_xxxxxxxxxxxxxxxxxxxx',
    keyFormat: 'Optional - for enhanced rate limits',
    getKeyUrl: 'https://pump.fun',
    commonErrors: [
      { pattern: 'timeout', solution: 'Pump.fun API can be slow during high traffic. Try again.' },
      { pattern: '503', solution: 'Service temporarily unavailable. Wait and retry.' },
    ],
  },
  rpc_provider: {
    label: 'Solana RPC Provider',
    required: true,
    description: 'Required for all blockchain interactions - reading data and sending transactions.',
    helpNotes: 'Free public RPC has rate limits. Use Helius, QuickNode, or Alchemy for production.',
    defaultUrl: 'https://api.mainnet-beta.solana.com',
    requiresKey: false,
    secretName: 'SOLANA_RPC_URL',
    exampleKey: 'https://mainnet.helius-rpc.com/?api-key=xxxx-xxxx-xxxx',
    keyFormat: 'Full RPC URL with API key embedded (e.g., Helius, QuickNode)',
    getKeyUrl: 'https://helius.xyz',
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
  return {
    label: apiType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    required: false,
    description: 'Legacy API configuration. Consider updating to the new API type.',
    helpNotes: 'This API type is deprecated. Please delete and reconfigure with the correct type.',
    defaultUrl: '',
    requiresKey: false,
    secretName: '',
    exampleKey: '',
    keyFormat: '',
    getKeyUrl: '',
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
  const { secretStatus, loading: secretsLoading, fetchSecretStatus, validateSecret, validateAllSecrets, saveApiKey, deleteApiKey, getApiKeyInfo } = useApiSecrets();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ApiConfiguration | null>(null);
  const [formData, setFormData] = useState<ApiFormData>(defaultFormData);
  const [isSaving, setIsSaving] = useState(false);
  const [validatingSecrets, setValidatingSecrets] = useState<Record<string, boolean>>({});
  const [validationResults, setValidationResults] = useState<Record<string, { valid: boolean; message: string; latencyMs?: number }>>({});
  const [showApiKey, setShowApiKey] = useState(false);
  const [existingMaskedKey, setExistingMaskedKey] = useState<string | null>(null);
  const [isValidatingAll, setIsValidatingAll] = useState(false);

  const handleOpenDialog = async (config?: ApiConfiguration) => {
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
      // Fetch masked key for editing
      const keyInfo = await getApiKeyInfo(config.api_type);
      setExistingMaskedKey(keyInfo?.maskedKey || null);
    } else {
      setEditingConfig(null);
      setFormData(defaultFormData);
      setExistingMaskedKey(null);
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
    setExistingMaskedKey(null);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { api_key, ...configData } = formData;
      
      // IMPORTANT: Don't touch api_key_encrypted in the config update
      // It will be handled separately by saveApiKey to avoid race conditions
      const saveData = {
        ...configData,
        // Don't set api_key_encrypted here - let saveApiKey handle it
      };

      if (editingConfig) {
        await updateConfiguration(editingConfig.id, saveData);
      } else {
        await addConfiguration(saveData);
      }
      
      // Save API key if provided - this now handles the encryption correctly
      if (api_key && api_key.trim()) {
        const result = await saveApiKey(formData.api_type, api_key.trim());
        if (!result.success) {
          console.error('Failed to save API key:', result.message);
        }
      }
      
      // Refresh configurations to get updated state
      await fetchConfigurations();
      
      setIsDialogOpen(false);
      setFormData(defaultFormData);
      setEditingConfig(null);
      setExistingMaskedKey(null);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string, apiType: ApiType) => {
    if (confirm('Are you sure you want to delete this API configuration? This will also remove the stored API key.')) {
      await deleteConfiguration(id);
      await deleteApiKey(apiType);
    }
  };

  const handleValidateSecret = async (apiType: ApiType) => {
    setValidatingSecrets(prev => ({ ...prev, [apiType]: true }));
    try {
      const result = await validateSecret(apiType);
      if (result) {
        setValidationResults(prev => ({ ...prev, [apiType]: result }));
      }
    } finally {
      setValidatingSecrets(prev => ({ ...prev, [apiType]: false }));
    }
  };

  const handleValidateAll = async () => {
    setIsValidatingAll(true);
    try {
      const results = await validateAllSecrets();
      if (results) {
        setValidationResults(results);
      }
    } finally {
      setIsValidatingAll(false);
    }
  };

  const handleDeleteApiKey = async (apiType: ApiType) => {
    if (confirm(`Are you sure you want to delete the API key for ${API_INFO[apiType]?.label || apiType}?`)) {
      await deleteApiKey(apiType);
      setValidationResults(prev => {
        const newResults = { ...prev };
        delete newResults[apiType];
        return newResults;
      });
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
            <p className="text-muted-foreground">Manage external API configurations and keys securely</p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleValidateAll}
              disabled={isValidatingAll}
            >
              {isValidatingAll ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <TestTube2 className="h-4 w-4 mr-2" />
              )}
              Test All APIs
            </Button>
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
              <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingConfig ? 'Edit API Configuration' : 'Add New API Configuration'}</DialogTitle>
                  <DialogDescription>
                    Configure the API settings. API keys are encrypted and stored securely.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  {/* API Type Selection */}
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
                      disabled={!!editingConfig}
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
                    
                    {/* API Info Box with Example */}
                    {formData.api_type && (() => {
                      const typeInfo = getApiInfo(formData.api_type);
                      return (
                        <div className="rounded-md border border-border bg-muted/30 p-3 text-sm space-y-3">
                          <div className="flex items-start gap-2">
                            <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                            <div>
                              <p className="text-foreground font-medium">{typeInfo.description}</p>
                              <p className="text-muted-foreground mt-1">{typeInfo.helpNotes}</p>
                            </div>
                          </div>
                          
                          {/* Key Format Example */}
                          <div className="bg-background/50 rounded p-2 border border-border/50">
                            <div className="flex items-center gap-2 mb-1">
                              <Key className="h-3 w-3 text-primary" />
                              <span className="text-xs font-medium text-foreground">Key Format</span>
                            </div>
                            <p className="text-xs text-muted-foreground">{typeInfo.keyFormat}</p>
                            <code className="text-xs bg-muted px-1.5 py-0.5 rounded mt-1 block text-primary font-mono">
                              Example: {typeInfo.exampleKey}
                            </code>
                          </div>
                          
                          {typeInfo.getKeyUrl && (
                            <div className="flex items-center gap-2 text-xs">
                              <Zap className="h-3 w-3 text-yellow-500" />
                              <span className="text-muted-foreground">Get your key at:</span>
                              <a 
                                href={typeInfo.getKeyUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-primary hover:underline"
                              >
                                {typeInfo.getKeyUrl}
                              </a>
                            </div>
                          )}
                          
                          {typeInfo.requiresKey && (
                            <div className="flex items-center gap-2 mt-2 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded">
                              <AlertCircle className="h-4 w-4 text-yellow-500" />
                              <span className="text-yellow-500 text-xs font-medium">
                                API key required for this service
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  
                  {/* API Name */}
                  <div className="grid gap-2">
                    <Label htmlFor="api_name">API Name</Label>
                    <Input
                      id="api_name"
                      value={formData.api_name}
                      onChange={(e) => setFormData(prev => ({ ...prev, api_name: e.target.value }))}
                      placeholder="e.g., DexScreener Main API"
                    />
                  </div>
                  
                  {/* Base URL */}
                  <div className="grid gap-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="base_url">Base URL</Label>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p><strong>Default:</strong> {getApiInfo(formData.api_type).defaultUrl}</p>
                          <p className="text-xs mt-1">Only change if using a custom endpoint or proxy.</p>
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
                  
                  {/* Rate Limit */}
                  <div className="grid gap-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="rate_limit">Rate Limit (requests per minute)</Label>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Maximum requests allowed per minute. Check API documentation for limits.</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Input
                      id="rate_limit"
                      type="number"
                      value={formData.rate_limit_per_minute}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        // Validate range 1-10000
                        if (!isNaN(val) && val >= 1 && val <= 10000) {
                          setFormData(prev => ({ ...prev, rate_limit_per_minute: val }));
                        } else if (e.target.value === '') {
                          setFormData(prev => ({ ...prev, rate_limit_per_minute: 60 }));
                        }
                      }}
                      min={1}
                      max={10000}
                    />
                  </div>
                  
                  {/* API Key Input */}
                  {(() => {
                    const keyInfo = getApiInfo(formData.api_type);
                    return (
                      <div className="grid gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
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
                            <TooltipContent className="max-w-sm">
                              <p className="font-medium">Key will be encrypted and stored securely</p>
                              <p className="text-xs mt-1">Format: {keyInfo.keyFormat}</p>
                              <code className="text-xs block mt-1 bg-muted px-1 py-0.5 rounded">{keyInfo.exampleKey}</code>
                            </TooltipContent>
                          </Tooltip>
                          {secretStatus[formData.api_type]?.configured && (
                            <Badge variant="outline" className="text-xs text-green-500 border-green-500/30">
                              <Key className="h-3 w-3 mr-1" />
                              Key Configured
                            </Badge>
                          )}
                        </div>
                        
                        {/* Show existing masked key when editing */}
                        {editingConfig && existingMaskedKey && (
                          <div className="flex items-center gap-2 p-2 bg-muted/50 rounded border border-border">
                            <Key className="h-4 w-4 text-green-500" />
                            <span className="text-sm text-muted-foreground">Current key:</span>
                            <code className="text-sm font-mono text-foreground">{existingMaskedKey}</code>
                          </div>
                        )}
                        
                        <div className="relative">
                          <Input
                            id="api_key"
                            type={showApiKey ? 'text' : 'password'}
                            value={formData.api_key}
                            onChange={(e) => setFormData(prev => ({ ...prev, api_key: e.target.value }))}
                            placeholder={existingMaskedKey ? 'Enter new key to replace existing' : `Enter API key (e.g., ${keyInfo.exampleKey.substring(0, 15)}...)`}
                            className="pr-10 font-mono"
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
                          {existingMaskedKey 
                            ? 'Leave empty to keep the current key, or enter a new key to replace it.'
                            : keyInfo.requiresKey 
                              ? `Required: ${keyInfo.helpNotes}`
                              : `Optional: ${keyInfo.helpNotes || 'API key can be added for enhanced features.'}`
                          }
                        </p>
                      </div>
                    );
                  })()}
                  
                  {/* Enabled Toggle */}
                  <div className="flex items-center gap-2">
                    <Switch
                      id="is_enabled"
                      checked={formData.is_enabled}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_enabled: checked }))}
                    />
                    <Label htmlFor="is_enabled">Enable this API</Label>
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

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-primary/30">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold">{configurations.length}</p>
                  <p className="text-xs text-muted-foreground">APIs Configured</p>
                </div>
                <Info className="h-8 w-8 text-primary/50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-green-500/30">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-green-500">{configurations.filter(c => c.status === 'active').length}</p>
                  <p className="text-xs text-muted-foreground">Active</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-green-500/50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-yellow-500/30">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-yellow-500">{Object.values(secretStatus).filter(s => s.configured).length}</p>
                  <p className="text-xs text-muted-foreground">Keys Configured</p>
                </div>
                <Key className="h-8 w-8 text-yellow-500/50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-destructive/30">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-destructive">{missingRequired.length}</p>
                  <p className="text-xs text-muted-foreground">Required Missing</p>
                </div>
                <AlertCircle className="h-8 w-8 text-destructive/50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Secrets Status Card */}
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="h-5 w-5 text-primary" />
              API Keys Status
            </CardTitle>
            <CardDescription>
              API keys are encrypted and stored securely. Click "Test" to verify connectivity.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.entries(API_INFO).map(([type, info]) => {
                const isConfigured = secretStatus[type]?.configured;
                const source = secretStatus[type]?.source;
                const validation = validationResults[type];
                const isValidating = validatingSecrets[type];
                
                return (
                  <div
                    key={type}
                    className={`p-3 rounded-lg border ${
                      isConfigured 
                        ? validation?.valid === false 
                          ? 'border-destructive/30 bg-destructive/10' 
                          : 'border-green-500/30 bg-green-500/10'
                        : info.requiresKey 
                          ? 'border-destructive/30 bg-destructive/10'
                          : 'border-muted bg-muted/30'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{info.label}</p>
                          {info.required && (
                            <Badge variant="destructive" className="text-[10px] px-1 py-0 shrink-0">REQ</Badge>
                          )}
                        </div>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <p className="text-xs text-muted-foreground truncate cursor-help">
                              {info.secretName}
                            </p>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-sm">
                            <p className="font-medium mb-1">{info.description}</p>
                            <p className="text-xs"><strong>Format:</strong> {info.keyFormat}</p>
                            <code className="text-xs block mt-1 bg-muted px-1 py-0.5 rounded">{info.exampleKey}</code>
                            {info.getKeyUrl && (
                              <p className="text-xs mt-1">Get key: <span className="text-primary">{info.getKeyUrl}</span></p>
                            )}
                          </TooltipContent>
                        </Tooltip>
                        {validation && (
                          <p className={`text-xs mt-1 ${validation.valid ? 'text-green-500' : 'text-destructive'}`}>
                            {validation.message}
                            {validation.latencyMs && ` (${validation.latencyMs}ms)`}
                          </p>
                        )}
                        {source && source !== 'none' && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Source: {source === 'database' ? 'Database (encrypted)' : 'Environment'}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 ml-2 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleValidateSecret(type as ApiType)}
                          disabled={isValidating}
                        >
                          {isValidating ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <TestTube2 className="h-3 w-3" />
                          )}
                        </Button>
                        {isConfigured ? (
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                        ) : (
                          <AlertCircle className={`h-5 w-5 ${info.requiresKey ? 'text-destructive' : 'text-muted-foreground'}`} />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {missingSecrets.length > 0 && (
              <Alert variant="destructive" className="mt-4">
                <ShieldAlert className="h-4 w-4" />
                <AlertTitle>Missing Required API Keys</AlertTitle>
                <AlertDescription>
                  Configure these keys to enable full functionality: {missingSecrets.map(s => s.info.label).join(', ')}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* API Configuration Guide */}
        <Alert className="border-primary/30 bg-primary/5">
          <Info className="h-4 w-4" />
          <AlertTitle>API Configuration Guide</AlertTitle>
          <AlertDescription className="mt-2">
            <div className="grid gap-2">
              <div className="flex items-center gap-2">
                <Badge variant="destructive" className="text-[10px]">Required</Badge>
                <span className="text-sm">DexScreener, Birdeye, Honeypot/Rugcheck, Jupiter, Solana RPC</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">Optional</Badge>
                <span className="text-sm">GeckoTerminal (backup), Dextools (premium), Raydium, Pump.fun, Liquidity Lock</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                All API keys are encrypted before storage. Use the "Test" button to verify each API is working correctly.
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

        {/* Configured APIs Table */}
        <Card>
          <CardHeader>
            <CardTitle>Configured APIs</CardTitle>
            <CardDescription>All external APIs used by the application. Click Edit to modify or update API keys.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>API Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>
                    <div className="flex items-center gap-1">
                      Key Status
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>API keys are encrypted and stored securely in the database</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Enabled</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configurations.map((config) => {
                  const apiInfo = getApiInfo(config.api_type);
                  const hasSecret = secretStatus[config.api_type]?.configured;
                  const needsKey = apiInfo.requiresKey;
                  const validation = validationResults[config.api_type];
                  const isValidating = validatingSecrets[config.api_type];
                  
                  return (
                    <TableRow key={config.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{config.api_name}</span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-sm">
                              <p className="font-medium">{apiInfo.description}</p>
                              <p className="text-xs mt-1 text-muted-foreground">{apiInfo.helpNotes}</p>
                              <div className="mt-2 pt-2 border-t border-border">
                                <p className="text-xs"><strong>Key Format:</strong> {apiInfo.keyFormat}</p>
                                <code className="text-xs block mt-1 bg-muted px-1 py-0.5 rounded">{apiInfo.exampleKey}</code>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Badge variant="outline" className="text-xs">
                            {apiInfo.label}
                          </Badge>
                          {apiInfo.required && (
                            <Tooltip>
                              <TooltipTrigger>
                                <CheckCircle2 className="h-3 w-3 text-green-500" />
                              </TooltipTrigger>
                              <TooltipContent>Required API</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
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
                          ) : hasSecret ? (
                            <div className="flex items-center gap-1">
                              <Key className="h-4 w-4 text-green-500" />
                              <span className="text-xs text-muted-foreground">Optional (set)</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Not required</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge className={STATUS_COLORS[config.status]}>
                            {config.status}
                          </Badge>
                          {validation && (
                            <Tooltip>
                              <TooltipTrigger>
                                {validation.valid ? (
                                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                                ) : (
                                  <AlertCircle className="h-4 w-4 text-destructive" />
                                )}
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{validation.message}</p>
                                {validation.latencyMs && <p className="text-xs">Latency: {validation.latencyMs}ms</p>}
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
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleValidateSecret(config.api_type)}
                                disabled={isValidating}
                              >
                                {isValidating ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <TestTube2 className="h-4 w-4" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Test Connection</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleOpenDialog(config)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Edit API / Update Key</TooltipContent>
                          </Tooltip>
                          {hasSecret && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-yellow-500 hover:text-yellow-500"
                                  onClick={() => handleDeleteApiKey(config.api_type)}
                                >
                                  <Key className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Delete API Key Only</TooltipContent>
                            </Tooltip>
                          )}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => handleDelete(config.id, config.api_type)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Delete API Configuration</TooltipContent>
                          </Tooltip>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {configurations.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No API configurations found. Click "Add API" to get started.
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