-- Add DELETE policy for risk_settings table
CREATE POLICY "Users can delete their own risk settings"
ON public.risk_settings
FOR DELETE
USING (auth.uid() = user_id);