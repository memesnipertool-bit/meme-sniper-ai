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

/**
 * Best-effort metadata lookup via DexScreener.
 * Uses the token endpoint which supports comma-separated addresses.
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

      for (const [addr, { pair }] of bestByAddress.entries()) {
        const symbol = String(pair?.baseToken?.symbol || '').trim();
        const name = String(pair?.baseToken?.name || '').trim();
        if (!symbol && !name) continue;
        result.set(addr, {
          address: addr,
          symbol: symbol || addr.slice(0, 4),
          name: name || `Token ${addr.slice(0, 6)}`,
        });
      }
    } catch {
      // Ignore: best-effort enrichment
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
