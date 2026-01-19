import { useState, useEffect, useCallback } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  AlertTriangle, 
  X, 
  ExternalLink, 
  CheckCircle2,
  XCircle,
  Zap,
  Info
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface PaidApiAlertProps {
  isBotActive: boolean;
  isDemo: boolean;
}

interface ApiRequirement {
  apiType: string;
  name: string;
  required: boolean; // true = CRITICAL for real trades, false = optional/enhances
  description: string;
  freeAlternative?: string;
  suggestedProvider?: string;
  providerUrl?: string;
}

// Define API requirements for production trading
const API_REQUIREMENTS: ApiRequirement[] = [
  {
    apiType: 'rpc_provider',
    name: 'Solana RPC',
    required: true,
    description: 'Required for submitting transactions to Solana blockchain',
    suggestedProvider: 'Helius or QuickNode',
    providerUrl: 'https://helius.dev',
  },
  {
    apiType: 'jupiter',
    name: 'Jupiter API',
    required: false,
    description: 'Token swaps & aggregation',
    freeAlternative: 'Free tier available with rate limits',
    suggestedProvider: 'Jupiter (free tier works)',
    providerUrl: 'https://jup.ag',
  },
  {
    apiType: 'birdeye',
    name: 'Birdeye API',
    required: false,
    description: 'Enhanced market data & token analytics',
    freeAlternative: 'DexScreener provides similar data for free',
  },
];

// These APIs are FREE and don't require paid keys
const FREE_APIS = [
  { name: 'DexScreener', description: 'Token discovery & liquidity data' },
  { name: 'GeckoTerminal', description: 'Market data & charts' },
  { name: 'RugCheck', description: 'Token safety validation' },
  { name: 'Pump.fun', description: 'New token detection' },
  { name: 'Raydium', description: 'DEX liquidity pools' },
];

export default function PaidApiAlert({ isBotActive, isDemo }: PaidApiAlertProps) {
  const [dismissed, setDismissed] = useState(false);
  const [apiStatuses, setApiStatuses] = useState<Record<string, { 
    configured: boolean; 
    status: string;
    hasKey: boolean;
  }>>({});
  const [loading, setLoading] = useState(true);

  const checkApiConfigurations = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('api_configurations')
        .select('api_type, status, is_enabled, api_key_encrypted');

      if (error) throw error;

      const statuses: Record<string, { configured: boolean; status: string; hasKey: boolean }> = {};
      
      for (const api of data || []) {
        statuses[api.api_type] = {
          configured: api.is_enabled === true,
          status: api.status || 'inactive',
          hasKey: !!api.api_key_encrypted,
        };
      }

      setApiStatuses(statuses);
    } catch (err) {
      console.error('[PaidApiAlert] Error checking API configs:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkApiConfigurations();
    // Recheck when bot becomes active
    if (isBotActive) {
      checkApiConfigurations();
    }
  }, [isBotActive, checkApiConfigurations]);

  // Don't show in demo mode or if dismissed
  if (isDemo || dismissed) return null;

  // Don't show if bot is not active
  if (!isBotActive) return null;

  // Check which critical APIs are missing
  const criticalMissing = API_REQUIREMENTS.filter(api => {
    if (!api.required) return false;
    const status = apiStatuses[api.apiType];
    return !status?.configured || !status?.hasKey || status?.status === 'error';
  });

  const optionalMissing = API_REQUIREMENTS.filter(api => {
    if (api.required) return false;
    const status = apiStatuses[api.apiType];
    return !status?.configured || !status?.hasKey;
  });

  // Show nothing if all critical APIs are configured
  if (criticalMissing.length === 0 && optionalMissing.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {/* Critical API Alert */}
      {criticalMissing.length > 0 && (
        <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Critical: Paid API Required for Live Trading
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 -mr-2"
              onClick={() => setDismissed(true)}
            >
              <X className="h-3 w-3" />
            </Button>
          </AlertTitle>
          <AlertDescription className="mt-2">
            <div className="space-y-2">
              {criticalMissing.map(api => (
                <div 
                  key={api.apiType}
                  className="flex items-start justify-between p-2 bg-destructive/20 rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-destructive" />
                      <span className="font-medium">{api.name}</span>
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                        REQUIRED
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {api.description}
                    </p>
                    {api.suggestedProvider && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Suggested: <span className="text-foreground">{api.suggestedProvider}</span>
                      </p>
                    )}
                  </div>
                  {api.providerUrl && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => window.open(api.providerUrl, '_blank')}
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      Get API
                    </Button>
                  )}
                </div>
              ))}
              <p className="text-xs text-destructive mt-2">
                ⚠️ Real trades will FAIL without a paid Solana RPC provider configured in Admin → API Settings
              </p>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Optional API Info */}
      {optionalMissing.length > 0 && criticalMissing.length === 0 && (
        <Alert className="border-warning/50 bg-warning/10">
          <Info className="h-4 w-4 text-warning" />
          <AlertTitle className="flex items-center justify-between text-warning">
            <span>Optional APIs Not Configured</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 -mr-2"
              onClick={() => setDismissed(true)}
            >
              <X className="h-3 w-3" />
            </Button>
          </AlertTitle>
          <AlertDescription className="mt-2">
            <div className="space-y-1.5">
              {optionalMissing.map(api => (
                <div 
                  key={api.apiType}
                  className="flex items-center gap-2 text-xs"
                >
                  <span className="text-muted-foreground">•</span>
                  <span className="font-medium">{api.name}</span>
                  {api.freeAlternative && (
                    <span className="text-muted-foreground">
                      — {api.freeAlternative}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Free APIs Info (collapsed by default) */}
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3 text-success" />
          These APIs work FREE without paid keys
        </summary>
        <div className="mt-2 p-2 bg-muted/30 rounded-lg grid grid-cols-2 gap-1">
          {FREE_APIS.map(api => (
            <div key={api.name} className="flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-success" />
              <span>{api.name}</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
