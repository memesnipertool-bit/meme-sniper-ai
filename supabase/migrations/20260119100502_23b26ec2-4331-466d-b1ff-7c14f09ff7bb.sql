-- Create user_sniper_settings table
CREATE TABLE public.user_sniper_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    min_liquidity DECIMAL(20, 8) DEFAULT 300,
    profit_take_percentage DECIMAL(5, 2) DEFAULT 100,
    stop_loss_percentage DECIMAL(5, 2) DEFAULT 20,
    trade_amount DECIMAL(20, 8) DEFAULT 0.1,
    max_concurrent_trades INTEGER DEFAULT 3,
    priority TEXT DEFAULT 'normal' CHECK (priority IN ('normal', 'fast', 'turbo')),
    category_filters JSONB DEFAULT '["animals", "parody", "trend", "utility"]',
    token_blacklist JSONB DEFAULT '[]',
    token_whitelist JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create trade_signals table
CREATE TABLE public.trade_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    token_address TEXT NOT NULL,
    token_symbol TEXT NOT NULL,
    token_name TEXT NOT NULL,
    chain TEXT DEFAULT 'solana',
    liquidity DECIMAL(30, 18) DEFAULT 0,
    price_usd DECIMAL(30, 18),
    risk_score INTEGER DEFAULT 50,
    trade_amount DECIMAL(20, 8) NOT NULL,
    slippage DECIMAL(5, 2) DEFAULT 5,
    priority TEXT DEFAULT 'normal',
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'executed', 'expired', 'cancelled')),
    reasons JSONB DEFAULT '[]',
    source TEXT,
    is_pump_fun BOOLEAN DEFAULT false,
    tx_signature TEXT,
    executed_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on new tables
ALTER TABLE public.user_sniper_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_signals ENABLE ROW LEVEL SECURITY;

-- RLS for user_sniper_settings
CREATE POLICY "Users can manage their own sniper settings"
ON public.user_sniper_settings FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- RLS for trade_signals
CREATE POLICY "Users can manage their own trade signals"
ON public.trade_signals FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Add timestamps trigger
CREATE TRIGGER update_user_sniper_settings_updated_at
BEFORE UPDATE ON public.user_sniper_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for trade_signals
ALTER PUBLICATION supabase_realtime ADD TABLE public.trade_signals