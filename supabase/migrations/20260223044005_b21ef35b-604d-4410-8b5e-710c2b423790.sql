
-- Fix recalculate function: audit has no updated_at, use a no-op update to trigger recalc
CREATE OR REPLACE FUNCTION public.recalculate_all_audits(since_days integer DEFAULT NULL)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF since_days IS NOT NULL THEN
    UPDATE audit SET w3c_score = w3c_score WHERE created_at >= now() - (since_days || ' days')::interval AND is_deleted = false;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSE
    UPDATE audit SET w3c_score = w3c_score WHERE is_deleted = false;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;

  RETURN v_count;
END;
$$;

-- Ensure the trigger exists
DROP TRIGGER IF EXISTS trg_calculate_audit_scores ON public.audit;
CREATE TRIGGER trg_calculate_audit_scores
  BEFORE INSERT OR UPDATE ON public.audit
  FOR EACH ROW
  EXECUTE FUNCTION public.calculate_audit_scores();

-- Ensure auto_create_share_link trigger exists
DROP TRIGGER IF EXISTS trg_auto_create_share_link ON public.audit;
CREATE TRIGGER trg_auto_create_share_link
  AFTER INSERT ON public.audit
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_share_link();
