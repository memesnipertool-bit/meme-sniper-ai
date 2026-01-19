import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  API_SECRET_MAPPING,
  encryptKey,
  decryptKey,
  validateApiKey,
  getAllApiKeyStatus,
} from "../_shared/api-keys.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const { action, apiType, apiKey } = body;

    // Internal action for edge-to-edge calls (no auth required, uses service role)
    if (action === 'get_key_internal') {
      if (!apiType || !API_SECRET_MAPPING[apiType]) {
        return new Response(JSON.stringify({ error: 'Invalid API type' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check database for stored key
      const { data: config } = await supabase
        .from('api_configurations')
        .select('api_key_encrypted, base_url, is_enabled')
        .eq('api_type', apiType)
        .maybeSingle();

      let apiKeyValue: string | null = null;
      
      if (config?.api_key_encrypted) {
        apiKeyValue = decryptKey(config.api_key_encrypted);
      }
      
      // Fall back to environment variable
      if (!apiKeyValue) {
        const envKey = API_SECRET_MAPPING[apiType];
        apiKeyValue = envKey ? Deno.env.get(envKey) || null : null;
      }

      return new Response(JSON.stringify({
        apiType,
        apiKey: apiKeyValue,
        baseUrl: config?.base_url || null,
        isEnabled: config?.is_enabled ?? true,
        configured: !!apiKeyValue,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // All other actions require authentication
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

    // Helper to get API key - first check DB, then env
    const getApiKeyForType = async (type: string): Promise<string | null> => {
      const { data: config } = await supabase
        .from('api_configurations')
        .select('api_key_encrypted')
        .eq('api_type', type)
        .maybeSingle();
      
      if (config?.api_key_encrypted) {
        const decrypted = decryptKey(config.api_key_encrypted);
        if (decrypted) return decrypted;
      }
      
      const envKey = API_SECRET_MAPPING[type];
      return envKey ? Deno.env.get(envKey) || null : null;
    };

    if (action === 'get_secret_status') {
      const secretStatus = await getAllApiKeyStatus();

      return new Response(JSON.stringify({ 
        secretStatus,
        message: 'Secret status retrieved successfully',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'save_api_key') {
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
        // Create new configuration with the API key
        const { error: insertError } = await supabase
          .from('api_configurations')
          .insert({
            api_type: apiType,
            api_name: API_SECRET_MAPPING[apiType] || apiType,
            base_url: getDefaultBaseUrl(apiType),
            api_key_encrypted: encryptedKey,
            is_enabled: true,
            status: 'active',
          });

        if (insertError) {
          throw new Error(`Failed to save API key: ${insertError.message}`);
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
        maskedKey: apiKeyValue 
          ? `${apiKeyValue.substring(0, 4)}${'•'.repeat(8)}${apiKeyValue.substring(apiKeyValue.length - 4)}` 
          : null,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'validate_secret') {
      if (!apiType || !API_SECRET_MAPPING[apiType]) {
        return new Response(JSON.stringify({ error: 'Invalid API type' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const result = await validateApiKey(apiType);

      // Update API status in database
      await supabase
        .from('api_configurations')
        .update({
          status: result.valid ? 'active' : 'error',
          last_checked_at: new Date().toISOString(),
        })
        .eq('api_type', apiType);

      return new Response(JSON.stringify({ 
        apiType,
        secretName: API_SECRET_MAPPING[apiType],
        valid: result.valid,
        message: result.message,
        latencyMs: result.latencyMs,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'validate_all') {
      const results: Record<string, { valid: boolean; message: string; latencyMs?: number }> = {};
      
      for (const apiType of Object.keys(API_SECRET_MAPPING)) {
        results[apiType] = await validateApiKey(apiType);
        
        // Update status in database
        await supabase
          .from('api_configurations')
          .update({
            status: results[apiType].valid ? 'active' : 'error',
            last_checked_at: new Date().toISOString(),
          })
          .eq('api_type', apiType);
      }

      return new Response(JSON.stringify({ 
        results,
        message: 'All API keys validated',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'list_required_secrets') {
      const secretStatus = await getAllApiKeyStatus();
      
      const requiredSecrets = Object.entries(API_SECRET_MAPPING).map(([type, secretName]) => ({
        apiType: type,
        secretName,
        configured: secretStatus[type]?.configured || false,
        source: secretStatus[type]?.source || 'none',
      }));

      return new Response(JSON.stringify({ 
        secrets: requiredSecrets,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
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

// Helper to get default base URLs for API types
function getDefaultBaseUrl(apiType: string): string {
  const defaults: Record<string, string> = {
    birdeye: 'https://public-api.birdeye.so',
    dextools: 'https://public-api.dextools.io',
    dexscreener: 'https://api.dexscreener.com',
    geckoterminal: 'https://api.geckoterminal.com',
    honeypot_rugcheck: 'https://api.rugcheck.xyz',
    jupiter: 'https://quote-api.jup.ag/v6',
    raydium: 'https://transaction-v1.raydium.io',
    pumpfun: 'https://frontend-api.pump.fun',
    rpc_provider: 'https://api.mainnet-beta.solana.com',
    liquidity_lock: 'https://api.team.finance',
    trade_execution: '',
  };
  return defaults[apiType] || '';
}
