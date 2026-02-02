-- Create token processing states table for persistent state tracking
-- States: NEW, PENDING, TRADED, REJECTED
CREATE TABLE public.token_processing_states (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  token_address TEXT NOT NULL,
  token_symbol TEXT,
  token_name TEXT,
  state TEXT NOT NULL DEFAULT 'NEW' CHECK (state IN ('NEW', 'PENDING', 'TRADED', 'REJECTED')),
  
  -- Discovery metadata
  discovered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  source TEXT, -- e.g., 'pump.fun', 'raydium', 'dexscreener'
  
  -- Evaluation metadata
  liquidity_at_discovery NUMERIC,
  risk_score_at_discovery INTEGER,
  buyer_position_at_discovery INTEGER,
  
  -- PENDING state tracking
  pending_since TIMESTAMP WITH TIME ZONE,
  pending_reason TEXT, -- e.g., 'no_liquidity', 'no_route', 'rate_limited'
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 5,
  retry_expires_at TIMESTAMP WITH TIME ZONE,
  
  -- TRADED state tracking
  traded_at TIMESTAMP WITH TIME ZONE,
  trade_tx_hash TEXT,
  position_id UUID,
  
  -- REJECTED state tracking
  rejected_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT, -- e.g., 'honeypot', 'liquidity_timeout', 'risk_too_high', 'not_sellable'
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Unique constraint: one state per token per user
  CONSTRAINT unique_user_token UNIQUE (user_id, token_address)
);

-- Create indexes for fast lookups
CREATE INDEX idx_token_states_user_state ON public.token_processing_states (user_id, state);
CREATE INDEX idx_token_states_token_address ON public.token_processing_states (token_address);
CREATE INDEX idx_token_states_pending_expires ON public.token_processing_states (retry_expires_at) WHERE state = 'PENDING';
CREATE INDEX idx_token_states_discovered ON public.token_processing_states (discovered_at DESC);

-- Enable RLS
ALTER TABLE public.token_processing_states ENABLE ROW LEVEL SECURITY;

-- Users can only manage their own token states
CREATE POLICY "Users can view their own token states"
  ON public.token_processing_states
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own token states"
  ON public.token_processing_states
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own token states"
  ON public.token_processing_states
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own token states"
  ON public.token_processing_states
  FOR DELETE
  USING (auth.uid() = user_id);

-- Admins can view all token states for debugging
CREATE POLICY "Admins can view all token states"
  ON public.token_processing_states
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Add trigger for updated_at
CREATE TRIGGER update_token_processing_states_updated_at
  BEFORE UPDATE ON public.token_processing_states
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();