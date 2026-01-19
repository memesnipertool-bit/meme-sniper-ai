import React, { forwardRef, useState } from "react";
import TradingHeader from "@/components/trading/TradingHeader";
import { useWallet } from "@/hooks/useWallet";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { WalletConnect } from "@/components/WalletConnect";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useSniperSettings } from "@/hooks/useSniperSettings";
import { toast } from "sonner";
import {
  Settings,
  Wallet,
  Ban,
  Star,
  X,
  Plus,
  Save,
  Loader2,
  Shield,
} from "lucide-react";

// Validate Solana address format
const isValidSolanaAddress = (address: string): boolean => {
  if (!address || typeof address !== 'string') return false;
  if (address.length < 32 || address.length > 44) return false;
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
  return base58Regex.test(address);
};

const UserSettings = forwardRef<HTMLDivElement, object>(function UserSettings(_props, ref) {
  const { user } = useAuth();
  const [newBlacklistToken, setNewBlacklistToken] = useState("");
  const [newWhitelistToken, setNewWhitelistToken] = useState("");
  const { settings, loading: settingsLoading, saving, saveSettings, updateField } = useSniperSettings();
  const { wallet, connectPhantom, disconnect } = useWallet();

  const handleConnectWallet = async () => {
    if (wallet.isConnected) {
      await disconnect();
    } else {
      await connectPhantom();
    }
  };

  const addToBlacklist = () => {
    if (!settings) return;
    const trimmed = newBlacklistToken.trim();
    if (!isValidSolanaAddress(trimmed)) {
      toast.error("Invalid Solana address format");
      return;
    }
    if (settings.token_blacklist.includes(trimmed)) {
      toast.error("Token already in blacklist");
      return;
    }
    updateField('token_blacklist', [...settings.token_blacklist, trimmed]);
    setNewBlacklistToken("");
    toast.success("Token added to blacklist");
  };

  const removeFromBlacklist = (token: string) => {
    if (!settings) return;
    updateField('token_blacklist', settings.token_blacklist.filter(t => t !== token));
    toast.success("Token removed from blacklist");
  };

  const addToWhitelist = () => {
    if (!settings) return;
    const trimmed = newWhitelistToken.trim();
    if (!isValidSolanaAddress(trimmed)) {
      toast.error("Invalid Solana address format");
      return;
    }
    if (settings.token_whitelist.includes(trimmed)) {
      toast.error("Token already in whitelist");
      return;
    }
    updateField('token_whitelist', [...settings.token_whitelist, trimmed]);
    setNewWhitelistToken("");
    toast.success("Token added to whitelist");
  };

  const removeFromWhitelist = (token: string) => {
    if (!settings) return;
    updateField('token_whitelist', settings.token_whitelist.filter(t => t !== token));
    toast.success("Token removed from whitelist");
  };

  const handleSave = async () => {
    if (!settings) return;
    try {
      await saveSettings(settings);
    } catch {
      // Error handled in hook
    }
  };

  if (settingsLoading) {
    return (
      <div className="min-h-screen bg-background">
        <TradingHeader
          walletConnected={wallet.isConnected}
          walletAddress={wallet.address || undefined}
          network={wallet.network}
          onConnectWallet={handleConnectWallet}
        />
        <div className="flex items-center justify-center pt-32">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" ref={ref}>
      <TradingHeader
        walletConnected={wallet.isConnected}
        walletAddress={wallet.address || undefined}
        network={wallet.network}
        onConnectWallet={handleConnectWallet}
      />

      <main className="relative pt-20 md:pt-24 pb-8">
        <div className="container mx-auto px-4 max-w-4xl">
          {/* Page Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-primary/10">
                <Settings className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-foreground">
                  Token Lists
                </h1>
                <p className="text-muted-foreground text-sm">
                  Manage your token blacklist and whitelist
                </p>
              </div>
            </div>
            <Button 
              onClick={handleSave} 
              disabled={saving} 
              variant="glow"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Save
            </Button>
          </div>

          {/* Wallet Status */}
          <div className="glass rounded-xl p-4 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  wallet.isConnected ? 'bg-success/20' : 'bg-warning/20'
                }`}>
                  <Wallet className={`w-5 h-5 ${wallet.isConnected ? 'text-success' : 'text-warning'}`} />
                </div>
                <div>
                  <p className="font-medium text-foreground">
                    {wallet.isConnected ? 'Wallet Connected' : 'No Wallet Connected'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {wallet.isConnected 
                      ? `${wallet.address?.slice(0, 6)}...${wallet.address?.slice(-4)}`
                      : 'Connect wallet for live trading'}
                  </p>
                </div>
              </div>
              <Button 
                variant={wallet.isConnected ? "outline" : "default"}
                onClick={handleConnectWallet}
              >
                {wallet.isConnected ? 'Disconnect' : 'Connect Wallet'}
              </Button>
            </div>
          </div>

          {/* Token Lists Grid */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Blacklist */}
            <div className="glass rounded-xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-5 h-5 text-destructive" />
                <h2 className="text-lg font-semibold text-foreground">Blacklist</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Tokens to never buy - bot will skip these during sniping
              </p>

              <div className="flex gap-2 mb-4">
                <Input
                  value={newBlacklistToken}
                  onChange={(e) => setNewBlacklistToken(e.target.value)}
                  placeholder="Enter token address..."
                  className="flex-1 font-mono text-sm"
                  onKeyDown={(e) => e.key === 'Enter' && addToBlacklist()}
                />
                <Button
                  variant="destructive"
                  size="icon"
                  onClick={addToBlacklist}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {!settings || settings.token_blacklist.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No tokens blacklisted
                  </p>
                ) : (
                  settings.token_blacklist.map((token) => (
                    <div
                      key={token}
                      className="flex items-center justify-between p-2.5 bg-destructive/10 rounded-lg border border-destructive/20"
                    >
                      <span className="font-mono text-sm text-foreground truncate flex-1">
                        {token.slice(0, 8)}...{token.slice(-6)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/20"
                        onClick={() => removeFromBlacklist(token)}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
              
              {settings && settings.token_blacklist.length > 0 && (
                <p className="text-xs text-muted-foreground mt-3">
                  {settings.token_blacklist.length} token{settings.token_blacklist.length !== 1 ? 's' : ''} blacklisted
                </p>
              )}
            </div>

            {/* Whitelist */}
            <div className="glass rounded-xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <Star className="w-5 h-5 text-success" />
                <h2 className="text-lg font-semibold text-foreground">Whitelist</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Prioritized tokens - bot will favor these during sniping
              </p>

              <div className="flex gap-2 mb-4">
                <Input
                  value={newWhitelistToken}
                  onChange={(e) => setNewWhitelistToken(e.target.value)}
                  placeholder="Enter token address..."
                  className="flex-1 font-mono text-sm"
                  onKeyDown={(e) => e.key === 'Enter' && addToWhitelist()}
                />
                <Button
                  variant="default"
                  size="icon"
                  className="bg-success hover:bg-success/90"
                  onClick={addToWhitelist}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {!settings || settings.token_whitelist.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No tokens whitelisted
                  </p>
                ) : (
                  settings.token_whitelist.map((token) => (
                    <div
                      key={token}
                      className="flex items-center justify-between p-2.5 bg-success/10 rounded-lg border border-success/20"
                    >
                      <span className="font-mono text-sm text-foreground truncate flex-1">
                        {token.slice(0, 8)}...{token.slice(-6)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-success hover:text-success hover:bg-success/20"
                        onClick={() => removeFromWhitelist(token)}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
              
              {settings && settings.token_whitelist.length > 0 && (
                <p className="text-xs text-muted-foreground mt-3">
                  {settings.token_whitelist.length} token{settings.token_whitelist.length !== 1 ? 's' : ''} whitelisted
                </p>
              )}
            </div>
          </div>

          {/* Info Card */}
          <div className="glass rounded-xl p-4 mt-6">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Shield className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h3 className="font-medium text-foreground mb-1">How Token Lists Work</h3>
                <p className="text-sm text-muted-foreground">
                  <strong>Blacklist:</strong> Tokens added here will be completely ignored by the bot, even if they meet all other criteria.
                  <br />
                  <strong>Whitelist:</strong> Prioritized tokens that the bot will favor when scanning for opportunities.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
});

export default UserSettings;
