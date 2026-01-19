-- Create table to track disclaimer acknowledgments
CREATE TABLE public.disclaimer_acknowledgments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  acknowledged_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT
);

-- Enable RLS
ALTER TABLE public.disclaimer_acknowledgments ENABLE ROW LEVEL SECURITY;

-- Users can view their own acknowledgment
CREATE POLICY "Users can view own acknowledgment"
ON public.disclaimer_acknowledgments
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own acknowledgment
CREATE POLICY "Users can insert own acknowledgment"
ON public.disclaimer_acknowledgments
FOR INSERT
WITH CHECK (auth.uid() = user_id);