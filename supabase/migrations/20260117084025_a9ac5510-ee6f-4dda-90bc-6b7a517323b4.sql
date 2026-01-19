-- Drop the security definer view and create a regular function instead
DROP VIEW IF EXISTS public.user_daily_pnl;

-- Create a secure function that admins can call
CREATE OR REPLACE FUNCTION public.get_user_daily_pnl(
  p_user_id uuid DEFAULT NULL,
  p_start_date date DEFAULT CURRENT_DATE - INTERVAL '30 days',
  p_end_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  user_id uuid,
  trade_date date,
  total_trades bigint,
  winning_trades bigint,
  losing_trades bigint,
  total_volume numeric,
  net_pnl numeric,
  avg_pnl_percent numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT 
    p.user_id,
    DATE(p.created_at) as trade_date,
    COUNT(*) as total_trades,
    COUNT(*) FILTER (WHERE p.status = 'closed' AND p.profit_loss_value > 0) as winning_trades,
    COUNT(*) FILTER (WHERE p.status = 'closed' AND p.profit_loss_value < 0) as losing_trades,
    COALESCE(SUM(p.entry_value), 0) as total_volume,
    COALESCE(SUM(p.profit_loss_value) FILTER (WHERE p.status = 'closed'), 0) as net_pnl,
    COALESCE(AVG(p.profit_loss_percent) FILTER (WHERE p.status = 'closed'), 0) as avg_pnl_percent
  FROM public.positions p
  WHERE (p_user_id IS NULL OR p.user_id = p_user_id)
    AND DATE(p.created_at) BETWEEN p_start_date AND p_end_date
  GROUP BY p.user_id, DATE(p.created_at)
  ORDER BY trade_date DESC;
$$;