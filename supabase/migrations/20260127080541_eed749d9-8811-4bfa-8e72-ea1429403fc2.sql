-- Add new position status values and columns for waiting liquidity tracking

-- Update positions table to support WAITING_FOR_LIQUIDITY status
-- Add column for tracking last liquidity check
ALTER TABLE public.positions 
ADD COLUMN IF NOT EXISTS liquidity_last_checked_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS liquidity_check_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS waiting_for_liquidity_since TIMESTAMP WITH TIME ZONE;

-- Create index for efficient querying of waiting positions
CREATE INDEX IF NOT EXISTS idx_positions_status_waiting ON public.positions(status) WHERE status = 'waiting_for_liquidity';

-- Add comment explaining the new status
COMMENT ON COLUMN public.positions.liquidity_last_checked_at IS 'Last time liquidity was checked for this position (for retry logic)';
COMMENT ON COLUMN public.positions.liquidity_check_count IS 'Number of times liquidity check has been attempted';
COMMENT ON COLUMN public.positions.waiting_for_liquidity_since IS 'When position entered WAITING_FOR_LIQUIDITY status';