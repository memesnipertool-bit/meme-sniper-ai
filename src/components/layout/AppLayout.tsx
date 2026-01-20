import { ReactNode } from "react";
import TradingHeader from "@/components/trading/TradingHeader";
import MobileTabNav from "@/components/navigation/MobileTabNav";
import { useWallet } from "@/hooks/useWallet";

interface AppLayoutProps {
  children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { wallet, connectPhantom, disconnect } = useWallet();

  const handleConnectWallet = async () => {
    if (wallet.isConnected) {
      await disconnect();
    } else {
      await connectPhantom();
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col overflow-x-hidden">
      <TradingHeader
        walletConnected={wallet.isConnected}
        walletAddress={wallet.address || undefined}
        network={wallet.network}
        onConnectWallet={handleConnectWallet}
      />
      {/* Main content: pt-16/20 for header, pb-20 on mobile for bottom nav */}
      <main className="pt-16 lg:pt-20 pb-20 lg:pb-8 flex-1 overflow-y-auto overflow-x-hidden">
        {children}
      </main>
      {/* Mobile bottom tab navigation */}
      <MobileTabNav />
    </div>
  );
}
