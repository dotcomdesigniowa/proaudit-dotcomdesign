
ALTER TABLE public.audit
  ADD COLUMN IF NOT EXISTS wave_status text NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS wave_last_error text,
  ADD COLUMN IF NOT EXISTS wave_fetched_at timestamptz;

-- Update scoring trigger to handle 1-10 scale for accessibility
CREATE OR REPLACE FUNCTION public.calculate_audit_scores()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  s scoring_settings%ROWTYPE;
  v_w_w3c numeric := 0.30;
  v_w_psi numeric := 0.30;
  v_w_acc numeric := 0.20;
  v_w_des numeric := 0.20;
  v_penalty numeric := 0.5;
  v_a int := 90; v_b int := 80; v_c int := 70; v_d int := 60;
  v_acc_normalized numeric;
BEGIN
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

  -- Accessibility score is now 1-10 scale; normalize to 0-100 for overall weighting
  IF NEW.accessibility_score IS NOT NULL THEN
    v_acc_normalized := (NEW.accessibility_score::numeric / 10.0) * 100.0;
  ELSE
    v_acc_normalized := 0;
  END IF;

  NEW.overall_score := ROUND(
    (COALESCE(NEW.w3c_score, 0) * v_w_w3c) +
    (COALESCE(NEW.psi_mobile_score, 0) * v_w_psi) +
    (v_acc_normalized * v_w_acc) +
    (COALESCE(NEW.design_score, 35) * v_w_des)
  )::INTEGER;

  NEW.w3c_grade := public.score_to_grade(COALESCE(NEW.w3c_score, 0), v_a, v_b, v_c, v_d);

  IF NEW.psi_mobile_score IS NULL THEN
    NEW.psi_grade := NULL;
  ELSE
    NEW.psi_grade := public.score_to_grade(NEW.psi_mobile_score, v_a, v_b, v_c, v_d);
  END IF;

  IF NEW.accessibility_score IS NULL THEN
    NEW.accessibility_grade := NULL;
  ELSIF NEW.accessibility_score >= 9 THEN
    NEW.accessibility_grade := 'A';
  ELSIF NEW.accessibility_score >= 8 THEN
    NEW.accessibility_grade := 'B';
  ELSIF NEW.accessibility_score >= 7 THEN
    NEW.accessibility_grade := 'C';
  ELSIF NEW.accessibility_score >= 6 THEN
    NEW.accessibility_grade := 'D';
  ELSE
    NEW.accessibility_grade := 'F';
  END IF;

  NEW.design_grade := public.score_to_grade(COALESCE(NEW.design_score, 35), v_a, v_b, v_c, v_d);

  IF NEW.psi_mobile_score IS NULL OR NEW.accessibility_score IS NULL THEN
    NEW.overall_grade := NULL;
    NEW.overall_score := NULL;
  ELSE
    NEW.overall_grade := public.score_to_grade(COALESCE(NEW.overall_score, 0), v_a, v_b, v_c, v_d);
  END IF;

  NEW.legal_risk_flag := (NEW.accessibility_score IS NOT NULL AND NEW.accessibility_score < 9);

  RETURN NEW;
END;
$function$;
