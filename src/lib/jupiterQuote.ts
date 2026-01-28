export type JupiterQuoteErrorKind = 'NO_ROUTE' | 'RATE_LIMITED' | 'HTTP_ERROR' | 'NETWORK_ERROR';

export type JupiterQuoteFetchResult =
  | {
      ok: true;
      quote: any;
      endpoint: string;
    }
  | {
      ok: false;
      kind: JupiterQuoteErrorKind;
      message: string;
      status?: number;
      endpoint?: string;
    };

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

// Prefer the main quote API, fallback to lite quote.
// Both return a quote object compatible with /swap/v1/swap.
const QUOTE_ENDPOINTS = [
  'https://quote-api.jup.ag/v6/quote',
  'https://lite-api.jup.ag/swap/v1/quote',
];

/**
 * Sleep helper for retry backoff
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch Jupiter quote with automatic retry and exponential backoff for rate limits
 */
export async function fetchJupiterQuote(params: {
  inputMint: string;
  outputMint: string;
  amount: string;
  slippageBps: number;
  timeoutMs?: number;
  extra?: Record<string, string>;
}): Promise<JupiterQuoteFetchResult> {
  const {
    inputMint,
    outputMint,
    amount,
    slippageBps,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    extra,
  } = params;

  let lastError: JupiterQuoteFetchResult | null = null;

  // Retry loop with exponential backoff
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 1s, 2s, 4s
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      console.log(`[Jupiter] Rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await sleep(delay);
    }

    const result = await attemptQuoteFetch({
      inputMint,
      outputMint,
      amount,
      slippageBps,
      timeoutMs,
      extra,
    });

    // Success - return immediately
    if (result.ok === true) {
      return result;
    }

    // Non-retryable error (NO_ROUTE) - return immediately
    if (result.kind === 'NO_ROUTE') {
      return result;
    }

    // Rate limited or network error - store and retry
    lastError = result;
    
    // Only retry on rate limit
    if (result.kind !== 'RATE_LIMITED') {
      return result;
    }
  }

  // All retries exhausted
  return lastError || {
    ok: false,
    kind: 'RATE_LIMITED',
    message: 'Jupiter rate limited after all retries. Please wait a moment and try again.',
  };
}

/**
 * Single attempt to fetch quote from all endpoints
 */
async function attemptQuoteFetch(params: {
  inputMint: string;
  outputMint: string;
  amount: string;
  slippageBps: number;
  timeoutMs: number;
  extra?: Record<string, string>;
}): Promise<JupiterQuoteFetchResult> {
  const { inputMint, outputMint, amount, slippageBps, timeoutMs, extra } = params;

  let sawRateLimit = false;
  let lastNetworkError: unknown = null;

  for (const endpoint of QUOTE_ENDPOINTS) {
    const url = new URL(endpoint);
    url.searchParams.set('inputMint', inputMint);
    url.searchParams.set('outputMint', outputMint);
    url.searchParams.set('amount', amount);
    url.searchParams.set('slippageBps', String(slippageBps));

    try {
      const res = await fetch(url.toString(), {
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          Accept: 'application/json',
          ...(extra || {}),
        },
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');

        if (res.status === 429) {
          sawRateLimit = true;
          continue;
        }

        // These statuses typically mean: token not indexed / no available route.
        if (res.status === 400 || res.status === 404) {
          return {
            ok: false,
            kind: 'NO_ROUTE',
            status: res.status,
            endpoint,
            message: text || 'No route available',
          };
        }

        // Try fallback endpoint for transient issues.
        continue;
      }

      const data = await res.json().catch(() => null);
      if (!data || data.error) {
        return {
          ok: false,
          kind: 'NO_ROUTE',
          endpoint,
          message: data?.error || 'No route available',
        };
      }

      return { ok: true, quote: data, endpoint };
    } catch (e) {
      lastNetworkError = e;
      continue;
    }
  }

  if (sawRateLimit) {
    return {
      ok: false,
      kind: 'RATE_LIMITED',
      message: 'Jupiter rate limited. Retrying...',
    };
  }

  return {
    ok: false,
    kind: 'NETWORK_ERROR',
    message: lastNetworkError instanceof Error ? lastNetworkError.message : 'Network error',
  };
}
