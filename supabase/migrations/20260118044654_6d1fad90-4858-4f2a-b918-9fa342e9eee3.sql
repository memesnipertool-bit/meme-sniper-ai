-- Create admin_settings table for global platform configuration
CREATE TABLE public.admin_settings (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    setting_key TEXT NOT NULL UNIQUE,
    setting_value JSONB NOT NULL DEFAULT '{}'::jsonb,
    category TEXT NOT NULL DEFAULT 'general',
    updated_by UUID,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_admin_settings_key ON public.admin_settings(setting_key);
CREATE INDEX idx_admin_settings_category ON public.admin_settings(category);

-- Enable RLS
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can view settings
CREATE POLICY "Admins can view all settings"
ON public.admin_settings
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can insert settings
CREATE POLICY "Admins can insert settings"
ON public.admin_settings
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can update settings
CREATE POLICY "Admins can update settings"
ON public.admin_settings
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can delete settings
CREATE POLICY "Admins can delete settings"
ON public.admin_settings
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add trigger for updated_at
CREATE TRIGGER update_admin_settings_updated_at
BEFORE UPDATE ON public.admin_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default settings
INSERT INTO public.admin_settings (setting_key, setting_value, category) VALUES
('scanner_settings', '{
  "scanInterval": "5",
  "minMarketCap": "10000",
  "maxMarketCap": "10000000",
  "minVolume24h": "5000",
  "minHolders": "50",
  "enableNewPairs": true,
  "enableTrendingFilter": true,
  "chains": ["solana", "ethereum"]
}'::jsonb, 'scanner'),
('liquidity_rules', '{
  "minLiquidity": "10000",
  "maxPriceImpact": "3",
  "minPoolAge": "5",
  "lockStatus": "any",
  "burnedLiquidity": false,
  "lpRatio": "20"
}'::jsonb, 'liquidity'),
('risk_filters', '{
  "maxRiskScore": "70",
  "honeypotCheck": true,
  "rugPullDetection": true,
  "contractVerified": true,
  "mintAuthority": true,
  "freezeAuthority": true,
  "topHolderLimit": "15",
  "devWalletLimit": "10"
}'::jsonb, 'risk'),
('trading_engine', '{
  "enabled": true,
  "maxSlippage": "5",
  "defaultBuyAmount": "0.1",
  "maxPositionSize": "1",
  "gasMultiplier": "1.5",
  "priorityFee": "0.0001",
  "retryAttempts": "3",
  "autoBuy": false,
  "autoSell": true,
  "stopLoss": "20",
  "takeProfit": "100",
  "trailingStop": false,
  "trailingStopPercent": "10"
}'::jsonb, 'trading'),
('copy_trading', '{
  "enabled": false,
  "maxWalletsToFollow": "10",
  "minWalletPnl": "50",
  "copyDelay": "0",
  "maxCopyAmount": "0.5",
  "blacklistedWallets": "",
  "whitelistedTokens": ""
}'::jsonb, 'copytrading');