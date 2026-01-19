import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mapping of API types to their secret names
const API_SECRET_MAPPING: Record<string, string> = {
  birdeye: 'BIRDEYE_API_KEY',
  dextools: 'DEXTOOLS_API_KEY',
  liquidity_lock: 'LIQUIDITY_LOCK_API_KEY',
  dexscreener: 'DEXSCREENER_API_KEY',
  geckoterminal: 'GECKOTERMINAL_API_KEY',
  honeypot_rugcheck: 'HONEYPOT_API_KEY',
  trade_execution: 'TRADE_EXECUTION_API_KEY',
  rpc_provider: 'RPC_PROVIDER_API_KEY',
};

// Simple encryption/decryption for API keys stored in database
// In production, use proper encryption with vault or KMS
const encryptKey = (key: string): string => {
  // Base64 encode with a prefix to identify encrypted values
  return 'enc:' + btoa(key);
};

const decryptKey = (encrypted: string): string | null => {
  if (!encrypted || !encrypted.startsWith('enc:')) return null;
  try {
    return atob(encrypted.substring(4));
  } catch {
    return null;
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Authenticate user
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

    const body = await req.json().catch(() => ({}));
    const { action, apiType, apiKey } = body;

    // Helper to get API key - first check DB, then env
    const getApiKeyForType = async (type: string): Promise<string | null> => {
      // First check database for stored key
      const { data: config } = await supabase
        .from('api_configurations')
        .select('api_key_encrypted')
        .eq('api_type', type)
        .maybeSingle();
      
      if (config?.api_key_encrypted) {
        const decrypted = decryptKey(config.api_key_encrypted);
        if (decrypted) return decrypted;
      }
      
      // Fall back to environment variable
      const envKey = API_SECRET_MAPPING[type];
      return envKey ? Deno.env.get(envKey) || null : null;
    };

    if (action === 'get_secret_status') {
      // Return the status of all API secrets (configured or not)
      const secretStatus: Record<string, { configured: boolean; secretName: string }> = {};
      
      // Get all configurations from database
      const { data: configs } = await supabase
        .from('api_configurations')
        .select('api_type, api_key_encrypted');
      
      const dbKeys = new Map(configs?.map(c => [c.api_type, c.api_key_encrypted]) || []);
      
      for (const [type, secretName] of Object.entries(API_SECRET_MAPPING)) {
        const dbKey = dbKeys.get(type);
        const hasDbKey = dbKey && decryptKey(dbKey);
        const envValue = Deno.env.get(secretName);
        
        secretStatus[type] = {
          configured: !!(hasDbKey || (envValue && envValue.length > 0)),
          secretName,
        };
      }

      return new Response(JSON.stringify({ 
        secretStatus,
        message: 'Secret status retrieved successfully',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'save_api_key') {
      // Save API key to database
      if (!apiType || !API_SECRET_MAPPING[apiType]) {
        return new Response(JSON.stringify({ error: 'Invalid API type' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
        return new Response(JSON.stringify({ error: 'API key is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const encryptedKey = encryptKey(apiKey.trim());

      // Check if configuration exists
      const { data: existing } = await supabase
        .from('api_configurations')
        .select('id')
        .eq('api_type', apiType)
        .maybeSingle();

      if (existing) {
        // Update existing configuration with API key
        const { error: updateError } = await supabase
          .from('api_configurations')
          .update({ 
            api_key_encrypted: encryptedKey,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        if (updateError) {
          throw new Error(`Failed to update API key: ${updateError.message}`);
        }
      } else {
        // Configuration doesn't exist - update by api_type (handles race condition where config was just created)
        const { error: upsertError } = await supabase
          .from('api_configurations')
          .update({ 
            api_key_encrypted: encryptedKey,
            updated_at: new Date().toISOString(),
          })
          .eq('api_type', apiType);

        if (upsertError) {
          return new Response(JSON.stringify({ 
            success: false,
            message: 'API configuration not found. Please add the API configuration first.',
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      return new Response(JSON.stringify({ 
        success: true,
        message: `API key for ${apiType} saved successfully`,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'delete_api_key') {
      // Remove API key from database
      if (!apiType || !API_SECRET_MAPPING[apiType]) {
        return new Response(JSON.stringify({ error: 'Invalid API type' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { error: updateError } = await supabase
        .from('api_configurations')
        .update({ 
          api_key_encrypted: null,
          updated_at: new Date().toISOString(),
        })
        .eq('api_type', apiType);

      if (updateError) {
        throw new Error(`Failed to delete API key: ${updateError.message}`);
      }

      return new Response(JSON.stringify({ 
        success: true,
        message: `API key for ${apiType} removed successfully`,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'get_api_key') {
      // Get API key for a specific type (for internal edge function use)
      if (!apiType || !API_SECRET_MAPPING[apiType]) {
        return new Response(JSON.stringify({ error: 'Invalid API type' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const secretName = API_SECRET_MAPPING[apiType];
      const apiKeyValue = await getApiKeyForType(apiType);

      return new Response(JSON.stringify({ 
        apiType,
        secretName,
        configured: !!apiKeyValue && apiKeyValue.length > 0,
        maskedKey: apiKeyValue ? `${apiKeyValue.substring(0, 4)}${'•'.repeat(8)}${apiKeyValue.substring(apiKeyValue.length - 4)}` : null,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'validate_secret') {
      // Validate a specific API secret is working
      if (!apiType || !API_SECRET_MAPPING[apiType]) {
        return new Response(JSON.stringify({ error: 'Invalid API type' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const secretName = API_SECRET_MAPPING[apiType];
      const apiKeyValue = await getApiKeyForType(apiType);

      if (!apiKeyValue) {
        return new Response(JSON.stringify({ 
          valid: false,
          error: `API key for ${apiType} is not configured`,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Basic validation - check if the key format looks valid
      let isValid = true;
      let validationMessage = 'API key is configured';

      // Perform basic format checks based on API type
      if (apiType === 'birdeye' && apiKeyValue.length < 20) {
        isValid = false;
        validationMessage = 'Birdeye API key appears too short';
      }

      return new Response(JSON.stringify({ 
        apiType,
        secretName,
        valid: isValid,
        message: validationMessage,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'list_required_secrets') {
      // Return list of required secrets for each API type
      const { data: configs } = await supabase
        .from('api_configurations')
        .select('api_type, api_key_encrypted');
      
      const dbKeys = new Map(configs?.map(c => [c.api_type, c.api_key_encrypted]) || []);
      
      const requiredSecrets = Object.entries(API_SECRET_MAPPING).map(([type, secretName]) => {
        const dbKey = dbKeys.get(type);
        const hasDbKey = dbKey && decryptKey(dbKey);
        const envValue = Deno.env.get(secretName);
        
        return {
          apiType: type,
          secretName,
          configured: !!(hasDbKey || envValue),
        };
      });

      return new Response(JSON.stringify({ 
        secrets: requiredSecrets,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Get API key for use by other edge functions
    if (action === 'get_key_for_use') {
      if (!apiType || !API_SECRET_MAPPING[apiType]) {
        return new Response(JSON.stringify({ error: 'Invalid API type' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const apiKeyValue = await getApiKeyForType(apiType);

      return new Response(JSON.stringify({ 
        apiType,
        apiKey: apiKeyValue,
        configured: !!apiKeyValue,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('API secrets error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});