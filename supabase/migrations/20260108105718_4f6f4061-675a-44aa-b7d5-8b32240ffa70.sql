-- Create enum for position status
CREATE TYPE public.position_status AS ENUM ('open', 'closed', 'pending');

-- Create positions table to track active trades
CREATE TABLE public.positions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  token_address TEXT NOT NULL,
  token_symbol TEXT NOT NULL,
  token_name TEXT NOT NULL,
  chain TEXT NOT NULL DEFAULT 'solana',
  entry_price NUMERIC NOT NULL,
  current_price NUMERIC NOT NULL,
  amount NUMERIC NOT NULL,
  entry_value NUMERIC NOT NULL,
  current_value NUMERIC NOT NULL,
  profit_loss_percent NUMERIC DEFAULT 0,
  profit_loss_value NUMERIC DEFAULT 0,
  profit_take_percent NUMERIC NOT NULL,
  stop_loss_percent NUMERIC NOT NULL,
  status public.position_status NOT NULL DEFAULT 'open',
  exit_reason TEXT,
  exit_price NUMERIC,
  exit_tx_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  closed_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;

-- RLS policies for positions
CREATE POLICY "Users can view their own positions" 
ON public.positions 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own positions" 
ON public.positions 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own positions" 
ON public.positions 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own positions" 
ON public.positions 
FOR DELETE 
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_positions_updated_at
BEFORE UPDATE ON public.positions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for positions
ALTER PUBLICATION supabase_realtime ADD TABLE public.positions;