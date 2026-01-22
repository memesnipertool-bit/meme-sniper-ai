-- Fix admin_settings RLS policy - remove public read access
DROP POLICY IF EXISTS "Authenticated users can view admin settings" ON public.admin_settings;

-- Ensure only admins can access admin_settings
-- The existing admin policy should remain:
-- "Only admins can view admin settings" with has_role check