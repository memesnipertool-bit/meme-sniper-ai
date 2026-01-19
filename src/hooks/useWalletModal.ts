import { create } from 'zustand';

interface WalletModalState {
  isOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
  setOpen: (open: boolean) => void;
}

/**
 * Global state for programmatically controlling the wallet connection modal
 * This allows any component to trigger the wallet modal open
 */
export const useWalletModal = create<WalletModalState>((set) => ({
  isOpen: false,
  openModal: () => set({ isOpen: true }),
  closeModal: () => set({ isOpen: false }),
  setOpen: (open: boolean) => set({ isOpen: open }),
}));
