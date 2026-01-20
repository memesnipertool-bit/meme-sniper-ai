-- CRITICAL FIX: Restrict api_configurations to admin users only
-- This table contains encrypted API keys which should NEVER be visible to regular users

DROP POLICY IF EXISTS "Authenticated users can view api configurations" ON public.api_configurations;
DROP POLICY IF EXISTS "Admins can manage api configurations" ON public.api_configurations;

-- Only admins can SELECT api_configurations
CREATE POLICY "Only admins can view api configurations"
ON public.api_configurations
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

-- Only admins can INSERT api_configurations
CREATE POLICY "Only admins can insert api configurations"
ON public.api_configurations
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

-- Only admins can UPDATE api_configurations
CREATE POLICY "Only admins can update api configurations"
ON public.api_configurations
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

-- Only admins can DELETE api_configurations
CREATE POLICY "Only admins can delete api configurations"
ON public.api_configurations
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

-- Fix duplicate system_logs policies by consolidating them
DROP POLICY IF EXISTS "Users can view only their own system logs" ON public.system_logs;
DROP POLICY IF EXISTS "Admins can view all system logs" ON public.system_logs;

-- Users can only view logs where their user_id matches (no NULL user_id access)
CREATE POLICY "Users view own system logs"
ON public.system_logs
FOR SELECT
USING (user_id = auth.uid());

-- Admins can view all logs (including NULL user_id system logs)
CREATE POLICY "Admins view all system logs"
ON public.system_logs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);