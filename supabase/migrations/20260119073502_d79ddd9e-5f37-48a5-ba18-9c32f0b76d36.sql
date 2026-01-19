-- Create trade_signals table for realtime approved trades
CREATE TABLE public.trade_signals (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    token_address TEXT NOT NULL,
    token_symbol TEXT NOT NULL,
    token_name TEXT NOT NULL,
    chain TEXT NOT NULL DEFAULT 'solana',
    liquidity NUMERIC NOT NULL DEFAULT 0,
    price_usd NUMERIC,
    risk_score INTEGER DEFAULT 50,
    trade_amount NUMERIC NOT NULL,
    slippage NUMERIC NOT NULL DEFAULT 5,
    priority TEXT NOT NULL DEFAULT 'normal',
    status TEXT NOT NULL DEFAULT 'pending', -- pending, executed, expired, cancelled
    reasons TEXT[] DEFAULT '{}',
    source TEXT, -- pumpfun, jupiter, raydium
    is_pump_fun BOOLEAN DEFAULT false,
    tx_signature TEXT,
    executed_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '5 minutes'),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    metadata JSONB DEFAULT '{}'
);

-- Enable RLS
ALTER TABLE public.trade_signals ENABLE ROW LEVEL SECURITY;

-- Users can see their own signals
CREATE POLICY "Users can view their own trade signals"
ON public.trade_signals FOR SELECT
USING (auth.uid() = user_id);

-- Users can update their own signals (mark as executed/cancelled)
CREATE POLICY "Users can update their own trade signals"
ON public.trade_signals FOR UPDATE
USING (auth.uid() = user_id);

-- Service role can insert signals (from edge functions)
CREATE POLICY "Service role can insert trade signals"
ON public.trade_signals FOR INSERT
WITH CHECK (true);

-- Users can delete expired/cancelled signals
CREATE POLICY "Users can delete their own trade signals"
ON public.trade_signals FOR DELETE
USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX idx_trade_signals_user_status ON public.trade_signals(user_id, status);
CREATE INDEX idx_trade_signals_expires ON public.trade_signals(expires_at);

-- Enable realtime for trade signals
ALTER PUBLICATION supabase_realtime ADD TABLE public.trade_signals;

-- Add RPC endpoint columns to admin_settings if needed
-- We'll store Helius RPC URL in admin settings