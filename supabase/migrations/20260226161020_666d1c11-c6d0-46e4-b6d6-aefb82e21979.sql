
CREATE TABLE public.error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  page text,
  action text,
  message text NOT NULL,
  stack text,
  metadata jsonb,
  severity text NOT NULL DEFAULT 'error'
);

ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can insert errors
CREATE POLICY "Authenticated users can insert error logs"
  ON public.error_logs FOR INSERT TO authenticated
  WITH CHECK (true);

-- Only admins can read error logs
CREATE POLICY "Admins can view error logs"
  ON public.error_logs FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true
  ));

-- Only admins can delete error logs
CREATE POLICY "Admins can delete error logs"
  ON public.error_logs FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true
  ));

-- Index for fast queries
CREATE INDEX idx_error_logs_created_at ON public.error_logs (created_at DESC);
