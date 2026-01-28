/**
 * Jupiter API retry helper for Edge Functions
 * Implements exponential backoff for rate limit handling
 */

const QUOTE_ENDPOINTS = [
  'https://quote-api.jup.ag/v6/quote',
  'https://lite-api.jup.ag/swap/v1/quote',
];

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export type JupiterQuoteResult =
  | { ok: true; quote: any; endpoint: string }
  | { ok: false; kind: 'NO_ROUTE' | 'RATE_LIMITED' | 'NETWORK_ERROR'; message: string };

export async function fetchJupiterQuoteWithRetry(params: {
  inputMint: string;
  outputMint: string;
  amount: string;
  slippageBps: number;
  timeoutMs?: number;
}): Promise<JupiterQuoteResult> {
  const { inputMint, outputMint, amount, slippageBps, timeoutMs = 10000 } = params;

  let lastError: JupiterQuoteResult | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      console.log(`[Jupiter] Rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await sleep(delay);
    }

    const result = await attemptQuoteFetch({ inputMint, outputMint, amount, slippageBps, timeoutMs });

    if (result.ok === true) return result;
    if (result.kind === 'NO_ROUTE') return result;
    
    lastError = result;
    if (result.kind !== 'RATE_LIMITED') return result;
  }

  return lastError || {
    ok: false,
    kind: 'RATE_LIMITED',
    message: 'Jupiter rate limited after all retries.',
  };
}

async function attemptQuoteFetch(params: {
  inputMint: string;
  outputMint: string;
  amount: string;
  slippageBps: number;
  timeoutMs: number;
}): Promise<JupiterQuoteResult> {
  const { inputMint, outputMint, amount, slippageBps, timeoutMs } = params;

  let sawRateLimit = false;

  for (const endpoint of QUOTE_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const url = `${endpoint}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}`;
      
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
      });

      clearTimeout(timeout);

      if (response.status === 429) {
        sawRateLimit = true;
        continue;
      }

      if (!response.ok) {
        if (response.status === 400 || response.status === 404) {
          const body = await response.text();
          if (body.includes('Could not find any route') || body.includes('No routes found')) {
            return { ok: false, kind: 'NO_ROUTE', message: 'No route available' };
          }
        }
        continue;
      }

      const data = await response.json();

      if (data.error) {
        if (String(data.error).toLowerCase().includes('no route')) {
          return { ok: false, kind: 'NO_ROUTE', message: data.error };
        }
        continue;
      }

      if (!data.outAmount && !data.outputAmount) {
        return { ok: false, kind: 'NO_ROUTE', message: 'Quote returned no output amount' };
      }

      return { ok: true, quote: data, endpoint };
    } catch (err) {
      continue;
    }
  }

  if (sawRateLimit) {
    return { ok: false, kind: 'RATE_LIMITED', message: 'Jupiter rate limited. Retrying...' };
  }

  return { ok: false, kind: 'NETWORK_ERROR', message: 'All Jupiter endpoints failed' };
}
