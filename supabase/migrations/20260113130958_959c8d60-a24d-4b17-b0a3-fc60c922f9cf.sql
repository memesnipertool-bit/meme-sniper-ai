-- Create app_role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Create user_roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role app_role NOT NULL DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Create profiles table
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    email TEXT,
    display_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create has_role security definer function
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create user_sniper_settings table
CREATE TABLE public.user_sniper_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    min_liquidity NUMERIC NOT NULL DEFAULT 300,
    profit_take_percentage NUMERIC NOT NULL DEFAULT 100,
    stop_loss_percentage NUMERIC NOT NULL DEFAULT 20,
    trade_amount NUMERIC NOT NULL DEFAULT 0.1,
    max_concurrent_trades INTEGER NOT NULL DEFAULT 3,
    priority TEXT NOT NULL DEFAULT 'normal',
    category_filters TEXT[] DEFAULT ARRAY['animals', 'parody', 'trend', 'utility'],
    token_blacklist TEXT[] DEFAULT ARRAY[]::TEXT[],
    token_whitelist TEXT[] DEFAULT ARRAY[]::TEXT[],
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create positions table
CREATE TABLE public.positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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
    profit_take_percent NUMERIC NOT NULL DEFAULT 100,
    stop_loss_percent NUMERIC NOT NULL DEFAULT 20,
    status TEXT NOT NULL DEFAULT 'open',
    exit_reason TEXT,
    exit_price NUMERIC,
    exit_tx_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    closed_at TIMESTAMP WITH TIME ZONE
);

-- Create copy_trades table
CREATE TABLE public.copy_trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    leader_address TEXT NOT NULL,
    leader_name TEXT,
    token_address TEXT NOT NULL,
    token_symbol TEXT NOT NULL,
    action TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    price NUMERIC NOT NULL,
    tx_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create disclaimer_acknowledgments table
CREATE TABLE public.disclaimer_acknowledgments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    user_agent TEXT,
    acknowledged_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create api_configurations table (admin only)
CREATE TABLE public.api_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_type TEXT NOT NULL,
    api_name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    api_key_encrypted TEXT,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    rate_limit_per_minute INTEGER NOT NULL DEFAULT 60,
    status TEXT NOT NULL DEFAULT 'inactive',
    last_checked_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create update_updated_at_column function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_user_sniper_settings_updated_at BEFORE UPDATE ON public.user_sniper_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_positions_updated_at BEFORE UPDATE ON public.positions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_api_configurations_updated_at BEFORE UPDATE ON public.api_configurations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger to auto-create profile and user_role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (user_id, email)
    VALUES (NEW.id, NEW.email);
    
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user');
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sniper_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copy_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disclaimer_acknowledgments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_configurations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own role" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update roles" ON public.user_roles FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for user_sniper_settings
CREATE POLICY "Users can view their own settings" ON public.user_sniper_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own settings" ON public.user_sniper_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own settings" ON public.user_sniper_settings FOR UPDATE USING (auth.uid() = user_id);

-- RLS Policies for positions
CREATE POLICY "Users can view their own positions" ON public.positions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own positions" ON public.positions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own positions" ON public.positions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own positions" ON public.positions FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for copy_trades
CREATE POLICY "Users can view their own copy trades" ON public.copy_trades FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own copy trades" ON public.copy_trades FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for disclaimer_acknowledgments
CREATE POLICY "Users can view their own acknowledgment" ON public.disclaimer_acknowledgments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own acknowledgment" ON public.disclaimer_acknowledgments FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for api_configurations (admin only)
CREATE POLICY "Admins can view api configs" ON public.api_configurations FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert api configs" ON public.api_configurations FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update api configs" ON public.api_configurations FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete api configs" ON public.api_configurations FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- Enable realtime for positions table
ALTER PUBLICATION supabase_realtime ADD TABLE public.positions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.copy_trades;