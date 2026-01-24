-- Add missing columns to user_sniper_settings table
ALTER TABLE public.user_sniper_settings 
ADD COLUMN IF NOT EXISTS slippage_tolerance numeric DEFAULT 15;

ALTER TABLE public.user_sniper_settings 
ADD COLUMN IF NOT EXISTS max_risk_score integer DEFAULT 70;

-- Add comments for documentation
COMMENT ON COLUMN public.user_sniper_settings.slippage_tolerance IS 'Slippage tolerance percentage for trades (default 15%)';
COMMENT ON COLUMN public.user_sniper_settings.max_risk_score IS 'Maximum risk score threshold for token filtering (0-100, default 70)';