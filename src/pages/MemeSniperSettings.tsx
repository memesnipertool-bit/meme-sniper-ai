import React, { forwardRef, useState } from 'react';
import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSniperSettings } from "@/hooks/useSniperSettings";
import { useWallet } from "@/hooks/useWallet";
import { isValidSolanaAddress } from "@/lib/sniperValidation";
import {
  Save,
  Loader2,
  Shield,
  Plus,
  X,
  Star,
  Info,
  ListFilter,
} from "lucide-react";
import { toast } from "sonner";

const MemeSniperSettings = forwardRef<HTMLDivElement, object>(function MemeSniperSettings(_props, ref) {
  const { settings, loading, saving, saveSettings, updateField } = useSniperSettings();
  const { wallet, connectPhantom, disconnect } = useWallet();
  const [newBlacklistToken, setNewBlacklistToken] = useState('');
  const [newWhitelistToken, setNewWhitelistToken] = useState('');

  const handleConnectWallet = async () => {
    if (wallet.isConnected) {
      await disconnect();
    } else {
      await connectPhantom();
    }
  };

  const handleSave = async () => {
    if (!settings) return;
    try {
      await saveSettings(settings);
    } catch {
      // Error already handled in hook
    }
  };

  const addToBlacklist = () => {
    if (!settings || !newBlacklistToken.trim()) return;
    
    const trimmed = newBlacklistToken.trim();
    
    if (!isValidSolanaAddress(trimmed)) {
      toast.error('Invalid Solana token address format');
      return;
    }
    
    if (settings.token_blacklist.includes(trimmed)) {
      toast.error('Token already in blacklist');
      return;
    }
    
    updateField('token_blacklist', [...settings.token_blacklist, trimmed]);
    setNewBlacklistToken('');
    toast.success('Token added to blacklist');
  };

  const removeFromBlacklist = (token: string) => {
    if (!settings) return;
    updateField('token_blacklist', settings.token_blacklist.filter(t => t !== token));
    toast.success('Token removed from blacklist');
  };

  const addToWhitelist = () => {
    if (!settings || !newWhitelistToken.trim()) return;
    
    const trimmed = newWhitelistToken.trim();
    
    if (!isValidSolanaAddress(trimmed)) {
      toast.error('Invalid Solana token address format');
      return;
    }
    
    if (settings.token_whitelist.includes(trimmed)) {
      toast.error('Token already in whitelist');
      return;
    }
    
    updateField('token_whitelist', [...settings.token_whitelist, trimmed]);
    setNewWhitelistToken('');
    toast.success('Token added to whitelist');
  };

  const removeFromWhitelist = (token: string) => {
    if (!settings) return;
    updateField('token_whitelist', settings.token_whitelist.filter(t => t !== token));
    toast.success('Token removed from whitelist');
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center pt-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (!settings) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center pt-12">
          <p className="text-muted-foreground">Please sign in to access settings.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container mx-auto max-w-4xl px-4">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-primary/20">
              <ListFilter className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">
                Token Lists
              </h1>
              <p className="text-muted-foreground text-sm">
                Manage blacklist and whitelist for token filtering
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

          {/* Info Card */}
          <Card className="mb-6 border-primary/20 bg-primary/5">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="text-foreground font-medium mb-1">How Token Lists Work</p>
                  <p className="text-muted-foreground">
                    <strong>Blacklist:</strong> Tokens added here will be completely ignored by the bot.
                    <br />
                    <strong>Whitelist:</strong> Prioritized tokens that bypass some safety checks.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Token Lists Grid */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Blacklist */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-destructive" />
                  Blacklist
                </CardTitle>
                <CardDescription>Tokens to never buy</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Token address..."
                    value={newBlacklistToken}
                    onChange={(e) => setNewBlacklistToken(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addToBlacklist()}
                    className="font-mono text-sm"
                  />
                  <Button size="icon" onClick={addToBlacklist} variant="destructive">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {settings.token_blacklist.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No tokens blacklisted</p>
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
                {settings.token_blacklist.length > 0 && (
                  <Badge variant="destructive" className="text-xs">
                    {settings.token_blacklist.length} token{settings.token_blacklist.length !== 1 ? 's' : ''}
                  </Badge>
                )}
              </CardContent>
            </Card>

            {/* Whitelist */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Star className="h-5 w-5 text-success" />
                  Whitelist
                </CardTitle>
                <CardDescription>Prioritized tokens</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Token address..."
                    value={newWhitelistToken}
                    onChange={(e) => setNewWhitelistToken(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addToWhitelist()}
                    className="font-mono text-sm"
                  />
                  <Button size="icon" onClick={addToWhitelist} className="bg-success hover:bg-success/90">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {settings.token_whitelist.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No tokens whitelisted</p>
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
                {settings.token_whitelist.length > 0 && (
                  <Badge className="bg-success/20 text-success text-xs">
                    {settings.token_whitelist.length} token{settings.token_whitelist.length !== 1 ? 's' : ''}
                  </Badge>
                )}
              </CardContent>
            </Card>
        </div>
      </div>
    </AppLayout>
  );
});

export default MemeSniperSettings;
