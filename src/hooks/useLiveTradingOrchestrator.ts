/**
 * Live Trading Orchestrator
 * 
 * This hook unifies the entire trading flow for live trading:
 * 1. Receives approved tokens from auto-sniper evaluation
 * 2. Validates wallet connection and balance
 * 3. Executes trades using the 3-stage trading engine
 * 4. Persists positions to the database
 * 5. Monitors for auto-exit conditions
 * 
 * This is the SINGLE ENTRY POINT for all live trades.
 */

import { useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useWallet } from '@/hooks/useWallet';
import { useWalletModal } from '@/hooks/useWalletModal';
import { useTradingEngine } from '@/hooks/useTradingEngine';
import { usePositions } from '@/hooks/usePositions';
import { useSniperSettings, SniperSettings } from '@/hooks/useSniperSettings';
import { useToast } from '@/hooks/use-toast';
import { addBotLog } from '@/components/scanner/BotActivityLog';
import type { TradingFlowResult } from '@/lib/trading-engine';

// Approved token from auto-sniper
export interface ApprovedToken {
  address: string;
  symbol: string;
  name: string;
  liquidity: number;
  riskScore: number;
  priceUsd?: number;
  buyerPosition?: number | null;
  isPumpFun?: boolean;
  isTradeable?: boolean;
  source?: string;
}

// Trade execution result
export interface LiveTradeResult {
  success: boolean;
  positionId?: string;
  txHash?: string;
  entryPrice?: number;
  tokenAmount?: number;
  solSpent?: number;
  error?: string;
  source?: 'trading-engine' | 'edge-function';
}

// Orchestrator state
interface OrchestratorState {
  isExecuting: boolean;
  currentToken: string | null;
  pendingQueue: ApprovedToken[];
  executedTokens: Set<string>;
  lastTradeTime: number;
}

const TRADE_COOLDOWN_MS = 3000; // Minimum 3 seconds between trades
const MAX_CONCURRENT_TRADES = 1; // Execute one at a time for safety

export function useLiveTradingOrchestrator() {
  const { wallet, signAndSendTransaction, refreshBalance } = useWallet();
  const { openModal: openWalletModal } = useWalletModal();
  const tradingEngine = useTradingEngine();
  const { snipeToken, exitPosition, createConfig } = tradingEngine;
  const { createPosition, fetchPositions } = usePositions();
  const { settings } = useSniperSettings();
  const { toast } = useToast();

  const [state, setState] = useState<OrchestratorState>({
    isExecuting: false,
    currentToken: null,
    pendingQueue: [],
    executedTokens: new Set(),
    lastTradeTime: 0,
  });

  const executingRef = useRef(false);
  const queueRef = useRef<ApprovedToken[]>([]);

  /**
   * Validate prerequisites for live trading
   */
  const validatePrerequisites = useCallback((): { valid: boolean; error?: string } => {
    // Check wallet connection
    if (!wallet.isConnected || wallet.network !== 'solana' || !wallet.address) {
      return { valid: false, error: 'Solana wallet not connected' };
    }

    // Check wallet balance
    const balanceNum = parseFloat(wallet.balance || '0');
    const tradeAmount = settings?.trade_amount || 0.1;
    
    if (balanceNum < tradeAmount + 0.01) { // +0.01 for fees
      return { valid: false, error: `Insufficient balance: ${balanceNum.toFixed(4)} SOL < ${(tradeAmount + 0.01).toFixed(4)} SOL` };
    }

    // Check settings
    if (!settings) {
      return { valid: false, error: 'Trading settings not loaded' };
    }

    return { valid: true };
  }, [wallet, settings]);

  /**
   * Execute a single trade with the trading engine
   */
  const executeSingleTrade = useCallback(async (
    token: ApprovedToken,
    settings: SniperSettings
  ): Promise<LiveTradeResult> => {
    if (!wallet.address) {
      return { success: false, error: 'No wallet address' };
    }

    addBotLog({
      level: 'info',
      category: 'trade',
      message: `Executing live trade: ${token.symbol}`,
      tokenSymbol: token.symbol,
      tokenAddress: token.address,
      details: `Amount: ${settings.trade_amount} SOL | Slippage: 15%`,
    });

    try {
      // Create trading config from user settings
      const config = createConfig({
        buyAmount: settings.trade_amount,
        slippage: 0.15, // 15% slippage for meme coins
        priorityFee: settings.priority === 'turbo' ? 0.005 : settings.priority === 'fast' ? 0.002 : 0.001,
        maxRetries: 3,
        riskFilters: {
          checkRugPull: true,
          checkHoneypot: true,
          checkMintAuthority: true,
          checkFreezeAuthority: true,
          maxOwnershipPercent: 30,
          minHolders: 10,
        },
      });

      // Execute via 3-stage trading engine
      const result = await snipeToken(
        token.address,
        wallet.address,
        signAndSendTransaction,
        config
      );

      if (!result) {
        return { success: false, error: 'Trade engine returned null' };
      }

      if (result.status !== 'SUCCESS') {
        return { 
          success: false, 
          error: result.error || `Trade failed: ${result.status}`,
          source: 'trading-engine',
        };
      }

      // CRITICAL: Persist position to database
      const position = result.position;
      if (position) {
        try {
          const savedPosition = await createPosition(
            token.address,
            position.tokenSymbol || token.symbol,
            token.name,
            'solana',
            position.entryPrice,
            position.tokenAmount,
            settings.profit_take_percentage,
            settings.stop_loss_percentage
          );

          addBotLog({
            level: 'success',
            category: 'trade',
            message: `Position created: ${token.symbol}`,
            tokenSymbol: token.symbol,
            details: `Entry: $${position.entryPrice.toFixed(8)} | Amount: ${position.tokenAmount.toFixed(2)}`,
          });

          return {
            success: true,
            positionId: savedPosition?.id,
            txHash: position.entryTxHash,
            entryPrice: position.entryPrice,
            tokenAmount: position.tokenAmount,
            solSpent: position.solSpent,
            source: 'trading-engine',
          };
        } catch (dbError) {
          console.error('[Orchestrator] Failed to save position:', dbError);
          // Trade succeeded but DB failed - still return success
          return {
            success: true,
            txHash: position.entryTxHash,
            entryPrice: position.entryPrice,
            tokenAmount: position.tokenAmount,
            solSpent: position.solSpent,
            error: 'Position save failed - check manually',
            source: 'trading-engine',
          };
        }
      }

      return { success: true, source: 'trading-engine' };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      addBotLog({
        level: 'error',
        category: 'trade',
        message: `Trade failed: ${token.symbol}`,
        tokenSymbol: token.symbol,
        details: errorMessage,
      });

      return { success: false, error: errorMessage, source: 'trading-engine' };
    }
  }, [wallet.address, signAndSendTransaction, snipeToken, createPosition, createConfig]);

  /**
   * Process the pending trade queue
   */
  const processQueue = useCallback(async () => {
    if (executingRef.current || queueRef.current.length === 0) {
      return;
    }

    const prerequisites = validatePrerequisites();
    if (!prerequisites.valid) {
      console.log('[Orchestrator] Prerequisites not met:', prerequisites.error);
      
      // If wallet not connected, prompt to connect
      if (prerequisites.error?.includes('wallet')) {
        openWalletModal();
      }
      return;
    }

    executingRef.current = true;
    
    while (queueRef.current.length > 0) {
      const token = queueRef.current.shift();
      if (!token) break;

      // Skip if already executed
      if (state.executedTokens.has(token.address)) {
        continue;
      }

      // Enforce cooldown
      const timeSinceLastTrade = Date.now() - state.lastTradeTime;
      if (timeSinceLastTrade < TRADE_COOLDOWN_MS) {
        await new Promise(r => setTimeout(r, TRADE_COOLDOWN_MS - timeSinceLastTrade));
      }

      setState(prev => ({
        ...prev,
        isExecuting: true,
        currentToken: token.address,
      }));

      const result = await executeSingleTrade(token, settings!);

      // Mark as executed regardless of result
      setState(prev => ({
        ...prev,
        executedTokens: new Set(prev.executedTokens).add(token.address),
        lastTradeTime: Date.now(),
      }));

      if (result.success) {
        toast({
          title: `🎯 Trade Executed: ${token.symbol}`,
          description: `Entry: $${result.entryPrice?.toFixed(8)} | TX: ${result.txHash?.slice(0, 8)}...`,
        });
        
        // Refresh balance after trade
        refreshBalance();
        fetchPositions();
      } else {
        toast({
          title: `Trade Failed: ${token.symbol}`,
          description: result.error || 'Unknown error',
          variant: 'destructive',
        });
      }
    }

    setState(prev => ({
      ...prev,
      isExecuting: false,
      currentToken: null,
    }));
    
    executingRef.current = false;
  }, [validatePrerequisites, state, settings, executeSingleTrade, toast, refreshBalance, fetchPositions, openWalletModal]);

  /**
   * Queue approved tokens for execution
   */
  const queueTokens = useCallback((tokens: ApprovedToken[]) => {
    // Filter out already executed or queued tokens
    const newTokens = tokens.filter(t => 
      !state.executedTokens.has(t.address) &&
      !queueRef.current.some(q => q.address === t.address)
    );

    if (newTokens.length === 0) return;

    queueRef.current.push(...newTokens);
    setState(prev => ({
      ...prev,
      pendingQueue: [...queueRef.current],
    }));

    addBotLog({
      level: 'info',
      category: 'evaluate',
      message: `Queued ${newTokens.length} tokens for execution`,
      details: newTokens.map(t => t.symbol).join(', '),
    });

    // Start processing
    processQueue();
  }, [state.executedTokens, processQueue]);

  /**
   * Execute immediate trade (bypass queue)
   */
  const executeImmediate = useCallback(async (token: ApprovedToken): Promise<LiveTradeResult> => {
    const prerequisites = validatePrerequisites();
    if (!prerequisites.valid) {
      if (prerequisites.error?.includes('wallet')) {
        openWalletModal();
      }
      return { success: false, error: prerequisites.error };
    }

    return executeSingleTrade(token, settings!);
  }, [validatePrerequisites, settings, executeSingleTrade, openWalletModal]);

  /**
   * Clear the execution queue
   */
  const clearQueue = useCallback(() => {
    queueRef.current = [];
    setState(prev => ({
      ...prev,
      pendingQueue: [],
    }));
  }, []);

  /**
   * Reset executed tokens (allow re-trading)
   */
  const resetExecutedTokens = useCallback(() => {
    setState(prev => ({
      ...prev,
      executedTokens: new Set(),
    }));
  }, []);

  return {
    // State
    isExecuting: state.isExecuting,
    currentToken: state.currentToken,
    queueLength: queueRef.current.length,
    executedCount: state.executedTokens.size,
    engineStatus: tradingEngine.status,

    // Actions
    queueTokens,
    executeImmediate,
    clearQueue,
    resetExecutedTokens,

    // Validation
    validatePrerequisites,
  };
}
