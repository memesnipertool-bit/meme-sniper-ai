-- Create api_health_metrics table for tracking API performance
CREATE TABLE public.api_health_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  api_type TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  response_time_ms INTEGER NOT NULL,
  status_code INTEGER NOT NULL DEFAULT 0,
  is_success BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for querying by api_type and time
CREATE INDEX idx_api_health_metrics_api_type ON public.api_health_metrics(api_type);
CREATE INDEX idx_api_health_metrics_created_at ON public.api_health_metrics(created_at DESC);

-- Enable RLS
ALTER TABLE public.api_health_metrics ENABLE ROW LEVEL SECURITY;

-- Only admins can view API health metrics
CREATE POLICY "Admins can view API health metrics"
ON public.api_health_metrics
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Service role can insert (for edge functions)
CREATE POLICY "Service can insert API health metrics"
ON public.api_health_metrics
FOR INSERT
WITH CHECK (true);

-- Insert default API configurations for the required APIs
INSERT INTO public.api_configurations (api_type, api_name, base_url, is_enabled, rate_limit_per_minute, status)
VALUES 
  ('dexscreener', 'DexScreener API', 'https://api.dexscreener.com', true, 300, 'inactive'),
  ('geckoterminal', 'GeckoTerminal API', 'https://api.geckoterminal.com', true, 30, 'inactive'),
  ('birdeye', 'Birdeye API', 'https://public-api.birdeye.so', false, 100, 'inactive'),
  ('dextools', 'Dextools / RapidAPI', 'https://public-api.dextools.io', false, 30, 'inactive'),
  ('honeypot_rugcheck', 'Honeypot/Rugcheck API', 'https://api.honeypot.is', true, 60, 'inactive'),
  ('liquidity_lock', 'Liquidity Lock API', 'https://api.team.finance', false, 30, 'inactive'),
  ('trade_execution', 'Trade Execution (Jupiter)', 'https://api.jup.ag', true, 60, 'inactive'),
  ('rpc_provider', 'Solana RPC Provider', 'https://api.mainnet-beta.solana.com', true, 100, 'inactive');