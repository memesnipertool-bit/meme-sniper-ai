-- Create api_configurations table
CREATE TABLE public.api_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_type TEXT NOT NULL,
    api_name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    api_key_encrypted TEXT,
    is_enabled BOOLEAN DEFAULT true,
    rate_limit_per_minute INTEGER DEFAULT 60,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error', 'rate_limited')),
    last_checked_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create copy_trades table
CREATE TABLE public.copy_trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    leader_address TEXT NOT NULL,
    leader_name TEXT,
    token_address TEXT NOT NULL,
    token_symbol TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('buy', 'sell')),
    amount DECIMAL(30, 18) NOT NULL,
    price DECIMAL(30, 18) NOT NULL,
    tx_id TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'executed', 'failed')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create disclaimer_acknowledgments table
CREATE TABLE public.disclaimer_acknowledgments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    user_agent TEXT,
    acknowledged_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create user_activity_logs table
CREATE TABLE public.user_activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    activity_type TEXT NOT NULL,
    activity_category TEXT NOT NULL,
    description TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create system_logs table  
CREATE TABLE public.system_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    event_category TEXT NOT NULL,
    message TEXT,
    severity TEXT DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error', 'critical')),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add suspended_at column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMP WITH TIME ZONE;

-- Add additional columns to positions table to match the interface
ALTER TABLE public.positions 
    ADD COLUMN IF NOT EXISTS chain TEXT DEFAULT 'solana',
    ADD COLUMN IF NOT EXISTS entry_value DECIMAL(30, 18),
    ADD COLUMN IF NOT EXISTS current_value DECIMAL(30, 18),
    ADD COLUMN IF NOT EXISTS profit_loss_percent DECIMAL(10, 4) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS profit_loss_value DECIMAL(30, 18) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS profit_take_percent DECIMAL(5, 2) DEFAULT 50,
    ADD COLUMN IF NOT EXISTS stop_loss_percent DECIMAL(5, 2) DEFAULT 10,
    ADD COLUMN IF NOT EXISTS exit_reason TEXT,
    ADD COLUMN IF NOT EXISTS exit_price DECIMAL(30, 18),
    ADD COLUMN IF NOT EXISTS exit_tx_id TEXT,
    ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP WITH TIME ZONE;

-- Enable RLS on new tables
ALTER TABLE public.api_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copy_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disclaimer_acknowledgments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

-- RLS for api_configurations (admin only)
CREATE POLICY "Admins can manage api configurations"
ON public.api_configurations FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view api configurations"
ON public.api_configurations FOR SELECT
TO authenticated
USING (true);

-- RLS for copy_trades
CREATE POLICY "Users can manage their own copy trades"
ON public.copy_trades FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- RLS for disclaimer_acknowledgments
CREATE POLICY "Users can manage their own disclaimer acknowledgment"
ON public.disclaimer_acknowledgments FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- RLS for user_activity_logs
CREATE POLICY "Users can view their own activity logs"
ON public.user_activity_logs FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own activity logs"
ON public.user_activity_logs FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all activity logs"
ON public.user_activity_logs FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage all activity logs"
ON public.user_activity_logs FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- RLS for system_logs
CREATE POLICY "Admins can manage system logs"
ON public.system_logs FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view their own system logs"
ON public.system_logs FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Add timestamps trigger to new tables
CREATE TRIGGER update_api_configurations_updated_at
BEFORE UPDATE ON public.api_configurations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.positions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.copy_trades;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications