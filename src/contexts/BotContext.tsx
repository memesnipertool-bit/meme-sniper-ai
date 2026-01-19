import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { useSniperSettings } from '@/hooks/useSniperSettings';
import { useToast } from '@/hooks/use-toast';
import { useAppMode } from '@/contexts/AppModeContext';

interface BotState {
  isBotActive: boolean;
  autoEntryEnabled: boolean;
  autoExitEnabled: boolean;
  scanSpeed: 'slow' | 'normal' | 'fast';
  isPaused: boolean;
  lastStartTime: number | null;
  totalTrades: number;
  successfulTrades: number;
  failedTrades: number;
}

interface BotContextType {
  // State
  botState: BotState;
  isRunning: boolean;
  
  // Actions
  startBot: () => void;
  stopBot: () => void;
  pauseBot: () => void;
  resumeBot: () => void;
  toggleAutoEntry: (enabled: boolean) => void;
  toggleAutoExit: (enabled: boolean) => void;
  setScanSpeed: (speed: 'slow' | 'normal' | 'fast') => void;
  recordTrade: (success: boolean) => void;
  resetStats: () => void;
}

const defaultBotState: BotState = {
  isBotActive: false,
  autoEntryEnabled: true,
  autoExitEnabled: true,
  scanSpeed: 'normal',
  isPaused: false,
  lastStartTime: null,
  totalTrades: 0,
  successfulTrades: 0,
  failedTrades: 0,
};

const BotContext = createContext<BotContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'meme_sniper_bot_state';

export function BotProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const { mode } = useAppMode();
  
  // Initialize state from localStorage
  const [botState, setBotState] = useState<BotState>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Don't restore isBotActive on page reload for safety
        return { ...defaultBotState, ...parsed, isBotActive: false };
      }
    } catch (e) {
      console.error('Failed to load bot state:', e);
    }
    return defaultBotState;
  });

  // Persist state to localStorage (except isBotActive for safety)
  useEffect(() => {
    try {
      const toSave = { ...botState };
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(toSave));
    } catch (e) {
      console.error('Failed to save bot state:', e);
    }
  }, [botState]);

  const startBot = useCallback(() => {
    setBotState(prev => ({
      ...prev,
      isBotActive: true,
      isPaused: false,
      lastStartTime: Date.now(),
    }));
    toast({
      title: mode === 'demo' ? '🤖 Demo Bot Started' : '🚀 Live Bot Started',
      description: 'Auto-sniper is now active and scanning for opportunities',
    });
  }, [toast, mode]);

  const stopBot = useCallback(() => {
    setBotState(prev => ({
      ...prev,
      isBotActive: false,
      isPaused: false,
    }));
    toast({
      title: '⏹️ Bot Stopped',
      description: 'Auto-sniper has been deactivated',
    });
  }, [toast]);

  const pauseBot = useCallback(() => {
    setBotState(prev => ({
      ...prev,
      isPaused: true,
    }));
    toast({
      title: '⏸️ Bot Paused',
      description: 'Scanning paused - positions still monitored',
    });
  }, [toast]);

  const resumeBot = useCallback(() => {
    setBotState(prev => ({
      ...prev,
      isPaused: false,
    }));
    toast({
      title: '▶️ Bot Resumed',
      description: 'Scanning resumed',
    });
  }, [toast]);

  const toggleAutoEntry = useCallback((enabled: boolean) => {
    setBotState(prev => ({
      ...prev,
      autoEntryEnabled: enabled,
    }));
  }, []);

  const toggleAutoExit = useCallback((enabled: boolean) => {
    setBotState(prev => ({
      ...prev,
      autoExitEnabled: enabled,
    }));
  }, []);

  const setScanSpeed = useCallback((speed: 'slow' | 'normal' | 'fast') => {
    setBotState(prev => ({
      ...prev,
      scanSpeed: speed,
    }));
  }, []);

  const recordTrade = useCallback((success: boolean) => {
    setBotState(prev => ({
      ...prev,
      totalTrades: prev.totalTrades + 1,
      successfulTrades: success ? prev.successfulTrades + 1 : prev.successfulTrades,
      failedTrades: success ? prev.failedTrades : prev.failedTrades + 1,
    }));
  }, []);

  const resetStats = useCallback(() => {
    setBotState(prev => ({
      ...prev,
      totalTrades: 0,
      successfulTrades: 0,
      failedTrades: 0,
    }));
  }, []);

  const isRunning = botState.isBotActive && !botState.isPaused;

  return (
    <BotContext.Provider
      value={{
        botState,
        isRunning,
        startBot,
        stopBot,
        pauseBot,
        resumeBot,
        toggleAutoEntry,
        toggleAutoExit,
        setScanSpeed,
        recordTrade,
        resetStats,
      }}
    >
      {children}
    </BotContext.Provider>
  );
}

export function useBotContext() {
  const context = useContext(BotContext);
  if (context === undefined) {
    throw new Error('useBotContext must be used within a BotProvider');
  }
  return context;
}
