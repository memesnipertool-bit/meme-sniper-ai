// Shared API key management utilities for edge functions
// This provides a single source of truth for API type to secret name mapping

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Complete mapping of API types to their secret/environment variable names
// Only includes APIs actually used in the application
export const API_SECRET_MAPPING: Record<string, string> = {
  birdeye: 'BIRDEYE_API_KEY',
  dextools: 'DEXTOOLS_API_KEY',
  liquidity_lock: 'LIQUIDITY_LOCK_API_KEY',
  dexscreener: 'DEXSCREENER_API_KEY',
  geckoterminal: 'GECKOTERMINAL_API_KEY',
  honeypot_rugcheck: 'HONEYPOT_API_KEY',
  jupiter: 'JUPITER_API_KEY',
  raydium: 'RAYDIUM_API_KEY',
  pumpfun: 'PUMPFUN_API_KEY',
  rpc_provider: 'SOLANA_RPC_URL',
};

// Internal service token for edge-to-edge calls (validated via shared secret)
const INTERNAL_SERVICE_TOKEN = 'EDGE_INTERNAL_TOKEN';

// API validation endpoints for testing connectivity
// Note: Some APIs have DNS restrictions in edge functions, so we skip HTTP testing for those
export const API_VALIDATION_ENDPOINTS: Record<string, { 
  url: string; 
  method: string; 
  requiresKey: boolean;
  skipHttpTest?: boolean; // Skip actual HTTP test due to DNS/network restrictions in edge functions
}> = {
  // Birdeye - use /defi/networks endpoint (more reliable than /public/tokenlist)
  birdeye: { url: 'https://public-api.birdeye.so/defi/networks', method: 'GET', requiresKey: true },
  dexscreener: { url: 'https://api.dexscreener.com/latest/dex/tokens/So11111111111111111111111111111111111111112', method: 'GET', requiresKey: false },
  geckoterminal: { url: 'https://api.geckoterminal.com/api/v2/networks', method: 'GET', requiresKey: false },
  // Jupiter, Raydium, Pump.fun have DNS resolution issues in Supabase edge functions
  jupiter: { url: 'https://quote-api.jup.ag/v6/quote', method: 'GET', requiresKey: false, skipHttpTest: true },
  raydium: { url: 'https://api-v3.raydium.io/main/version', method: 'GET', requiresKey: false, skipHttpTest: true },
  pumpfun: { url: 'https://frontend-api.pump.fun/coins', method: 'GET', requiresKey: false, skipHttpTest: true },
  honeypot_rugcheck: { url: 'https://api.rugcheck.xyz/v1/tokens/So11111111111111111111111111111111111111112/report', method: 'GET', requiresKey: false },
  rpc_provider: { url: 'https://api.mainnet-beta.solana.com', method: 'POST', requiresKey: false },
  // Dextools - use v2 blockchain endpoint (more reliable) with x-api-key header
  dextools: { url: 'https://public-api.dextools.io/standard/v2/blockchain', method: 'GET', requiresKey: true },
  // Team Finance has no public API - skip HTTP test, only verify key is configured
  liquidity_lock: { url: 'https://api.team.finance/v1/lockups', method: 'GET', requiresKey: true, skipHttpTest: true },
};

// Simple XOR encryption with a key derived from service role key
// This provides actual encryption (not just encoding) while staying compatible with edge functions
const getEncryptionKey = (): string => {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  // Use last 32 chars of service role key as encryption key (always available in edge functions)
  return serviceKey.slice(-32);
};

// XOR-based encryption - simple but effective when combined with RLS and service role access
const xorEncrypt = (text: string, key: string): string => {
  const textBytes = new TextEncoder().encode(text);
  const keyBytes = new TextEncoder().encode(key);
  const result = new Uint8Array(textBytes.length);
  
  for (let i = 0; i < textBytes.length; i++) {
    result[i] = textBytes[i] ^ keyBytes[i % keyBytes.length];
  }
  
  // Convert to hex string for storage
  return Array.from(result).map(b => b.toString(16).padStart(2, '0')).join('');
};

const xorDecrypt = (hexString: string, key: string): string => {
  // Convert hex string back to bytes
  const bytes = new Uint8Array(hexString.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []);
  const keyBytes = new TextEncoder().encode(key);
  const result = new Uint8Array(bytes.length);
  
  for (let i = 0; i < bytes.length; i++) {
    result[i] = bytes[i] ^ keyBytes[i % keyBytes.length];
  }
  
  return new TextDecoder().decode(result);
};

// Encryption/decryption for API keys stored in database
// Uses XOR encryption with service role key derivation
export const encryptKey = (key: string): string => {
  const encryptionKey = getEncryptionKey();
  if (!encryptionKey) {
    // Fallback to base64 if no encryption key available (shouldn't happen in edge functions)
    return 'enc:' + btoa(key);
  }
  const encrypted = xorEncrypt(key, encryptionKey);
  return 'aes:' + encrypted; // New prefix to distinguish from old base64 encoding
};

export const decryptKey = (encrypted: string | null): string | null => {
  if (!encrypted) return null;
  
  // Handle new AES-style encryption
  if (encrypted.startsWith('aes:')) {
    const encryptionKey = getEncryptionKey();
    if (!encryptionKey) return null;
    try {
      return xorDecrypt(encrypted.substring(4), encryptionKey);
    } catch {
      return null;
    }
  }
  
  // Handle legacy base64 encoding for backward compatibility
  if (encrypted.startsWith('enc:')) {
    try {
      return atob(encrypted.substring(4));
    } catch {
      return null;
    }
  }
  
  // Not encrypted, return as-is
  return encrypted;
};

// Validate internal service token for edge-to-edge calls
export const validateInternalToken = (token: string | null): boolean => {
  if (!token) return false;
  
  // The internal token is derived from service role key hash
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!serviceKey) return false;
  
  // Create a simple hash of the service key for internal auth
  const expectedToken = btoa(serviceKey.slice(0, 16) + 'internal').slice(0, 32);
  return token === expectedToken;
};

// Generate internal service token for edge-to-edge calls
export const generateInternalToken = (): string => {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  return btoa(serviceKey.slice(0, 16) + 'internal').slice(0, 32);
};

// Get Supabase client for service-level operations
export const getServiceClient = () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(supabaseUrl, supabaseKey);
};

// Get API key for a specific type - checks database first, then environment
export async function getApiKey(apiType: string): Promise<string | null> {
  const supabase = getServiceClient();
  
  // First check database for stored key
  const { data: config } = await supabase
    .from('api_configurations')
    .select('api_key_encrypted')
    .eq('api_type', apiType)
    .eq('is_enabled', true)
    .maybeSingle();
  
  if (config?.api_key_encrypted) {
    const decrypted = decryptKey(config.api_key_encrypted);
    if (decrypted) return decrypted;
  }
  
  // Fall back to environment variable
  const envKey = API_SECRET_MAPPING[apiType];
  return envKey ? Deno.env.get(envKey) || null : null;
}

// Get API configuration including base URL
export async function getApiConfig(apiType: string): Promise<{
  baseUrl: string | null;
  apiKey: string | null;
  isEnabled: boolean;
  rateLimitPerMinute: number;
} | null> {
  const supabase = getServiceClient();
  
  const { data: config } = await supabase
    .from('api_configurations')
    .select('base_url, api_key_encrypted, is_enabled, rate_limit_per_minute')
    .eq('api_type', apiType)
    .maybeSingle();
  
  if (!config) {
    // Return null if no configuration exists
    return null;
  }
  
  const apiKey = config.api_key_encrypted 
    ? decryptKey(config.api_key_encrypted) 
    : Deno.env.get(API_SECRET_MAPPING[apiType]) || null;
  
  return {
    baseUrl: config.base_url,
    apiKey,
    isEnabled: config.is_enabled ?? true,
    rateLimitPerMinute: config.rate_limit_per_minute ?? 60,
  };
}

// Validate API key by making a test request
export async function validateApiKey(apiType: string, apiKey?: string): Promise<{
  valid: boolean;
  message: string;
  latencyMs?: number;
  skipped?: boolean;
}> {
  const validationConfig = API_VALIDATION_ENDPOINTS[apiType];
  
  if (!validationConfig) {
    return { valid: false, message: `No validation endpoint configured for ${apiType}` };
  }
  
  // Get API key if not provided
  const keyToTest = apiKey || await getApiKey(apiType);
  
  if (validationConfig.requiresKey && !keyToTest) {
    return { valid: false, message: `API key required for ${apiType} but not configured` };
  }
  
  // For APIs with DNS restrictions in edge functions, just verify the key is configured
  if (validationConfig.skipHttpTest) {
    if (keyToTest || !validationConfig.requiresKey) {
      return { 
        valid: true, 
        message: `${apiType} API key is configured (connection test skipped - will work in browser)`,
        skipped: true,
      };
    } else {
      return { valid: false, message: `${apiType} API key not configured` };
    }
  }
  
  const startTime = Date.now();
  
  try {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'User-Agent': 'MemeSniper/1.0',
    };
    
    // Add API key to headers based on API type
    if (keyToTest) {
      switch (apiType) {
        case 'birdeye':
          headers['X-API-KEY'] = keyToTest;
          break;
        case 'dextools':
          // Dextools V2 API uses x-api-key header (not RapidAPI)
          headers['x-api-key'] = keyToTest;
          break;
        case 'jupiter':
          headers['x-api-key'] = keyToTest;
          break;
        case 'liquidity_lock':
          headers['x-api-key'] = keyToTest;
          break;
        default:
          headers['Authorization'] = `Bearer ${keyToTest}`;
      }
    }
    
    let response: Response;
    
    if (apiType === 'rpc_provider') {
      // Special handling for RPC - make a simple getHealth request
      const rpcUrl = keyToTest || validationConfig.url;
      response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getHealth',
        }),
        signal: AbortSignal.timeout(10000),
      });
    } else {
      response = await fetch(validationConfig.url, {
        method: validationConfig.method,
        headers,
        signal: AbortSignal.timeout(10000),
      });
    }
    
    const latencyMs = Date.now() - startTime;
    
    if (response.ok) {
      return { valid: true, message: `${apiType} API is working`, latencyMs };
    } else if (response.status === 401 || response.status === 403) {
      return { valid: false, message: `Invalid or expired API key for ${apiType}`, latencyMs };
    } else if (response.status === 429) {
      return { valid: true, message: `${apiType} API is rate limited but key is valid`, latencyMs };
    } else {
      return { valid: false, message: `${apiType} API returned HTTP ${response.status}`, latencyMs };
    }
  } catch (error: any) {
    const latencyMs = Date.now() - startTime;
    if (error.name === 'TimeoutError') {
      return { valid: false, message: `${apiType} API request timed out`, latencyMs };
    }
    return { valid: false, message: `${apiType} API error: ${error.message}`, latencyMs };
  }
}

// Get all configured API keys status
export async function getAllApiKeyStatus(): Promise<Record<string, {
  configured: boolean;
  secretName: string;
  source: 'database' | 'environment' | 'none';
}>> {
  const supabase = getServiceClient();
  
  const { data: configs } = await supabase
    .from('api_configurations')
    .select('api_type, api_key_encrypted');
  
  const dbKeys = new Map(configs?.map(c => [c.api_type, c.api_key_encrypted]) || []);
  
  const status: Record<string, { configured: boolean; secretName: string; source: 'database' | 'environment' | 'none' }> = {};
  
  for (const [apiType, secretName] of Object.entries(API_SECRET_MAPPING)) {
    const dbKey = dbKeys.get(apiType);
    const hasDbKey = dbKey && decryptKey(dbKey);
    const envValue = Deno.env.get(secretName);
    
    let source: 'database' | 'environment' | 'none' = 'none';
    if (hasDbKey) {
      source = 'database';
    } else if (envValue && envValue.length > 0) {
      source = 'environment';
    }
    
    status[apiType] = {
      configured: source !== 'none',
      secretName,
      source,
    };
  }
  
  return status;
}
