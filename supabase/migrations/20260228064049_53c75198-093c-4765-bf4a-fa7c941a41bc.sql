
-- Add weight_ai column to scoring_settings
ALTER TABLE public.scoring_settings
  ADD COLUMN IF NOT EXISTS weight_ai NUMERIC NOT NULL DEFAULT 0.10;

-- Proportionally reduce existing weights so total = 1.00
-- new_weight = old_weight * 0.90
UPDATE public.scoring_settings
SET
  weight_w3c = ROUND(weight_w3c * 0.90, 4),
  weight_psi_mobile = ROUND(weight_psi_mobile * 0.90, 4),
  weight_accessibility = ROUND(weight_accessibility * 0.90, 4),
  weight_design = ROUND(weight_design * 0.90, 4),
  weight_ai = 0.10;

-- Recreate calculate_audit_scores trigger function to include AI weight
CREATE OR REPLACE FUNCTION public.calculate_audit_scores()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  s scoring_settings%ROWTYPE;
  v_w_w3c numeric := 0.27;
  v_w_psi numeric := 0.27;
  v_w_acc numeric := 0.18;
  v_w_des numeric := 0.18;
  v_w_ai  numeric := 0.10;
  v_penalty numeric := 0.5;
  v_a int := 90; v_b int := 80; v_c int := 70; v_d int := 60;
  v_acc_normalized numeric;
  v_include_design boolean;
  v_total_weight numeric;
BEGIN
  SELECT * INTO s FROM scoring_settings WHERE is_active = true LIMIT 1;
  IF FOUND THEN
    v_w_w3c := s.weight_w3c;
    v_w_psi := s.weight_psi_mobile;
    v_w_acc := s.weight_accessibility;
    v_w_des := s.weight_design;
    v_w_ai  := s.weight_ai;
    v_penalty := s.w3c_issue_penalty;
    v_a := s.grade_a_min; v_b := s.grade_b_min; v_c := s.grade_c_min; v_d := s.grade_d_min;
  END IF;

  v_include_design := (COALESCE(NEW.provider, '') != 'Other');

  -- W3C score
  IF NEW.w3c_issue_count IS NOT NULL THEN
    NEW.w3c_score := GREATEST(0, LEAST(100, 100 - (NEW.w3c_issue_count * v_penalty)))::INTEGER;
    NEW.w3c_grade := public.score_to_grade(NEW.w3c_score, v_a, v_b, v_c, v_d);
  ELSE
    NEW.w3c_score := NULL;
    NEW.w3c_grade := NULL;
  END IF;

  -- Accessibility normalization (1-10 to 0-100)
  IF NEW.accessibility_score IS NOT NULL THEN
    v_acc_normalized := (NEW.accessibility_score::numeric / 10.0) * 100.0;
  ELSE
    v_acc_normalized := 0;
  END IF;

  -- PSI grade
  IF NEW.psi_mobile_score IS NULL THEN
    NEW.psi_grade := NULL;
  ELSE
    NEW.psi_grade := public.score_to_grade(NEW.psi_mobile_score, v_a, v_b, v_c, v_d);
  END IF;

  -- Accessibility grade
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

  -- Design grade
  IF v_include_design THEN
    NEW.design_grade := public.score_to_grade(COALESCE(NEW.design_score, 35), v_a, v_b, v_c, v_d);
  ELSE
    NEW.design_grade := NULL;
  END IF;

  -- AI grade (already stored, but ensure it's set from ai_score)
  IF NEW.ai_score IS NOT NULL THEN
    NEW.ai_grade := public.score_to_grade(NEW.ai_score, v_a, v_b, v_c, v_d);
  END IF;

  -- Overall: require W3C, PSI, Accessibility to be present
  IF NEW.psi_mobile_score IS NULL OR NEW.accessibility_score IS NULL OR NEW.w3c_issue_count IS NULL THEN
    NEW.overall_grade := NULL;
    NEW.overall_score := NULL;
  ELSE
    IF v_include_design THEN
      NEW.overall_score := ROUND(
        (COALESCE(NEW.w3c_score, 0) * v_w_w3c) +
        (COALESCE(NEW.psi_mobile_score, 0) * v_w_psi) +
        (v_acc_normalized * v_w_acc) +
        (COALESCE(NEW.design_score, 35) * v_w_des) +
        (COALESCE(NEW.ai_score, 0) * v_w_ai)
      )::INTEGER;
    ELSE
      -- Exclude design: redistribute design weight proportionally among remaining 4
      v_total_weight := v_w_w3c + v_w_psi + v_w_acc + v_w_ai;
      NEW.overall_score := ROUND(
        (COALESCE(NEW.w3c_score, 0) * (v_w_w3c / v_total_weight)) +
        (COALESCE(NEW.psi_mobile_score, 0) * (v_w_psi / v_total_weight)) +
        (v_acc_normalized * (v_w_acc / v_total_weight)) +
        (COALESCE(NEW.ai_score, 0) * (v_w_ai / v_total_weight))
      )::INTEGER;
    END IF;
    NEW.overall_grade := public.score_to_grade(COALESCE(NEW.overall_score, 0), v_a, v_b, v_c, v_d);
  END IF;

  NEW.legal_risk_flag := (NEW.accessibility_score IS NOT NULL AND NEW.accessibility_score < 9);

  RETURN NEW;
END;
$function$;

-- Update recalculate_all_audits to trigger the scoring trigger
-- (it already works by doing a dummy update that fires the trigger)
-- No change needed there since the trigger now includes AI weight.
