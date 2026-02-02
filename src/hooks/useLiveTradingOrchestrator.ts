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

import { useCallback, useRef, useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useWallet } from '@/hooks/useWallet';
import { useWalletModal } from '@/hooks/useWalletModal';
import { useTradingEngine } from '@/hooks/useTradingEngine';
import { usePositions } from '@/hooks/usePositions';
import { useSniperSettings, SniperSettings } from '@/hooks/useSniperSettings';
import { useToast } from '@/hooks/use-toast';
import { useTokenStateManager } from '@/hooks/useTokenStateManager';
import { addBotLog } from '@/components/scanner/BotActivityLog';
import { isPlaceholderText } from '@/lib/formatters';
import { validateSwapRoute } from '@/lib/routeValidator';
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
  canBuy?: boolean;
  canSell?: boolean;
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

// Orchestrator state - executedTokens moved to ref for stable closure access
interface OrchestratorState {
  isExecuting: boolean;
  currentToken: string | null;
  pendingQueue: ApprovedToken[];
  lastTradeTime: number;
}

// Trade execution constants - these are intentional safety limits, not user-configurable
const TRADE_COOLDOWN_MS = 2000; // Minimum 2 seconds between trades (system limit)
const MAX_CONCURRENT_TRADES = 1; // Execute one at a time for wallet safety

export function useLiveTradingOrchestrator() {
  const { wallet, signAndSendTransaction, refreshBalance } = useWallet();
  const { openModal: openWalletModal } = useWalletModal();
  const tradingEngine = useTradingEngine();
  const { snipeToken, exitPosition, createConfig } = tradingEngine;
  const { createPosition, fetchPositions, openPositions } = usePositions();
  const { settings } = useSniperSettings();
  const { toast } = useToast();
  
  // CRITICAL: Persistent token state manager - survives restarts
  const {
    initialized: tokenStatesInitialized,
    canTradeToken,
    markTraded,
    markPending,
    markRejected,
  } = useTokenStateManager();

  const [state, setState] = useState<OrchestratorState>({
    isExecuting: false,
    currentToken: null,
    pendingQueue: [],
    lastTradeTime: 0,
  });

  const executingRef = useRef(false);
  const queueRef = useRef<ApprovedToken[]>([]);
  
  // CRITICAL: Use ref for executedTokens to prevent stale closure issues
  // This ensures deduplication works correctly across all callbacks
  const executedTokensRef = useRef<Set<string>>(new Set());
  
  // CRITICAL: Track active position addresses from database to prevent duplicate trades
  // This persists across sessions unlike executedTokensRef which is session-only
  const activePositionAddressesRef = useRef<Set<string>>(new Set());
  
  // Keep activePositionAddressesRef synced with database positions
  useEffect(() => {
    const addresses = new Set(openPositions.map(p => p.token_address.toLowerCase()));
    activePositionAddressesRef.current = addresses;
    console.log(`[Orchestrator] Synced ${addresses.size} active position addresses for deduplication`);
  }, [openPositions]);


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

    // CRITICAL: Pre-validate token is sellable before executing buy
    if (token.isTradeable === false || token.canBuy === false) {
      addBotLog({
        level: 'warning',
        category: 'trade',
        message: `⚠️ Skipped: ${token.symbol} (not tradeable)`,
        tokenSymbol: token.symbol,
        tokenAddress: token.address,
        details: `Token cannot be traded - rejected before execution`,
      });
      return { success: false, error: 'Token not tradeable' };
    }

    // Prepare trade context for logging
    const buyerPosText = token.buyerPosition ? `#${token.buyerPosition}` : 'N/A';
    const safetyScoreText = token.riskScore != null ? `${100 - token.riskScore}/100` : 'N/A';
    const liquidityText = token.liquidity ? `$${token.liquidity.toLocaleString()}` : 'N/A';

    addBotLog({
      level: 'info',
      category: 'trade',
      message: `🚀 Executing BUY: ${token.name} (${token.symbol})`,
      tokenSymbol: token.symbol,
      tokenAddress: token.address,
      details: `🪙 Token: ${token.name} (${token.symbol})\n💧 Liquidity: ${liquidityText} | 👤 Buyer Pos: ${buyerPosText} | 🛡️ Safety: ${safetyScoreText}\n⚙️ User Settings: ${settings.trade_amount} SOL | Slippage: ${settings.slippage_tolerance || 15}% | Priority: ${settings.priority} | TP: ${settings.profit_take_percentage}% | SL: ${settings.stop_loss_percentage}%`,
    });

    try {
      // Create trading config from user settings - NO HARDCODED VALUES
      // Use user's slippage tolerance, default to 15% for meme coins
      const slippage = settings.slippage_tolerance 
        ? settings.slippage_tolerance / 100 
        : 0.15;
      
      // Priority fee based on user's priority setting (in SOL)
      const priorityFeeMap: Record<string, number> = {
        turbo: 0.005,
        fast: 0.002,
        normal: 0.001,
      };
      
      const config = createConfig({
        buyAmount: settings.trade_amount,
        slippage,
        priorityFee: priorityFeeMap[settings.priority] || 0.001,
        maxRetries: 2, // System limit for faster failure detection
        riskFilters: {
          checkRugPull: true,
          checkHoneypot: true,
          checkMintAuthority: true,
          checkFreezeAuthority: true,
          // These should ideally come from admin settings, using sensible defaults
          maxOwnershipPercent: 50, // Allow higher ownership for new tokens
          minHolders: 5, // Allow tokens with fewer holders
        },
        // Pass user's TP/SL settings for position persistence
        profitTakePercent: settings.profit_take_percentage,
        stopLossPercent: settings.stop_loss_percentage,
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
          // PRIORITY: Use scanner token metadata (from pool scan) FIRST
          // This ensures position names match what user saw during discovery
          // Only fall back to trading engine metadata if scanner data is unavailable/placeholder
          // Use the unified isPlaceholderText from formatters for consistent detection
          
          // Scanner data (token.symbol/name) is from pool discovery - most reliable
          // Trading engine data (position.tokenSymbol/Name) may be from DexScreener enrichment
          const finalSymbol = !isPlaceholderText(token.symbol) ? token.symbol : 
            (!isPlaceholderText(position.tokenSymbol) ? position.tokenSymbol : token.symbol);
          const finalName = !isPlaceholderText(token.name) ? token.name : 
            (!isPlaceholderText(position.tokenName) ? position.tokenName : token.name);
          
          const savedPosition = await createPosition(
            token.address,
            finalSymbol,
            finalName,
            'solana',
            position.entryPrice,
            position.tokenAmount,
            settings.profit_take_percentage,
            settings.stop_loss_percentage
          );

          // Log comprehensive trade details with liquidity, safety, position info
          const entryValueUsd = position.entryPrice * position.tokenAmount;
          const buyerPosTextSuccess = token.buyerPosition ? `#${token.buyerPosition}` : 'N/A';
          const safetyScoreTextSuccess = token.riskScore != null ? `${100 - token.riskScore}/100` : 'N/A';
          const liquidityTextSuccess = token.liquidity ? `$${token.liquidity.toLocaleString()}` : 'N/A';
          const txHashFull = position.entryTxHash || '';
          
          addBotLog({
            level: 'success',
            category: 'trade',
            message: `✅ BUY FILLED: ${finalName} (${finalSymbol})`,
            tokenSymbol: finalSymbol,
            tokenAddress: token.address,
            details: `🪙 Token: ${finalName} (${finalSymbol})\n💧 Liquidity: ${liquidityTextSuccess} | 👤 Buyer Pos: ${buyerPosTextSuccess} | 🛡️ Safety: ${safetyScoreTextSuccess}\nEntry: $${position.entryPrice.toFixed(8)} | Tokens: ${position.tokenAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} | Value: $${entryValueUsd.toFixed(4)} | SOL: ${position.solSpent.toFixed(4)}\n🔗 TX: ${txHashFull}`,
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
      const buyerPosFail = token.buyerPosition ? `#${token.buyerPosition}` : 'N/A';
      const safetyFail = token.riskScore != null ? `${100 - token.riskScore}/100` : 'N/A';
      const liqFail = token.liquidity ? `$${token.liquidity.toLocaleString()}` : 'N/A';
      
      addBotLog({
        level: 'error',
        category: 'trade',
        message: `❌ BUY FAILED: ${token.name} (${token.symbol})`,
        tokenSymbol: token.symbol,
        tokenAddress: token.address,
        details: `🪙 Token: ${token.name} (${token.symbol})\n💧 Liquidity: ${liqFail} | 👤 Buyer Pos: ${buyerPosFail} | 🛡️ Safety: ${safetyFail}\n❗ Reason: ${errorMessage}\n⚙️ Attempted: ${settings.trade_amount} SOL | Slippage: ${settings.slippage_tolerance || 15}% | TP: ${settings.profit_take_percentage}% | SL: ${settings.stop_loss_percentage}%\n📍 Token: ${token.address}`,
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

      const tokenAddrLower = token.address.toLowerCase();
      
      // Skip if already executed - use ref for stable closure access
      if (executedTokensRef.current.has(token.address)) {
        continue;
      }
      
      // CRITICAL: Skip if token already has an active position in database
      // This prevents duplicate buys across sessions
      if (activePositionAddressesRef.current.has(tokenAddrLower)) {
        addBotLog({
          level: 'warning',
          category: 'trade',
          message: `⏭️ Skipped: ${token.symbol} (already in active positions)`,
          tokenSymbol: token.symbol,
          tokenAddress: token.address,
          details: 'Token already has an open position - skipping to avoid duplicate buy',
        });
        continue;
      }
      
      // CRITICAL: Check persistent token state - prevents duplicate trades across restarts
      if (tokenStatesInitialized && !canTradeToken(token.address)) {
        addBotLog({
          level: 'warning',
          category: 'trade',
          message: `⏭️ Skipped: ${token.symbol} (persistent state: TRADED/REJECTED)`,
          tokenSymbol: token.symbol,
          tokenAddress: token.address,
          details: 'Token already traded or rejected - skipping to avoid duplicate',
        });
        continue;
      }

      // Enforce cooldown
      const timeSinceLastTrade = Date.now() - state.lastTradeTime;
      if (timeSinceLastTrade < TRADE_COOLDOWN_MS) {
        await new Promise(r => setTimeout(r, TRADE_COOLDOWN_MS - timeSinceLastTrade));
      }

      // CRITICAL: Mandatory route validation before any trade decision
      // Check both Jupiter AND Raydium - block if no route on either
      addBotLog({
        level: 'info',
        category: 'trade',
        message: `🔍 Validating swap route: ${token.symbol}`,
        tokenSymbol: token.symbol,
        tokenAddress: token.address,
        details: 'Checking Jupiter and Raydium for active swap route...',
      });

      const routeValidation = await validateSwapRoute(token.address, {
        timeoutMs: 8000,
        checkBothParallel: true,
        checkIndexing: true,
      });

      // CRITICAL: Block tokens awaiting indexing - too new to trade safely
      if (routeValidation.isAwaitingIndexing) {
        addBotLog({
          level: 'warning',
          category: 'trade',
          message: `⏳ Awaiting indexing: ${token.symbol} - skipped`,
          tokenSymbol: token.symbol,
          tokenAddress: token.address,
          details: 'Token is too new and not yet indexed on DEX aggregators.\nWill retry once indexing completes.',
        });
        
        // Mark as PENDING for retry later when indexed
        await markPending(token.address, 'awaiting_indexing');
        executedTokensRef.current.add(token.address); // Prevent immediate retry
        continue;
      }

      if (!routeValidation.hasRoute) {
        addBotLog({
          level: 'warning',
          category: 'trade',
          message: `🚫 No route: ${token.symbol} - skipped`,
          tokenSymbol: token.symbol,
          tokenAddress: token.address,
          details: `Jupiter: ${routeValidation.jupiter ? '✓' : '✗'} | Raydium: ${routeValidation.raydium ? '✓' : '✗'}\n${routeValidation.error || 'No active swap route on either DEX'}`,
        });
        
        // Mark as PENDING for retry later
        await markPending(token.address, 'no_route');
        executedTokensRef.current.add(token.address); // Prevent immediate retry
        continue;
      }

      addBotLog({
        level: 'success',
        category: 'trade',
        message: `✓ Route found: ${token.symbol} via ${routeValidation.source}`,
        tokenSymbol: token.symbol,
        tokenAddress: token.address,
        details: `Jupiter: ${routeValidation.jupiter ? '✓' : '✗'} | Raydium: ${routeValidation.raydium ? '✓' : '✗'} | Indexed: ✓`,
      });

      setState(prev => ({
        ...prev,
        isExecuting: true,
        currentToken: token.address,
      }));

      const result = await executeSingleTrade(token, settings!);

      // Mark as executed regardless of result - use ref for immediate effect
      executedTokensRef.current.add(token.address);
      setState(prev => ({
        ...prev,
        lastTradeTime: Date.now(),
      }));

      if (result.success) {
        // CRITICAL: Mark token as TRADED in persistent state (survives restarts)
        await markTraded(token.address, result.txHash, result.positionId);
        
        toast({
          title: `🎯 Trade Executed: ${token.symbol}`,
          description: `Entry: $${result.entryPrice?.toFixed(8)} | TX: ${result.txHash?.slice(0, 8)}...`,
        });
        
        // Refresh balance after trade
        refreshBalance();
        fetchPositions();
      } else {
        // Check if failure is due to liquidity/route issue - mark as PENDING for retry
        const isLiquidityIssue = result.error?.toLowerCase().includes('no route') || 
          result.error?.toLowerCase().includes('no liquidity') ||
          result.error?.toLowerCase().includes('insufficient liquidity');
        
        if (isLiquidityIssue) {
          await markPending(token.address, 'no_route');
        } else {
          await markRejected(token.address, result.error?.slice(0, 100) || 'unknown_error');
        }
        
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
  }, [validatePrerequisites, state.lastTradeTime, settings, executeSingleTrade, toast, refreshBalance, fetchPositions, openWalletModal, tokenStatesInitialized, canTradeToken, markTraded, markPending, markRejected]);

  /**
   * Queue approved tokens for execution
   */
  const queueTokens = useCallback((tokens: ApprovedToken[]) => {
    // Filter out already executed, queued, OR having active positions
    const newTokens = tokens.filter(t => {
      const addrLower = t.address.toLowerCase();
      
      // Skip if already executed this session
      if (executedTokensRef.current.has(t.address)) return false;
      
      // Skip if already in queue
      if (queueRef.current.some(q => q.address === t.address)) return false;
      
      // CRITICAL: Skip if token already has an active position in database
      if (activePositionAddressesRef.current.has(addrLower)) {
        console.log(`[Orchestrator] Filtered out ${t.symbol} - already in active positions`);
        return false;
      }
      
      // CRITICAL: Check persistent token state - prevents duplicate trades across restarts
      if (tokenStatesInitialized && !canTradeToken(t.address)) {
        console.log(`[Orchestrator] Filtered out ${t.symbol} - persistent state: TRADED/REJECTED`);
        return false;
      }
      
      return true;
    });

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
  }, [processQueue, tokenStatesInitialized, canTradeToken]);

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
    executedTokensRef.current.clear();
  }, []);

  return {
    // State
    isExecuting: state.isExecuting,
    currentToken: state.currentToken,
    queueLength: queueRef.current.length,
    executedCount: executedTokensRef.current.size,
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
