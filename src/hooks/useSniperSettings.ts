import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export type SnipingPriority = 'normal' | 'fast' | 'turbo';

export interface SniperSettings {
  id?: string;
  user_id: string;
  min_liquidity: number;
  profit_take_percentage: number;
  stop_loss_percentage: number;
  trade_amount: number;
  max_concurrent_trades: number;
  priority: SnipingPriority;
  category_filters: string[];
  token_blacklist: string[];
  token_whitelist: string[];
}

const defaultSettings: Omit<SniperSettings, 'user_id'> = {
  min_liquidity: 300,
  profit_take_percentage: 100,
  stop_loss_percentage: 20,
  trade_amount: 0.1,
  max_concurrent_trades: 3,
  priority: 'normal',
  category_filters: ['animals', 'parody', 'trend', 'utility'],
  token_blacklist: [],
  token_whitelist: [],
};

export function useSniperSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<SniperSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const fetchSettings = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('user_sniper_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSettings({
          ...data,
          priority: data.priority as SnipingPriority,
        });
      } else {
        // Return default settings for new users
        setSettings({
          ...defaultSettings,
          user_id: user.id,
        });
      }
    } catch (error: any) {
      toast({
        title: 'Error loading settings',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  const saveSettings = async (newSettings: Partial<SniperSettings>) => {
    if (!user) return;

    setSaving(true);
    try {
      const settingsToSave = {
        ...settings,
        ...newSettings,
        user_id: user.id,
      };

      const { data, error } = await supabase
        .from('user_sniper_settings')
        .upsert(settingsToSave, { onConflict: 'user_id' })
        .select()
        .single();

      if (error) throw error;

      setSettings({
        ...data,
        priority: data.priority as SnipingPriority,
      });

      toast({ title: 'Settings saved successfully' });
      return data;
    } catch (error: any) {
      toast({
        title: 'Error saving settings',
        description: error.message,
        variant: 'destructive',
      });
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const updateField = <K extends keyof SniperSettings>(
    field: K,
    value: SniperSettings[K]
  ) => {
    setSettings(prev => prev ? { ...prev, [field]: value } : null);
  };

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  return {
    settings,
    loading,
    saving,
    saveSettings,
    updateField,
    fetchSettings,
  };
}
