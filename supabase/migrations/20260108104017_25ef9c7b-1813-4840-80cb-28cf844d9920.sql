-- Create enum for API types
CREATE TYPE public.api_type AS ENUM (
  'dexscreener',
  'geckoterminal',
  'birdeye',
  'dextools',
  'honeypot_rugcheck',
  'liquidity_lock',
  'trade_execution',
  'rpc_provider'
);

-- Create enum for API status
CREATE TYPE public.api_status AS ENUM (
  'active',
  'inactive',
  'error',
  'rate_limited'
);

-- Create API configurations table
CREATE TABLE public.api_configurations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  api_type api_type NOT NULL,
  api_name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  api_key_encrypted TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  rate_limit_per_minute INTEGER NOT NULL DEFAULT 60,
  status api_status NOT NULL DEFAULT 'inactive',
  last_checked_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(api_type, api_name)
);

-- Enable RLS
ALTER TABLE public.api_configurations ENABLE ROW LEVEL SECURITY;

-- Only admins can manage API configurations
CREATE POLICY "Admins can view all API configurations"
ON public.api_configurations
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert API configurations"
ON public.api_configurations
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update API configurations"
ON public.api_configurations
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete API configurations"
ON public.api_configurations
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_api_configurations_updated_at
BEFORE UPDATE ON public.api_configurations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default API configurations
INSERT INTO public.api_configurations (api_type, api_name, base_url, rate_limit_per_minute) VALUES
('dexscreener', 'DexScreener API', 'https://api.dexscreener.com', 300),
('geckoterminal', 'GeckoTerminal API', 'https://api.geckoterminal.com', 300),
('birdeye', 'Birdeye API', 'https://public-api.birdeye.so', 100),
('dextools', 'Dextools API', 'https://api.dextools.io', 60),
('honeypot_rugcheck', 'Honeypot/Rug-check API', 'https://api.honeypot.is', 60),
('liquidity_lock', 'Liquidity Lock Verification API', 'https://api.team.finance', 60),
('trade_execution', 'Jupiter Trade API', 'https://quote-api.jup.ag', 120),
('rpc_provider', 'Solana RPC', 'https://api.mainnet-beta.solana.com', 100);