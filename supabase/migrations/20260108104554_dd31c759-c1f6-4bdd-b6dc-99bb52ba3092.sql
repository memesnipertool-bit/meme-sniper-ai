-- Create enum for sniping priority
CREATE TYPE public.sniping_priority AS ENUM ('normal', 'fast', 'turbo');

-- Create user sniper settings table
CREATE TABLE public.user_sniper_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  min_liquidity DECIMAL NOT NULL DEFAULT 300,
  profit_take_percentage DECIMAL NOT NULL DEFAULT 100,
  stop_loss_percentage DECIMAL NOT NULL DEFAULT 20,
  trade_amount DECIMAL NOT NULL DEFAULT 0.1,
  max_concurrent_trades INTEGER NOT NULL DEFAULT 3,
  priority sniping_priority NOT NULL DEFAULT 'normal',
  category_filters TEXT[] NOT NULL DEFAULT ARRAY['animals', 'parody', 'trend', 'utility'],
  token_blacklist TEXT[] NOT NULL DEFAULT '{}',
  token_whitelist TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.user_sniper_settings ENABLE ROW LEVEL SECURITY;

-- Users can only view their own settings
CREATE POLICY "Users can view their own sniper settings"
ON public.user_sniper_settings
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own settings
CREATE POLICY "Users can insert their own sniper settings"
ON public.user_sniper_settings
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own settings
CREATE POLICY "Users can update their own sniper settings"
ON public.user_sniper_settings
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own settings
CREATE POLICY "Users can delete their own sniper settings"
ON public.user_sniper_settings
FOR DELETE
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_user_sniper_settings_updated_at
BEFORE UPDATE ON public.user_sniper_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();