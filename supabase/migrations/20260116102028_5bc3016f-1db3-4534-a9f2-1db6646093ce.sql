-- Fix overpermissive RLS policy on api_health_metrics
-- Drop the policy that allows any authenticated user to insert
DROP POLICY IF EXISTS "Service can insert API health metrics" ON public.api_health_metrics;

-- Create admin-only insert policy
-- Note: Edge functions using service role key will bypass RLS anyway
CREATE POLICY "Admins can insert API health metrics"
ON public.api_health_metrics
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));