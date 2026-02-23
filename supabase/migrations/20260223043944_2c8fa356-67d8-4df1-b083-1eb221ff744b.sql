
-- 1. Add is_admin to profiles
ALTER TABLE public.profiles ADD COLUMN is_admin boolean NOT NULL DEFAULT false;

-- 2. Create scoring_settings table
CREATE TABLE public.scoring_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  weight_w3c numeric NOT NULL DEFAULT 0.30,
  weight_psi_mobile numeric NOT NULL DEFAULT 0.30,
  weight_accessibility numeric NOT NULL DEFAULT 0.20,
  weight_design numeric NOT NULL DEFAULT 0.20,
  w3c_issue_penalty numeric NOT NULL DEFAULT 0.5,
  grade_a_min integer NOT NULL DEFAULT 90,
  grade_b_min integer NOT NULL DEFAULT 80,
  grade_c_min integer NOT NULL DEFAULT 70,
  grade_d_min integer NOT NULL DEFAULT 60
);

ALTER TABLE public.scoring_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can read/write scoring_settings
CREATE POLICY "Admins can view scoring settings"
  ON public.scoring_settings FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Admins can insert scoring settings"
  ON public.scoring_settings FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Admins can update scoring settings"
  ON public.scoring_settings FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- Allow the trigger function (SECURITY DEFINER) to read settings;
-- also allow anon to read for the calculate function context
CREATE POLICY "Anyone can read active scoring settings"
  ON public.scoring_settings FOR SELECT
  USING (is_active = true);

-- Insert default row
INSERT INTO public.scoring_settings (is_active) VALUES (true);

-- 3. Update score_to_grade to accept thresholds
CREATE OR REPLACE FUNCTION public.score_to_grade(score integer, a_min integer DEFAULT 90, b_min integer DEFAULT 80, c_min integer DEFAULT 70, d_min integer DEFAULT 60)
  RETURNS text
  LANGUAGE plpgsql
  IMMUTABLE
  SET search_path TO 'public'
AS $$
BEGIN
  IF score >= a_min THEN RETURN 'A';
  ELSIF score >= b_min THEN RETURN 'B';
  ELSIF score >= c_min THEN RETURN 'C';
  ELSIF score >= d_min THEN RETURN 'D';
  ELSE RETURN 'F';
  END IF;
END;
$$;

-- 4. Update calculate_audit_scores to use scoring_settings
CREATE OR REPLACE FUNCTION public.calculate_audit_scores()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
DECLARE
  s scoring_settings%ROWTYPE;
  v_w_w3c numeric := 0.30;
  v_w_psi numeric := 0.30;
  v_w_acc numeric := 0.20;
  v_w_des numeric := 0.20;
  v_penalty numeric := 0.5;
  v_a int := 90; v_b int := 80; v_c int := 70; v_d int := 60;
BEGIN
  -- Try to load active settings, fall back to defaults
  SELECT * INTO s FROM scoring_settings WHERE is_active = true LIMIT 1;
  IF FOUND THEN
    v_w_w3c := s.weight_w3c;
    v_w_psi := s.weight_psi_mobile;
    v_w_acc := s.weight_accessibility;
    v_w_des := s.weight_design;
    v_penalty := s.w3c_issue_penalty;
    v_a := s.grade_a_min; v_b := s.grade_b_min; v_c := s.grade_c_min; v_d := s.grade_d_min;
  END IF;

  NEW.w3c_score := GREATEST(0, LEAST(100, 100 - (COALESCE(NEW.w3c_issue_count, 0) * v_penalty)))::INTEGER;
  NEW.overall_score := ROUND(
    (COALESCE(NEW.w3c_score, 0) * v_w_w3c) +
    (COALESCE(NEW.psi_mobile_score, 0) * v_w_psi) +
    (COALESCE(NEW.accessibility_score, 0) * v_w_acc) +
    (COALESCE(NEW.design_score, 35) * v_w_des)
  )::INTEGER;
  NEW.w3c_grade := public.score_to_grade(COALESCE(NEW.w3c_score, 0), v_a, v_b, v_c, v_d);
  NEW.psi_grade := public.score_to_grade(COALESCE(NEW.psi_mobile_score, 0), v_a, v_b, v_c, v_d);
  NEW.accessibility_grade := public.score_to_grade(COALESCE(NEW.accessibility_score, 0), v_a, v_b, v_c, v_d);
  NEW.design_grade := public.score_to_grade(COALESCE(NEW.design_score, 35), v_a, v_b, v_c, v_d);
  NEW.overall_grade := public.score_to_grade(COALESCE(NEW.overall_score, 0), v_a, v_b, v_c, v_d);
  NEW.legal_risk_flag := COALESCE(NEW.accessibility_score, 0) < 90;
  RETURN NEW;
END;
$$;

-- 5. Create recalculate function for admin use
CREATE OR REPLACE FUNCTION public.recalculate_all_audits(since_days integer DEFAULT NULL)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_count integer := 0;
  r audit%ROWTYPE;
BEGIN
  -- Verify caller is admin
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Touch each audit row to re-trigger the calculate_audit_scores trigger
  IF since_days IS NOT NULL THEN
    UPDATE audit SET updated_at = updated_at WHERE created_at >= now() - (since_days || ' days')::interval AND is_deleted = false;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSE
    UPDATE audit SET updated_at = updated_at WHERE is_deleted = false;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;

  RETURN v_count;
END;
$$;
