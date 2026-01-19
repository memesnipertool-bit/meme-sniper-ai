import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Jupiter API configuration - uses paid endpoint if API key is available
const JUPITER_API_KEY = Deno.env.get("JUPITER_API_KEY");
const JUPITER_HEALTH_URL = JUPITER_API_KEY 
  ? "https://public.jupiterapi.com/health"  // Paid API health endpoint
  : "https://quote-api.jup.ag/v6/health";   // Free public API

interface ApiEndpoint {
  name: string;
  url: string;
  type: string;
  headers?: Record<string, string>;
}

const API_ENDPOINTS: ApiEndpoint[] = [
  { 
    name: 'Jupiter', 
    url: JUPITER_HEALTH_URL, 
    type: 'swap',
    headers: JUPITER_API_KEY ? { 'x-api-key': JUPITER_API_KEY } : undefined
  },
  { name: 'Raydium', url: 'https://api-v3.raydium.io/main/version', type: 'swap' },
  { name: 'Pump.fun', url: 'https://frontend-api.pump.fun/health', type: 'scan' },
  { name: 'DexScreener', url: 'https://api.dexscreener.com/latest/dex/tokens/So11111111111111111111111111111111111111112', type: 'scan' },
];

console.log(`[api-health] Jupiter API: ${JUPITER_API_KEY ? 'AUTHENTICATED' : 'PUBLIC'}`);

interface ApiStatus {
  name: string;
  status: 'online' | 'degraded' | 'offline';
  latency: number | null;
  lastCheck: string;
  lastError?: string;
}

async function checkEndpoint(endpoint: ApiEndpoint): Promise<ApiStatus> {
  const start = Date.now();
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    
    // Build headers, including any API keys
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'User-Agent': 'MemeSniper/1.0',
      ...(endpoint.headers || {}),
    };
    
    const response = await fetch(endpoint.url, {
      method: 'GET',
      signal: controller.signal,
      headers,
    });
    
    clearTimeout(timeout);
    const latency = Date.now() - start;
    
    if (response.ok) {
      return {
        name: endpoint.name,
        status: latency > 3000 ? 'degraded' : 'online',
        latency,
        lastCheck: new Date().toISOString(),
      };
    } else {
      // For Jupiter, 401/403 means API key issue
      if (endpoint.name === 'Jupiter' && (response.status === 401 || response.status === 403)) {
        return {
          name: endpoint.name,
          status: 'degraded',
          latency,
          lastCheck: new Date().toISOString(),
          lastError: `API key invalid or expired (${response.status})`,
        };
      }
      return {
        name: endpoint.name,
        status: 'degraded',
        latency,
        lastCheck: new Date().toISOString(),
        lastError: `HTTP ${response.status}`,
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
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[api-health] Checking API endpoints...');
    
    // Check all endpoints in parallel
    const results = await Promise.all(
      API_ENDPOINTS.map(endpoint => checkEndpoint(endpoint))
    );
    
    const summary = results.map(r => `${r.name}: ${r.status}${r.latency ? ` (${r.latency}ms)` : ''}`).join(', ');
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
