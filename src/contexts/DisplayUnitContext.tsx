import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { useSolPrice } from '@/hooks/useSolPrice';

export type DisplayUnit = 'SOL' | 'USD';

interface DisplayUnitContextType {
  displayUnit: DisplayUnit;
  setDisplayUnit: (unit: DisplayUnit) => void;
  toggleDisplayUnit: () => void;
  solPrice: number;
  solPriceLoading: boolean;
  // Conversion utilities
  usdToSol: (usd: number) => number;
  solToUsd: (sol: number) => number;
  // Formatting with proper visual hierarchy
  formatPrimaryValue: (usdValue: number, options?: FormatOptions) => string;
  formatSecondaryValue: (usdValue: number) => string;
  // Format SOL-native values (input is SOL, not USD) - shows SOL primary, USD secondary
  formatSolNativeValue: (solValue: number, options?: FormatOptions) => { primary: string; secondary: string };
  formatDualValue: (usdValue: number, options?: FormatOptions) => { primary: string; secondary: string };
}

interface FormatOptions {
  showSign?: boolean;
  decimals?: number;
}

const DisplayUnitContext = createContext<DisplayUnitContextType | undefined>(undefined);

export function DisplayUnitProvider({ children }: { children: React.ReactNode }) {
  const [displayUnit, setDisplayUnit] = useState<DisplayUnit>('SOL');
  const { price: solPrice, loading: solPriceLoading } = useSolPrice(60000);

  const toggleDisplayUnit = useCallback(() => {
    setDisplayUnit(prev => prev === 'SOL' ? 'USD' : 'SOL');
  }, []);

  const usdToSol = useCallback((usd: number): number => {
    if (!solPrice || solPrice <= 0) return 0;
    return usd / solPrice;
  }, [solPrice]);

  const solToUsd = useCallback((sol: number): number => {
    return sol * solPrice;
  }, [solPrice]);

  // Format SOL value with appropriate precision
  const formatSolValue = useCallback((sol: number, showSign = false): string => {
    const sign = showSign && sol >= 0 ? '+' : '';
    const absVal = Math.abs(sol);
    
    if (absVal >= 1000) {
      return `${sign}${sol.toFixed(1)} SOL`;
    }
    if (absVal >= 100) {
      return `${sign}${sol.toFixed(2)} SOL`;
    }
    if (absVal >= 1) {
      return `${sign}${sol.toFixed(3)} SOL`;
    }
    if (absVal >= 0.001) {
      return `${sign}${sol.toFixed(4)} SOL`;
    }
    if (absVal > 0) {
      return `${sign}${sol.toFixed(6)} SOL`;
    }
    return showSign ? '+0.00 SOL' : '0.00 SOL';
  }, []);

  // Format USD value with appropriate precision
  const formatUsdValue = useCallback((usd: number, showSign = false): string => {
    const sign = showSign && usd >= 0 ? '+' : '';
    const absVal = Math.abs(usd);
    
    if (absVal >= 1000000) {
      return `${sign}$${(usd / 1000000).toFixed(2)}M`;
    }
    if (absVal >= 1000) {
      return `${sign}$${(usd / 1000).toFixed(2)}K`;
    }
    if (absVal >= 1) {
      return `${sign}$${usd.toFixed(2)}`;
    }
    if (absVal >= 0.01) {
      return `${sign}$${usd.toFixed(3)}`;
    }
    if (absVal > 0) {
      return `${sign}$${usd.toFixed(4)}`;
    }
    return showSign ? '+$0.00' : '$0.00';
  }, []);

  // Primary value based on current display unit
  const formatPrimaryValue = useCallback((usdValue: number, options?: FormatOptions): string => {
    const showSign = options?.showSign ?? false;
    
    if (displayUnit === 'SOL') {
      const solValue = usdToSol(usdValue);
      return formatSolValue(solValue, showSign);
    }
    return formatUsdValue(usdValue, showSign);
  }, [displayUnit, usdToSol, formatSolValue, formatUsdValue]);

  // Secondary value (opposite of primary)
  const formatSecondaryValue = useCallback((usdValue: number): string => {
    if (displayUnit === 'SOL') {
      return `(${formatUsdValue(usdValue)})`;
    }
    const solValue = usdToSol(usdValue);
    return `(${formatSolValue(solValue)})`;
  }, [displayUnit, usdToSol, formatSolValue, formatUsdValue]);

  // Get both values for dual display
  const formatDualValue = useCallback((usdValue: number, options?: FormatOptions): { primary: string; secondary: string } => {
    const showSign = options?.showSign ?? false;
    
    if (displayUnit === 'SOL') {
      const solValue = usdToSol(usdValue);
      return {
        primary: formatSolValue(solValue, showSign),
        secondary: formatUsdValue(usdValue, showSign),
      };
    }
    const solValue = usdToSol(usdValue);
    return {
      primary: formatUsdValue(usdValue, showSign),
      secondary: formatSolValue(solValue, showSign),
    };
  }, [displayUnit, usdToSol, formatSolValue, formatUsdValue]);

  // Format SOL-native values (input is SOL, not USD)
  // Always shows SOL as primary and USD as secondary for consistency
  const formatSolNativeValue = useCallback((solValue: number, options?: FormatOptions): { primary: string; secondary: string } => {
    const showSign = options?.showSign ?? false;
    const usdValue = solToUsd(solValue);
    return {
      primary: formatSolValue(solValue, showSign),
      secondary: formatUsdValue(usdValue, showSign),
    };
  }, [solToUsd, formatSolValue, formatUsdValue]);

  const value = useMemo(() => ({
    displayUnit,
    setDisplayUnit,
    toggleDisplayUnit,
    solPrice,
    solPriceLoading,
    usdToSol,
    solToUsd,
    formatPrimaryValue,
    formatSecondaryValue,
    formatDualValue,
    formatSolNativeValue,
  }), [
    displayUnit,
    toggleDisplayUnit,
    solPrice,
    solPriceLoading,
    usdToSol,
    solToUsd,
    formatPrimaryValue,
    formatSecondaryValue,
    formatDualValue,
    formatSolNativeValue,
  ]);

  return (
    <DisplayUnitContext.Provider value={value}>
      {children}
    </DisplayUnitContext.Provider>
  );
}

export function useDisplayUnit() {
  const context = useContext(DisplayUnitContext);
  if (!context) {
    throw new Error('useDisplayUnit must be used within DisplayUnitProvider');
  }
  return context;
}
