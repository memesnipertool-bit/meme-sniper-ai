import React, { forwardRef, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/layout/AppLayout";
import LiquidityBotPanel from "@/components/trading/LiquidityBotPanel";
import SniperDecisionPanel from "@/components/trading/SniperDecisionPanel";
import { TradeSignalPanel } from "@/components/trading/TradeSignalPanel";
import LiquidityMonitor from "@/components/scanner/LiquidityMonitor";
import PerformancePanel from "@/components/scanner/PerformancePanel";

import BotActivityLog, { addBotLog, clearBotLogs } from "@/components/scanner/BotActivityLog";
import RecoveryControls from "@/components/scanner/RecoveryControls";
import ApiHealthWidget from "@/components/scanner/ApiHealthWidget";
import PaidApiAlert from "@/components/scanner/PaidApiAlert";
import BotPreflightCheck from "@/components/scanner/BotPreflightCheck";
import ExitPreviewModal from "@/components/scanner/ExitPreviewModal";
import NoRouteExitModal from "@/components/scanner/NoRouteExitModal";
import StatsCard from "@/components/StatsCard";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTokenScanner } from "@/hooks/useTokenScanner";
import { useSniperSettings } from "@/hooks/useSniperSettings";
import { useAutoSniper, TokenData } from "@/hooks/useAutoSniper";
import { useAutoExit } from "@/hooks/useAutoExit";
import { useDemoAutoExit } from "@/hooks/useDemoAutoExit";
import { useLiquidityRetryWorker } from "@/hooks/useLiquidityRetryWorker";
import { useWallet } from "@/hooks/useWallet";
import { useWalletModal } from "@/hooks/useWalletModal";
import { useTradeExecution, SOL_MINT, type TradeParams, type PriorityLevel } from "@/hooks/useTradeExecution";
import { useTradingEngine } from "@/hooks/useTradingEngine";
import { usePositions } from "@/hooks/usePositions";
import { useToast } from "@/hooks/use-toast";
import { useNotifications } from "@/hooks/useNotifications";
import { useAppMode } from "@/contexts/AppModeContext";
import { useDemoPortfolio } from "@/contexts/DemoPortfolioContext";
import { useBotContext } from "@/contexts/BotContext";
import { useSolPrice } from "@/hooks/useSolPrice";
import { reconcilePositionsWithPools } from "@/lib/positionMetadataReconciler";
import { fetchDexScreenerTokenMetadata } from "@/lib/dexscreener";
import { isPlaceholderText } from "@/lib/formatters";
import { Wallet, TrendingUp, Zap, Activity, AlertTriangle, X, FlaskConical, Coins, RotateCcw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ToastAction } from "@/components/ui/toast";

const Scanner = forwardRef<HTMLDivElement, object>(function Scanner(_props, ref) {
  const { tokens, loading, scanTokens, errors, apiErrors, isDemo, cleanup, lastScanStats } = useTokenScanner();
  const { settings, saving, saveSettings, updateField } = useSniperSettings();
  const { evaluateTokens, result: sniperResult, loading: sniperLoading } = useAutoSniper();
  const { startAutoExitMonitor, stopAutoExitMonitor, isMonitoring } = useAutoExit();
  const {
    waitingPositions,
    checking: checkingLiquidity,
    fetchWaitingPositions,
    runRetryCheck: runLiquidityRetryCheck,
    moveToWaitingForLiquidity,
    moveBackToOpen,
    checkAndExecutePosition: tryExecuteWaitingPosition,
    startRetryWorker: startLiquidityRetryWorker,
    stopRetryWorker: stopLiquidityRetryWorker,
    isRunning: isLiquidityRetryRunning,
  } = useLiquidityRetryWorker();
  const { executeTrade, sellPosition } = useTradeExecution();
  const { snipeToken, exitPosition, status: engineStatus, isExecuting: engineExecuting } = useTradingEngine();
  const { wallet, connectPhantom, disconnect, signAndSendTransaction, refreshBalance } = useWallet();
  const { openModal: openWalletModal } = useWalletModal();
  const { openPositions: realOpenPositions, closedPositions: realClosedPositions, fetchPositions, closePosition: markPositionClosed } = usePositions();
  const { toast } = useToast();
  const { addNotification } = useNotifications();
  const { mode } = useAppMode();
  
  // Real-time SOL price
  const { price: solPrice } = useSolPrice();
  
  // Demo portfolio context
  const {
    demoBalance,
    deductBalance,
    addBalance,
    addDemoPosition,
    updateDemoPosition,
    closeDemoPosition,
    openDemoPositions,
    closedDemoPositions,
    totalValue: demoTotalValue,
    totalPnL: demoTotalPnL,
    totalPnLPercent: demoTotalPnLPercent,
    resetDemoPortfolio,
    // Performance stats
    winRate: demoWinRate,
    avgPnL: demoAvgPnL,
    bestTrade: demoBestTrade,
    worstTrade: demoWorstTrade,
    totalTrades: demoTotalTrades,
    wins: demoWins,
    losses: demoLosses,
  } = useDemoPortfolio();
  
  // Demo auto-exit monitor
  const { startDemoMonitor, stopDemoMonitor } = useDemoAutoExit();

  // Bot context for persistent state across navigation
  const { 
    botState, 
    isRunning,
    startBot, 
    stopBot, 
    pauseBot, 
    resumeBot,
    toggleAutoEntry,
    toggleAutoExit,
    setScanSpeed: setBotScanSpeed,
    recordTrade,
  } = useBotContext();

  // Local aliases from bot context for easier access
  const isBotActive = botState.isBotActive;
  const autoEntryEnabled = botState.autoEntryEnabled;
  const autoExitEnabled = botState.autoExitEnabled;
  const scanSpeed = botState.scanSpeed;
  const isPaused = botState.isPaused;
  
  const [showApiErrors, setShowApiErrors] = useState(true);
  
  // Confirmation dialogs
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showBotActivateConfirm, setShowBotActivateConfirm] = useState(false);
  const [showSwitchToLiveConfirm, setShowSwitchToLiveConfirm] = useState(false);
  const [showCleanupConfirm, setShowCleanupConfirm] = useState(false);
  const [cleaningUpPositions, setCleaningUpPositions] = useState(false);
  const [pendingBotAction, setPendingBotAction] = useState<boolean | null>(null);
  
  // Exit Preview Modal state
  const [exitPreviewPosition, setExitPreviewPosition] = useState<any | null>(null);
  const [showExitPreview, setShowExitPreview] = useState(false);
  
  // Sync Positions state
  const [syncingPositions, setSyncingPositions] = useState(false);
  
  // No Route Exit Modal state
  const [noRoutePosition, setNoRoutePosition] = useState<any | null>(null);
  const [showNoRouteModal, setShowNoRouteModal] = useState(false);
  
  // Get setMode from AppModeContext
  const { setMode } = useAppMode();
  
  // Refs for tracking
  const lastSniperRunRef = useRef<number>(0);
  const processedTokensRef = useRef<Set<string>>(new Set());
  const liveTradeInFlightRef = useRef(false);
  
  // CRITICAL: Separate ref for tokens that have been TRADED (never cleared during bot session)
  // This prevents the same token from being bought multiple times
  const tradedTokensRef = useRef<Set<string>>(new Set());

  // Use demo or real positions based on mode
  // CRITICAL: Reconcile position metadata with pool data to ensure token names match
  const rawOpenPositions = isDemo ? openDemoPositions : realOpenPositions;
  const openPositions = useMemo(() => {
    // Convert tokens to pool data format for reconciliation
    const poolData = tokens.map(t => ({
      address: t.address,
      symbol: t.symbol,
      name: t.name,
    }));
    return reconcilePositionsWithPools(rawOpenPositions, poolData);
  }, [rawOpenPositions, tokens]);
  
  const closedPositions = isDemo ? closedDemoPositions : realClosedPositions;

  const fallbackSolPrice = Number.isFinite(solPrice) && solPrice > 0 ? solPrice : 150;

  const decimalToBaseUnits = useCallback((amountDecimal: number, mint: string) => {
    const decimals = mint === SOL_MINT ? 9 : 6;
    const fixed = Math.max(0, amountDecimal).toFixed(decimals);
    const [whole, frac = ""] = fixed.split(".");
    return BigInt(`${whole}${frac}`).toString();
  }, []);

  // Handler to open the exit preview modal instead of exiting directly
  const handleOpenExitPreview = useCallback((positionId: string, currentPrice: number) => {
    if (isDemo) {
      closeDemoPosition(positionId, currentPrice, "manual");
      const position = openDemoPositions.find((p) => p.id === positionId);
      if (position) {
        const pnlValueUsd = (currentPrice - position.entry_price) * position.amount;
        addBalance((settings?.trade_amount || 0) + (pnlValueUsd / fallbackSolPrice));
        toast({
          title: "Position Closed",
          description: `${position.token_symbol} manually closed`,
        });
      }
      return;
    }

    if (!wallet.isConnected || wallet.network !== "solana" || !wallet.address) {
      toast({
        title: "Wallet Required",
        description: "Connect a Solana wallet to exit live trades.",
        variant: "destructive",
      });
      openWalletModal();
      return;
    }

    const position = realOpenPositions.find((p) => p.id === positionId);
    if (!position) {
      toast({
        title: "Position not found",
        description: "This position is no longer active. Refreshing…",
      });
      fetchPositions(true);
      return;
    }

    // Open the exit preview modal
    setExitPreviewPosition({
      ...position,
      current_price: currentPrice,
    });
    setShowExitPreview(true);
  }, [
    isDemo,
    closeDemoPosition,
    openDemoPositions,
    addBalance,
    settings?.trade_amount,
    toast,
    wallet.isConnected,
    wallet.network,
    wallet.address,
    realOpenPositions,
    fetchPositions,
    fallbackSolPrice,
    openWalletModal,
  ]);

  // Actual exit execution - called from modal
  const handleConfirmExitFromModal = useCallback(async (positionId: string, amountToSell: number, currentPrice: number) => {
    const position = realOpenPositions.find((p) => p.id === positionId);
    if (!position || !wallet.address) return;

    const safeExitPrice = Number.isFinite(currentPrice) && currentPrice > 0
      ? currentPrice
      : (position.current_price ?? position.entry_price);

    // Use the on-chain balance passed from the modal
    const tokenAmountToSell = amountToSell;

    // Use 3-stage engine for Jupiter exit (better routing)
    addBotLog({
      level: 'info',
      category: 'trade',
      message: 'Exiting position via Jupiter',
      tokenSymbol: position.token_symbol,
      tokenAddress: position.token_address,
      details: `Selling ${tokenAmountToSell.toFixed(6)} tokens`,
    });

    const showForceCloseToast = (title: string, description: string) => {
      toast({
        title,
        description,
        duration: 15000,
        variant: "destructive",
        action: (
          <ToastAction
            altText="Force close"
            onClick={async () => {
              const closed = await markPositionClosed(positionId, safeExitPrice);
              if (closed) {
                toast({
                  title: "Position Marked Closed",
                  description: `${position.token_symbol} removed from active positions`,
                });
                await fetchPositions(true);
              } else {
                toast({
                  title: "Force Close Failed",
                  description: "Couldn't update the position status. Please try again.",
                  variant: "destructive",
                });
              }
            }}
          >
            Force Close
          </ToastAction>
        ),
      });
    };

    try {
      const result = await exitPosition(
        position.token_address,
        tokenAmountToSell,
        wallet.address,
        (tx) => signAndSendTransaction(tx),
        { slippage: 0.15 } // 15% slippage for exits
      );

      if (result.success) {
        // Confirm, then verify remaining balance before closing.
        // Prevents closing DB position if only a partial sell happened.
        let confirmed = true;
        try {
          const { data: confirmData } = await supabase.functions.invoke('confirm-transaction', {
            body: { signature: result.txHash, action: 'sell' },
          });
          confirmed = Boolean((confirmData as any)?.confirmed ?? true);
        } catch {
          // ignore
        }

        if (!confirmed) {
          toast({
            title: 'Exit Pending Confirmation',
            description: 'Transaction was submitted but not confirmed yet. Try again in a few seconds.',
            variant: 'destructive',
          });
          await fetchPositions(true);
          return;
        }

        let remainingBalance: number | null = null;
        try {
          const { data: meta2 } = await supabase.functions.invoke('token-metadata', {
            body: { mint: position.token_address, owner: wallet.address },
          });
          const bal = Number((meta2 as any)?.balanceUi);
          if (Number.isFinite(bal)) remainingBalance = bal;
        } catch {
          // ignore
        }

        const DUST = 1e-6;
        if (remainingBalance !== null && remainingBalance > DUST) {
          await supabase
            .from('positions')
            .update({ amount: remainingBalance, updated_at: new Date().toISOString() })
            .eq('id', positionId);

          toast({
            title: 'Partial Sell Detected',
            description: `Wallet still holds ${remainingBalance.toFixed(6)} ${position.token_symbol}. Position kept open.`,
            variant: 'destructive',
          });

          await fetchPositions(true);
          refreshBalance();
          return;
        }

        // IMPORTANT: A successful on-chain sell does NOT automatically update our positions table.
        // Mark the position closed so it is removed from Active Trades immediately.
        // CRITICAL FIX: Pass the transaction hash so it's recorded in the database
        const closed = await markPositionClosed(positionId, safeExitPrice, result.txHash);

        if (closed) {
          addBotLog({
            level: 'success',
            category: 'trade',
            message: 'Position closed successfully',
            tokenSymbol: position.token_symbol,
            details: `Received ${result.solReceived?.toFixed(4)} SOL | TX: ${result.txHash?.slice(0, 12)}...`,
          });
          
          // Log to trade_history for Transaction History display
          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              await supabase.from('trade_history').insert({
                user_id: user.id,
                token_address: position.token_address,
                token_symbol: position.token_symbol,
                token_name: position.token_name,
                trade_type: 'sell',
                amount: tokenAmountToSell,
                price_sol: result.solReceived && tokenAmountToSell > 0 ? (result.solReceived / tokenAmountToSell) : null,
                price_usd: safeExitPrice,
                status: 'confirmed',
                tx_hash: result.txHash,
              });
            }
          } catch (historyErr) {
            console.error('Failed to log sell to trade_history:', historyErr);
          }
        } else {
          addBotLog({
            level: 'warning',
            category: 'trade',
            message: 'Swap succeeded but failed to update position',
            tokenSymbol: position.token_symbol,
            details: 'Use Force Close to remove it from Active Trades',
          });

          showForceCloseToast(
            "Exit completed, but position is still open",
            "The swap went through, but the app couldn't mark it closed. Force close it?"
          );
        }

        // Force refresh to reconcile any background polling / realtime ordering
        await fetchPositions(true);
        refreshBalance();
        setTimeout(() => refreshBalance(), 8000);
        return;
      }

      const errorMessage = result.error || "Exit failed";
      const shouldOfferForceClose =
        errorMessage.includes("don't have this token") ||
        errorMessage.includes("already been sold") ||
        errorMessage.includes("REQ_INPUT") ||
        errorMessage.includes("NO_ROUTE") ||
        errorMessage.toLowerCase().includes("no route") ||
        errorMessage.toLowerCase().includes("no liquidity");

      if (shouldOfferForceClose) {
        showForceCloseToast(
          "Token Not Found or No Route",
          "This position may have been sold externally or has no liquidity. Mark it as closed?"
        );
      } else {
        toast({
          title: "Error closing position",
          description: errorMessage,
          variant: "destructive",
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const shouldOfferForceClose =
        message.includes("don't have this token") ||
        message.includes("already been sold") ||
        message.includes("REQ_INPUT") ||
        message.includes("NO_ROUTE") ||
        message.toLowerCase().includes("no route") ||
        message.toLowerCase().includes("no liquidity");

      if (shouldOfferForceClose) {
        showForceCloseToast(
          "Token Not Found or No Route",
          "This position may have been sold externally or has no liquidity. Mark it as closed?"
        );
      } else {
        toast({
          title: "Error closing position",
          description: message,
          variant: "destructive",
        });
      }
    }
  }, [
    realOpenPositions,
    wallet.address,
    exitPosition,
    signAndSendTransaction,
    fetchPositions,
    refreshBalance,
    markPositionClosed,
    toast,
  ]);

  // Calculate stats based on mode
  const totalValue = useMemo(() => {
    if (isDemo) {
      return demoTotalValue;
    }
    return realOpenPositions.reduce((sum, p) => sum + p.current_value, 0);
  }, [isDemo, demoTotalValue, realOpenPositions]);
  
  const totalPnL = useMemo(() => {
    if (isDemo) {
      return demoTotalPnL;
    }
    return realOpenPositions.reduce((sum, p) => sum + (p.profit_loss_value || 0), 0);
  }, [isDemo, demoTotalPnL, realOpenPositions]);
  
  const totalPnLPercent = useMemo(() => {
    if (isDemo) {
      return demoTotalPnLPercent;
    }
    const entryTotal = realOpenPositions.reduce((sum, p) => sum + p.entry_value, 0);
    return entryTotal > 0 ? (totalPnL / entryTotal) * 100 : 0;
  }, [isDemo, demoTotalPnLPercent, realOpenPositions, totalPnL]);

  // Resume monitors when navigating back to Scanner with bot still active
  // CRITICAL: Also start auto-exit when there are open positions in live mode
  useEffect(() => {
    if (isDemo) {
      // Demo mode: only run demo monitor when bot is active
      if (isBotActive && !isPaused) {
        startDemoMonitor(5000);
      }
    } else {
      // Live mode: ALWAYS run auto-exit monitor when there are open positions OR bot is active with autoExit
      const hasOpenLivePositions = realOpenPositions.length > 0;
      const hasWaitingPositions = waitingPositions.length > 0;
      const shouldRunAutoExit = hasOpenLivePositions || (isBotActive && !isPaused && autoExitEnabled);
      
      if (shouldRunAutoExit && wallet.isConnected) {
        console.log(`[Scanner] Starting auto-exit monitor: ${realOpenPositions.length} open positions, bot=${isBotActive}, autoExit=${autoExitEnabled}`);
        startAutoExitMonitor(15000); // Check every 15 seconds for faster response
      }
      
      // Start liquidity retry worker if there are waiting positions
      if (hasWaitingPositions && wallet.isConnected) {
        startLiquidityRetryWorker(30000); // Check every 30 seconds
      }
    }
    
    return () => {
      // Don't stop bot on unmount - just stop monitors (bot state persists)
      stopDemoMonitor();
      stopAutoExitMonitor();
      stopLiquidityRetryWorker();
    };
  }, [isBotActive, isPaused, isDemo, autoExitEnabled, startDemoMonitor, stopDemoMonitor, startAutoExitMonitor, stopAutoExitMonitor, realOpenPositions.length, waitingPositions.length, wallet.isConnected, startLiquidityRetryWorker, stopLiquidityRetryWorker]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  // Auto-scan on mount
  useEffect(() => {
    if (settings?.min_liquidity && !isPaused) {
      scanTokens(settings.min_liquidity);
    }
  }, [settings?.min_liquidity]);

  // Periodic scanning based on speed - optimized intervals
  useEffect(() => {
    if (isPaused) return;
    
    // Demo mode uses faster intervals since no real API calls
    const intervals = isDemo 
      ? { slow: 20000, normal: 10000, fast: 5000 }
      : { slow: 60000, normal: 30000, fast: 15000 };
    
    const interval = setInterval(() => {
      if (settings?.min_liquidity) {
        scanTokens(settings.min_liquidity);
      }
    }, intervals[scanSpeed]);
    
    return () => clearInterval(interval);
  }, [scanSpeed, isPaused, settings?.min_liquidity, scanTokens, isDemo]);

  // Log scan stats to bot activity when they update
  useEffect(() => {
    if (!lastScanStats || !isBotActive) return;
    
    const { total, tradeable, stages } = lastScanStats;
    
    // Build stage summary (Raydium-only pipeline - no bonding stage)
    const stageParts: string[] = [];
    if (stages.lpLive > 0) stageParts.push(`🏊 ${stages.lpLive} LP Live`);
    if (stages.indexing > 0) stageParts.push(`⏳ ${stages.indexing} Indexing`);
    if (stages.listed > 0) stageParts.push(`✅ ${stages.listed} Listed`);
    
    addBotLog({
      level: tradeable > 0 ? 'success' : 'info',
      category: 'scan',
      message: `🔍 Pool Discovery: ${tradeable}/${total} tradeable`,
      details: stageParts.length > 0 
        ? `Pool Status: ${stageParts.join(' | ')}\nSources: GeckoTerminal, Birdeye, DexScreener` 
        : 'Sources: GeckoTerminal, Birdeye, DexScreener',
    });
  }, [lastScanStats, isBotActive]);

  // Log API errors with specific context so BotActivityLog can show helpful messages
  useEffect(() => {
    if (apiErrors.length === 0 || !isBotActive) return;
    
    // Dedupe by API type to avoid log spam
    const loggedTypes = new Set<string>();
    
    apiErrors.forEach(error => {
      if (loggedTypes.has(error.apiType)) return;
      loggedTypes.add(error.apiType);
      
      // Create descriptive message that includes API name for pattern matching
      const apiName = error.apiName || error.apiType || 'Unknown API';
      const errorCode = error.errorMessage?.match(/\d{3}/)?.[0] || '';
      
      // Build message with API name for regex matching
      let message = `${apiName} ${errorCode}`.trim();
      if (error.errorMessage?.includes('fallback')) {
        message += ' using fallback';
      }
      
      addBotLog({
        level: 'warning',
        category: 'system',
        message,
        details: error.errorMessage,
      });
    });
  }, [apiErrors, isBotActive]);

  // ============================================
  // PRODUCTION-GRADE BOT EVALUATION LOOP
  // Runs continuously while bot is active
  // ============================================
  
  // Continuous evaluation interval ref
  const evaluationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // Clear processed tokens periodically to allow re-evaluation of old tokens
  useEffect(() => {
    if (!isBotActive || isPaused) return;
    
    const cleanupInterval = setInterval(() => {
      const oldSize = processedTokensRef.current.size;
      if (oldSize > 100) {
        const tokensArray = Array.from(processedTokensRef.current);
        processedTokensRef.current = new Set(tokensArray.slice(-50));
        addBotLog({
          level: 'info',
          category: 'system',
          message: `Cleared ${oldSize - 50} old tokens from cache`,
        });
      }
    }, 120000);
    
    return () => clearInterval(cleanupInterval);
  }, [isBotActive, isPaused]);
  
  // Main evaluation function - extracted for reuse
  // Bot can run if active and not paused - autoEntryEnabled only controls NEW trade entries
  const runBotEvaluation = useCallback(async () => {
    // Bot must be active to run evaluations, but autoEntry only gates new trades
    if (!isBotActive || tokens.length === 0 || !settings) {
      return;
    }
    
    // If autoEntry is disabled, skip new trade evaluations (but bot can still run for other features)
    if (!autoEntryEnabled) {
      return;
    }
    
    // Filter for tokens we haven't processed yet AND haven't traded
    // tradedTokensRef is NEVER cleared during bot session - prevents duplicate buys
    const unseenTokens = tokens.filter(t => 
      !processedTokensRef.current.has(t.address) && 
      !tradedTokensRef.current.has(t.address)
    );

    if (unseenTokens.length === 0) {
      // No new tokens - this is normal, just wait for next scan
      return;
    }

    const blacklist = new Set(settings.token_blacklist || []);
    const candidates = unseenTokens.filter((t) => {
      if (!t.address) return false;
      if (blacklist.has(t.address)) return false;
      if (t.symbol?.toUpperCase() === 'SOL' && t.address !== SOL_MINT) return false;
      if (t.canSell === false) return false;
      // Double-check against traded tokens
      if (tradedTokensRef.current.has(t.address)) return false;
      return true;
    });

    if (candidates.length === 0) return;

    const batchSize = isDemo ? 10 : 20;
    const batch = candidates.slice(0, batchSize);

    const tokenData: TokenData[] = batch.map(t => ({
      address: t.address,
      name: t.name,
      symbol: t.symbol,
      chain: t.chain,
      liquidity: t.liquidity,
      liquidityLocked: t.liquidityLocked,
      lockPercentage: t.lockPercentage,
      buyerPosition: t.buyerPosition,
      riskScore: t.riskScore,
      categories: [],
      priceUsd: t.priceUsd,
      isPumpFun: t.isPumpFun,
      isTradeable: t.isTradeable,
      canBuy: t.canBuy,
      canSell: t.canSell,
      source: t.source,
      safetyReasons: t.safetyReasons,
    }));

    addBotLog({ 
      level: 'info', 
      category: 'evaluate', 
      message: `Evaluating ${tokenData.length} new tokens`,
      details: tokenData.map(t => `${t.symbol} (${t.source || 'unknown'})`).join(', '),
    });

    // Demo mode execution
    if (isDemo) {
      batch.forEach(t => processedTokensRef.current.add(t.address));
      
      // Use more lenient matching for demo mode
      const targetPositions = settings.target_buyer_positions || [1, 2, 3, 4, 5];
      const minLiq = settings.min_liquidity || 5;
      const maxRisk = settings.max_risk_score || 70;
      
      const approvedToken = tokenData.find(t => 
        // Check buyer position OR allow if position is unknown (null)
        (t.buyerPosition === null || (t.buyerPosition && targetPositions.includes(t.buyerPosition))) && 
        t.riskScore < maxRisk &&
        t.liquidity >= minLiq &&
        t.isTradeable !== false && // Must be tradeable
        t.canBuy !== false && // Must be buyable
        t.canSell !== false // CRITICAL: Must be sellable to avoid stuck positions
      );
      
      if (approvedToken && settings.trade_amount && demoBalance >= settings.trade_amount) {
        // CRITICAL: Mark token as traded BEFORE execution to prevent race conditions
        tradedTokensRef.current.add(approvedToken.address);
        
        deductBalance(settings.trade_amount);
        const tradeAmountInDollars = settings.trade_amount * solPrice;
        const entryPrice = approvedToken.priceUsd || 0.0001;
        const amount = tradeAmountInDollars / entryPrice;
        
        const newPosition = addDemoPosition({
          token_address: approvedToken.address,
          token_symbol: approvedToken.symbol,
          token_name: approvedToken.name,
          chain: approvedToken.chain,
          entry_price: entryPrice,
          current_price: entryPrice,
          amount,
          entry_value: tradeAmountInDollars,
          current_value: tradeAmountInDollars,
          profit_loss_percent: 0,
          profit_loss_value: 0,
          profit_take_percent: settings.profit_take_percentage,
          stop_loss_percent: settings.stop_loss_percentage,
          status: 'open',
          exit_reason: null,
          exit_price: null,
          exit_tx_id: null,
          closed_at: null,
        });
        
        addBotLog({
          level: 'success',
          category: 'trade',
          message: `Demo trade executed: ${approvedToken.symbol}`,
          tokenSymbol: approvedToken.symbol,
          details: `Entry: $${entryPrice.toFixed(6)} | Amount: ${settings.trade_amount} SOL`,
        });
        
        toast({
          title: '🎯 Demo Trade Executed!',
          description: `Bought ${approvedToken.symbol} at $${entryPrice.toFixed(6)}`,
        });
        
        // Simulate price movement
        setTimeout(() => {
          const priceChange = (Math.random() - 0.3) * 0.5;
          const newPrice = entryPrice * (1 + priceChange);
          const newValue = amount * newPrice;
          const pnlPercent = priceChange * 100;
          const pnlValue = newValue - tradeAmountInDollars;
          
          updateDemoPosition(newPosition.id, {
            current_price: newPrice,
            current_value: newValue,
            profit_loss_percent: pnlPercent,
            profit_loss_value: pnlValue,
          });
          
          if (pnlPercent >= settings.profit_take_percentage) {
            closeDemoPosition(newPosition.id, newPrice, 'take_profit');
            addBalance(settings.trade_amount + (pnlValue / solPrice));
            toast({ title: '💰 Take Profit Hit!', description: `Closed ${approvedToken.symbol} at +${pnlPercent.toFixed(1)}%` });
          } else if (pnlPercent <= -settings.stop_loss_percentage) {
            closeDemoPosition(newPosition.id, newPrice, 'stop_loss');
            addBalance(settings.trade_amount + (pnlValue / solPrice));
            toast({ title: '🛑 Stop Loss Hit', description: `Closed ${approvedToken.symbol} at ${pnlPercent.toFixed(1)}%`, variant: 'destructive' });
          }
        }, 5000 + Math.random() * 10000);
      } else if (approvedToken && demoBalance < (settings.trade_amount || 0)) {
        addBotLog({ level: 'warning', category: 'trade', message: 'Insufficient demo balance' });
      }
      return;
    }

    // Live mode execution
    if (!wallet.isConnected || wallet.network !== 'solana' || !wallet.address) {
      addBotLog({ level: 'warning', category: 'trade', message: 'Connect wallet to enable live trading' });
      return;
    }

    const balanceSol = parseFloat(String(wallet.balance || '').replace(/[^\d.]/g, '')) || 0;
    const tradeAmountSol = settings.trade_amount || 0;
    const feeBufferSol = 0.01;

    if (tradeAmountSol <= 0 || balanceSol < tradeAmountSol + feeBufferSol) {
      if (balanceSol < tradeAmountSol + feeBufferSol) {
        addBotLog({ 
          level: 'warning', 
          category: 'trade', 
          message: 'Insufficient SOL balance',
          details: `Have: ${balanceSol.toFixed(4)} SOL | Need: ${(tradeAmountSol + feeBufferSol).toFixed(4)} SOL`,
        });
      }
      return;
    }

    if (liveTradeInFlightRef.current) {
      return; // Trade already in progress
    }

    // Evaluate tokens
    const evaluation = await evaluateTokens(tokenData, false, undefined, { suppressOpportunityToast: true });
    if (!evaluation) {
      return;
    }

    batch.forEach(t => processedTokensRef.current.add(t.address));
    const approved = evaluation.decisions?.filter((d) => d.approved) || [];
    
    if (approved.length === 0) {
      // Get rejected tokens with their primary rejection reasons
      const rejected = evaluation.decisions?.filter(d => !d.approved) || [];
      const rejectionSummary = rejected.slice(0, 3).map(d => {
        const reason = d.reasons.find(r => r.startsWith('✗')) || d.reasons[0] || 'N/A';
        return `${d.token.symbol}: ${reason}`;
      }).join(' | ');
      
      addBotLog({ 
        level: 'skip', 
        category: 'evaluate', 
        message: `${rejected.length} token(s) did not pass filters`,
        details: rejectionSummary || undefined,
      });
      return;
    }

    addBotLog({
      level: 'success',
      category: 'evaluate',
      message: `${approved.length} token(s) approved for trading`,
      details: approved.map(d => d.token.symbol).join(', '),
    });

    const availableSlots = Math.max(0, (settings.max_concurrent_trades || 0) - openPositions.length);
    if (availableSlots <= 0) {
      addBotLog({ level: 'skip', category: 'trade', message: 'Max positions reached' });
      return;
    }

    const maxAffordableTrades = Math.max(0, Math.floor((balanceSol - feeBufferSol) / tradeAmountSol));
    const tradesThisCycle = Math.min(availableSlots, maxAffordableTrades, 3, approved.length);

    if (tradesThisCycle <= 0) return;

    const toExecute = approved.slice(0, tradesThisCycle);
    
    addBotLog({
      level: 'info',
      category: 'trade',
      message: `🚀 Executing ${toExecute.length} live trade(s)`,
      details: `Tokens: ${toExecute.map(t => t.token.symbol).join(', ')}\n⚙️ Settings: ${tradeAmountSol} SOL | Slippage: ${settings.slippage_tolerance || 15}% | TP: ${settings.profit_take_percentage}% | SL: ${settings.stop_loss_percentage}% | Min Liq: ${settings.min_liquidity} SOL`,
    });

    liveTradeInFlightRef.current = true;
    try {
      for (const next of toExecute) {
        // CRITICAL: Pre-validate token is sellable before executing buy
        if (next.token.canSell === false) {
          addBotLog({
            level: 'warning',
            category: 'trade',
            message: `⚠️ Skipped: ${next.token.symbol} (not sellable)`,
            tokenSymbol: next.token.symbol,
            tokenAddress: next.token.address,
            details: `Token rejected - cannot be sold after purchase\n💧 Liquidity: $${next.token.liquidity?.toLocaleString() || 'N/A'} | 🛡️ Safety: ${100 - (next.token.riskScore || 0)}/100`,
          });
          continue;
        }
        
        // CRITICAL: Mark token as traded BEFORE execution to prevent race conditions
        tradedTokensRef.current.add(next.token.address);
        
        const buyerPos = next.token.buyerPosition ? `#${next.token.buyerPosition}` : 'N/A';
        const safetyScore = next.token.riskScore != null ? `${100 - next.token.riskScore}/100` : 'N/A';
        const liqText = next.token.liquidity ? `$${next.token.liquidity.toLocaleString()}` : 'N/A';
        
        addBotLog({
          level: 'info',
          category: 'trade',
          message: `📝 Starting trade: ${next.token.symbol}`,
          tokenSymbol: next.token.symbol,
          tokenAddress: next.token.address,
          details: `💧 Liquidity: ${liqText} | 👤 Buyer Pos: ${buyerPos} | 🛡️ Safety: ${safetyScore}\n⚙️ Amount: ${tradeAmountSol} SOL | Slippage: ${settings.slippage_tolerance || 15}% | Priority: ${settings.priority}`,
        });

        // Use user settings for slippage and priority, with sensible defaults
        const slippagePct = next.tradeParams?.slippage ?? settings.slippage_tolerance ?? 15;
        
        // Priority fee mapping - configurable based on user's priority setting
        const priorityFeeMap: Record<string, number> = {
          turbo: 500000,  // 0.0005 SOL
          fast: 200000,   // 0.0002 SOL
          normal: 100000, // 0.0001 SOL
        };
        const priorityFee = priorityFeeMap[settings.priority] || priorityFeeMap.normal;

        const result = await snipeToken(
          next.token.address,
          wallet.address,
          (tx) => signAndSendTransaction(tx),
          {
            buyAmount: tradeAmountSol,
            slippage: slippagePct / 100,
            priorityFee,
            minLiquidity: settings.min_liquidity,
            // Use user's max risk score from settings, default to 70
            maxRiskScore: settings.max_risk_score ?? 70,
            // Skip risk check for pre-verified tokens from scanner
            skipRiskCheck: true,
            // Pass user's TP/SL settings for position persistence
            profitTakePercent: settings.profit_take_percentage,
            stopLossPercent: settings.stop_loss_percentage,
          }
        );

        if (result?.status === 'SUCCESS' && result.position) {
          const entryVal = (result.position.entryPrice || 0) * (result.position.tokenAmount || 0);
          addBotLog({ 
            level: 'success', 
            category: 'trade', 
            message: `✅ BUY FILLED: ${next.token.symbol}`,
            tokenSymbol: next.token.symbol,
            tokenAddress: next.token.address,
            details: `💧 Liquidity: ${liqText} | 👤 Buyer Pos: ${buyerPos} | 🛡️ Safety: ${safetyScore}\n📊 Entry: $${result.position.entryPrice?.toFixed(8)} | Tokens: ${result.position.tokenAmount?.toLocaleString(undefined, { maximumFractionDigits: 2 })} | Value: $${entryVal.toFixed(4)} | SOL: ${result.position.solSpent?.toFixed(4)}\n⚙️ TP: ${settings.profit_take_percentage}% | SL: ${settings.stop_loss_percentage}%\n🔗 TX: ${result.position.entryTxHash || 'N/A'}`,
          });
          recordTrade(true);
          await fetchPositions();
          refreshBalance();
          await new Promise(r => setTimeout(r, 500));
        } else {
          const failReason = result?.error || 'Trade failed - unknown error';
          addBotLog({ 
            level: 'error', 
            category: 'trade', 
            message: `❌ BUY FAILED: ${next.token.symbol}`,
            tokenSymbol: next.token.symbol,
            tokenAddress: next.token.address,
            details: `💧 Liquidity: ${liqText} | 👤 Buyer Pos: ${buyerPos} | 🛡️ Safety: ${safetyScore}\n❗ Reason: ${failReason}\n⚙️ Attempted: ${tradeAmountSol} SOL | Slippage: ${settings.slippage_tolerance || 15}%\n📍 Token: ${next.token.address}`,
          });
          recordTrade(false);
          break; // Stop on first failure
        }
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      addBotLog({ level: 'error', category: 'trade', message: `Trade error: ${errorMsg}` });
      toast({ title: 'Trade Error', description: errorMsg, variant: 'destructive' });
    } finally {
      liveTradeInFlightRef.current = false;
    }
  }, [
    tokens, isBotActive, autoEntryEnabled, settings, isDemo, openPositions.length,
    wallet.isConnected, wallet.network, wallet.address, wallet.balance,
    demoBalance, solPrice, evaluateTokens, snipeToken, recordTrade,
    signAndSendTransaction, refreshBalance, fetchPositions, toast,
    deductBalance, addBalance, addDemoPosition, updateDemoPosition, closeDemoPosition,
  ]);

  // Continuous evaluation loop - runs on interval
  useEffect(() => {
    if (!isBotActive || isPaused) {
      if (evaluationIntervalRef.current) {
        clearInterval(evaluationIntervalRef.current);
        evaluationIntervalRef.current = null;
      }
      return;
    }

    // Run immediately on activation
    runBotEvaluation();

    // Set up interval for continuous evaluation
    const intervalMs = isDemo ? 8000 : 10000; // 8s demo, 10s live
    evaluationIntervalRef.current = setInterval(() => {
      runBotEvaluation();
    }, intervalMs);

    addBotLog({
      level: 'info',
      category: 'system',
      message: `Bot loop started (${intervalMs / 1000}s interval)`,
    });

    return () => {
      if (evaluationIntervalRef.current) {
        clearInterval(evaluationIntervalRef.current);
        evaluationIntervalRef.current = null;
      }
    };
  }, [isBotActive, isPaused, isDemo, runBotEvaluation]);

  const handleConnectWallet = async () => {
    if (wallet.isConnected) {
      await disconnect();
    } else {
      await connectPhantom();
    }
  };

  const handleSaveSettings = async () => {
    if (!settings) return;
    try {
      await saveSettings(settings);
    } catch {
      // Error handled in hook
    }
  };

  const handleToggleBotActive = (active: boolean) => {
    if (active) {
      // Clear processed and traded tokens when activating bot (fresh session)
      processedTokensRef.current.clear();
      tradedTokensRef.current.clear();
      
      if (isDemo) {
        // Start demo auto-exit monitor
        startDemoMonitor(5000); // Check every 5 seconds for demo
        toast({
          title: "Demo Mode Active",
          description: `Bot running with ${demoBalance.toFixed(0)} SOL demo balance. No real trades.`,
          variant: "default",
        });
      } else {
        // Start auto-exit monitor for live mode (only if Auto Exit is enabled)
        if (autoExitEnabled) {
          startAutoExitMonitor(30000); // Check every 30 seconds
        }
      }
      
      addNotification({
        title: 'Bot Activated',
        message: isDemo 
          ? `Liquidity bot started in demo mode with ${demoBalance.toFixed(0)} SOL balance`
          : 'Liquidity bot started - will auto-trade and auto-exit when conditions are met',
        type: 'success',
      });
    } else {
      // Stop auto-exit monitors
      if (isDemo) {
        stopDemoMonitor();
      } else {
        stopAutoExitMonitor();
      }
      
      addNotification({
        title: 'Bot Deactivated',
        message: 'Liquidity bot has been stopped',
        type: 'info',
      });
    }
    
    // Use BotContext to persist state
    if (active) {
      startBot();
    } else {
      stopBot();
    }
  };
  
  // Reset demo balance handler - with confirmation
  const handleResetDemo = () => {
    setShowResetConfirm(true);
  };

  const confirmResetDemo = () => {
    resetDemoPortfolio();
    setShowResetConfirm(false);
    toast({
      title: "Demo Reset",
      description: "Demo balance reset to 5,000 SOL. All positions cleared.",
    });
  };

  // Bot activation with confirmation for live mode
  const handleToggleBotActiveWithConfirm = (active: boolean) => {
    if (active && !isDemo) {
      // Show confirmation for live mode activation
      setPendingBotAction(active);
      setShowBotActivateConfirm(true);
    } else if (active && isDemo && wallet.isConnected && wallet.network === 'solana') {
      // User is in demo mode but has wallet connected - prompt to switch to live
      setPendingBotAction(active);
      setShowSwitchToLiveConfirm(true);
    } else {
      handleToggleBotActive(active);
    }
  };

  const confirmBotActivation = () => {
    if (pendingBotAction !== null) {
      handleToggleBotActive(pendingBotAction);
      setPendingBotAction(null);
    }
    setShowBotActivateConfirm(false);
  };
  
  const handleSwitchToLiveAndActivate = () => {
    setMode('live');
    setShowSwitchToLiveConfirm(false);
    // Show confirmation for live mode after switching
    setPendingBotAction(true);
    setShowBotActivateConfirm(true);
  };
  
  const handleContinueDemo = () => {
    setShowSwitchToLiveConfirm(false);
    if (pendingBotAction !== null) {
      handleToggleBotActive(pendingBotAction);
      setPendingBotAction(null);
    }
  };

  // Recovery control handlers
  const handleForceScan = useCallback(() => {
    addBotLog({ level: 'info', category: 'system', message: 'Force scan triggered' });
    if (settings?.min_liquidity) {
      scanTokens(settings.min_liquidity);
    }
  }, [settings?.min_liquidity, scanTokens]);

  const handleForceEvaluate = useCallback(() => {
    addBotLog({ level: 'info', category: 'system', message: 'Force evaluate triggered' });
    // Clear the last eval timestamp to bypass throttle
    processedTokensRef.current.clear();
  }, []);

  const handleClearProcessed = useCallback(() => {
    const count = processedTokensRef.current.size;
    processedTokensRef.current.clear();
    addBotLog({ level: 'info', category: 'system', message: `Cleared ${count} processed tokens from cache` });
    toast({ title: 'Cache Cleared', description: `Cleared ${count} tokens from processed cache` });
  }, [toast]);

  // Cleanup stuck positions (no route, zero balance, stablecoins that can't be sold)
  const handleCleanupStuckPositions = useCallback(async () => {
    if (isDemo) {
      toast({ title: 'Not Available', description: 'Cleanup is only available in Live mode', variant: 'destructive' });
      return;
    }

    const stuckPositions = realOpenPositions.filter(p => 
      p.status === 'open' || p.status === 'pending'
    );

    if (stuckPositions.length === 0) {
      toast({ title: 'No Stuck Positions', description: 'All positions are already closed.' });
      return;
    }

    setShowCleanupConfirm(true);
  }, [isDemo, realOpenPositions, toast]);

  const confirmCleanupPositions = useCallback(async () => {
    setShowCleanupConfirm(false);
    setCleaningUpPositions(true);

    const stuckPositions = realOpenPositions.filter(p => 
      p.status === 'open' || p.status === 'pending'
    );

    let closedCount = 0;
    let failedCount = 0;

    for (const position of stuckPositions) {
      try {
        const exitPrice = position.current_price ?? position.entry_price;
        const closed = await markPositionClosed(position.id, exitPrice);
        if (closed) {
          closedCount++;
          addBotLog({
            level: 'success',
            category: 'trade',
            message: `Force closed: ${position.token_symbol}`,
            tokenAddress: position.token_address,
          });
        } else {
          failedCount++;
        }
      } catch (err) {
        failedCount++;
        console.error('Failed to close position:', position.id, err);
      }
    }

    setCleaningUpPositions(false);

    // Force refresh to sync UI
    await fetchPositions(true);

    if (closedCount > 0) {
      toast({
        title: 'Positions Cleaned Up',
        description: `Successfully closed ${closedCount} position${closedCount > 1 ? 's' : ''}${failedCount > 0 ? `. ${failedCount} failed.` : '.'}`,
      });
    } else if (failedCount > 0) {
      toast({
        title: 'Cleanup Failed',
        description: `Failed to close ${failedCount} position${failedCount > 1 ? 's' : ''}. Try again or contact support.`,
        variant: 'destructive',
      });
    }
  }, [realOpenPositions, markPositionClosed, fetchPositions, toast]);

  const handleResetBot = useCallback(() => {
    stopBot();
    processedTokensRef.current.clear();
    clearBotLogs();
    if (isDemo) {
      stopDemoMonitor();
    } else {
      stopAutoExitMonitor();
    }
    addBotLog({ level: 'warning', category: 'system', message: 'Bot reset - all state cleared' });
    toast({ title: 'Bot Reset', description: 'Bot deactivated and cache cleared' });
  }, [isDemo, stopDemoMonitor, stopAutoExitMonitor, stopBot, toast]);

  // Sync all open positions with on-chain wallet balances
  const handleSyncPositions = useCallback(async () => {
    if (isDemo || !wallet.address) {
      toast({ title: 'Not Available', description: 'Sync is only available in Live mode with a connected wallet', variant: 'destructive' });
      return;
    }

    setSyncingPositions(true);
    addBotLog({ level: 'info', category: 'system', message: `Syncing ${realOpenPositions.length} positions with on-chain balances and metadata...` });

    let updatedCount = 0;
    let closedCount = 0;
    let metadataUpdated = 0;
    let errorCount = 0;

    // Collect addresses that need metadata enrichment
    const addressesNeedingMetadata = realOpenPositions
      .filter(p => isPlaceholderText(p.token_symbol) || isPlaceholderText(p.token_name))
      .map(p => p.token_address);

    // Fetch metadata from DexScreener for all tokens needing enrichment
    let metadataMap = new Map<string, { name: string; symbol: string }>();
    if (addressesNeedingMetadata.length > 0) {
      try {
        const fetchedMeta = await fetchDexScreenerTokenMetadata(addressesNeedingMetadata);
        for (const [addr, meta] of fetchedMeta.entries()) {
          if (meta.name && meta.symbol) {
            metadataMap.set(addr, { name: meta.name, symbol: meta.symbol });
          }
        }
        addBotLog({ level: 'info', category: 'system', message: `Fetched metadata for ${metadataMap.size} tokens from DexScreener` });
      } catch (err) {
        console.error('DexScreener metadata fetch error:', err);
      }
    }

    for (const position of realOpenPositions) {
      try {
        const { data, error } = await supabase.functions.invoke('token-metadata', {
          body: { mint: position.token_address, owner: wallet.address },
        });

        if (error) {
          errorCount++;
          continue;
        }

        const balanceUi = Number((data as any)?.balanceUi);
        const DUST = 1e-6;

        // Build update payload
        const updatePayload: Record<string, unknown> = {};
        let hasBalanceChange = false;
        let hasMetadataChange = false;

        // Check if balance needs update
        if (!Number.isFinite(balanceUi) || balanceUi <= DUST) {
          // No balance - mark as sold externally
          await markPositionClosed(position.id, position.current_price ?? position.entry_price);
          closedCount++;
          addBotLog({
            level: 'warning',
            category: 'trade',
            message: `Closed ${position.token_symbol} - no on-chain balance`,
            tokenAddress: position.token_address,
          });
          continue; // Skip metadata update for closed positions
        } else if (Math.abs(balanceUi - position.amount) > DUST) {
          updatePayload.amount = balanceUi;
          hasBalanceChange = true;
        }

        // Check if metadata needs enrichment
        const meta = metadataMap.get(position.token_address);
        if (meta) {
          if (isPlaceholderText(position.token_name) && meta.name && !isPlaceholderText(meta.name)) {
            updatePayload.token_name = meta.name;
            hasMetadataChange = true;
          }
          if (isPlaceholderText(position.token_symbol) && meta.symbol && !isPlaceholderText(meta.symbol)) {
            updatePayload.token_symbol = meta.symbol;
            hasMetadataChange = true;
          }
        }

        // Apply updates if any
        if (hasBalanceChange || hasMetadataChange) {
          updatePayload.updated_at = new Date().toISOString();
          await supabase
            .from('positions')
            .update(updatePayload)
            .eq('id', position.id);
          
          if (hasBalanceChange) {
            updatedCount++;
            addBotLog({
              level: 'info',
              category: 'trade',
              message: `Updated ${meta?.symbol || position.token_symbol}: ${position.amount.toFixed(4)} → ${balanceUi.toFixed(4)}`,
              tokenAddress: position.token_address,
            });
          }
          if (hasMetadataChange) {
            metadataUpdated++;
            addBotLog({
              level: 'info',
              category: 'system',
              message: `Enriched metadata: ${position.token_symbol} → ${meta?.symbol}`,
              tokenAddress: position.token_address,
            });
          }
        }
      } catch (err) {
        errorCount++;
        console.error('Sync error for position:', position.id, err);
      }
    }

    setSyncingPositions(false);
    await fetchPositions(true);

    const summary: string[] = [];
    if (updatedCount > 0) summary.push(`${updatedCount} amounts synced`);
    if (metadataUpdated > 0) summary.push(`${metadataUpdated} names fixed`);
    if (closedCount > 0) summary.push(`${closedCount} closed`);
    if (errorCount > 0) summary.push(`${errorCount} errors`);

    toast({
      title: 'Sync Complete',
      description: summary.length > 0 ? summary.join(', ') : 'All positions are in sync',
    });

    addBotLog({
      level: 'success',
      category: 'system',
      message: `Sync complete: ${summary.join(', ') || 'all in sync'}`,
    });
  }, [isDemo, wallet.address, realOpenPositions, markPositionClosed, fetchPositions, toast]);

  // Win rate calculation
  const winRate = closedPositions.length > 0 
    ? (closedPositions.filter(p => (p.profit_loss_percent || 0) > 0).length / closedPositions.length) * 100 
    : 0;

  return (
    <ErrorBoundary>
      {/* Confirmation Dialogs */}
      <ConfirmDialog
        open={showResetConfirm}
        onOpenChange={setShowResetConfirm}
        title="Reset Demo Portfolio?"
        description="This will reset your demo balance to 5,000 SOL and close all demo positions. This action cannot be undone."
        confirmLabel="Reset Demo"
        variant="warning"
        onConfirm={confirmResetDemo}
      />
      
      <ConfirmDialog
        open={showBotActivateConfirm}
        onOpenChange={setShowBotActivateConfirm}
        title="Activate Live Trading Bot?"
        description="This will enable automatic trading with real funds from your connected wallet. The bot will execute trades based on your configured settings. Make sure you understand the risks before proceeding."
        confirmLabel="Activate Bot"
        variant="destructive"
        onConfirm={confirmBotActivation}
      />
      
      {/* Switch to Live Mode Dialog */}
      <ConfirmDialog
        open={showSwitchToLiveConfirm}
        onOpenChange={setShowSwitchToLiveConfirm}
        title="Wallet Connected - Switch to Live Mode?"
        description={`You have a Solana wallet connected with ${wallet.balance || '0 SOL'}. Would you like to switch to Live mode to trade with real funds, or continue in Demo mode with simulated trades?`}
        confirmLabel="Switch to Live Mode"
        cancelLabel="Continue Demo"
        variant="default"
        onConfirm={handleSwitchToLiveAndActivate}
        onCancel={handleContinueDemo}
      />
      
      {/* Cleanup Stuck Positions Dialog */}
      <ConfirmDialog
        open={showCleanupConfirm}
        onOpenChange={setShowCleanupConfirm}
        title="Cleanup Stuck Positions?"
        description={`This will force-close ${realOpenPositions.filter(p => p.status === 'open' || p.status === 'pending').length} open position(s) that may be stuck due to no swap route, zero balance, or failed exits. These positions will be marked as 'force_closed_manual' in your history.`}
        confirmLabel={cleaningUpPositions ? "Closing..." : "Force Close All"}
        variant="destructive"
        onConfirm={confirmCleanupPositions}
      />
      
      {/* Exit Preview Modal */}
      <ExitPreviewModal
        open={showExitPreview}
        onOpenChange={setShowExitPreview}
        position={exitPreviewPosition}
        walletAddress={wallet.address || ''}
        onConfirmExit={handleConfirmExitFromModal}
      />
      
      {/* No Route Exit Modal */}
      <NoRouteExitModal
        open={showNoRouteModal}
        onOpenChange={setShowNoRouteModal}
        tokenSymbol={noRoutePosition?.token_symbol || ''}
        tokenName={noRoutePosition?.token_name || ''}
        onMoveToWaiting={async () => {
          if (noRoutePosition) {
            await moveToWaitingForLiquidity(noRoutePosition.id);
            fetchPositions(true);
          }
          setShowNoRouteModal(false);
          setNoRoutePosition(null);
        }}
        onKeepInList={() => {
          setShowNoRouteModal(false);
          setNoRoutePosition(null);
        }}
      />
      <AppLayout>
        <div className="container mx-auto px-3 md:px-4 space-y-4 md:space-y-6">
          {/* Demo Mode Banner */}
          {isDemo && (
            <Alert className="bg-warning/10 border-warning/30">
              <FlaskConical className="h-4 w-4 text-warning" />
              <AlertTitle className="text-warning flex items-center justify-between">
                <div className="flex items-center gap-2">
                  Demo Mode Active
                  <Badge className="bg-warning/20 text-warning border-warning/30 ml-2">
                    <Coins className="w-3 h-3 mr-1" />
                    {demoBalance.toFixed(0)} SOL
                  </Badge>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-7 text-xs border-warning/30 text-warning hover:bg-warning/20"
                  onClick={handleResetDemo}
                >
                  <RotateCcw className="w-3 h-3 mr-1" />
                  Reset
                </Button>
              </AlertTitle>
              <AlertDescription className="text-warning/80">
                You're trading with simulated {demoBalance.toFixed(0)} SOL. Switch to Live mode for real trading.
              </AlertDescription>
            </Alert>
          )}

          {/* API Errors Banner */}
          {apiErrors.length > 0 && (
            <Alert variant="destructive" className="border-destructive/40 bg-destructive/5">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle className="flex items-center justify-between">
                <span>API Connection Issues ({apiErrors.length})</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => {}}
                >
                  <X className="h-4 w-4" />
                </Button>
              </AlertTitle>
              <AlertDescription>
                <div className="space-y-1 mt-2">
                  {apiErrors.slice(0, 3).map((error, index) => (
                    <div key={index} className="flex items-center justify-between text-sm bg-destructive/10 rounded px-2 py-1">
                      <div>
                        <span className="font-medium">{error.apiName}</span>
                        <span className="text-muted-foreground ml-2">({error.apiType})</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{error.errorMessage}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  View Admin Panel → Analytics for detailed API health monitoring
                </p>
              </AlertDescription>
            </Alert>
          )}

          {/* Stats Row - Mobile optimized with 2x2 grid */}
          <div className="grid grid-cols-2 gap-2 md:gap-4 lg:grid-cols-4">
            <StatsCard
              title={isDemo ? "Demo Balance" : "Portfolio"}
              value={isDemo ? `${demoBalance.toFixed(0)} SOL` : `$${totalValue.toFixed(2)}`}
              change={`${totalPnLPercent >= 0 ? '+' : ''}${totalPnLPercent.toFixed(1)}%`}
              changeType={totalPnLPercent >= 0 ? 'positive' : 'negative'}
              icon={isDemo ? Coins : Wallet}
            />
            <StatsCard
              title="Active"
              value={openPositions.length.toString()}
              change={`${openPositions.filter(p => (p.profit_loss_percent || 0) > 0).length} profit`}
              changeType="positive"
              icon={TrendingUp}
            />
            <StatsCard
              title="Pools"
              value={tokens.length.toString()}
              change={`${tokens.filter(t => t.riskScore < 50).length} signals`}
              changeType="neutral"
              icon={Zap}
            />
            <StatsCard
              title="Win Rate"
              value={`${winRate.toFixed(0)}%`}
              change={`${closedPositions.length} trades`}
              changeType={winRate >= 50 ? 'positive' : winRate > 0 ? 'negative' : 'neutral'}
              icon={Activity}
            />
          </div>

          {/* Main Content Grid - Cleaner 2-column layout */}
          <div className="grid gap-4 lg:grid-cols-[1fr,400px]">
            {/* Left Column - Token Monitor (main focus) */}
            <div className="space-y-4 order-2 lg:order-1">
              {/* Liquidity Monitor - Primary content */}
              <LiquidityMonitor 
                pools={tokens}
                activeTrades={openPositions}
                waitingPositions={waitingPositions}
                loading={loading}
                apiStatus={loading ? 'active' : 'waiting'}
                onExitTrade={handleOpenExitPreview}
                onRetryLiquidityCheck={runLiquidityRetryCheck}
                onMoveBackFromWaiting={moveBackToOpen}
                onManualSellWaiting={async (pos) => {
                  const success = await tryExecuteWaitingPosition(pos);
                  if (success) {
                    fetchPositions(true);
                    fetchWaitingPositions();
                  }
                }}
                checkingLiquidity={checkingLiquidity}
              />

              {/* Bot Activity Log */}
              <BotActivityLog maxEntries={30} />
            </div>

            {/* Right Column - Bot Controls & Stats */}
            <div className="space-y-4 order-1 lg:order-2">
              {/* Bot Preflight Check */}
              <BotPreflightCheck
                isBotActive={isBotActive}
                isDemo={isDemo}
                walletConnected={wallet.isConnected}
                walletNetwork={wallet.network}
                walletBalance={wallet.balance}
                tradeAmount={settings?.trade_amount ?? null}
                maxConcurrentTrades={settings?.max_concurrent_trades ?? null}
                autoEntryEnabled={autoEntryEnabled}
                openPositionsCount={openPositions.length}
                onConnectWallet={connectPhantom}
              />
              
              {/* Liquidity Bot Panel - All settings in one place */}
              <LiquidityBotPanel
                settings={settings}
                saving={saving}
                onUpdateField={updateField}
                onSave={handleSaveSettings}
                isActive={isBotActive}
                onToggleActive={handleToggleBotActiveWithConfirm}
                autoEntryEnabled={autoEntryEnabled}
                onAutoEntryChange={toggleAutoEntry}
                autoExitEnabled={autoExitEnabled}
                onAutoExitChange={toggleAutoExit}
                isDemo={isDemo}
                walletConnected={wallet.isConnected && wallet.network === 'solana'}
                walletAddress={wallet.address}
                walletBalance={wallet.balance}
              />

              {/* Performance Panel */}
              <PerformancePanel
                winRate={isDemo ? demoWinRate : winRate}
                totalPnL={isDemo ? demoTotalPnLPercent : totalPnLPercent}
                avgPnL={isDemo ? demoAvgPnL : (totalPnLPercent / Math.max(closedPositions.length, 1))}
                bestTrade={isDemo ? demoBestTrade : Math.max(...closedPositions.map(p => p.profit_loss_percent || 0), 0)}
                worstTrade={isDemo ? demoWorstTrade : Math.min(...closedPositions.map(p => p.profit_loss_percent || 0), 0)}
                totalTrades={isDemo ? demoTotalTrades : closedPositions.length}
                wins={isDemo ? demoWins : closedPositions.filter(p => (p.profit_loss_percent || 0) > 0).length}
                losses={isDemo ? demoLosses : closedPositions.filter(p => (p.profit_loss_percent || 0) <= 0).length}
              />

              {/* Trade Signals - Live mode only */}
              {!isDemo && <TradeSignalPanel />}

              {/* Sniper Decisions - Live mode debug */}
              {!isDemo && (
                <SniperDecisionPanel
                  decisions={sniperResult?.decisions || []}
                  loading={sniperLoading}
                  isDemo={isDemo}
                  botActive={isBotActive}
                />
              )}

              {/* API Health */}
              <ApiHealthWidget isDemo={isDemo} />

              {/* Paid API Alert */}
              <PaidApiAlert isBotActive={isBotActive} isDemo={isDemo} />

              {/* Recovery Controls - Live mode only */}
              {!isDemo && (
                <RecoveryControls
                  onForceScan={handleForceScan}
                  onForceEvaluate={handleForceEvaluate}
                  onClearProcessed={handleClearProcessed}
                  onResetBot={handleResetBot}
                  onCleanupStuck={handleCleanupStuckPositions}
                  onSyncPositions={handleSyncPositions}
                  scanning={loading}
                  evaluating={sniperLoading}
                  cleaningUp={cleaningUpPositions}
                  syncingPositions={syncingPositions}
                  processedCount={processedTokensRef.current.size}
                  stuckPositionsCount={realOpenPositions.filter(p => p.status === 'open' || p.status === 'pending').length}
                  openPositionsCount={realOpenPositions.length}
                  botActive={isBotActive}
                />
              )}
            </div>
          </div>
        </div>
      </AppLayout>
    </ErrorBoundary>
  );
});

Scanner.displayName = 'Scanner';

export default Scanner;
