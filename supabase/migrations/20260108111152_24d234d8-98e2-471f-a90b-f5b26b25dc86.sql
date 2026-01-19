-- Fix the overly permissive INSERT policy on api_health_metrics
-- Drop the old policy
DROP POLICY IF EXISTS "System can insert API health metrics" ON public.api_health_metrics;

-- Create a more secure policy - only admins can insert (service role bypasses RLS anyway)
CREATE POLICY "Admins can insert API health metrics"
ON public.api_health_metrics FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'));