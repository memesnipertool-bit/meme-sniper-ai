-- Create table for system event logs
CREATE TABLE public.system_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL,
  event_category TEXT NOT NULL,
  message TEXT,
  metadata JSONB DEFAULT '{}',
  severity TEXT DEFAULT 'info',
  user_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for efficient querying
CREATE INDEX idx_system_logs_category ON public.system_logs(event_category);
CREATE INDEX idx_system_logs_created_at ON public.system_logs(created_at DESC);
CREATE INDEX idx_system_logs_severity ON public.system_logs(severity);

-- Enable RLS
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view system logs
CREATE POLICY "Admins can view all system logs"
ON public.system_logs FOR SELECT
USING (has_role(auth.uid(), 'admin'));

-- Only admins can insert logs (though edge functions with service role can bypass)
CREATE POLICY "Admins can insert system logs"
ON public.system_logs FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Create table for API health metrics
CREATE TABLE public.api_health_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  api_type TEXT NOT NULL,
  endpoint TEXT,
  response_time_ms INTEGER,
  status_code INTEGER,
  is_success BOOLEAN DEFAULT true,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_api_health_created_at ON public.api_health_metrics(created_at DESC);
CREATE INDEX idx_api_health_api_type ON public.api_health_metrics(api_type);

-- Enable RLS
ALTER TABLE public.api_health_metrics ENABLE ROW LEVEL SECURITY;

-- Only admins can view API health metrics
CREATE POLICY "Admins can view API health metrics"
ON public.api_health_metrics FOR SELECT
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "System can insert API health metrics"
ON public.api_health_metrics FOR INSERT
WITH CHECK (true);