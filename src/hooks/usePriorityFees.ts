import { useState, useCallback, useEffect, useRef } from 'react';
import { Connection } from '@solana/web3.js';

export type PriorityLevel = 'low' | 'medium' | 'high' | 'veryHigh';

export interface PriorityFeeEstimate {
  low: number;
  medium: number;
  high: number;
  veryHigh: number;
  recommended: PriorityLevel;
  lastUpdated: Date;
}

// Default fees in microLamports
const DEFAULT_FEES: Record<PriorityLevel, number> = {
  low: 1_000,       // 0.000001 SOL
  medium: 10_000,   // 0.00001 SOL
  high: 100_000,    // 0.0001 SOL
  veryHigh: 500_000, // 0.0005 SOL
};

// Multipliers for different priority levels relative to median
const PRIORITY_MULTIPLIERS: Record<PriorityLevel, number> = {
  low: 0.5,
  medium: 1.0,
  high: 2.5,
  veryHigh: 5.0,
};

export function usePriorityFees(connection?: Connection) {
  const [estimate, setEstimate] = useState<PriorityFeeEstimate>({
    ...DEFAULT_FEES,
    recommended: 'medium',
    lastUpdated: new Date(),
  });
  const [loading, setLoading] = useState(false);
  const lastFetchRef = useRef<number>(0);

  const fetchPriorityFees = useCallback(async () => {
    // Throttle: only fetch every 30 seconds
    const now = Date.now();
    if (now - lastFetchRef.current < 30_000) {
      return estimate;
    }

    if (!connection) {
      return estimate;
    }

    setLoading(true);
    lastFetchRef.current = now;

    try {
      // Use RPC method to get recent priority fees
      // @ts-ignore - method exists but not in types
      const recentFees = await connection.getRecentPrioritizationFees();

      if (!recentFees || recentFees.length === 0) {
        console.log('[Priority] No recent fees, using defaults');
        return estimate;
      }

      // Extract fees and sort
      const fees = recentFees
        .map((f: any) => f.prioritizationFee)
        .filter((f: number) => f > 0)
        .sort((a: number, b: number) => a - b);

      if (fees.length === 0) {
        return estimate;
      }

      // Calculate percentiles
      const median = fees[Math.floor(fees.length * 0.5)];
      const p75 = fees[Math.floor(fees.length * 0.75)];
      const p90 = fees[Math.floor(fees.length * 0.9)];

      // Calculate fees based on network conditions
      const newEstimate: PriorityFeeEstimate = {
        low: Math.max(median * PRIORITY_MULTIPLIERS.low, DEFAULT_FEES.low),
        medium: Math.max(median * PRIORITY_MULTIPLIERS.medium, DEFAULT_FEES.medium),
        high: Math.max(p75 * PRIORITY_MULTIPLIERS.high, DEFAULT_FEES.high),
        veryHigh: Math.max(p90 * PRIORITY_MULTIPLIERS.veryHigh, DEFAULT_FEES.veryHigh),
        recommended: determineRecommended(median, p90),
        lastUpdated: new Date(),
      };

      console.log(`[Priority] Updated fees - Median: ${median}, P90: ${p90}, Recommended: ${newEstimate.recommended}`);
      setEstimate(newEstimate);
      return newEstimate;
    } catch (error) {
      console.error('[Priority] Failed to fetch priority fees:', error);
      return estimate;
    } finally {
      setLoading(false);
    }
  }, [connection, estimate]);

  // Determine recommended priority based on network congestion
  const determineRecommended = (median: number, p90: number): PriorityLevel => {
    const congestionRatio = p90 / median;

    if (congestionRatio > 10) {
      // Very congested network
      return 'veryHigh';
    } else if (congestionRatio > 5) {
      // Moderately congested
      return 'high';
    } else if (congestionRatio > 2) {
      // Normal congestion
      return 'medium';
    } else {
      // Low congestion
      return 'low';
    }
  };

  // Get fee for a specific priority level
  const getFeeForLevel = useCallback((level: PriorityLevel): number => {
    return Math.floor(estimate[level]);
  }, [estimate]);

  // Get fee in SOL for display
  const getFeeInSol = useCallback((level: PriorityLevel): string => {
    const feeMicroLamports = estimate[level];
    const feeLamports = feeMicroLamports / 1_000_000;
    const feeSol = feeLamports / 1e9;
    
    if (feeSol < 0.000001) {
      return '<0.000001';
    }
    return feeSol.toFixed(6);
  }, [estimate]);

  // Get estimated compute units for a typical swap
  const getEstimatedTxFee = useCallback((level: PriorityLevel, computeUnits: number = 200_000): number => {
    const feePerUnit = estimate[level];
    // Fee = (computeUnits * feePerUnit) / 1_000_000 (convert from microLamports)
    return Math.floor((computeUnits * feePerUnit) / 1_000_000);
  }, [estimate]);

  // Auto-refresh fees periodically
  useEffect(() => {
    if (!connection) return;

    // Initial fetch
    fetchPriorityFees();

    // Refresh every minute
    const interval = setInterval(fetchPriorityFees, 60_000);

    return () => clearInterval(interval);
  }, [connection, fetchPriorityFees]);

  return {
    estimate,
    loading,
    fetchPriorityFees,
    getFeeForLevel,
    getFeeInSol,
    getEstimatedTxFee,
    recommended: estimate.recommended,
  };
}

// Standalone function for use in edge functions
export function calculatePriorityFee(
  level: PriorityLevel,
  recentMedian?: number
): number {
  if (!recentMedian || recentMedian <= 0) {
    return DEFAULT_FEES[level];
  }

  return Math.max(
    Math.floor(recentMedian * PRIORITY_MULTIPLIERS[level]),
    DEFAULT_FEES[level]
  );
}
