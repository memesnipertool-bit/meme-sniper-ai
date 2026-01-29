-- Create risk_settings table for user-specific risk configuration
CREATE TABLE public.risk_settings (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE,
    emergency_stop_active BOOLEAN NOT NULL DEFAULT false,
    circuit_breaker_enabled BOOLEAN NOT NULL DEFAULT true,
    circuit_breaker_loss_threshold NUMERIC NOT NULL DEFAULT 30,
    circuit_breaker_time_window_minutes INTEGER NOT NULL DEFAULT 60,
    circuit_breaker_triggered_at TIMESTAMP WITH TIME ZONE,
    max_risk_score INTEGER NOT NULL DEFAULT 70,
    require_ownership_renounced BOOLEAN NOT NULL DEFAULT false,
    require_liquidity_locked BOOLEAN NOT NULL DEFAULT false,
    max_tax_percent NUMERIC NOT NULL DEFAULT 10,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create risk_check_logs table for logging honeypot/risk checks
CREATE TABLE public.risk_check_logs (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID,
    token_address TEXT NOT NULL,
    token_symbol TEXT,
    chain TEXT DEFAULT 'solana',
    is_honeypot BOOLEAN DEFAULT false,
    is_blacklisted BOOLEAN DEFAULT false,
    owner_renounced BOOLEAN,
    liquidity_locked BOOLEAN,
    lock_percentage NUMERIC,
    buy_tax NUMERIC DEFAULT 0,
    sell_tax NUMERIC DEFAULT 0,
    risk_score INTEGER DEFAULT 0,
    passed_checks BOOLEAN DEFAULT true,
    rejection_reasons TEXT[] DEFAULT ARRAY[]::TEXT[],
    metadata JSONB DEFAULT '{}'::jsonb,
    checked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.risk_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_check_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for risk_settings
CREATE POLICY "Users can view their own risk settings"
ON public.risk_settings FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own risk settings"
ON public.risk_settings FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own risk settings"
ON public.risk_settings FOR UPDATE
USING (auth.uid() = user_id);

-- RLS policies for risk_check_logs
CREATE POLICY "Users can view their own risk check logs"
ON public.risk_check_logs FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own risk check logs"
ON public.risk_check_logs FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all risk check logs"
ON public.risk_check_logs FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create index for faster lookups
CREATE INDEX idx_risk_check_logs_user_id ON public.risk_check_logs(user_id);
CREATE INDEX idx_risk_check_logs_token ON public.risk_check_logs(token_address);
CREATE INDEX idx_risk_check_logs_checked_at ON public.risk_check_logs(checked_at DESC);

-- Add trigger for updated_at
CREATE TRIGGER update_risk_settings_updated_at
    BEFORE UPDATE ON public.risk_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();