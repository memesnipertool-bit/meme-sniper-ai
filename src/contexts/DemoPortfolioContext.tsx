import { createContext, useContext, useState, ReactNode, useCallback, useEffect, useRef } from 'react';
import { useAppMode } from './AppModeContext';

// Demo position matching the real Position interface
export interface DemoPosition {
  id: string;
  user_id: string;
  token_address: string;
  token_symbol: string;
  token_name: string;
  chain: string;
  entry_price: number;
  current_price: number;
  amount: number;
  entry_value: number;
  current_value: number;
  profit_loss_percent: number;
  profit_loss_value: number;
  profit_take_percent: number;
  stop_loss_percent: number;
  status: 'open' | 'closed' | 'pending';
  exit_reason: string | null;
  exit_price: number | null;
  exit_tx_id: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

interface PortfolioData {
  date: string;
  value: number;
  pnl: number;
}

interface DemoPortfolioContextType {
  // Balance
  demoBalance: number;
  setDemoBalance: (balance: number) => void;
  deductBalance: (amount: number) => boolean;
  addBalance: (amount: number) => void;
  resetDemoPortfolio: () => void;
  
  // Positions
  demoPositions: DemoPosition[];
  addDemoPosition: (position: Omit<DemoPosition, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => DemoPosition;
  updateDemoPosition: (id: string, updates: Partial<DemoPosition>) => void;
  closeDemoPosition: (id: string, exitPrice: number, exitReason: string) => void;
  
  // Open/Closed positions
  openDemoPositions: DemoPosition[];
  closedDemoPositions: DemoPosition[];
  
  // Portfolio history - now dynamically updated
  portfolioHistory: Record<string, PortfolioData[]>;
  selectedPeriod: '1H' | '24H' | '7D' | '30D';
  setSelectedPeriod: (period: '1H' | '24H' | '7D' | '30D') => void;
  getCurrentPortfolioData: () => PortfolioData[];
  
  // Stats
  totalValue: number;
  totalPnL: number;
  totalPnLPercent: number;
  
  // Performance stats
  winRate: number;
  avgPnL: number;
  bestTrade: number;
  worstTrade: number;
  totalTrades: number;
  wins: number;
  losses: number;
}

const INITIAL_DEMO_BALANCE = 100; // 100 SOL
const DEMO_STORAGE_KEY = 'demo_portfolio_state';

const DemoPortfolioContext = createContext<DemoPortfolioContextType | undefined>(undefined);

export function DemoPortfolioProvider({ children }: { children: ReactNode }) {
  const { isDemo } = useAppMode();
  
  // Initialize from localStorage or defaults
  const [demoBalance, setDemoBalance] = useState<number>(() => {
    const saved = localStorage.getItem(DEMO_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.balance ?? INITIAL_DEMO_BALANCE;
      } catch {
        return INITIAL_DEMO_BALANCE;
      }
    }
    return INITIAL_DEMO_BALANCE;
  });
  
  const [demoPositions, setDemoPositions] = useState<DemoPosition[]>(() => {
    const saved = localStorage.getItem(DEMO_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.positions ?? [];
      } catch {
        return [];
      }
    }
    return [];
  });
  
  // Portfolio history snapshots - stored in localStorage
  const [portfolioSnapshots, setPortfolioSnapshots] = useState<{ timestamp: number; value: number }[]>(() => {
    const saved = localStorage.getItem(DEMO_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.snapshots ?? [{ timestamp: Date.now(), value: INITIAL_DEMO_BALANCE }];
      } catch {
        return [{ timestamp: Date.now(), value: INITIAL_DEMO_BALANCE }];
      }
    }
    return [{ timestamp: Date.now(), value: INITIAL_DEMO_BALANCE }];
  });
  
  const [selectedPeriod, setSelectedPeriod] = useState<'1H' | '24H' | '7D' | '30D'>('24H');
  
  // Refs for interval
  const snapshotIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Calculate open/closed positions
  const openDemoPositions = demoPositions.filter(p => p.status === 'open');
  const closedDemoPositions = demoPositions.filter(p => p.status === 'closed');
  
  // Calculate totals
  const positionValue = openDemoPositions.reduce((sum, p) => sum + p.current_value, 0);
  const totalValue = positionValue + (demoBalance * 150); // Convert SOL to USD (approx)
  const totalPnL = openDemoPositions.reduce((sum, p) => sum + (p.profit_loss_value || 0), 0);
  const entryTotal = openDemoPositions.reduce((sum, p) => sum + p.entry_value, 0);
  const totalPnLPercent = entryTotal > 0 ? (totalPnL / entryTotal) * 100 : 0;
  
  // Performance stats from closed positions
  const wins = closedDemoPositions.filter(p => (p.profit_loss_percent || 0) > 0).length;
  const losses = closedDemoPositions.filter(p => (p.profit_loss_percent || 0) <= 0).length;
  const totalTrades = closedDemoPositions.length;
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  
  const avgPnL = totalTrades > 0 
    ? closedDemoPositions.reduce((sum, p) => sum + (p.profit_loss_percent || 0), 0) / totalTrades 
    : 0;
    
  const bestTrade = closedDemoPositions.length > 0 
    ? Math.max(...closedDemoPositions.map(p => p.profit_loss_percent || 0))
    : 0;
    
  const worstTrade = closedDemoPositions.length > 0 
    ? Math.min(...closedDemoPositions.map(p => p.profit_loss_percent || 0))
    : 0;
  
  // Take a snapshot of current portfolio value
  const takeSnapshot = useCallback(() => {
    const currentValue = totalValue;
    setPortfolioSnapshots(prev => {
      const now = Date.now();
      const newSnapshots = [...prev, { timestamp: now, value: currentValue }];
      // Keep last 30 days of snapshots (1 per minute = ~43200 entries max, let's limit to 1000)
      return newSnapshots.slice(-1000);
    });
  }, [totalValue]);
  
  // Take snapshots periodically
  useEffect(() => {
    if (!isDemo) return;
    
    // Take a snapshot every minute
    snapshotIntervalRef.current = setInterval(() => {
      takeSnapshot();
    }, 60000);
    
    return () => {
      if (snapshotIntervalRef.current) {
        clearInterval(snapshotIntervalRef.current);
      }
    };
  }, [isDemo, takeSnapshot]);
  
  // Generate portfolio history from snapshots
  const generatePortfolioHistory = useCallback((): Record<string, PortfolioData[]> => {
    const now = Date.now();
    const baseValue = INITIAL_DEMO_BALANCE * 150; // In USD
    
    // Helper to format snapshots into chart data
    const formatSnapshots = (
      maxAge: number, 
      dateFormatter: (date: Date) => string,
      targetPoints: number
    ): PortfolioData[] => {
      const relevantSnapshots = portfolioSnapshots.filter(s => now - s.timestamp <= maxAge);
      
      if (relevantSnapshots.length === 0) {
        // Generate placeholder data based on current value
        const data: PortfolioData[] = [];
        for (let i = targetPoints; i >= 0; i--) {
          const time = new Date(now - (i * maxAge / targetPoints));
          const variance = (Math.random() - 0.5) * 0.02 * totalValue;
          data.push({
            date: dateFormatter(time),
            value: totalValue + variance,
            pnl: variance,
          });
        }
        // Set last point to actual current value
        if (data.length > 0) {
          data[data.length - 1].value = totalValue;
          data[data.length - 1].pnl = totalValue - baseValue;
        }
        return data;
      }
      
      // Sample snapshots to target number of points
      const step = Math.max(1, Math.floor(relevantSnapshots.length / targetPoints));
      const sampledSnapshots = relevantSnapshots.filter((_, i) => i % step === 0);
      
      return sampledSnapshots.map(s => ({
        date: dateFormatter(new Date(s.timestamp)),
        value: s.value,
        pnl: s.value - baseValue,
      }));
    };
    
    return {
      '1H': formatSnapshots(
        60 * 60 * 1000, 
        (d) => d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        30
      ),
      '24H': formatSnapshots(
        24 * 60 * 60 * 1000,
        (d) => d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        24
      ),
      '7D': formatSnapshots(
        7 * 24 * 60 * 60 * 1000,
        (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        28
      ),
      '30D': formatSnapshots(
        30 * 24 * 60 * 60 * 1000,
        (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        30
      ),
    };
  }, [portfolioSnapshots, totalValue]);
  
  const portfolioHistory = generatePortfolioHistory();
  
  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify({
      balance: demoBalance,
      positions: demoPositions,
      snapshots: portfolioSnapshots,
    }));
  }, [demoBalance, demoPositions, portfolioSnapshots]);
  
  const deductBalance = useCallback((amount: number) => {
    if (demoBalance >= amount) {
      setDemoBalance(prev => prev - amount);
      return true;
    }
    return false;
  }, [demoBalance]);
  
  const addBalance = useCallback((amount: number) => {
    setDemoBalance(prev => prev + amount);
  }, []);
  
  const resetDemoPortfolio = useCallback(() => {
    setDemoBalance(INITIAL_DEMO_BALANCE);
    setDemoPositions([]);
    setPortfolioSnapshots([{ timestamp: Date.now(), value: INITIAL_DEMO_BALANCE * 150 }]);
  }, []);
  
  const addDemoPosition = useCallback((position: Omit<DemoPosition, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
    const newPosition: DemoPosition = {
      ...position,
      id: `demo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      user_id: 'demo-user',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    setDemoPositions(prev => [newPosition, ...prev]);
    takeSnapshot(); // Take snapshot on trade
    return newPosition;
  }, [takeSnapshot]);
  
  const updateDemoPosition = useCallback((id: string, updates: Partial<DemoPosition>) => {
    setDemoPositions(prev => prev.map(p => 
      p.id === id ? { ...p, ...updates, updated_at: new Date().toISOString() } : p
    ));
  }, []);
  
  const closeDemoPosition = useCallback((id: string, exitPrice: number, exitReason: string) => {
    setDemoPositions(prev => prev.map(p => {
      if (p.id === id) {
        const currentValue = p.amount * exitPrice;
        const profitLossValue = currentValue - p.entry_value;
        const profitLossPercent = ((exitPrice - p.entry_price) / p.entry_price) * 100;
        
        return {
          ...p,
          status: 'closed' as const,
          exit_price: exitPrice,
          exit_reason: exitReason,
          current_price: exitPrice,
          current_value: currentValue,
          profit_loss_value: profitLossValue,
          profit_loss_percent: profitLossPercent,
          closed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      }
      return p;
    }));
    takeSnapshot(); // Take snapshot on trade close
  }, [takeSnapshot]);
  
  const getCurrentPortfolioData = useCallback(() => {
    return portfolioHistory[selectedPeriod] || portfolioHistory['24H'];
  }, [portfolioHistory, selectedPeriod]);
  
  const value: DemoPortfolioContextType = {
    demoBalance,
    setDemoBalance,
    deductBalance,
    addBalance,
    resetDemoPortfolio,
    demoPositions,
    addDemoPosition,
    updateDemoPosition,
    closeDemoPosition,
    openDemoPositions,
    closedDemoPositions,
    portfolioHistory,
    selectedPeriod,
    setSelectedPeriod,
    getCurrentPortfolioData,
    totalValue,
    totalPnL,
    totalPnLPercent,
    // Performance stats
    winRate,
    avgPnL,
    bestTrade,
    worstTrade,
    totalTrades,
    wins,
    losses,
  };
  
  return (
    <DemoPortfolioContext.Provider value={value}>
      {children}
    </DemoPortfolioContext.Provider>
  );
}

export function useDemoPortfolio() {
  const context = useContext(DemoPortfolioContext);
  if (context === undefined) {
    throw new Error('useDemoPortfolio must be used within a DemoPortfolioProvider');
  }
  return context;
}
