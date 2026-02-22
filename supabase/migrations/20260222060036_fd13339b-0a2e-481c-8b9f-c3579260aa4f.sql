
-- Function to convert score to grade
CREATE OR REPLACE FUNCTION public.score_to_grade(score INTEGER)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE
AS $$
BEGIN
  IF score >= 90 THEN RETURN 'A';
  ELSIF score >= 80 THEN RETURN 'B';
  ELSIF score >= 70 THEN RETURN 'C';
  ELSIF score >= 60 THEN RETURN 'D';
  ELSE RETURN 'F';
  END IF;
END;
$$;

-- Trigger function to auto-calculate fields
CREATE OR REPLACE FUNCTION public.calculate_audit_scores()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- W3C Score
  NEW.w3c_score := GREATEST(0, LEAST(100, 100 - (COALESCE(NEW.w3c_issue_count, 0) * 0.5)))::INTEGER;

  -- Overall Score
  NEW.overall_score := ROUND(
    (COALESCE(NEW.w3c_score, 0) * 0.30) +
    (COALESCE(NEW.psi_mobile_score, 0) * 0.30) +
    (COALESCE(NEW.accessibility_score, 0) * 0.20) +
    (COALESCE(NEW.design_score, 35) * 0.20)
  )::INTEGER;

  -- Grades
  NEW.w3c_grade := public.score_to_grade(COALESCE(NEW.w3c_score, 0));
  NEW.psi_grade := public.score_to_grade(COALESCE(NEW.psi_mobile_score, 0));
  NEW.accessibility_grade := public.score_to_grade(COALESCE(NEW.accessibility_score, 0));
  NEW.design_grade := public.score_to_grade(COALESCE(NEW.design_score, 35));
  NEW.overall_grade := public.score_to_grade(COALESCE(NEW.overall_score, 0));

  -- Legal Risk Flag
  NEW.legal_risk_flag := COALESCE(NEW.accessibility_score, 0) < 90;

  RETURN NEW;
END;
$$;

-- Trigger on insert and update
CREATE TRIGGER audit_calculate_scores
  BEFORE INSERT OR UPDATE ON public.audit
  FOR EACH ROW
  EXECUTE FUNCTION public.calculate_audit_scores();
