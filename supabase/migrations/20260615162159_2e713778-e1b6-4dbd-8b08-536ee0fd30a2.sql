
-- Fix 1: Restrict anon access to ai_audit_runs to rows tied to an active share
DROP POLICY IF EXISTS "Anon can view ai audit runs" ON public.ai_audit_runs;
CREATE POLICY "Anon can view shared ai audit runs"
  ON public.ai_audit_runs FOR SELECT
  TO anon
  USING (
    audit_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.audit_shares s
      WHERE s.audit_id = ai_audit_runs.audit_id
        AND s.is_active = true
        AND (s.expires_at IS NULL OR s.expires_at > now())
    )
  );

-- Fix 2: Restrict anon access to ai_audit_factor_results similarly (via run -> audit_id -> share)
DROP POLICY IF EXISTS "Anon can view factor results" ON public.ai_audit_factor_results;
CREATE POLICY "Anon can view shared factor results"
  ON public.ai_audit_factor_results FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.ai_audit_runs r
      JOIN public.audit_shares s ON s.audit_id = r.audit_id
      WHERE r.id = ai_audit_factor_results.audit_run_id
        AND s.is_active = true
        AND (s.expires_at IS NULL OR s.expires_at > now())
    )
  );

-- Fix 3: Pin error_logs INSERT user_id to the inserting user (or null)
DROP POLICY IF EXISTS "Authenticated users can insert error logs" ON public.error_logs;
CREATE POLICY "Authenticated users can insert error logs"
  ON public.error_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (user_id IS NULL OR user_id = auth.uid())
  );

-- Fix 4: Restrict scoring_settings reads to authenticated users (was public)
DROP POLICY IF EXISTS "Anyone can read active scoring settings" ON public.scoring_settings;
CREATE POLICY "Authenticated users can read active scoring settings"
  ON public.scoring_settings FOR SELECT
  TO authenticated
  USING (is_active = true);
