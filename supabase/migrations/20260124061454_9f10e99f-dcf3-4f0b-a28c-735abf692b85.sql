-- Fix security issue: admin_settings readable by all authenticated users
-- Drop the overly permissive policy that allows any authenticated user to read admin settings
DROP POLICY IF EXISTS "Authenticated users can view admin settings" ON public.admin_settings;

-- The existing "Admins can manage admin settings" ALL policy and 
-- "Only admins can view admin settings" SELECT policy already restrict access properly

-- Fix security issue: user_roles publicly readable (enumeration risk)
-- Add explicit policy to deny anonymous/public access
-- First, ensure RLS is enabled (should already be)
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Add a restrictive default - require authentication for any access
-- The existing policies already use auth.uid() checks, but we want to be explicit
-- Drop any potential public access policies
DROP POLICY IF EXISTS "Public can view roles" ON public.user_roles;
DROP POLICY IF EXISTS "Anyone can view roles" ON public.user_roles;