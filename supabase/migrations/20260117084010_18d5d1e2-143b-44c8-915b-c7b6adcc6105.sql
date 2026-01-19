-- Add suspension fields to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS suspended_at timestamp with time zone DEFAULT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS suspension_reason text DEFAULT NULL;

-- Create user activity logs table for tracking daily activities
CREATE TABLE IF NOT EXISTS public.user_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  activity_type text NOT NULL,
  activity_category text NOT NULL DEFAULT 'general',
  description text,
  metadata jsonb DEFAULT '{}',
  ip_address text,
  user_agent text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_user_id ON public.user_activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_created_at ON public.user_activity_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_activity_type ON public.user_activity_logs(activity_type);

-- Enable RLS
ALTER TABLE public.user_activity_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_activity_logs
CREATE POLICY "Users can view their own activity logs"
ON public.user_activity_logs
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own activity logs"
ON public.user_activity_logs
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all activity logs"
ON public.user_activity_logs
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert activity logs"
ON public.user_activity_logs
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to update profiles (for suspension)
CREATE POLICY "Admins can update all profiles"
ON public.profiles
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create daily user profit/loss summary view for analytics
CREATE OR REPLACE VIEW public.user_daily_pnl AS
SELECT 
  user_id,
  DATE(created_at) as trade_date,
  COUNT(*) as total_trades,
  COUNT(*) FILTER (WHERE status = 'closed' AND profit_loss_value > 0) as winning_trades,
  COUNT(*) FILTER (WHERE status = 'closed' AND profit_loss_value < 0) as losing_trades,
  COALESCE(SUM(entry_value), 0) as total_volume,
  COALESCE(SUM(profit_loss_value) FILTER (WHERE status = 'closed'), 0) as net_pnl,
  COALESCE(AVG(profit_loss_percent) FILTER (WHERE status = 'closed'), 0) as avg_pnl_percent
FROM public.positions
GROUP BY user_id, DATE(created_at);