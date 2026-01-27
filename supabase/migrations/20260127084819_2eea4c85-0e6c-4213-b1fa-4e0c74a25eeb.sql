-- =====================================================
-- Security Fix: Remove permissive admin_settings policy
-- =====================================================
-- Drop the overly permissive policy that allows all authenticated users to read admin settings
DROP POLICY IF EXISTS "Authenticated users can view admin settings" ON public.admin_settings;

-- =====================================================
-- Security Fix: Convert profiles policies from RESTRICTIVE to PERMISSIVE
-- =====================================================
-- The profiles table currently only has RESTRICTIVE policies, which can cause 
-- unexpected access control behavior. We need to recreate them as PERMISSIVE.

-- First, drop all existing RESTRICTIVE policies
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view only their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update only their own profile" ON public.profiles;

-- Recreate as PERMISSIVE policies (default behavior)
-- Users can view their own profile
CREATE POLICY "Users can view own profile" 
ON public.profiles 
FOR SELECT 
TO authenticated
USING (auth.uid() = user_id);

-- Users can insert their own profile
CREATE POLICY "Users can insert own profile" 
ON public.profiles 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile" 
ON public.profiles 
FOR UPDATE 
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles" 
ON public.profiles 
FOR SELECT 
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Admins can update all profiles (for suspension, etc.)
CREATE POLICY "Admins can update all profiles" 
ON public.profiles 
FOR UPDATE 
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admins can delete profiles if needed
CREATE POLICY "Admins can delete profiles" 
ON public.profiles 
FOR DELETE 
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));