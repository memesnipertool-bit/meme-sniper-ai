import { useEffect, useRef, useCallback } from 'react';
import { useDemoPortfolio, DemoPosition } from '@/contexts/DemoPortfolioContext';
import { useToast } from '@/hooks/use-toast';
import { useNotifications } from '@/hooks/useNotifications';

interface DemoExitResult {
  positionId: string;
  symbol: string;
  action: 'take_profit' | 'stop_loss';
  exitPrice: number;
  profitLossPercent: number;
}

export function useDemoAutoExit() {
  const {
    openDemoPositions,
    closeDemoPosition,
    updateDemoPosition,
    addBalance,
  } = useDemoPortfolio();
  
  const { toast } = useToast();
  const { addNotification } = useNotifications();
  
  const monitorIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMonitoringRef = useRef(false);
  
  // Check exit conditions for all open demo positions
  const checkDemoExitConditions = useCallback(() => {
    const results: DemoExitResult[] = [];
    
    for (const position of openDemoPositions) {
      // Simulate price movement
      const priceVolatility = 0.05; // 5% volatility
      const priceChange = (Math.random() - 0.45) * priceVolatility; // Slightly biased up
      const newPrice = position.current_price * (1 + priceChange);
      
      const newValue = position.amount * newPrice;
      const pnlPercent = ((newPrice - position.entry_price) / position.entry_price) * 100;
      const pnlValue = newValue - position.entry_value;
      
      // Update position with new price
      updateDemoPosition(position.id, {
        current_price: newPrice,
        current_value: newValue,
        profit_loss_percent: pnlPercent,
        profit_loss_value: pnlValue,
      });
      
      // Check take profit
      if (pnlPercent >= position.profit_take_percent) {
        closeDemoPosition(position.id, newPrice, 'take_profit');
        
        // Return funds + profit to balance (convert back to SOL)
        const returnAmount = (position.entry_value + pnlValue) / 150;
        addBalance(returnAmount);
        
        results.push({
          positionId: position.id,
          symbol: position.token_symbol,
          action: 'take_profit',
          exitPrice: newPrice,
          profitLossPercent: pnlPercent,
        });
        
        toast({
          title: '💰 Take Profit Hit!',
          description: `Closed ${position.token_symbol} at +${pnlPercent.toFixed(1)}% (+$${pnlValue.toFixed(2)})`,
        });
        
        addNotification({
          title: `Take Profit: ${position.token_symbol}`,
          message: `Position closed at +${pnlPercent.toFixed(1)}% profit`,
          type: 'success',
          metadata: { pnl: pnlPercent, token: position.token_symbol },
        });
      }
      // Check stop loss
      else if (pnlPercent <= -position.stop_loss_percent) {
        closeDemoPosition(position.id, newPrice, 'stop_loss');
        
        // Return remaining funds to balance
        const returnAmount = Math.max(0, (position.entry_value + pnlValue) / 150);
        addBalance(returnAmount);
        
        results.push({
          positionId: position.id,
          symbol: position.token_symbol,
          action: 'stop_loss',
          exitPrice: newPrice,
          profitLossPercent: pnlPercent,
        });
        
        toast({
          title: '🛑 Stop Loss Hit',
          description: `Closed ${position.token_symbol} at ${pnlPercent.toFixed(1)}% (-$${Math.abs(pnlValue).toFixed(2)})`,
          variant: 'destructive',
        });
        
        addNotification({
          title: `Stop Loss: ${position.token_symbol}`,
          message: `Position closed at ${pnlPercent.toFixed(1)}% loss`,
          type: 'error',
          metadata: { pnl: pnlPercent, token: position.token_symbol },
        });
      }
    }
    
    return results;
  }, [openDemoPositions, closeDemoPosition, updateDemoPosition, addBalance, toast, addNotification]);
  
  // Start monitoring demo positions
  const startDemoMonitor = useCallback((intervalMs: number = 5000) => {
    if (isMonitoringRef.current) return;
    
    isMonitoringRef.current = true;
    console.log('Starting demo auto-exit monitor...');
    
    monitorIntervalRef.current = setInterval(() => {
      if (openDemoPositions.length > 0) {
        checkDemoExitConditions();
      }
    }, intervalMs);
  }, [checkDemoExitConditions, openDemoPositions.length]);
  
  // Stop monitoring
  const stopDemoMonitor = useCallback(() => {
    if (monitorIntervalRef.current) {
      clearInterval(monitorIntervalRef.current);
      monitorIntervalRef.current = null;
    }
    isMonitoringRef.current = false;
    console.log('Stopped demo auto-exit monitor');
  }, []);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopDemoMonitor();
    };
  }, [stopDemoMonitor]);
  
  return {
    startDemoMonitor,
    stopDemoMonitor,
    checkDemoExitConditions,
    isMonitoring: isMonitoringRef.current,
  };
}
