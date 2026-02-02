-- Drop the existing check constraint and recreate with the new status value
ALTER TABLE public.positions DROP CONSTRAINT IF EXISTS positions_status_check;

-- Add the updated check constraint including 'waiting_for_liquidity'
ALTER TABLE public.positions ADD CONSTRAINT positions_status_check 
  CHECK (status IN ('open', 'closed', 'pending', 'waiting_for_liquidity'));