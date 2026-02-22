
ALTER TABLE public.audit ADD COLUMN IF NOT EXISTS scheduler_url text;

-- Create the trigger if it doesn't exist
DROP TRIGGER IF EXISTS trigger_calculate_audit_scores ON public.audit;
CREATE TRIGGER trigger_calculate_audit_scores
  BEFORE INSERT OR UPDATE ON public.audit
  FOR EACH ROW
  EXECUTE FUNCTION public.calculate_audit_scores();
