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

// Session-level cache to prevent repeated API calls for the same tokens
// This cache survives across tab switches but resets on page refresh
const jupiterMetaCache = new Map<string, { symbol: string; name: string; fetchedAt: number }>();
const JUPITER_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Rate limit tracker for Jupiter
let lastJupiterCallTime = 0;
const MIN_JUPITER_CALL_INTERVAL_MS = 2000; // 2 seconds between calls

/**
 * Fetch token metadata from Jupiter token list.
 * IMPORTANT: This is now ONLY used as a fallback when DexScreener fails.
 * Uses aggressive caching and rate limiting to avoid 429 errors.
 */
export async function fetchJupiterTokenMetadata(
  addresses: string[],
  opts?: { timeoutMs?: number }
): Promise<Map<string, DexTokenMetadata>> {
  const timeoutMs = opts?.timeoutMs ?? 5000;
  const result = new Map<string, DexTokenMetadata>();
  
  const unique = Array.from(new Set(addresses.filter((a) => isLikelyRealSolanaMint(a))));
  if (unique.length === 0) return result;
  
  const now = Date.now();
  
  // Check cache first - return cached values and skip API call if all are cached
  const stillNeeded: string[] = [];
  for (const addr of unique) {
    const cached = jupiterMetaCache.get(addr);
    if (cached && now - cached.fetchedAt < JUPITER_CACHE_TTL_MS) {
      result.set(addr, { address: addr, symbol: cached.symbol, name: cached.name });
    } else {
      stillNeeded.push(addr);
    }
  }
  
  // If all addresses are cached, return immediately
  if (stillNeeded.length === 0) return result;
  
  // RATE LIMITING: Enforce minimum interval between Jupiter API calls
  const timeSinceLastCall = now - lastJupiterCallTime;
  if (timeSinceLastCall < MIN_JUPITER_CALL_INTERVAL_MS) {
    console.log(`[Jupiter] Rate limiting: waiting ${MIN_JUPITER_CALL_INTERVAL_MS - timeSinceLastCall}ms`);
    await new Promise(r => setTimeout(r, MIN_JUPITER_CALL_INTERVAL_MS - timeSinceLastCall));
  }
  lastJupiterCallTime = Date.now();
  
  // Limit to max 10 individual fetches to avoid hammering the API
  const toFetch = stillNeeded.slice(0, 10);
  
  // Individual fetches with delays (the batch endpoint also rate limits)
  for (let i = 0; i < toFetch.length; i++) {
    const addr = toFetch[i];
    try {
      // Add delay between individual requests
      if (i > 0) await new Promise(r => setTimeout(r, 500));
      
      const res = await fetch(`https://lite-api.jup.ag/tokens/v1/${addr}`, {
        signal: AbortSignal.timeout(3000),
      });
      
      if (res.status === 429) {
        console.log('[Jupiter] Rate limited on individual fetch, stopping');
        break; // Stop fetching more tokens if rate limited
      }
      
      if (!res.ok) continue;
      
      const data = await res.json();
      const symbol = String(data?.symbol || '').trim();
      const name = String(data?.name || '').trim();
      
      if (symbol && !isPlaceholderTokenText(symbol)) {
        const meta = { address: addr, symbol, name: name || symbol };
        result.set(addr, meta);
        // Cache it
        jupiterMetaCache.set(addr, { symbol: meta.symbol, name: meta.name, fetchedAt: Date.now() });
      }
    } catch {
      // Ignore: best-effort
    }
  }
  
  return result;
}

/**
 * Best-effort metadata lookup via DexScreener ONLY - NO Jupiter fallback.
 * Jupiter's API is heavily rate limited and causes 429 errors.
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

  // Use DexScreener ONLY - no Jupiter fallback (causes 429s)
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
  
  // For addresses still missing after DexScreener, try Birdeye API (free, no rate limits)
  const stillMissing = stillNeeded.filter(a => !result.has(a));
  if (stillMissing.length > 0) {
    try {
      // Birdeye's token info endpoint (free tier, rate limited but not as aggressive)
      for (const addr of stillMissing.slice(0, 5)) { // Limit to 5
        const res = await fetch(`https://public-api.birdeye.so/public/tokeninfo?address=${addr}`, {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const data = await res.json();
          const symbol = String(data?.data?.symbol || '').trim();
          const name = String(data?.data?.name || '').trim();
          if (symbol && !isPlaceholderTokenText(symbol)) {
            const meta = { address: addr, symbol, name: name || symbol };
            result.set(addr, meta);
            persistedMetadataCache.set(addr, { symbol: meta.symbol, name: meta.name, persistedAt: now });
          }
        }
        // Small delay between requests
        await new Promise(r => setTimeout(r, 200));
      }
    } catch {
      // Ignore Birdeye errors
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
