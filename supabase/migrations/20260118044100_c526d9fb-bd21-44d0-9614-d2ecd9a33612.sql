-- Create system_logs table for tracking all system events (trading, sniper, etc.)
CREATE TABLE public.system_logs (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    event_type TEXT NOT NULL,
    event_category TEXT NOT NULL DEFAULT 'general',
    message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    severity TEXT NOT NULL DEFAULT 'info',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for efficient queries
CREATE INDEX idx_system_logs_user_id ON public.system_logs(user_id);
CREATE INDEX idx_system_logs_event_category ON public.system_logs(event_category);
CREATE INDEX idx_system_logs_created_at ON public.system_logs(created_at DESC);
CREATE INDEX idx_system_logs_event_type ON public.system_logs(event_type);

-- Enable RLS
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

-- Users can view their own logs
CREATE POLICY "Users can view their own system logs"
ON public.system_logs
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own logs
CREATE POLICY "Users can insert their own system logs"
ON public.system_logs
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Admins can view all system logs
CREATE POLICY "Admins can view all system logs"
ON public.system_logs
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Service role can insert logs (for edge functions)
CREATE POLICY "Service can insert system logs"
ON public.system_logs
FOR INSERT
WITH CHECK (true);

-- Create risk_check_logs table for token risk assessments
CREATE TABLE public.risk_check_logs (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID,
    token_address TEXT NOT NULL,
    token_symbol TEXT,
    risk_score INTEGER DEFAULT 0,
    is_honeypot BOOLEAN DEFAULT false,
    is_blacklisted BOOLEAN DEFAULT false,
    passed_checks BOOLEAN DEFAULT true,
    rejection_reasons TEXT[] DEFAULT ARRAY[]::TEXT[],
    metadata JSONB DEFAULT '{}'::jsonb,
    checked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_risk_check_logs_checked_at ON public.risk_check_logs(checked_at DESC);
CREATE INDEX idx_risk_check_logs_token_address ON public.risk_check_logs(token_address);
CREATE INDEX idx_risk_check_logs_passed_checks ON public.risk_check_logs(passed_checks);

-- Enable RLS
ALTER TABLE public.risk_check_logs ENABLE ROW LEVEL SECURITY;

-- Anyone can insert risk check logs (from edge functions)
CREATE POLICY "Anyone can insert risk check logs"
ON public.risk_check_logs
FOR INSERT
WITH CHECK (true);

-- Admins can view all risk check logs
CREATE POLICY "Admins can view all risk check logs"
ON public.risk_check_logs
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Users can view their own risk check logs
CREATE POLICY "Users can view their own risk check logs"
ON public.risk_check_logs
FOR SELECT
USING (auth.uid() = user_id);