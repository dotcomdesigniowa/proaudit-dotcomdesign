
-- Table for AI audit runs
CREATE TABLE public.ai_audit_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid REFERENCES public.audit(id) ON DELETE CASCADE,
  domain text NOT NULL,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  status text DEFAULT 'pending',
  score integer,
  score_pass integer,
  score_warn integer,
  score_fail integer,
  pillar1_score integer,
  pillar2_score integer,
  pillar3_score integer,
  pillar4_score integer,
  letter_grade text
);

ALTER TABLE public.ai_audit_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view ai audit runs"
  ON public.ai_audit_runs FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Anon can view ai audit runs"
  ON public.ai_audit_runs FOR SELECT TO anon
  USING (true);

CREATE POLICY "Service role can manage ai audit runs"
  ON public.ai_audit_runs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Index for lookups by audit_id
CREATE INDEX idx_ai_audit_runs_audit_id ON public.ai_audit_runs(audit_id);
CREATE INDEX idx_ai_audit_runs_domain ON public.ai_audit_runs(domain);

-- Table for individual factor results
CREATE TABLE public.ai_audit_factor_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_run_id uuid REFERENCES public.ai_audit_runs(id) ON DELETE CASCADE NOT NULL,
  factor_id integer NOT NULL,
  factor_name text NOT NULL,
  pillar integer NOT NULL,
  check_method text NOT NULL,
  status text NOT NULL,
  finding text,
  fix text
);

ALTER TABLE public.ai_audit_factor_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view factor results"
  ON public.ai_audit_factor_results FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Anon can view factor results"
  ON public.ai_audit_factor_results FOR SELECT TO anon
  USING (true);

CREATE POLICY "Service role can manage factor results"
  ON public.ai_audit_factor_results FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX idx_ai_audit_factor_results_run_id ON public.ai_audit_factor_results(audit_run_id);
