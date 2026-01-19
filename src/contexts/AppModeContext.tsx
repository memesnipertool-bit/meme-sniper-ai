import { createContext, useContext, useState, ReactNode, useEffect } from 'react';

export type AppMode = 'demo' | 'live';

interface AppModeContextType {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
  isDemo: boolean;
  isLive: boolean;
}

const AppModeContext = createContext<AppModeContextType | undefined>(undefined);

export function AppModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<AppMode>(() => {
    const saved = localStorage.getItem('app_mode');
    return (saved === 'live' ? 'live' : 'demo') as AppMode;
  });

  useEffect(() => {
    localStorage.setItem('app_mode', mode);
  }, [mode]);

  const value: AppModeContextType = {
    mode,
    setMode,
    isDemo: mode === 'demo',
    isLive: mode === 'live',
  };

  return (
    <AppModeContext.Provider value={value}>
      {children}
    </AppModeContext.Provider>
  );
}

export function useAppMode() {
  const context = useContext(AppModeContext);
  if (context === undefined) {
    throw new Error('useAppMode must be used within an AppModeProvider');
  }
  return context;
}
