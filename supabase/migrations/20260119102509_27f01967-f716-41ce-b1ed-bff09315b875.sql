-- Create api_health_metrics table for tracking API health
CREATE TABLE IF NOT EXISTS public.api_health_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_type TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  response_time_ms INTEGER,
  status_code INTEGER,
  is_success BOOLEAN DEFAULT false,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.api_health_metrics ENABLE ROW LEVEL SECURITY;

-- Only admins can view health metrics
CREATE POLICY "Admins can manage api health metrics"
ON public.api_health_metrics FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- Create index for efficient querying
CREATE INDEX idx_api_health_metrics_api_type ON public.api_health_metrics(api_type);
CREATE INDEX idx_api_health_metrics_created_at ON public.api_health_metrics(created_at DESC);

-- Add cleanup function to remove old metrics (keep last 7 days)
CREATE OR REPLACE FUNCTION public.cleanup_old_api_health_metrics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.api_health_metrics
  WHERE created_at < NOW() - INTERVAL '7 days';
END;
$$;