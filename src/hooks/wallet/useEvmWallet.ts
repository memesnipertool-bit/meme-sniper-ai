// Ethereum/EVM wallet connection utilities
import { BrowserProvider, formatEther } from 'ethers';
import { useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

export type EvmNetwork = 'ethereum' | 'bsc';

export interface EvmWalletState {
  isConnected: boolean;
  address: string | null;
  balance: string | null;
  network: EvmNetwork | null;
}

export interface EthereumProvider {
  isMetaMask?: boolean;
  request: (args: { method: string; params?: any[] }) => Promise<any>;
  on: (event: string, callback: (...args: any[]) => void) => void;
  removeListener: (event: string, callback: (...args: any[]) => void) => void;
  selectedAddress: string | null;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

const BSC_CHAIN_ID = '0x38';
const ETH_CHAIN_ID = '0x1';

export function useEvmWallet() {
  const { toast } = useToast();

  const getBalance = useCallback(async (address: string, provider: BrowserProvider): Promise<string> => {
    try {
      const balance = await provider.getBalance(address);
      return parseFloat(formatEther(balance)).toFixed(4);
    } catch {
      return '0';
    }
  }, []);

  const isMetaMaskAvailable = useCallback((): boolean => {
    return !!window.ethereum?.isMetaMask;
  }, []);

  const connectMetaMask = useCallback(async (
    targetNetwork: EvmNetwork = 'ethereum'
  ): Promise<{ address: string; balance: string; network: EvmNetwork } | null> => {
    const provider = window.ethereum;

    if (!provider?.isMetaMask) {
      toast({
        title: 'MetaMask not found',
        description: 'Please install MetaMask extension',
        variant: 'destructive',
      });
      window.open('https://metamask.io/', '_blank');
      return null;
    }

    try {
      const targetChainId = targetNetwork === 'bsc' ? BSC_CHAIN_ID : ETH_CHAIN_ID;
      
      const accounts = await provider.request({ method: 'eth_requestAccounts' });
      const address = accounts[0];

      try {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: targetChainId }],
        });
      } catch (switchError: any) {
        if (switchError.code === 4902 && targetNetwork === 'bsc') {
          await provider.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: BSC_CHAIN_ID,
              chainName: 'BNB Smart Chain',
              nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
              rpcUrls: ['https://bsc-dataseed.binance.org/'],
              blockExplorerUrls: ['https://bscscan.com/'],
            }],
          });
        }
      }

      const browserProvider = new BrowserProvider(provider);
      const balance = await getBalance(address, browserProvider);
      const symbol = targetNetwork === 'bsc' ? 'BNB' : 'ETH';

      toast({ 
        title: 'Wallet connected', 
        description: `Connected to MetaMask on ${targetNetwork.toUpperCase()}` 
      });

      return { address, balance: `${balance} ${symbol}`, network: targetNetwork };
    } catch (error: any) {
      toast({
        title: 'Connection failed',
        description: error.message || 'Failed to connect to MetaMask',
        variant: 'destructive',
      });
      return null;
    }
  }, [toast, getBalance]);

  const refreshBalance = useCallback(async (
    address: string, 
    network: EvmNetwork
  ): Promise<string | null> => {
    if (!window.ethereum) return null;
    
    try {
      const browserProvider = new BrowserProvider(window.ethereum);
      const balance = await getBalance(address, browserProvider);
      const symbol = network === 'bsc' ? 'BNB' : 'ETH';
      return `${balance} ${symbol}`;
    } catch (error) {
      console.error('Failed to refresh balance:', error);
      return null;
    }
  }, [getBalance]);

  const getAccounts = useCallback(async (): Promise<string[]> => {
    if (!window.ethereum) return [];
    try {
      return await window.ethereum.request({ method: 'eth_accounts' });
    } catch {
      return [];
    }
  }, []);

  return {
    isMetaMaskAvailable,
    connectMetaMask,
    refreshBalance,
    getAccounts,
    getBalance,
  };
}
