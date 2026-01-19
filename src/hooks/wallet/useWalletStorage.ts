// Wallet storage utilities
import { useCallback } from 'react';

export type WalletType = 'phantom' | 'solflare' | 'backpack' | 'metamask' | 'walletconnect';
export type BlockchainNetwork = 'solana' | 'ethereum' | 'bsc';

interface StoredWalletConnection {
  walletType: WalletType;
  network: BlockchainNetwork;
}

const WALLET_STORAGE_KEY = 'connected_wallet';

export function useWalletStorage() {
  const saveConnection = useCallback((walletType: WalletType, network: BlockchainNetwork) => {
    localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify({ walletType, network }));
  }, []);

  const clearConnection = useCallback(() => {
    localStorage.removeItem(WALLET_STORAGE_KEY);
  }, []);

  const getStoredConnection = useCallback((): StoredWalletConnection | null => {
    const stored = localStorage.getItem(WALLET_STORAGE_KEY);
    if (!stored) return null;
    
    try {
      return JSON.parse(stored) as StoredWalletConnection;
    } catch {
      return null;
    }
  }, []);

  return {
    saveConnection,
    clearConnection,
    getStoredConnection,
  };
}
