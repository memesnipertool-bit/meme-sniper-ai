import React, { forwardRef, useState, useEffect, useCallback, useMemo, useRef } from "react";
import TradingHeader from "@/components/trading/TradingHeader";
import BotControlPanel from "@/components/scanner/BotControlPanel";
import SniperDecisionPanel from "@/components/trading/SniperDecisionPanel";
import { TradeSignalPanel } from "@/components/trading/TradeSignalPanel";
import LiquidityMonitor from "@/components/scanner/LiquidityMonitor";
import PerformancePanel from "@/components/scanner/PerformancePanel";
import ActivePositionsPanel from "@/components/scanner/ActivePositionsPanel";
import BotActivityLog, { addBotLog, clearBotLogs } from "@/components/scanner/BotActivityLog";
import RecoveryControls from "@/components/scanner/RecoveryControls";
import ApiHealthWidget from "@/components/scanner/ApiHealthWidget";
import PaidApiAlert from "@/components/scanner/PaidApiAlert";
import BotPreflightCheck from "@/components/scanner/BotPreflightCheck";
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
import { Wallet, TrendingUp, Zap, Activity, AlertTriangle, X, FlaskConical, Coins, RotateCcw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

const Scanner = forwardRef<HTMLDivElement, object>(function Scanner(_props, ref) {
  const { tokens, loading, scanTokens, errors, apiErrors, isDemo, cleanup } = useTokenScanner();
  const { settings, saving, saveSettings, updateField } = useSniperSettings();
  const { evaluateTokens, result: sniperResult, loading: sniperLoading } = useAutoSniper();
  const { startAutoExitMonitor, stopAutoExitMonitor, isMonitoring } = useAutoExit();
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
  const [pendingBotAction, setPendingBotAction] = useState<boolean | null>(null);
  
  // Get setMode from AppModeContext
  const { setMode } = useAppMode();
  
  // Refs for tracking
  const lastSniperRunRef = useRef<number>(0);
  const processedTokensRef = useRef<Set<string>>(new Set());
  const liveTradeInFlightRef = useRef(false);

  // Use demo or real positions based on mode
  const openPositions = isDemo ? openDemoPositions : realOpenPositions;
  const closedPositions = isDemo ? closedDemoPositions : realClosedPositions;

  const fallbackSolPrice = Number.isFinite(solPrice) && solPrice > 0 ? solPrice : 150;

  const decimalToBaseUnits = useCallback((amountDecimal: number, mint: string) => {
    const decimals = mint === SOL_MINT ? 9 : 6;
    const fixed = Math.max(0, amountDecimal).toFixed(decimals);
    const [whole, frac = ""] = fixed.split(".");
    return BigInt(`${whole}${frac}`).toString();
  }, []);

  const handleExitPosition = useCallback(async (positionId: string, currentPrice: number) => {
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
      // Open wallet modal programmatically
      openWalletModal();
      return;
    }

    const position = realOpenPositions.find((p) => p.id === positionId);
    if (!position) {
      toast({
        title: "Position not found",
        description: "This position is no longer active. Refreshing…",
      });
      fetchPositions();
      return;
    }

    // Use 3-stage engine for Jupiter exit (better routing)
    addBotLog({
      level: 'info',
      category: 'trade',
      message: 'Exiting position via Jupiter',
      tokenSymbol: position.token_symbol,
      tokenAddress: position.token_address,
    });

    const result = await exitPosition(
      position.token_address,
      position.amount,
      wallet.address,
      (tx) => signAndSendTransaction(tx),
      { slippage: 0.15 } // 15% slippage for exits
    );

    if (result.success) {
      addBotLog({
        level: 'success',
        category: 'trade',
        message: 'Position closed successfully',
        tokenSymbol: position.token_symbol,
        details: `Received ${result.solReceived?.toFixed(4)} SOL`,
      });
      await fetchPositions();
      refreshBalance();
      setTimeout(() => refreshBalance(), 8000);
    } else if (result.error) {
      // Check if this is a "token not in wallet" error - offer to force close
      const errorMessage = result.error;
      if (errorMessage.includes("don't have this token") || errorMessage.includes("already been sold") || errorMessage.includes("REQ_INPUT") || errorMessage.includes("NO_ROUTE")) {
        toast({
          title: "Token Not Found or No Route",
          description: "This position may have already been sold or has no liquidity. Mark it as closed?",
          duration: 10000,
          action: (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await markPositionClosed(positionId, currentPrice);
                toast({
                  title: "Position Marked Closed",
                  description: `${position.token_symbol} removed from active positions`,
                });
              }}
            >
              Mark Closed
            </Button>
          ),
        });
      }
    }
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
    exitPosition,
    signAndSendTransaction,
    refreshBalance,
    fallbackSolPrice,
    markPositionClosed,
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
  useEffect(() => {
    if (isBotActive && !isPaused) {
      if (isDemo) {
        startDemoMonitor(5000);
      } else if (autoExitEnabled) {
        startAutoExitMonitor(30000);
      }
    }
    
    return () => {
      // Don't stop bot on unmount - just stop monitors (bot state persists)
      stopDemoMonitor();
      stopAutoExitMonitor();
    };
  }, [isBotActive, isPaused, isDemo, autoExitEnabled, startDemoMonitor, stopDemoMonitor, startAutoExitMonitor, stopAutoExitMonitor]);

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

  // Auto-sniper: evaluate NEW tokens when bot is active
  useEffect(() => {
    if (!isBotActive || !autoEntryEnabled || tokens.length === 0 || !settings) return;
    
    // Filter for tokens we haven't processed yet
    const unseenTokens = tokens.filter(t => !processedTokensRef.current.has(t.address));

    if (unseenTokens.length === 0) return;

    // IMPORTANT:
    // Previously we marked ALL unseen tokens as "processed" but only evaluated a small slice.
    // That caused the bot to permanently skip many valid opportunities.
    const blacklist = new Set(settings.token_blacklist || []);
    const candidates = unseenTokens.filter((t) => {
      if (!t.address) return false;
      if (blacklist.has(t.address)) return false;

      // Block obvious “fake SOL” lookalikes (symbol SOL but not the real wSOL mint)
      if (t.symbol?.toUpperCase() === 'SOL' && t.address !== SOL_MINT) return false;

      // If scanner flags it as not sellable, don’t waste evaluations on it
      if (t.canSell === false) return false;

      return true;
    });

    if (candidates.length === 0) return;

    const batchSize = isDemo ? 10 : 20;
    const batch = candidates.slice(0, batchSize);

    // Map tokens with ALL scanner validation fields for auto-sniper
    // CRITICAL: Include isPumpFun, isTradeable, source to avoid re-validating
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
      // CRITICAL: Pass scanner validation flags to auto-sniper
      isPumpFun: t.isPumpFun,       // From token-scanner
      isTradeable: t.isTradeable,   // From token-scanner
      canBuy: t.canBuy,             // From token-scanner
      canSell: t.canSell,           // From token-scanner
      source: t.source,             // API source (Pump.fun, DexScreener, etc.)
      safetyReasons: t.safetyReasons, // Safety check results
    }));

    console.log('Auto-sniper evaluating new tokens:', tokenData.map(t => t.symbol));
    addBotLog({ 
      level: 'info', 
      category: 'evaluate', 
      message: `Evaluating ${tokenData.length} tokens`,
      details: tokenData.map(t => t.symbol).join(', '),
    });

    // In demo mode, simulate trade execution with demo balance
    if (isDemo) {
      // Mark batch as processed for demo mode (prevents repeated sim trades)
      batch.forEach(t => processedTokensRef.current.add(t.address));
      // Find token that meets criteria using multi-select buyer positions
      const targetPositions = settings.target_buyer_positions || [2, 3];
      const approvedToken = tokenData.find(t => 
        t.buyerPosition && 
        targetPositions.includes(t.buyerPosition) && 
        t.riskScore < 70 &&
        t.liquidity >= (settings.min_liquidity || 300)
      );
      
      if (approvedToken && settings.trade_amount) {
        // Check if we have enough balance - use real SOL price
        const tradeAmountInDollars = settings.trade_amount * solPrice;
        
        if (demoBalance >= settings.trade_amount) {
          // Deduct balance
          deductBalance(settings.trade_amount);
          
          const entryPrice = approvedToken.priceUsd || 0.0001;
          const amount = tradeAmountInDollars / entryPrice;
          
          // Create demo position
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
          
          toast({
            title: '🎯 Demo Trade Executed!',
            description: `Bought ${approvedToken.symbol} at $${entryPrice.toFixed(6)} with ${settings.trade_amount} SOL`,
          });
          
          addNotification({
            title: `Demo Trade: ${approvedToken.symbol}`,
            message: `Bought ${approvedToken.symbol} with ${settings.trade_amount} SOL. TP: ${settings.profit_take_percentage}% SL: ${settings.stop_loss_percentage}%`,
            type: 'trade',
            metadata: { token: approvedToken.symbol, amount: settings.trade_amount },
          });
          
          // Simulate price movement for demo positions
          setTimeout(() => {
            const priceChange = (Math.random() - 0.3) * 0.5; // -30% to +20%
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
            
            // Check exit conditions
            if (pnlPercent >= settings.profit_take_percentage) {
              closeDemoPosition(newPosition.id, newPrice, 'take_profit');
              addBalance(settings.trade_amount + (pnlValue / solPrice)); // Return original + profit
              toast({
                title: '💰 Take Profit Hit!',
                description: `Closed ${approvedToken.symbol} at +${pnlPercent.toFixed(1)}%`,
              });
            } else if (pnlPercent <= -settings.stop_loss_percentage) {
              closeDemoPosition(newPosition.id, newPrice, 'stop_loss');
              addBalance(settings.trade_amount + (pnlValue / solPrice)); // Return remaining value
              toast({
                title: '🛑 Stop Loss Hit',
                description: `Closed ${approvedToken.symbol} at ${pnlPercent.toFixed(1)}%`,
                variant: 'destructive',
              });
            }
          }, 5000 + Math.random() * 10000); // Random 5-15 seconds delay
        } else {
          toast({
            title: 'Insufficient Demo Balance',
            description: `Need ${settings.trade_amount} SOL, have ${demoBalance.toFixed(2)} SOL`,
            variant: 'destructive',
          });
        }
      }
    } else {
      // Live mode: evaluate first, then execute via wallet signature (no private keys stored)
      (async () => {
        if (!wallet.isConnected || wallet.network !== 'solana' || !wallet.address) {
          console.log('[Live Bot] No wallet connected, opening wallet modal...');
          addBotLog({
            level: 'warning',
            category: 'trade',
            message: 'Wallet not connected - please connect to trade',
          });
          openWalletModal();
          return;
        }

        // Ensure we have enough SOL for the trade amount + a small fee buffer
        const balanceSol = parseFloat(String(wallet.balance || '').replace(/[^\d.]/g, '')) || 0;
        const tradeAmountSol = settings.trade_amount || 0;
        const feeBufferSol = 0.01;

        if (tradeAmountSol <= 0) {
          console.log('[Live Bot] Invalid trade amount:', tradeAmountSol);
          return;
        }

        if (balanceSol < tradeAmountSol + feeBufferSol) {
          console.log(`[Live Bot] Insufficient balance: have ${balanceSol}, need ${tradeAmountSol + feeBufferSol}`);
          return;
        }

        if (liveTradeInFlightRef.current) {
          console.log('[Live Bot] Trade already in flight, skipping');
          return;
        }

        console.log(`[Live Bot] Evaluating ${tokenData.length} tokens for trade...`);
        const evaluation = await evaluateTokens(tokenData, false, undefined, { suppressOpportunityToast: true });
        if (!evaluation) {
          console.log('[Live Bot] Evaluation returned null, will retry later');
          return;
        }

        // Mark evaluated batch as processed only AFTER we successfully get an evaluation
        batch.forEach(t => processedTokensRef.current.add(t.address));

        const approved = evaluation.decisions?.filter((d) => d.approved) || [];
        
        console.log(`[Live Bot] Evaluation result: ${approved.length} approved out of ${evaluation?.decisions?.length || 0}`);
        
        if (approved.length === 0) {
          addBotLog({ 
            level: 'skip', 
            category: 'evaluate', 
            message: `${evaluation.decisions?.length || 0} tokens evaluated, 0 approved`,
            details: evaluation.decisions?.map(d => `${d.token.symbol}: ${d.reasons.slice(0, 2).join(', ')}`).join('\n'),
          });
          console.log('[Live Bot] No approved tokens, skipping trade');
          return;
        }

        // Execute up to available slots (cap per cycle to avoid wallet spam)
        const availableSlots = Math.max(0, (settings.max_concurrent_trades || 0) - openPositions.length);
        if (availableSlots <= 0) {
          addBotLog({ 
            level: 'skip', 
            category: 'trade', 
            message: 'Max concurrent trades reached',
            details: `${openPositions.length}/${settings.max_concurrent_trades} positions open`,
          });
          console.log('[Live Bot] Max concurrent trades reached, skipping execution');
          return;
        }

        // Also ensure we can afford multiple trades (keep a small fee buffer)
        const maxAffordableTrades = tradeAmountSol > 0
          ? Math.max(0, Math.floor((balanceSol - feeBufferSol) / tradeAmountSol))
          : 0;

        const maxPerCycle = 3;
        const tradesThisCycle = Math.min(availableSlots, maxAffordableTrades, maxPerCycle, approved.length);

        if (tradesThisCycle <= 0) {
          addBotLog({ 
            level: 'skip', 
            category: 'trade', 
            message: 'Insufficient balance for trades',
            details: `Balance: ${balanceSol.toFixed(4)} SOL, need: ${(tradeAmountSol + feeBufferSol).toFixed(4)} SOL`,
          });
          console.log('[Live Bot] Not enough balance for additional trades, skipping execution');
          return;
        }

        const toExecute = approved.slice(0, tradesThisCycle);

        liveTradeInFlightRef.current = true;
        try {
          for (const next of toExecute) {
            console.log(`[Live Bot] 🚀 3-Stage Snipe for ${next.token.symbol} (${next.token.address})`);
            
            addBotLog({
              level: 'info',
              category: 'trade',
              message: 'Starting 3-stage snipe',
              tokenSymbol: next.token.symbol,
              tokenAddress: next.token.address,
              details: 'Stage 1: Liquidity → Stage 2: Raydium → Stage 3: Jupiter',
            });

            const slippagePct = next.tradeParams?.slippage ?? 15; // Higher slippage for new tokens
            const priorityFee = settings.priority === 'turbo' 
              ? 500000 
              : settings.priority === 'fast' 
                ? 200000 
                : 100000;

            // Use 3-stage trading engine
            const result = await snipeToken(
              next.token.address,
              wallet.address,
              (tx) => signAndSendTransaction(tx),
              {
                buyAmount: tradeAmountSol,
                slippage: slippagePct / 100, // Convert to decimal
                priorityFee,
                minLiquidity: settings.min_liquidity,
                maxRiskScore: 70,
              }
            );

            console.log(`[Live Bot] Snipe result:`, result?.status || 'NULL');

            if (result?.status === 'SUCCESS' && result.position) {
              addBotLog({ 
                level: 'success', 
                category: 'trade', 
                message: '3-stage snipe successful!',
                tokenSymbol: next.token.symbol,
                tokenAddress: next.token.address,
                details: `Entry: ${result.position.entryPrice?.toFixed(8)} | TX: ${result.position.entryTxHash?.slice(0, 12)}...`,
              });
              
              // Record trade in bot context
              recordTrade(result.status === 'SUCCESS');
              
              await fetchPositions();
              refreshBalance();
              
              // Brief delay before next trade
              await new Promise(r => setTimeout(r, 500));
            } else if (result?.status === 'PARTIAL') {
              addBotLog({ 
                level: 'info', 
                category: 'trade', 
                message: 'Partial success - liquidity detected but snipe failed',
                tokenSymbol: next.token.symbol,
                tokenAddress: next.token.address,
                details: result.error || 'Will retry via Jupiter when available',
              });
              recordTrade(false);
            } else {
              addBotLog({ 
                level: 'error', 
                category: 'trade', 
                message: result?.error || 'Snipe failed',
                tokenSymbol: next.token.symbol,
                tokenAddress: next.token.address,
              });
              recordTrade(false);
              // Stop batch on failure to avoid repeated wallet popups
              break;
            }
          }
        } catch (err: any) {
          console.error('[Live Bot] Trade error:', err);
          toast({
            title: 'Trade Error',
            description: err.message || 'Failed to execute trade',
            variant: 'destructive',
          });
        } finally {
          liveTradeInFlightRef.current = false;
        }
      })();
    }
  }, [
    tokens,
    isBotActive,
    autoEntryEnabled,
    openPositions.length,
    settings,
    isDemo,
    evaluateTokens,
    snipeToken,
    recordTrade,
    wallet.isConnected,
    wallet.network,
    wallet.address,
    wallet.balance,
    signAndSendTransaction,
    refreshBalance,
    fetchPositions,
    toast,
    addNotification,
    demoBalance,
    deductBalance,
    addBalance,
    addDemoPosition,
    updateDemoPosition,
    closeDemoPosition,
    solPrice,
  ]);

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
      // Clear processed tokens when activating bot
      processedTokensRef.current.clear();
      
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

  // Win rate calculation
  const winRate = closedPositions.length > 0 
    ? (closedPositions.filter(p => (p.profit_loss_percent || 0) > 0).length / closedPositions.length) * 100 
    : 0;

  return (
    <ErrorBoundary>
    <div className="min-h-screen bg-background">
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
      <TradingHeader
        walletConnected={wallet.isConnected}
        walletAddress={wallet.address || undefined}
        network={wallet.network}
        onConnectWallet={handleConnectWallet}
      />

      <main className="pt-16 md:pt-20 pb-6 px-3 md:px-4">
        <div className="container mx-auto space-y-4 md:space-y-6">
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

          {/* API Errors Alert - Only show in Live mode */}
          {!isDemo && apiErrors.length > 0 && showApiErrors && (
            <Alert variant="destructive" className="relative">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle className="flex items-center justify-between">
                <span>API Issues Detected ({apiErrors.length})</span>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6 absolute top-2 right-2"
                  onClick={() => setShowApiErrors(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </AlertTitle>
              <AlertDescription>
                <div className="mt-2 space-y-1">
                  {apiErrors.map((error, index) => (
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
                loading={loading}
                apiStatus={loading ? 'active' : 'waiting'}
                onExitTrade={handleExitPosition}
              />

              {/* Active Positions */}
              <ActivePositionsPanel 
                positions={openPositions}
                onClosePosition={handleExitPosition}
                onForceClose={async (positionId) => {
                  if (isDemo) {
                    const pos = openDemoPositions.find(p => p.id === positionId);
                    if (pos) closeDemoPosition(positionId, pos.current_price, 'manual');
                  } else {
                    const pos = realOpenPositions.find(p => p.id === positionId);
                    if (pos) {
                      await markPositionClosed(positionId, pos.current_price);
                      toast({
                        title: "Position Force Closed",
                        description: `${pos.token_symbol} removed from active positions (no on-chain sell)`,
                      });
                    }
                  }
                }}
                onRefresh={isDemo ? undefined : fetchPositions}
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
              
              {/* Bot Control Panel - All settings in one place */}
              <BotControlPanel
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
                  scanning={loading}
                  evaluating={sniperLoading}
                  processedCount={processedTokensRef.current.size}
                  botActive={isBotActive}
                />
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
    </ErrorBoundary>
  );
});

Scanner.displayName = 'Scanner';

export default Scanner;
