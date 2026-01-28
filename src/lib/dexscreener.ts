export type DexTokenMetadata = {
  address: string;
  symbol: string;
  name: string;
};

export type DexTokenPriceData = {
  address: string;
  priceUsd: number;
  priceChange24h: number;
  volume24h: number;
  liquidity: number;
  // Include metadata for enrichment
  symbol?: string;
  name?: string;
};

const PLACEHOLDER_RE = /^(unknown|unknown token|token|\?\?\?|n\/a)$/i;

export function isPlaceholderTokenText(value: string | null | undefined): boolean {
  if (!value) return true;
  const v = value.trim();
  if (!v) return true;
  return PLACEHOLDER_RE.test(v);
}

export function isLikelyRealSolanaMint(address: string): boolean {
  // Basic length check only (no heavy validation here)
  if (!address) return false;
  if (address.includes('...')) return false;
  if (address.toLowerCase().startsWith('demo')) return false;
  return address.length >= 32 && address.length <= 66;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// In-memory cache for persisted metadata (prevents re-fetching after DB save)
const persistedMetadataCache = new Map<string, { symbol: string; name: string; persistedAt: number }>();
const PERSISTED_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch token metadata from Jupiter token list using BATCH endpoint to avoid rate limits.
 * Uses the /all-tokens endpoint with filtering instead of individual calls.
 */
export async function fetchJupiterTokenMetadata(
  addresses: string[],
  opts?: { timeoutMs?: number }
): Promise<Map<string, DexTokenMetadata>> {
  const timeoutMs = opts?.timeoutMs ?? 5000;
  const result = new Map<string, DexTokenMetadata>();
  
  const unique = Array.from(new Set(addresses.filter((a) => isLikelyRealSolanaMint(a))));
  if (unique.length === 0) return result;
  
  // Create a Set for fast lookup
  const addressSet = new Set(unique);
  
  try {
    // Use Jupiter's all-tokens endpoint which doesn't rate limit as aggressively
    // Then filter client-side for the tokens we need
    const res = await fetch('https://lite-api.jup.ag/tokens/v1/mints?include=address,name,symbol', {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'Accept': 'application/json' },
    });
    
    if (res.ok) {
      const allTokens: { address: string; symbol?: string; name?: string }[] = await res.json();
      
      for (const token of allTokens) {
        if (!token.address || !addressSet.has(token.address)) continue;
        
        const symbol = String(token.symbol || '').trim();
        const name = String(token.name || '').trim();
        
        if (symbol && !isPlaceholderTokenText(symbol)) {
          result.set(token.address, {
            address: token.address,
            symbol,
            name: name || symbol,
          });
        }
      }
      
      return result;
    }
  } catch {
    // Fallback: try individual fetches with delays if batch fails
  }
  
  // FALLBACK: Individual fetches with rate limiting (max 2 per second)
  const RATE_LIMIT_DELAY = 500;
  for (let i = 0; i < unique.length && i < 5; i++) { // Limit to first 5 to avoid rate limits
    const addr = unique[i];
    try {
      if (i > 0) await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY));
      
      const res = await fetch(`https://lite-api.jup.ag/tokens/v1/${addr}`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const symbol = String(data?.symbol || '').trim();
      const name = String(data?.name || '').trim();
      if (symbol && !isPlaceholderTokenText(symbol)) {
        result.set(addr, {
          address: addr,
          symbol,
          name: name || symbol,
        });
      }
    } catch {
      // Ignore: best-effort
    }
  }
  
  return result;
}

/**
 * Best-effort metadata lookup via DexScreener FIRST, then Jupiter fallback.
 * Uses the token endpoint which supports comma-separated addresses.
 * Results are cached to prevent repeated external calls.
 */
export async function fetchDexScreenerTokenMetadata(
  addresses: string[],
  opts?: { timeoutMs?: number; chunkSize?: number }
): Promise<Map<string, DexTokenMetadata>> {
  const timeoutMs = opts?.timeoutMs ?? 5000;
  const chunkSize = opts?.chunkSize ?? 25;

  const unique = Array.from(
    new Set(addresses.filter((a) => isLikelyRealSolanaMint(a)))
  );
  const result = new Map<string, DexTokenMetadata>();
  if (unique.length === 0) return result;
  
  // Check persisted cache first
  const now = Date.now();
  const stillNeeded: string[] = [];
  for (const addr of unique) {
    const cached = persistedMetadataCache.get(addr);
    if (cached && now - cached.persistedAt < PERSISTED_CACHE_TTL_MS) {
      result.set(addr, { address: addr, symbol: cached.symbol, name: cached.name });
    } else {
      stillNeeded.push(addr);
    }
  }
  
  if (stillNeeded.length === 0) return result;

  // 1. Try DexScreener first
  for (const batch of chunk(stillNeeded, chunkSize)) {
    try {
      const url = `https://api.dexscreener.com/latest/dex/tokens/${batch.join(',')}`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!res.ok) continue;
      const data = await res.json();
      const pairs: any[] = data?.pairs || [];

      // Choose best pair per token by highest liquidity.usd
      const bestByAddress = new Map<string, { pair: any; liquidityUsd: number }>();
      for (const pair of pairs) {
        if (pair?.chainId !== 'solana') continue;
        const addr = pair?.baseToken?.address;
        if (!addr) continue;
        const liquidityUsd = Number(pair?.liquidity?.usd ?? 0);
        const prev = bestByAddress.get(addr);
        if (!prev || liquidityUsd > prev.liquidityUsd) {
          bestByAddress.set(addr, { pair, liquidityUsd });
        }
      }

      for (const [addr, { pair }] of bestByAddress.entries()) {
        const symbol = String(pair?.baseToken?.symbol || '').trim();
        const name = String(pair?.baseToken?.name || '').trim();
        if (!symbol && !name) continue;
        const meta = {
          address: addr,
          symbol: symbol || addr.slice(0, 4),
          name: name || `Token ${addr.slice(0, 6)}`,
        };
        result.set(addr, meta);
        // Cache it
        persistedMetadataCache.set(addr, { symbol: meta.symbol, name: meta.name, persistedAt: now });
      }
    } catch {
      // Ignore: best-effort enrichment
    }
  }
  
  // 2. For addresses still missing, try Jupiter token list as fallback
  const stillMissing = stillNeeded.filter(a => !result.has(a));
  if (stillMissing.length > 0) {
    const jupiterMeta = await fetchJupiterTokenMetadata(stillMissing, { timeoutMs: 3000 });
    for (const [addr, meta] of jupiterMeta.entries()) {
      result.set(addr, meta);
      persistedMetadataCache.set(addr, { symbol: meta.symbol, name: meta.name, persistedAt: now });
    }
  }

  return result;
}

/**
 * Fetch live price data for multiple tokens from DexScreener.
 * Returns real-time price, 24h change, volume, and liquidity.
 * Optimized for minimal latency with 3s timeout.
 */
export async function fetchDexScreenerPrices(
  addresses: string[],
  opts?: { timeoutMs?: number; chunkSize?: number }
): Promise<Map<string, DexTokenPriceData>> {
  const timeoutMs = opts?.timeoutMs ?? 3000; // Reduced from 5s to 3s for speed
  const chunkSize = opts?.chunkSize ?? 30; // Increased batch size

  const unique = Array.from(
    new Set(addresses.filter((a) => isLikelyRealSolanaMint(a)))
  );
  const result = new Map<string, DexTokenPriceData>();
  if (unique.length === 0) return result;

  for (const batch of chunk(unique, chunkSize)) {
    try {
      const url = `https://api.dexscreener.com/latest/dex/tokens/${batch.join(',')}`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!res.ok) continue;
      const data = await res.json();
      const pairs: any[] = data?.pairs || [];

      // Choose best pair per token by highest liquidity.usd
      const bestByAddress = new Map<string, { pair: any; liquidityUsd: number }>();
      for (const pair of pairs) {
        if (pair?.chainId !== 'solana') continue;
        const addr = pair?.baseToken?.address;
        if (!addr) continue;
        const liquidityUsd = Number(pair?.liquidity?.usd ?? 0);
        const prev = bestByAddress.get(addr);
        if (!prev || liquidityUsd > prev.liquidityUsd) {
          bestByAddress.set(addr, { pair, liquidityUsd });
        }
      }

      for (const [addr, { pair, liquidityUsd }] of bestByAddress.entries()) {
        // Extract symbol and name for metadata enrichment
        const symbol = String(pair?.baseToken?.symbol || '').trim();
        const name = String(pair?.baseToken?.name || '').trim();
        
        result.set(addr, {
          address: addr,
          priceUsd: parseFloat(pair?.priceUsd || '0') || 0,
          priceChange24h: parseFloat(pair?.priceChange?.h24 || '0') || 0,
          volume24h: parseFloat(pair?.volume?.h24 || '0') || 0,
          liquidity: liquidityUsd,
          // Include metadata for positions that need enrichment
          symbol: symbol || undefined,
          name: name || undefined,
        });
      }
    } catch {
      // Ignore: best-effort price fetch
    }
  }

  return result;
}
