-- Fix the INSERT policy to be more restrictive
DROP POLICY IF EXISTS "Service role can insert trade signals" ON public.trade_signals;

-- Edge functions use service role which bypasses RLS anyway
-- But for regular users, they shouldn't insert directly
CREATE POLICY "No direct user inserts on trade signals"
ON public.trade_signals FOR INSERT
WITH CHECK (false);

-- Add default RPC settings to admin_settings
INSERT INTO public.admin_settings (setting_key, setting_value, category)
VALUES 
  ('rpc_endpoints', '{"primary": "https://api.mainnet-beta.solana.com", "helius": null, "quicknode": null, "useHelius": false}', 'infrastructure'),
  ('trade_execution', '{"enabled": false, "autoExecute": false, "signalExpiry": 300, "maxPendingSignals": 10}', 'trading')
ON CONFLICT (setting_key) DO NOTHING;