import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

export interface SecretStatus {
  configured: boolean;
  secretName: string;
}

export interface ApiSecretInfo {
  apiType: string;
  secretName: string;
  configured: boolean;
  maskedKey?: string | null;
}

export function useApiSecrets() {
  const [secretStatus, setSecretStatus] = useState<Record<string, SecretStatus>>({});
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { isAdmin } = useAuth();

  const fetchSecretStatus = useCallback(async () => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke('api-secrets', {
        body: { action: 'get_secret_status' },
      });

      if (error) throw error;
      setSecretStatus(data.secretStatus || {});
    } catch (error: any) {
      console.error('Error fetching secret status:', error);
      toast({
        title: 'Error fetching API secrets status',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [isAdmin, toast]);

  const getApiKeyInfo = async (apiType: string): Promise<ApiSecretInfo | null> => {
    if (!isAdmin) return null;

    try {
      const { data, error } = await supabase.functions.invoke('api-secrets', {
        body: { action: 'get_api_key', apiType },
      });

      if (error) throw error;
      return data as ApiSecretInfo;
    } catch (error: any) {
      console.error('Error getting API key info:', error);
      toast({
        title: 'Error getting API key info',
        description: error.message,
        variant: 'destructive',
      });
      return null;
    }
  };

  const validateSecret = async (apiType: string): Promise<{ valid: boolean; message: string } | null> => {
    if (!isAdmin) return null;

    try {
      const { data, error } = await supabase.functions.invoke('api-secrets', {
        body: { action: 'validate_secret', apiType },
      });

      if (error) throw error;
      return { valid: data.valid, message: data.message || data.error };
    } catch (error: any) {
      console.error('Error validating secret:', error);
      return { valid: false, message: error.message };
    }
  };

  const saveApiKey = async (apiType: string, apiKey: string): Promise<{ success: boolean; message: string }> => {
    if (!isAdmin) return { success: false, message: 'Admin access required' };

    try {
      const { data, error } = await supabase.functions.invoke('api-secrets', {
        body: { action: 'save_api_key', apiType, apiKey },
      });

      if (error) throw error;
      
      // Refresh secret status after saving
      await fetchSecretStatus();
      
      toast({
        title: data.success ? 'API Key Saved' : 'Error',
        description: data.message,
        variant: data.success ? 'default' : 'destructive',
      });
      
      return { success: data.success, message: data.message };
    } catch (error: any) {
      console.error('Error saving API key:', error);
      toast({
        title: 'Error saving API key',
        description: error.message,
        variant: 'destructive',
      });
      return { success: false, message: error.message };
    }
  };

  const deleteApiKey = async (apiType: string): Promise<{ success: boolean; message: string }> => {
    if (!isAdmin) return { success: false, message: 'Admin access required' };

    try {
      const { data, error } = await supabase.functions.invoke('api-secrets', {
        body: { action: 'delete_api_key', apiType },
      });

      if (error) throw error;
      
      // Refresh secret status after deleting
      await fetchSecretStatus();
      
      toast({
        title: data.success ? 'API Key Removed' : 'Error',
        description: data.message,
        variant: data.success ? 'default' : 'destructive',
      });
      
      return { success: data.success, message: data.message };
    } catch (error: any) {
      console.error('Error deleting API key:', error);
      toast({
        title: 'Error deleting API key',
        description: error.message,
        variant: 'destructive',
      });
      return { success: false, message: error.message };
    }
  };

  const listRequiredSecrets = async () => {
    if (!isAdmin) return [];

    try {
      const { data, error } = await supabase.functions.invoke('api-secrets', {
        body: { action: 'list_required_secrets' },
      });

      if (error) throw error;
      return data.secrets || [];
    } catch (error: any) {
      console.error('Error listing required secrets:', error);
      return [];
    }
  };

  useEffect(() => {
    fetchSecretStatus();
  }, [fetchSecretStatus]);

  return {
    secretStatus,
    loading,
    fetchSecretStatus,
    getApiKeyInfo,
    validateSecret,
    saveApiKey,
    deleteApiKey,
    listRequiredSecrets,
  };
}
