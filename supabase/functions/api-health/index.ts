import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { getApiKey, API_VALIDATION_ENDPOINTS } from "../_shared/api-keys.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ApiStatus {
  name: string;
  status: 'online' | 'degraded' | 'offline';
  latency: number | null;
  lastCheck: string;
  lastError?: string;
  hasApiKey?: boolean;
}

// API endpoints to check with their display names
const API_ENDPOINTS: { name: string; type: string }[] = [
  { name: 'Jupiter', type: 'jupiter' },
  { name: 'Raydium', type: 'raydium' },
  { name: 'Pump.fun', type: 'pumpfun' },
  { name: 'DexScreener', type: 'dexscreener' },
  { name: 'Birdeye', type: 'birdeye' },
  { name: 'RugCheck', type: 'honeypot_rugcheck' },
];

async function checkEndpoint(endpoint: { name: string; type: string }): Promise<ApiStatus> {
  const start = Date.now();
  const validationConfig = API_VALIDATION_ENDPOINTS[endpoint.type];
  
  if (!validationConfig) {
    return {
      name: endpoint.name,
      status: 'offline',
      latency: null,
      lastCheck: new Date().toISOString(),
      lastError: 'No validation endpoint configured',
    };
  }
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    
    // Get API key from database/env if configured
    const apiKey = await getApiKey(endpoint.type);
    
    // Build headers
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'User-Agent': 'MemeSniper/1.0',
    };
    
    // Add API key based on type
    if (apiKey) {
      switch (endpoint.type) {
        case 'birdeye':
          headers['X-API-KEY'] = apiKey;
          break;
        case 'jupiter':
          headers['x-api-key'] = apiKey;
          break;
        case 'dextools':
          // Dextools V2 API uses x-api-key header
          headers['x-api-key'] = apiKey;
          break;
      }
    }
    
    let response: Response;
    
    if (endpoint.type === 'rpc_provider') {
      // Special handling for RPC
      const rpcUrl = apiKey || validationConfig.url;
      response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getHealth',
        }),
        signal: controller.signal,
      });
    } else {
      response = await fetch(validationConfig.url, {
        method: validationConfig.method,
        signal: controller.signal,
        headers,
      });
    }
    
    clearTimeout(timeout);
    const latency = Date.now() - start;
    
    if (response.ok) {
      return {
        name: endpoint.name,
        status: latency > 3000 ? 'degraded' : 'online',
        latency,
        lastCheck: new Date().toISOString(),
        hasApiKey: !!apiKey,
      };
    } else {
      // Check for auth errors
      if (response.status === 401 || response.status === 403) {
        return {
          name: endpoint.name,
          status: 'degraded',
          latency,
          lastCheck: new Date().toISOString(),
          lastError: validationConfig.requiresKey 
            ? `API key invalid or missing (${response.status})` 
            : `Access denied (${response.status})`,
          hasApiKey: !!apiKey,
        };
      }
      return {
        name: endpoint.name,
        status: 'degraded',
        latency,
        lastCheck: new Date().toISOString(),
        lastError: `HTTP ${response.status}`,
        hasApiKey: !!apiKey,
      };
    }
  } catch (error: any) {
    return {
      name: endpoint.name,
      status: 'offline',
      latency: null,
      lastCheck: new Date().toISOString(),
      lastError: error.name === 'AbortError' ? 'Timeout' : (error.message || 'Connection failed'),
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[api-health] Checking API endpoints with configured keys...');
    
    // Check all endpoints in parallel
    const results = await Promise.all(
      API_ENDPOINTS.map(endpoint => checkEndpoint(endpoint))
    );
    
    const summary = results.map(r => 
      `${r.name}: ${r.status}${r.latency ? ` (${r.latency}ms)` : ''}${r.hasApiKey ? ' [key]' : ''}`
    ).join(', ');
    console.log(`[api-health] Results: ${summary}`);
    
    return new Response(
      JSON.stringify({ 
        statuses: results,
        checkedAt: new Date().toISOString(),
      }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('[api-health] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Health check failed' }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
