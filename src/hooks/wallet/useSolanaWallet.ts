// Solana wallet connection utilities
import { Connection, PublicKey, LAMPORTS_PER_SOL, Transaction, VersionedTransaction, SendOptions } from '@solana/web3.js';
import { useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';

export type SolanaWalletType = 'phantom' | 'solflare' | 'backpack';

export interface SolanaWalletState {
  isConnected: boolean;
  address: string | null;
  balance: string | null;
  walletType: SolanaWalletType | null;
}

export interface SolanaProvider {
  isPhantom?: boolean;
  isSolflare?: boolean;
  isBackpack?: boolean;
  connect: (options?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: PublicKey }>;
  disconnect: () => Promise<void>;
  on: (event: string, callback: (args: any) => void) => void;
  off: (event: string, callback: (args: any) => void) => void;
  publicKey: PublicKey | null;
  signTransaction: <T extends Transaction | VersionedTransaction>(transaction: T) => Promise<T>;
  signAllTransactions: <T extends Transaction | VersionedTransaction>(transactions: T[]) => Promise<T[]>;
  signMessage: (message: Uint8Array) => Promise<{ signature: Uint8Array }>;
  signAndSendTransaction: (
    transaction: Transaction | VersionedTransaction,
    options?: SendOptions
  ) => Promise<{ signature: string }>;
}

declare global {
  interface Window {
    solana?: SolanaProvider;
    solflare?: SolanaProvider;
    backpack?: SolanaProvider;
  }
}

// Use multiple RPC endpoints with fallback for reliability
// Priority: custom public RPC > widely-available public endpoints
const SOLANA_RPC_ENDPOINTS = [
  import.meta.env.VITE_SOLANA_RPC_URL,
  'https://rpc.ankr.com/solana',
  'https://api.mainnet-beta.solana.com',
  'https://solana.public-rpc.com',
].filter(Boolean) as string[];

export function useSolanaConnection() {
  const rpcIndexRef = useRef(0);
  const connectionRef = useRef<Connection | null>(null);

  const getConnection = useCallback(() => {
    if (!connectionRef.current) {
      const rpcUrl = SOLANA_RPC_ENDPOINTS[rpcIndexRef.current] || SOLANA_RPC_ENDPOINTS[0];
      connectionRef.current = new Connection(rpcUrl, {
        commitment: 'confirmed',
        confirmTransactionInitialTimeout: 60000,
      });
    }
    return connectionRef.current;
  }, []);

  const switchRpcEndpoint = useCallback(() => {
    rpcIndexRef.current = (rpcIndexRef.current + 1) % SOLANA_RPC_ENDPOINTS.length;
    connectionRef.current = null;
    console.log(`Switched to RPC endpoint: ${SOLANA_RPC_ENDPOINTS[rpcIndexRef.current]}`);
  }, []);

  const getBalance = useCallback(async (publicKey: string, retries = 2): Promise<string> => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const connection = getConnection();
        const balance = await connection.getBalance(new PublicKey(publicKey));
        return (balance / LAMPORTS_PER_SOL).toFixed(4);
      } catch (error: any) {
        console.error(`Failed to get Solana balance (attempt ${attempt + 1}):`, error);
        
        if (error?.message?.includes('403') || error?.message?.includes('Access forbidden') || error?.name === 'TypeError') {
          switchRpcEndpoint();
        }
        
        if (attempt === retries) {
          return '0';
        }
      }
    }
    return '0';
  }, [getConnection, switchRpcEndpoint]);

  return {
    getConnection,
    switchRpcEndpoint,
    getBalance,
  };
}

export function useSolanaProvider() {
  const { toast } = useToast();

  const getProvider = useCallback((walletType: SolanaWalletType): SolanaProvider | null => {
    switch (walletType) {
      case 'phantom':
        return window.solana?.isPhantom ? window.solana : null;
      case 'solflare':
        return window.solflare?.isSolflare ? window.solflare : null;
      case 'backpack':
        return window.backpack?.isBackpack ? window.backpack : null;
      default:
        return null;
    }
  }, []);

  const isProviderAvailable = useCallback((walletType: SolanaWalletType): boolean => {
    return getProvider(walletType) !== null;
  }, [getProvider]);

  const signTransaction = useCallback(async <T extends Transaction | VersionedTransaction>(
    walletType: SolanaWalletType,
    transaction: T
  ): Promise<T | null> => {
    const provider = getProvider(walletType);
    if (!provider) {
      toast({
        title: 'Provider not found',
        description: 'Wallet provider is not available',
        variant: 'destructive',
      });
      return null;
    }

    try {
      return await provider.signTransaction(transaction);
    } catch (error: any) {
      if (error.code === 4001) {
        toast({
          title: 'Transaction rejected',
          description: 'You rejected the transaction',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Signing failed',
          description: error.message || 'Failed to sign transaction',
          variant: 'destructive',
        });
      }
      return null;
    }
  }, [getProvider, toast]);

  const signAndSendTransaction = useCallback(async (
    walletType: SolanaWalletType,
    transaction: Transaction | VersionedTransaction,
    options?: SendOptions
  ): Promise<{ signature: string; success: boolean; error?: string }> => {
    const provider = getProvider(walletType);
    if (!provider) {
      return { signature: '', success: false, error: 'Provider not found' };
    }

    try {
      const result = await provider.signAndSendTransaction(transaction, options);
      toast({
        title: 'Transaction sent',
        description: `Signature: ${result.signature.slice(0, 8)}...`,
      });
      return { signature: result.signature, success: true };
    } catch (error: any) {
      const errorMessage = error.code === 4001 
        ? 'Transaction rejected by user'
        : error.message || 'Transaction failed';
      
      toast({
        title: 'Transaction failed',
        description: errorMessage,
        variant: 'destructive',
      });

      return { signature: '', success: false, error: errorMessage };
    }
  }, [getProvider, toast]);

  const signMessage = useCallback(async (
    walletType: SolanaWalletType,
    message: string
  ): Promise<Uint8Array | null> => {
    const provider = getProvider(walletType);
    if (!provider) {
      toast({
        title: 'Provider not found',
        description: 'Wallet provider is not available',
        variant: 'destructive',
      });
      return null;
    }

    try {
      const encodedMessage = new TextEncoder().encode(message);
      const result = await provider.signMessage(encodedMessage);
      return result.signature;
    } catch (error: any) {
      if (error.code === 4001) {
        toast({
          title: 'Signing rejected',
          description: 'You rejected the message signing',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Signing failed',
          description: error.message || 'Failed to sign message',
          variant: 'destructive',
        });
      }
      return null;
    }
  }, [getProvider, toast]);

  return {
    getProvider,
    isProviderAvailable,
    signTransaction,
    signAndSendTransaction,
    signMessage,
  };
}
