-- Fix: Consolidate duplicate SELECT policies on system_logs table
-- Current state: 3 overlapping SELECT policies causing confusion
-- Target state: 2 clear policies - one for users (own logs), one for admins (all logs)

-- Drop the duplicate/overlapping SELECT policies
DROP POLICY IF EXISTS "Users can view their own system logs" ON public.system_logs;
DROP POLICY IF EXISTS "Users view own system logs" ON public.system_logs;
DROP POLICY IF EXISTS "Admins view all system logs" ON public.system_logs;

-- Create single consolidated policy for users viewing their own logs
CREATE POLICY "Users can view own system logs"
ON public.system_logs
FOR SELECT
USING (auth.uid() = user_id);

-- Note: "Admins can manage system logs" policy with has_role() function already exists
-- and covers admin SELECT access, so no additional admin SELECT policy needed