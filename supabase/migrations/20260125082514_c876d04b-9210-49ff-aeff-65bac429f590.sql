-- Add entry_price_usd column for consistent USD-based P&L calculations
ALTER TABLE public.positions
ADD COLUMN IF NOT EXISTS entry_price_usd numeric;

-- Update existing positions: if entry_price looks like a SOL value (very small), 
-- we'll need to mark them for later backfill via DexScreener
-- For now, copy entry_price to entry_price_usd as a placeholder
-- The real backfill should happen via the updatePricesFromDexScreener function

-- Create a comment explaining the column
COMMENT ON COLUMN public.positions.entry_price_usd IS 'Entry price in USD for consistent P&L calculations. Required for accurate profit/loss tracking.';