-- Fix security issue: Restrict admin_settings to admin users only
DROP POLICY IF EXISTS "Authenticated users can view admin settings" ON public.admin_settings;

CREATE POLICY "Only admins can view admin settings"
ON public.admin_settings
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

-- Ensure admin_settings INSERT/UPDATE/DELETE is also admin-only
DROP POLICY IF EXISTS "Admins can insert admin settings" ON public.admin_settings;
DROP POLICY IF EXISTS "Admins can update admin settings" ON public.admin_settings;
DROP POLICY IF EXISTS "Admins can delete admin settings" ON public.admin_settings;

CREATE POLICY "Admins can insert admin settings"
ON public.admin_settings
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

CREATE POLICY "Admins can update admin settings"
ON public.admin_settings
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

CREATE POLICY "Admins can delete admin settings"
ON public.admin_settings
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

-- Fix profiles table: ensure strict user_id matching (prevent enumeration)
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can view only their own profile"
ON public.profiles
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update only their own profile"
ON public.profiles
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Fix system_logs: prevent cross-user information leakage via NULL user_id logs
DROP POLICY IF EXISTS "Users can view their own logs" ON public.system_logs;

CREATE POLICY "Users can view only their own system logs"
ON public.system_logs
FOR SELECT
USING (
  user_id = auth.uid()
);

-- Admins can view all system logs including system-level ones
CREATE POLICY "Admins can view all system logs"
ON public.system_logs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);