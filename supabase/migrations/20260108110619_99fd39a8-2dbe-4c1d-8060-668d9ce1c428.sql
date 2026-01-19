-- Create table for global risk settings
CREATE TABLE public.risk_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  emergency_stop_active BOOLEAN DEFAULT false,
  circuit_breaker_enabled BOOLEAN DEFAULT true,
  circuit_breaker_loss_threshold NUMERIC DEFAULT 20,
  circuit_breaker_time_window_minutes INTEGER DEFAULT 60,
  circuit_breaker_triggered_at TIMESTAMP WITH TIME ZONE,
  max_risk_score INTEGER DEFAULT 70,
  require_ownership_renounced BOOLEAN DEFAULT true,
  require_liquidity_locked BOOLEAN DEFAULT true,
  max_tax_percent NUMERIC DEFAULT 10,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.risk_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own risk settings"
ON public.risk_settings FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own risk settings"
ON public.risk_settings FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own risk settings"
ON public.risk_settings FOR UPDATE
USING (auth.uid() = user_id);

-- Create table for risk check logs
CREATE TABLE public.risk_check_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  token_address TEXT NOT NULL,
  token_symbol TEXT,
  chain TEXT DEFAULT 'solana',
  is_honeypot BOOLEAN,
  is_blacklisted BOOLEAN,
  owner_renounced BOOLEAN,
  liquidity_locked BOOLEAN,
  lock_percentage NUMERIC,
  buy_tax NUMERIC,
  sell_tax NUMERIC,
  risk_score INTEGER,
  passed_checks BOOLEAN DEFAULT false,
  rejection_reasons TEXT[],
  checked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.risk_check_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own risk check logs"
ON public.risk_check_logs FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own risk check logs"
ON public.risk_check_logs FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Add updated_at trigger
CREATE TRIGGER update_risk_settings_updated_at
BEFORE UPDATE ON public.risk_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();