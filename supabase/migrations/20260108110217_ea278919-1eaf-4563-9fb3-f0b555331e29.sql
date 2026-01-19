-- Create copy trading activity log table
CREATE TABLE public.copy_trades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  leader_address TEXT NOT NULL,
  leader_name TEXT,
  token_address TEXT NOT NULL,
  token_symbol TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('buy', 'sell')),
  amount NUMERIC NOT NULL,
  price NUMERIC NOT NULL,
  tx_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'executed', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.copy_trades ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own copy trades" 
ON public.copy_trades FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own copy trades" 
ON public.copy_trades FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.copy_trades;