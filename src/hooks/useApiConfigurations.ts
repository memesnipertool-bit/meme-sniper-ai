import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type ApiType = 
  | 'dexscreener'
  | 'geckoterminal'
  | 'birdeye'
  | 'dextools'
  | 'honeypot_rugcheck'
  | 'liquidity_lock'
  | 'jupiter'
  | 'raydium'
  | 'rpc_provider'
  | 'pumpfun';

export type ApiStatus = 'active' | 'inactive' | 'error' | 'rate_limited';

export interface ApiConfiguration {
  id: string;
  api_type: ApiType;
  api_name: string;
  base_url: string;
  api_key_encrypted: string | null;
  is_enabled: boolean;
  rate_limit_per_minute: number;
  status: ApiStatus;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export function useApiConfigurations() {
  const [configurations, setConfigurations] = useState<ApiConfiguration[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchConfigurations = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('api_configurations')
        .select('*')
        .order('api_type');

      if (error) throw error;
      setConfigurations((data as ApiConfiguration[]) || []);
    } catch (error: any) {
      toast({
        title: 'Error fetching API configurations',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const addConfiguration = async (config: Omit<ApiConfiguration, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'last_checked_at'>) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('api_configurations')
        .insert({ ...config, created_by: user?.id })
        .select()
        .single();

      if (error) throw error;
      setConfigurations(prev => [...prev, data as ApiConfiguration]);
      toast({ title: 'API configuration added successfully' });
      return data;
    } catch (error: any) {
      toast({
        title: 'Error adding API configuration',
        description: error.message,
        variant: 'destructive',
      });
      throw error;
    }
  };

  const updateConfiguration = async (id: string, updates: Partial<ApiConfiguration>) => {
    try {
      const { data, error } = await supabase
        .from('api_configurations')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      setConfigurations(prev => prev.map(c => c.id === id ? (data as ApiConfiguration) : c));
      toast({ title: 'API configuration updated successfully' });
      return data;
    } catch (error: any) {
      toast({
        title: 'Error updating API configuration',
        description: error.message,
        variant: 'destructive',
      });
      throw error;
    }
  };

  const deleteConfiguration = async (id: string) => {
    try {
      const { error } = await supabase
        .from('api_configurations')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setConfigurations(prev => prev.filter(c => c.id !== id));
      toast({ title: 'API configuration deleted successfully' });
    } catch (error: any) {
      toast({
        title: 'Error deleting API configuration',
        description: error.message,
        variant: 'destructive',
      });
      throw error;
    }
  };

  const toggleEnabled = async (id: string, isEnabled: boolean) => {
    return updateConfiguration(id, { 
      is_enabled: isEnabled,
      status: isEnabled ? 'active' : 'inactive'
    });
  };

  useEffect(() => {
    fetchConfigurations();
  }, []);

  return {
    configurations,
    loading,
    fetchConfigurations,
    addConfiguration,
    updateConfiguration,
    deleteConfiguration,
    toggleEnabled,
  };
}
