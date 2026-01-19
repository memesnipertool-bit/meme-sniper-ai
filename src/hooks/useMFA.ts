import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface MFAFactor {
  id: string;
  factor_type: 'totp';
  friendly_name?: string;
  created_at: string;
  updated_at: string;
  status: 'verified' | 'unverified';
}

interface EnrollmentData {
  id: string;
  type: 'totp';
  totp: {
    qr_code: string;
    secret: string;
    uri: string;
  };
}

export function useMFA() {
  const [factors, setFactors] = useState<MFAFactor[]>([]);
  const [loading, setLoading] = useState(false);
  const [enrollmentData, setEnrollmentData] = useState<EnrollmentData | null>(null);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const { toast } = useToast();

  // Fetch MFA factors for the current user
  const fetchFactors = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.auth.mfa.listFactors();
      
      if (error) throw error;
      
      setFactors(data?.totp || []);
    } catch (error: any) {
      console.error('Error fetching MFA factors:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Start MFA enrollment - generates QR code
  const startEnrollment = useCallback(async (friendlyName: string = 'Authenticator App') => {
    try {
      setIsEnrolling(true);
      
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName,
      });

      if (error) throw error;

      setEnrollmentData(data as EnrollmentData);
      
      return data;
    } catch (error: any) {
      toast({
        title: 'Enrollment Failed',
        description: error.message,
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsEnrolling(false);
    }
  }, [toast]);

  // Verify and complete enrollment with TOTP code
  const verifyEnrollment = useCallback(async (factorId: string, code: string) => {
    try {
      setLoading(true);

      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId,
      });

      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code,
      });

      if (verifyError) throw verifyError;

      toast({
        title: '2FA Enabled',
        description: 'Two-factor authentication has been set up successfully.',
      });

      setEnrollmentData(null);
      await fetchFactors();
      
      return true;
    } catch (error: any) {
      toast({
        title: 'Verification Failed',
        description: error.message || 'Invalid code. Please try again.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setLoading(false);
    }
  }, [toast, fetchFactors]);

  // Remove/unenroll a factor
  const removeFactor = useCallback(async (factorId: string) => {
    try {
      setLoading(true);

      const { error } = await supabase.auth.mfa.unenroll({
        factorId,
      });

      if (error) throw error;

      toast({
        title: '2FA Removed',
        description: 'Two-factor authentication has been disabled.',
      });

      await fetchFactors();
      return true;
    } catch (error: any) {
      toast({
        title: 'Removal Failed',
        description: error.message,
        variant: 'destructive',
      });
      return false;
    } finally {
      setLoading(false);
    }
  }, [toast, fetchFactors]);

  // Cancel enrollment
  const cancelEnrollment = useCallback(() => {
    setEnrollmentData(null);
  }, []);

  // Check if MFA is enabled
  const isMFAEnabled = factors.some((f) => f.status === 'verified');

  // Load factors on mount
  useEffect(() => {
    fetchFactors();
  }, [fetchFactors]);

  return {
    factors,
    loading,
    isEnrolling,
    enrollmentData,
    isMFAEnabled,
    startEnrollment,
    verifyEnrollment,
    removeFactor,
    cancelEnrollment,
    fetchFactors,
  };
}
