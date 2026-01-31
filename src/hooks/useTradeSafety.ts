/**
 * Trade Safety Hook
 * Pre-buy validation with liquidity check and sell simulation
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { fetchJupiterQuote } from '@/lib/jupiterQuote';
import {
  PreBuyValidationResult,
  LiquidityCheckResult,
  SellSimulationResult,
  TradeWarning,
  calculateDynamicSlippage,
  createTradeWarnings,
} from '@/lib/tradeSafety';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const SELL_TAX_THRESHOLD = 50; // Block if >= 50%

// Minimum amount for sell simulation (0.001 SOL worth)
const SIMULATION_AMOUNT_LAMPORTS = '1000000'; // 0.001 SOL in lamports

export function useTradeSafety() {
  const [validating, setValidating] = useState(false);
  const [lastValidation, setLastValidation] = useState<PreBuyValidationResult | null>(null);
  const { toast } = useToast();

  /**
   * Check if a swap route exists (Jupiter or Raydium)
   */
  const checkLiquidity = useCallback(async (
    tokenMint: string,
    amount: string = SIMULATION_AMOUNT_LAMPORTS
  ): Promise<LiquidityCheckResult> => {
    // Try Jupiter first
    const jupiterResult = await fetchJupiterQuote({
      inputMint: SOL_MINT,
      outputMint: tokenMint,
      amount,
      slippageBps: 100,
    });

    if (jupiterResult.ok) {
      return {
        hasRoute: true,
        source: 'jupiter',
        priceImpact: jupiterResult.quote?.priceImpactPct,
      };
    }

    // Try Raydium as fallback
    try {
      const raydiumUrl = `https://transaction-v1.raydium.io/compute/swap-base-in?inputMint=${SOL_MINT}&outputMint=${tokenMint}&amount=${amount}&slippageBps=100&txVersion=V0`;
      const raydiumRes = await fetch(raydiumUrl, { signal: AbortSignal.timeout(8000) });

      if (raydiumRes.ok) {
        const raydiumData = await raydiumRes.json();
        if (raydiumData?.success) {
          return {
            hasRoute: true,
            source: 'raydium',
            priceImpact: raydiumData.data?.priceImpactPct,
          };
        }
      }
    } catch (err) {
      console.log('[TradeSafety] Raydium check failed:', err);
    }

    // Check if it's a Pump.fun token
    try {
      const pumpRes = await fetch(`https://frontend-api.pump.fun/coins/${tokenMint}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (pumpRes.ok) {
        const pumpData = await pumpRes.json();
        if (pumpData?.mint === tokenMint && !pumpData.complete) {
          return {
            hasRoute: true,
            source: 'pumpfun',
          };
        }
      }
    } catch (err) {
      console.log('[TradeSafety] Pump.fun check failed:', err);
    }

    return {
      hasRoute: false,
      source: 'none',
      error: jupiterResult.ok === false ? jupiterResult.message : 'No route found',
    };
  }, []);

  /**
   * Simulate a sell to detect honeypots and high taxes
   * Returns whether the token can be sold
   */
  const simulateSell = useCallback(async (
    tokenMint: string
  ): Promise<SellSimulationResult> => {
    // Use a small test amount for simulation
    const testAmount = '100000'; // Small amount in base units

    // Try Jupiter sell quote
    const jupiterResult = await fetchJupiterQuote({
      inputMint: tokenMint,
      outputMint: SOL_MINT,
      amount: testAmount,
      slippageBps: 500, // 5% for simulation
    });

    if (jupiterResult.ok) {
      const quote = jupiterResult.quote;
      const priceImpact = quote?.priceImpactPct || 0;
      
      // Estimate tax from quote if available
      // High price impact with low amounts often indicates sell tax
      const estimatedTax = priceImpact > 10 ? priceImpact : 0;

      return {
        canSell: true,
        estimatedTax,
        priceImpact,
      };
    }

    // Try Raydium as fallback
    try {
      const raydiumUrl = `https://transaction-v1.raydium.io/compute/swap-base-in?inputMint=${tokenMint}&outputMint=${SOL_MINT}&amount=${testAmount}&slippageBps=500&txVersion=V0`;
      const raydiumRes = await fetch(raydiumUrl, { signal: AbortSignal.timeout(8000) });

      if (raydiumRes.ok) {
        const raydiumData = await raydiumRes.json();
        if (raydiumData?.success) {
          return {
            canSell: true,
            priceImpact: raydiumData.data?.priceImpactPct || 0,
          };
        }
      }
    } catch (err) {
      console.log('[TradeSafety] Raydium sell simulation failed:', err);
    }

    // If Jupiter gave NO_ROUTE, check RugCheck for honeypot indicators
    if (jupiterResult.ok === false && jupiterResult.kind === 'NO_ROUTE') {
      try {
        const rugCheckRes = await fetch(`https://api.rugcheck.xyz/v1/tokens/${tokenMint}/report`, {
          signal: AbortSignal.timeout(5000),
        });

        if (rugCheckRes.ok) {
          const rugData = await rugCheckRes.json();
          
          // Check for honeypot risks
          const risks = rugData?.risks || [];
          const honeypotRisk = risks.find((r: any) => 
            r.name?.toLowerCase().includes('honeypot') ||
            r.description?.toLowerCase().includes('cannot sell')
          );

          if (honeypotRisk) {
            return {
              canSell: false,
              error: 'Honeypot detected by RugCheck',
            };
          }
        }
      } catch (err) {
        console.log('[TradeSafety] RugCheck failed:', err);
      }
    }

    return {
      canSell: false,
      error: jupiterResult.ok === false ? jupiterResult.message : 'Sell simulation failed',
    };
  }, []);

  /**
   * Full pre-buy validation
   */
  const validatePreBuy = useCallback(async (
    tokenMint: string,
    options?: {
      skipSellSimulation?: boolean;
      amount?: string;
    }
  ): Promise<PreBuyValidationResult> => {
    setValidating(true);

    try {
      const warnings: TradeWarning[] = [];

      // Step 1: Check if buy route exists
      console.log('[TradeSafety] Checking buy route for', tokenMint);
      const liquidityCheck = await checkLiquidity(tokenMint, options?.amount);

      if (!liquidityCheck.hasRoute) {
        const result: PreBuyValidationResult = {
          approved: false,
          liquidityCheck,
          warnings: createTradeWarnings({ hasRoute: false }),
          blockReason: 'ILLIQUID',
          blockMessage: 'No swap route available. Token may be illiquid or not yet listed.',
        };
        setLastValidation(result);
        setValidating(false);
        return result;
      }

      // Step 2: Simulate sell (unless skipped)
      let sellSimulation: SellSimulationResult | undefined;
      
      if (!options?.skipSellSimulation) {
        console.log('[TradeSafety] Simulating sell for', tokenMint);
        sellSimulation = await simulateSell(tokenMint);

        if (!sellSimulation.canSell) {
          const result: PreBuyValidationResult = {
            approved: false,
            liquidityCheck,
            sellSimulation,
            warnings: createTradeWarnings({ 
              hasRoute: true, 
              sellSimulationFailed: true 
            }),
            blockReason: 'HONEYPOT',
            blockMessage: sellSimulation.error || 'Sell simulation failed - token may be a honeypot',
          };
          setLastValidation(result);
          setValidating(false);
          return result;
        }

        // Check for high sell tax
        if (sellSimulation.estimatedTax && sellSimulation.estimatedTax >= SELL_TAX_THRESHOLD) {
          const result: PreBuyValidationResult = {
            approved: false,
            liquidityCheck,
            sellSimulation,
            warnings: [{
              type: 'honeypot_suspected',
              message: `High sell tax detected: ${sellSimulation.estimatedTax.toFixed(1)}%`,
              severity: 'error',
            }],
            blockReason: 'HIGH_TAX',
            blockMessage: `Sell tax is ${sellSimulation.estimatedTax.toFixed(1)}% (threshold: ${SELL_TAX_THRESHOLD}%)`,
          };
          setLastValidation(result);
          setValidating(false);
          return result;
        }
      }

      // Step 3: Check for price impact and liquidity warnings
      const tradeWarnings = createTradeWarnings({
        hasRoute: true,
        priceImpact: liquidityCheck.priceImpact || sellSimulation?.priceImpact,
        liquidity: liquidityCheck.liquidity,
      });

      const result: PreBuyValidationResult = {
        approved: true,
        liquidityCheck,
        sellSimulation,
        warnings: tradeWarnings,
      };

      setLastValidation(result);
      setValidating(false);
      return result;

    } catch (err: any) {
      console.error('[TradeSafety] Validation error:', err);
      
      const result: PreBuyValidationResult = {
        approved: false,
        liquidityCheck: { hasRoute: false, source: 'none', error: err.message },
        warnings: [],
        blockReason: 'NO_ROUTE',
        blockMessage: err.message || 'Validation failed',
      };
      
      setLastValidation(result);
      setValidating(false);
      return result;
    }
  }, [checkLiquidity, simulateSell]);

  /**
   * Quick liquidity check without full validation
   */
  const quickLiquidityCheck = useCallback(async (
    tokenMint: string
  ): Promise<{ hasRoute: boolean; source: string }> => {
    const result = await checkLiquidity(tokenMint);
    return { hasRoute: result.hasRoute, source: result.source };
  }, [checkLiquidity]);

  return {
    validating,
    lastValidation,
    validatePreBuy,
    quickLiquidityCheck,
    checkLiquidity,
    simulateSell,
  };
}
