-- Add SEO columns to audit table
ALTER TABLE public.audit
  ADD COLUMN IF NOT EXISTS seo_score integer,
  ADD COLUMN IF NOT EXISTS seo_grade text,
  ADD COLUMN IF NOT EXISTS seo_status text,
  ADD COLUMN IF NOT EXISTS seo_pillar_crawlability integer,
  ADD COLUMN IF NOT EXISTS seo_pillar_onpage integer,
  ADD COLUMN IF NOT EXISTS seo_pillar_technical integer,
  ADD COLUMN IF NOT EXISTS seo_pillar_social integer,
  ADD COLUMN IF NOT EXISTS seo_factors jsonb,
  ADD COLUMN IF NOT EXISTS seo_run_at timestamptz,
  ADD COLUMN IF NOT EXISTS seo_error text;

-- Add SEO weight to scoring_settings, rebalance defaults
ALTER TABLE public.scoring_settings
  ADD COLUMN IF NOT EXISTS weight_seo numeric NOT NULL DEFAULT 0.18;

UPDATE public.scoring_settings
  SET weight_w3c = 0.22,
      weight_psi_mobile = 0.22,
      weight_accessibility = 0.16,
      weight_design = 0.12,
      weight_ai = 0.10,
      weight_seo = 0.18
  WHERE is_active = true;

-- Update calculate_audit_scores trigger to include SEO
CREATE OR REPLACE FUNCTION public.calculate_audit_scores()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  s scoring_settings%ROWTYPE;
  v_w_w3c numeric := 0.22;
  v_w_perf numeric := 0.22;
  v_w_acc numeric := 0.16;
  v_w_des numeric := 0.12;
  v_w_ai  numeric := 0.10;
  v_w_seo numeric := 0.18;
  v_penalty numeric := 0.5;
  v_a int := 90; v_b int := 80; v_c int := 70; v_d int := 60;
  v_acc_normalized numeric;
  v_include_design boolean;
  v_total_weight numeric;
  v_perf_score integer;
BEGIN
  SELECT * INTO s FROM scoring_settings WHERE is_active = true LIMIT 1;
  IF FOUND THEN
    v_w_w3c := s.weight_w3c;
    v_w_perf := s.weight_psi_mobile;
    v_w_acc := s.weight_accessibility;
    v_w_des := s.weight_design;
    v_w_ai  := s.weight_ai;
    v_w_seo := COALESCE(s.weight_seo, 0.18);
    v_penalty := s.w3c_issue_penalty;
    v_a := s.grade_a_min; v_b := s.grade_b_min; v_c := s.grade_c_min; v_d := s.grade_d_min;
  END IF;

  v_perf_score := COALESCE(NEW.gtmetrix_performance, NEW.psi_mobile_score);
  v_include_design := (COALESCE(NEW.provider, '') != 'Other');

  IF NEW.w3c_issue_count IS NOT NULL THEN
    NEW.w3c_score := GREATEST(0, LEAST(100, 100 - (NEW.w3c_issue_count * v_penalty)))::INTEGER;
    NEW.w3c_grade := public.score_to_grade(NEW.w3c_score, v_a, v_b, v_c, v_d);
  ELSE
    NEW.w3c_score := NULL;
    NEW.w3c_grade := NULL;
  END IF;

  IF NEW.accessibility_score IS NOT NULL THEN
    v_acc_normalized := (NEW.accessibility_score::numeric / 10.0) * 100.0;
  ELSE
    v_acc_normalized := 0;
  END IF;

  IF NEW.gtmetrix_grade IS NOT NULL THEN
    NEW.psi_grade := NEW.gtmetrix_grade;
  ELSIF v_perf_score IS NULL THEN
    NEW.psi_grade := NULL;
  ELSE
    NEW.psi_grade := public.score_to_grade(v_perf_score, v_a, v_b, v_c, v_d);
  END IF;

  IF NEW.gtmetrix_performance IS NOT NULL THEN
    NEW.psi_mobile_score := NEW.gtmetrix_performance;
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

  IF v_include_design THEN
    NEW.design_grade := public.score_to_grade(COALESCE(NEW.design_score, 35), v_a, v_b, v_c, v_d);
  ELSE
    NEW.design_grade := NULL;
  END IF;

  IF NEW.ai_score IS NOT NULL THEN
    NEW.ai_grade := public.score_to_grade(NEW.ai_score, v_a, v_b, v_c, v_d);
  END IF;

  IF NEW.seo_score IS NOT NULL THEN
    NEW.seo_grade := public.score_to_grade(NEW.seo_score, v_a, v_b, v_c, v_d);
  ELSE
    NEW.seo_grade := NULL;
  END IF;

  IF v_perf_score IS NULL OR NEW.accessibility_score IS NULL OR NEW.w3c_issue_count IS NULL THEN
    NEW.overall_grade := NULL;
    NEW.overall_score := NULL;
  ELSE
    IF v_include_design THEN
      v_total_weight := v_w_w3c + v_w_perf + v_w_acc + v_w_des + v_w_ai + v_w_seo;
      NEW.overall_score := ROUND(
        (COALESCE(NEW.w3c_score, 0) * v_w_w3c) +
        (v_perf_score * v_w_perf) +
        (v_acc_normalized * v_w_acc) +
        (COALESCE(NEW.design_score, 35) * v_w_des) +
        (COALESCE(NEW.ai_score, 0) * v_w_ai) +
        (COALESCE(NEW.seo_score, 0) * v_w_seo)
      )::INTEGER;
      -- normalize if weights don't sum to 1
      IF v_total_weight <> 1 AND v_total_weight > 0 THEN
        NEW.overall_score := ROUND(NEW.overall_score / v_total_weight)::INTEGER;
      END IF;
    ELSE
      v_total_weight := v_w_w3c + v_w_perf + v_w_acc + v_w_ai + v_w_seo;
      NEW.overall_score := ROUND(
        (COALESCE(NEW.w3c_score, 0) * (v_w_w3c / v_total_weight)) +
        (v_perf_score * (v_w_perf / v_total_weight)) +
        (v_acc_normalized * (v_w_acc / v_total_weight)) +
        (COALESCE(NEW.ai_score, 0) * (v_w_ai / v_total_weight)) +
        (COALESCE(NEW.seo_score, 0) * (v_w_seo / v_total_weight))
      )::INTEGER;
    END IF;
    NEW.overall_grade := public.score_to_grade(COALESCE(NEW.overall_score, 0), v_a, v_b, v_c, v_d);
  END IF;

  NEW.legal_risk_flag := (NEW.accessibility_score IS NOT NULL AND NEW.accessibility_score < 9);

  RETURN NEW;
END;
$function$;