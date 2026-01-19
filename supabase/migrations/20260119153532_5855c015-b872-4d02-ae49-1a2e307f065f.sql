-- Add target_buyer_positions column to user_sniper_settings table
ALTER TABLE public.user_sniper_settings 
ADD COLUMN target_buyer_positions jsonb DEFAULT '[2, 3]'::jsonb;