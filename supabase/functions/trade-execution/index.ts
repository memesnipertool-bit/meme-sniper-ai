import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getApiKey, getApiConfig } from "../_shared/api-keys.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// API configuration - dynamically fetched from database
let JUPITER_API_KEY: string | null = null;
// Default to free lite-api (no API key required, bypasses DNS issues in some regions)
let JUPITER_BASE_URL = "https://lite-api.jup.ag/swap/v1";
let JUPITER_QUOTE_API = `${JUPITER_BASE_URL}/quote`;
let JUPITER_SWAP_API = `${JUPITER_BASE_URL}/swap`;

// Initialize API keys from database
async function initializeApiKeys() {
  try {
    // Get Jupiter API key from database/env
    JUPITER_API_KEY = await getApiKey('jupiter');
    
    if (JUPITER_API_KEY) {
      // Paid API with higher limits
      JUPITER_BASE_URL = "https://public.jupiterapi.com";
      JUPITER_QUOTE_API = `${JUPITER_BASE_URL}/quote`;
      JUPITER_SWAP_API = `${JUPITER_BASE_URL}/swap`;
      console.log('[Trade] Jupiter API: AUTHENTICATED (paid) - using jupiterapi.com');
    } else {
      // Free lite-api - no key needed
      console.log('[Trade] Jupiter API: PUBLIC (lite-api) - free tier');
    }
  } catch (error) {
    console.error('[Trade] Failed to initialize API keys:', error);
  }
}

// Raydium API endpoints (Fallback)
const RAYDIUM_QUOTE_API = "https://transaction-v1.raydium.io/compute/swap-base-in";
const RAYDIUM_SWAP_API = "https://transaction-v1.raydium.io/transaction/swap-base-in";
const RAYDIUM_FEE_API = "https://api-v3.raydium.io/main/auto-fee";

// Pump.fun API endpoints
const PUMPFUN_API = "https://frontend-api.pump.fun";
const PUMPFUN_COIN_API = "https://client-api-2-74b1891ee9f9.herokuapp.com";
const PUMPFUN_TRADE_API = "https://pumpportal.fun/api/trade-local";

// Common token addresses
const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

interface QuoteRequest {
  inputMint: string;
  outputMint: string;
  amount: string;
  slippageBps?: number;
}

interface SwapRequest {
  quoteResponse: any;
  userPublicKey: string;
  priorityFee?: number;
}

interface TradeRequest {
  action: "quote" | "swap" | "execute" | "validate";
  inputMint?: string;
  outputMint?: string;
  amount?: string;
  slippageBps?: number;
  userPublicKey?: string;
  quoteResponse?: any;
  priorityLevel?: "low" | "medium" | "high" | "veryHigh";
  tokenSymbol?: string;
  tokenName?: string;
  profitTakePercent?: number;
  stopLossPercent?: number;
  isPumpFun?: boolean;
}

interface TokenValidation {
  isTradeable: boolean;
  isHoneypot: boolean;
  freezeAuthority: string | null;
  mintAuthority: string | null;
  holders: number;
  canBuy: boolean;
  canSell: boolean;
  reasons: string[];
}

// Priority fee levels in microLamports
const PRIORITY_FEES = {
  low: 10000,
  medium: 50000,
  high: 200000,
  veryHigh: 1000000,
};

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
};

// Exponential backoff retry helper
async function withRetry<T>(
  fn: () => Promise<T>,
  operation: string,
  maxRetries = RETRY_CONFIG.maxRetries
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // Don't retry on client errors (4xx) or specific non-retryable errors
      if (error.message?.includes('Invalid') || 
          error.message?.includes('HONEYPOT') ||
          error.message?.includes('rejected') ||
          error.message?.includes('Missing')) {
        throw error;
      }
      
      if (attempt < maxRetries) {
        const delay = Math.min(
          RETRY_CONFIG.baseDelay * Math.pow(2, attempt),
          RETRY_CONFIG.maxDelay
        );
        console.log(`[Retry] ${operation} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error(`${operation} failed after ${maxRetries + 1} attempts`);
}

// Check if token is from Pump.fun (bonding curve)
async function isPumpFunToken(tokenMint: string): Promise<{ isPumpFun: boolean; bondingCurve?: any; apiError?: boolean; confirmedNotPumpFun?: boolean }> {
  // Multiple API endpoints to try for resilience
  const endpoints = [
    { url: `${PUMPFUN_API}/coins/${tokenMint}`, name: 'primary' },
    { url: `${PUMPFUN_COIN_API}/coins/${tokenMint}`, name: 'fallback' },
    { url: `https://pump.fun/coin/${tokenMint}`, name: 'web-fallback', isHtml: true },
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint.url, {
        signal: AbortSignal.timeout(8000),
        headers: {
          'Accept': endpoint.isHtml ? 'text/html' : 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Cache-Control': 'no-cache',
        },
      });
      
      if (response.ok) {
        if (endpoint.isHtml) {
          // If web page exists, token is likely on Pump.fun
          const html = await response.text();
          if (html.includes(tokenMint) && !html.includes('404') && !html.includes('not found')) {
            console.log(`[Pump.fun] Token ${tokenMint} found via web fallback (may be on bonding curve)`);
            return { isPumpFun: true, bondingCurve: { complete: false }, apiError: true };
          }
        } else {
          const data = await response.json();
          // If the token exists on pump.fun and hasn't graduated
          if (data && data.mint === tokenMint) {
            if (!data.complete) {
              console.log(`[Pump.fun] Token ${tokenMint} is on bonding curve (${endpoint.name})`);
              return { isPumpFun: true, bondingCurve: data };
            } else {
              console.log(`[Pump.fun] Token ${tokenMint} has graduated to Raydium`);
              return { isPumpFun: false, confirmedNotPumpFun: true }; // Graduated = confirmed not on bonding curve
            }
          }
        }
      } else if (response.status === 404) {
        // Token definitely not on Pump.fun - confirmed
        console.log(`[Pump.fun] Token ${tokenMint} confirmed NOT on Pump.fun (${endpoint.name})`);
        return { isPumpFun: false, confirmedNotPumpFun: true };
      }
    } catch (error: any) {
      console.log(`[Pump.fun] ${endpoint.name} API failed for ${tokenMint}: ${error.message}`);
    }
  }

  // If all endpoints failed but we couldn't confirm token doesn't exist
  console.log(`[Pump.fun] All endpoints failed for ${tokenMint}, assuming not on Pump.fun`);
  return { isPumpFun: false, apiError: true };
}

// Validate token for safety (honeypot, freeze authority, etc.)
async function validateToken(tokenMint: string): Promise<TokenValidation> {
  const validation: TokenValidation = {
    isTradeable: false,
    isHoneypot: false,
    freezeAuthority: null,
    mintAuthority: null,
    holders: 0,
    canBuy: true,
    canSell: true,
    reasons: [],
  };

  try {
    // Check RugCheck API for Solana tokens
    const rugCheckResponse = await fetch(`https://api.rugcheck.xyz/v1/tokens/${tokenMint}/report`, {
      signal: AbortSignal.timeout(8000),
    });
    
    if (rugCheckResponse.ok) {
      const data = await rugCheckResponse.json();
      
      // Check freeze authority
      if (data.token?.freezeAuthority && data.token.freezeAuthority !== null) {
        validation.freezeAuthority = data.token.freezeAuthority;
        validation.reasons.push("⚠️ Freeze authority not revoked - tokens can be frozen");
      }
      
      // Check mint authority
      if (data.token?.mintAuthority && data.token.mintAuthority !== null) {
        validation.mintAuthority = data.token.mintAuthority;
        validation.reasons.push("⚠️ Mint authority not revoked - supply can be increased");
      }
      
      // Check holder count
      validation.holders = data.token?.holder_count || 0;
      if (validation.holders < 10) {
        validation.reasons.push(`⚠️ Low holder count: ${validation.holders}`);
      }
      
      // Check for honeypot risks
      if (data.risks) {
        const highRisks = data.risks.filter((r: any) => r.level === "danger" || r.level === "warn");
        if (highRisks.some((r: any) => r.name?.toLowerCase().includes("honeypot"))) {
          validation.isHoneypot = true;
          validation.canSell = false;
          validation.reasons.push("🚨 HONEYPOT DETECTED - Cannot sell");
        }
      }
      
      // Determine if tradeable
      validation.isTradeable = !validation.isHoneypot && validation.canBuy && validation.canSell;
      
      if (validation.isTradeable) {
        validation.reasons.push("✅ Token passed safety checks");
      }
    }
  } catch (error) {
    console.error("[Validate] RugCheck error:", error);
    validation.reasons.push("⚠️ Could not verify token safety - proceed with caution");
    validation.isTradeable = true; // Allow but with warning
  }

  return validation;
}

// Get Jupiter quote with retry (uses API key if available)
async function getJupiterQuote(request: QuoteRequest): Promise<any> {
  return withRetry(async () => {
    const params = new URLSearchParams({
      inputMint: request.inputMint,
      outputMint: request.outputMint,
      amount: request.amount,
      slippageBps: String(request.slippageBps || 100),
      swapMode: "ExactIn",
    });

    console.log(`[Jupiter] Fetching quote: ${params.toString()}`);

    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    
    // Add API key header if available (for paid Jupiter API)
    if (JUPITER_API_KEY) {
      headers['x-api-key'] = JUPITER_API_KEY;
    }

    const response = await fetch(`${JUPITER_QUOTE_API}?${params}`, {
      signal: AbortSignal.timeout(15000),
      headers,
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Jupiter] Quote error: ${response.status} - ${errorText}`);
      
      // Provide more helpful error messages
      if (response.status === 429) {
        throw new Error(`Jupiter rate limited - consider upgrading to paid API`);
      }
      throw new Error(`Jupiter quote failed: ${response.status}`);
    }

    const quoteData = await response.json();
    
    if (quoteData.error) {
      console.error(`[Jupiter] Quote failed:`, quoteData);
      throw new Error(`Jupiter quote failed: ${quoteData.error}`);
    }

    console.log(`[Jupiter] Quote received: ${quoteData.outAmount} output for ${request.amount} input`);
    
    return quoteData;
  }, 'Jupiter quote');
}

// Get Jupiter swap transaction (uses API key if available)
async function getJupiterSwap(request: SwapRequest): Promise<any> {
  console.log(`[Jupiter] Building swap transaction for ${request.userPublicKey}`);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  // Add API key header if available
  if (JUPITER_API_KEY) {
    headers['x-api-key'] = JUPITER_API_KEY;
  }

  const response = await fetch(JUPITER_SWAP_API, {
    method: "POST",
    headers,
    body: JSON.stringify({
      quoteResponse: request.quoteResponse,
      userPublicKey: request.userPublicKey,
      wrapAndUnwrapSol: true,
      prioritizationFeeLamports: request.priorityFee || PRIORITY_FEES.medium,
      dynamicComputeUnitLimit: true,
    }),
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Jupiter] Swap build error: ${response.status} - ${errorText}`);
    throw new Error(`Jupiter swap build failed: ${response.status}`);
  }

  const swapData = await response.json();
  
  if (swapData.error) {
    console.error(`[Jupiter] Swap build failed:`, swapData);
    throw new Error(`Jupiter swap build failed: ${swapData.error}`);
  }

  console.log(`[Jupiter] Swap transaction built successfully`);
  
  return swapData;
}

// Get Raydium quote (fallback) with retry
async function getRaydiumQuote(request: QuoteRequest): Promise<any> {
  return withRetry(async () => {
    const params = new URLSearchParams({
      inputMint: request.inputMint,
      outputMint: request.outputMint,
      amount: request.amount,
      slippageBps: String(request.slippageBps || 100),
      txVersion: "V0",
    });

    console.log(`[Raydium] Fetching quote: ${params.toString()}`);

    const response = await fetch(`${RAYDIUM_QUOTE_API}?${params}`, {
      signal: AbortSignal.timeout(10000),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Raydium] Quote error: ${response.status} - ${errorText}`);
      throw new Error(`Raydium quote failed: ${response.status}`);
    }

    const quoteData = await response.json();
    
    if (!quoteData.success) {
      const msg = quoteData.msg || 'Unknown error';
      throw new Error(`Raydium quote failed: ${msg}`);
    }

    console.log(`[Raydium] Quote received: ${quoteData.data.outputAmount} output for ${request.amount} input`);
    
    return quoteData;
  }, 'Raydium quote');
}

// Get Raydium swap transaction (fallback)
async function getRaydiumSwap(quoteResponse: any, wallet: string, priorityFee: number): Promise<any> {
  console.log(`[Raydium] Building swap transaction for ${wallet}`);

  const isInputSol = quoteResponse.data?.inputMint === SOL_MINT;
  const isOutputSol = quoteResponse.data?.outputMint === SOL_MINT;

  const response = await fetch(RAYDIUM_SWAP_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      swapResponse: quoteResponse,
      wallet: wallet,
      txVersion: "V0",
      wrapSol: isInputSol,
      unwrapSol: isOutputSol,
      computeUnitPriceMicroLamports: String(priorityFee),
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Raydium] Swap build error: ${response.status} - ${errorText}`);
    throw new Error(`Raydium swap build failed: ${response.status}`);
  }

  const swapData = await response.json();
  
  if (!swapData.success) {
    const msg = swapData.msg || 'Unknown error';
    if (msg === 'REQ_INPUT_ACCOUT_ERROR' || msg === 'REQ_INPUT_ACCOUNT_ERROR') {
      throw new Error(`You don't have this token in your wallet. The token may have already been sold or transferred.`);
    }
    throw new Error(`Raydium swap build failed: ${msg}`);
  }

  console.log(`[Raydium] Swap transaction built successfully`);
  
  return swapData;
}

// Get Pump.fun swap transaction (for bonding curve tokens)
async function getPumpFunSwap(
  action: "buy" | "sell",
  tokenMint: string,
  amount: number,
  wallet: string,
  slippageBps: number
): Promise<any> {
  console.log(`[Pump.fun] Building ${action} transaction for ${wallet}, amount: ${amount}`);

  const response = await fetch(PUMPFUN_TRADE_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      publicKey: wallet,
      action: action,
      mint: tokenMint,
      amount: amount,
      denominatedInSol: action === "buy" ? "true" : "false",
      slippage: slippageBps / 100, // Convert basis points to percentage
      priorityFee: 0.0005, // 0.0005 SOL priority fee
      pool: "pump",
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Pump.fun] Swap build error: ${response.status} - ${errorText}`);
    throw new Error(`Pump.fun swap build failed: ${response.status}`);
  }

  // Pump.fun returns the serialized transaction directly
  const transactionBuffer = await response.arrayBuffer();
  const base64Tx = btoa(String.fromCharCode(...new Uint8Array(transactionBuffer)));

  console.log(`[Pump.fun] Swap transaction built successfully`);
  
  return { swapTransaction: base64Tx, isPumpFun: true };
}

// Get dynamic priority fee
async function getPriorityFee(level: "low" | "medium" | "high" | "veryHigh"): Promise<number> {
  try {
    const response = await fetch(RAYDIUM_FEE_API, {
      signal: AbortSignal.timeout(5000),
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.success && data.data?.default) {
        switch (level) {
          case "veryHigh": return data.data.default.vh;
          case "high": return data.data.default.h;
          case "medium": return data.data.default.m;
          case "low": return Math.floor(data.data.default.m / 2);
        }
      }
    }
  } catch (error) {
    console.error("[Fee] Failed to fetch dynamic fees:", error);
  }
  
  return PRIORITY_FEES[level];
}

// Main handler
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize API keys from database on each request
    await initializeApiKeys();
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: TradeRequest = await req.json();
    console.log(`[Trade] Action: ${body.action}, User: ${user.id}`);

    switch (body.action) {
      // Validate token safety before trading
      case "validate": {
        if (!body.outputMint) {
          return new Response(
            JSON.stringify({ error: "Missing required field: outputMint" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const [validation, pumpFunCheck] = await Promise.all([
          validateToken(body.outputMint),
          isPumpFunToken(body.outputMint),
        ]);

        return new Response(
          JSON.stringify({
            success: true,
            validation,
            isPumpFun: pumpFunCheck.isPumpFun,
            bondingCurve: pumpFunCheck.bondingCurve,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "quote": {
        if (!body.inputMint || !body.outputMint || !body.amount) {
          return new Response(
            JSON.stringify({ error: "Missing required fields: inputMint, outputMint, amount" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Check if it's a Pump.fun token
        const pumpCheck = await isPumpFunToken(body.outputMint);
        
        let quoteData: any;
        let source = "jupiter";
        
        if (pumpCheck.isPumpFun) {
          // For Pump.fun tokens, calculate quote from bonding curve
          source = "pumpfun";
          const virtualSolReserves = pumpCheck.bondingCurve?.virtual_sol_reserves || 0;
          const virtualTokenReserves = pumpCheck.bondingCurve?.virtual_token_reserves || 0;
          const price = virtualSolReserves / virtualTokenReserves;
          const inputAmount = parseInt(body.amount);
          const outputAmount = Math.floor(inputAmount / price);
          
          quoteData = {
            inputAmount,
            outAmount: outputAmount,
            priceImpactPct: 1.5, // Estimate
            source: "pumpfun",
          };
        } else {
          // Try Jupiter first, fallback to Raydium
          try {
            quoteData = await getJupiterQuote({
              inputMint: body.inputMint,
              outputMint: body.outputMint,
              amount: body.amount,
              slippageBps: body.slippageBps,
            });
            source = "jupiter";
          } catch (jupiterError) {
            console.log("[Trade] Jupiter failed, trying Raydium...");
            try {
              const raydiumQuote = await getRaydiumQuote({
                inputMint: body.inputMint,
                outputMint: body.outputMint,
                amount: body.amount,
                slippageBps: body.slippageBps,
              });
              quoteData = {
                inputAmount: parseInt(body.amount),
                outAmount: raydiumQuote.data.outputAmount,
                priceImpactPct: raydiumQuote.data.priceImpactPct || 0,
                raydiumData: raydiumQuote,
              };
              source = "raydium";
            } catch (raydiumError) {
              throw new Error(`No route found. Jupiter: ${jupiterError}. Raydium: ${raydiumError}`);
            }
          }
        }

        return new Response(
          JSON.stringify({
            success: true,
            quote: {
              ...quoteData,
              slippageBps: body.slippageBps || 100,
              source,
            },
            quoteResponse: quoteData,
            isPumpFun: pumpCheck.isPumpFun,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "swap": {
        if (!body.quoteResponse || !body.userPublicKey) {
          return new Response(
            JSON.stringify({ error: "Missing required fields: quoteResponse, userPublicKey" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const priorityFee = await getPriorityFee(body.priorityLevel || "medium");
        console.log(`[Trade] Using priority fee: ${priorityFee}`);

        let swapData: any;
        
        if (body.isPumpFun && body.outputMint) {
          // Use Pump.fun for bonding curve tokens
          const amountInSol = parseInt(body.quoteResponse.inputAmount || body.amount || "0") / 1e9;
          swapData = await getPumpFunSwap(
            "buy",
            body.outputMint,
            amountInSol,
            body.userPublicKey,
            body.slippageBps || 100
          );
        } else if (body.quoteResponse.source === "raydium" || body.quoteResponse.raydiumData) {
          // Use Raydium
          swapData = await getRaydiumSwap(
            body.quoteResponse.raydiumData || body.quoteResponse,
            body.userPublicKey,
            priorityFee
          );
          const transactions = swapData.data || [];
          swapData = {
            swapTransaction: transactions[0]?.transaction,
            transactions: transactions.map((tx: any) => tx.transaction),
          };
        } else {
          // Use Jupiter
          swapData = await getJupiterSwap({
            quoteResponse: body.quoteResponse,
            userPublicKey: body.userPublicKey,
            priorityFee,
          });
        }

        return new Response(
          JSON.stringify({
            success: true,
            swapTransaction: swapData.swapTransaction,
            transactions: swapData.transactions,
            priorityFeeUsed: priorityFee,
            source: body.isPumpFun ? "pumpfun" : (body.quoteResponse.source || "jupiter"),
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "execute": {
        if (!body.inputMint || !body.outputMint || !body.amount || !body.userPublicKey) {
          return new Response(
            JSON.stringify({ 
              error: "Missing required fields: inputMint, outputMint, amount, userPublicKey" 
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // CRITICAL: Validate Solana address format before proceeding
        const isSolanaAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(body.outputMint);
        const isEthereumAddress = body.outputMint.startsWith('0x');
        
        if (isEthereumAddress || !isSolanaAddress) {
          console.log(`[Trade] Rejected non-Solana token address: ${body.outputMint}`);
          return new Response(
            JSON.stringify({ 
              success: false,
              error: "Invalid token: Only Solana tokens can be traded. This appears to be an Ethereum/BSC address."
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Step 1: Validate token safety
        const [validation, pumpCheck] = await Promise.all([
          validateToken(body.outputMint),
          isPumpFunToken(body.outputMint),
        ]);

        // Block if token is a confirmed honeypot
        if (validation.isHoneypot) {
          return new Response(
            JSON.stringify({
              success: false,
              error: "Token failed safety check: HONEYPOT DETECTED",
              validation,
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Warn if freeze authority is not revoked
        if (validation.freezeAuthority) {
          console.log(`[Trade] Warning: Token has freeze authority: ${validation.freezeAuthority}`);
        }

        // Step 2: Get quote - CRITICAL: Check Pump.fun FIRST for new tokens
        let quoteData: any;
        let source = "jupiter";
        let tradeablityError: string | null = null;
        
        // Always check Pump.fun first - new tokens are often not yet on Jupiter/Raydium
        if (pumpCheck.isPumpFun) {
          source = "pumpfun";
          const virtualSolReserves = pumpCheck.bondingCurve?.virtual_sol_reserves || 0;
          const virtualTokenReserves = pumpCheck.bondingCurve?.virtual_token_reserves || 0;
          
          if (virtualSolReserves > 0 && virtualTokenReserves > 0) {
            const price = virtualSolReserves / virtualTokenReserves;
            const inputAmount = parseInt(body.amount);
            const outputAmount = Math.floor(inputAmount / price);
            
            console.log(`[Pump.fun] Token is on bonding curve. Price: ${price}, Output: ${outputAmount}`);
            
            quoteData = {
              inputAmount,
              outAmount: outputAmount,
              priceImpactPct: 1.5,
            };
          } else {
            console.log(`[Pump.fun] Invalid bonding curve reserves, trying DEX...`);
            pumpCheck.isPumpFun = false; // Force fallback to DEX
          }
        }
        
        // Only try Jupiter/Raydium if NOT a Pump.fun token
        if (!pumpCheck.isPumpFun) {
          try {
            quoteData = await getJupiterQuote({
              inputMint: body.inputMint,
              outputMint: body.outputMint,
              amount: body.amount,
              slippageBps: body.slippageBps,
            });
            source = "jupiter";
          } catch (jupiterError: any) {
            const jupErrorMsg = jupiterError?.message || String(jupiterError);
            console.log(`[Trade] Jupiter failed: ${jupErrorMsg}, trying Raydium...`);
            
            // Check if token is simply not tradable on Jupiter
            if (jupErrorMsg.includes('TOKEN_NOT_TRADABLE') || jupErrorMsg.includes('not tradable')) {
              tradeablityError = `Token not yet available on Jupiter DEX. This is a very new token - try Pump.fun trading or wait for DEX listing.`;
            }
            
            try {
              const raydiumQuote = await getRaydiumQuote({
                inputMint: body.inputMint,
                outputMint: body.outputMint,
                amount: body.amount,
                slippageBps: body.slippageBps,
              });
              quoteData = {
                inputAmount: parseInt(body.amount),
                outAmount: raydiumQuote.data.outputAmount,
                priceImpactPct: raydiumQuote.data.priceImpactPct || 0,
                raydiumData: raydiumQuote,
              };
              source = "raydium";
              tradeablityError = null; // Raydium worked
            } catch (raydiumError: any) {
              const rayErrorMsg = raydiumError?.message || String(raydiumError);
              console.log(`[Trade] Raydium also failed: ${rayErrorMsg}`);
              
              // Provide user-friendly error messages based on failure type
              const isNotTradable = jupErrorMsg.includes('TOKEN_NOT_TRADABLE') || jupErrorMsg.includes('not tradable');
              const isNoRoute = rayErrorMsg.includes('ROUTE_NOT_FOUND');
              
              if (isNotTradable || isNoRoute) {
                // Only suggest Pump.fun if API check actually failed (not if it confirmed token isn't there)
                // AND the token shows signs of being very new (no DEX routes)
                if (pumpCheck.apiError && !pumpCheck.confirmedNotPumpFun) {
                  throw new Error(
                    `🔄 Token may still be on Pump.fun bonding curve but API verification failed. ` +
                    `This is a very new token that hasn't graduated to DEXs yet. ` +
                    `Try again in a few minutes or trade directly on pump.fun website.`
                  );
                }
                
                // Token is confirmed NOT on Pump.fun but still not tradeable on DEXs
                throw new Error(
                  `❌ Token not available for trading yet.\n\n` +
                  `This token exists but has no active trading routes on Jupiter or Raydium.\n\n` +
                  `Possible reasons:\n` +
                  `• Token liquidity pool is not yet indexed by DEX aggregators\n` +
                  `• Token may be on a different DEX (check DexScreener for exact pool)\n` +
                  `• Liquidity may have been recently added or removed\n\n` +
                  `💡 Try: Check DexScreener.com for the token's actual trading venue.`
                );
              }
              throw new Error(
                `⚠️ No trading route found. Token may have insufficient liquidity.\n` +
                `Jupiter: ${jupErrorMsg}\nRaydium: ${rayErrorMsg}`
              );
            }
          }
        }

        // Step 3: Get priority fee
        const priorityFee = await getPriorityFee(body.priorityLevel || "medium");

        // Step 4: Build swap transaction
        let swapData: any;
        
        if (pumpCheck.isPumpFun) {
          const amountInSol = parseInt(body.amount) / 1e9;
          swapData = await getPumpFunSwap(
            "buy",
            body.outputMint,
            amountInSol,
            body.userPublicKey,
            body.slippageBps || 100
          );
        } else if (source === "raydium") {
          swapData = await getRaydiumSwap(
            quoteData.raydiumData,
            body.userPublicKey,
            priorityFee
          );
          const transactions = swapData.data || [];
          swapData = {
            swapTransaction: transactions[0]?.transaction,
          };
        } else {
          swapData = await getJupiterSwap({
            quoteResponse: quoteData,
            userPublicKey: body.userPublicKey,
            priorityFee,
          });
        }

        // Step 5: Create pending position
        const inputAmountLamports = parseInt(body.amount);
        const outputAmountLamports = parseInt(quoteData.outAmount || quoteData.outputAmount);
        const inputAmountDecimal = inputAmountLamports / 1e9;
        const outputAmountDecimal = outputAmountLamports / (pumpCheck.isPumpFun ? 1e6 : 1e6);
        const entryPrice = inputAmountDecimal / outputAmountDecimal;

        const { data: position, error: posError } = await supabase
          .from("positions")
          .insert({
            user_id: user.id,
            token_address: body.outputMint,
            token_symbol: body.tokenSymbol || "TOKEN",
            token_name: body.tokenName || "Unknown Token",
            chain: "solana",
            entry_price: entryPrice,
            current_price: entryPrice,
            amount: outputAmountDecimal,
            entry_value: inputAmountDecimal,
            current_value: inputAmountDecimal,
            profit_take_percent: body.profitTakePercent || 100,
            stop_loss_percent: body.stopLossPercent || 20,
            status: "pending",
          })
          .select()
          .single();

        if (posError) {
          console.error("[Trade] Failed to create position:", posError);
        }

        return new Response(
          JSON.stringify({
            success: true,
            quote: {
              inputAmount: inputAmountLamports,
              outputAmount: outputAmountLamports,
              inputAmountDecimal,
              outputAmountDecimal,
              priceImpactPct: quoteData.priceImpactPct || 0,
              slippageBps: body.slippageBps || 100,
            },
            swapTransaction: swapData.swapTransaction,
            priorityFeeUsed: priorityFee,
            positionId: position?.id,
            source,
            isPumpFun: pumpCheck.isPumpFun,
            validation,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: "Invalid action. Use: validate, quote, swap, or execute" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error: any) {
    console.error("[Trade] Error:", error);
    
    // Map known errors to appropriate HTTP status codes
    const errorMessage = error.message || "Internal server error";
    let statusCode = 500;
    let errorCode = "INTERNAL_ERROR";
    
    // 4xx client errors (user/input issues)
    if (errorMessage.includes("ROUTE_NOT_FOUND") || 
        errorMessage.includes("No routes found") ||
        errorMessage.includes("insufficient liquidity")) {
      statusCode = 422;
      errorCode = "NO_ROUTE";
    } else if (errorMessage.includes("Invalid") || 
               errorMessage.includes("Missing") ||
               errorMessage.includes("required")) {
      statusCode = 400;
      errorCode = "INVALID_INPUT";
    } else if (errorMessage.includes("HONEYPOT") || 
               errorMessage.includes("not tradeable")) {
      statusCode = 422;
      errorCode = "UNTRADEABLE_TOKEN";
    } else if (errorMessage.includes("Unauthorized") || 
               errorMessage.includes("sign in")) {
      statusCode = 401;
      errorCode = "UNAUTHORIZED";
    } else if (errorMessage.includes("rejected") || 
               errorMessage.includes("cancelled")) {
      statusCode = 400;
      errorCode = "USER_REJECTED";
    } else if (errorMessage.includes("timeout") || 
               errorMessage.includes("Timeout")) {
      statusCode = 504;
      errorCode = "TIMEOUT";
    } else if (errorMessage.includes("rate limit") || 
               errorMessage.includes("429")) {
      statusCode = 429;
      errorCode = "RATE_LIMITED";
    }
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        errorCode,
        retryable: statusCode >= 500 || statusCode === 429,
      }),
      { status: statusCode, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
