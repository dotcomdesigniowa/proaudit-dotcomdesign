
-- 1) Add is_deleted column to audit
ALTER TABLE public.audit ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;

-- 2) Create trigger function to auto-create share link on audit insert
CREATE OR REPLACE FUNCTION public.auto_create_share_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_token text;
BEGIN
  -- Generate a secure random token (48 hex chars)
  v_token := encode(gen_random_bytes(24), 'hex');
  
  INSERT INTO audit_shares (audit_id, share_token, created_by, is_active)
  VALUES (NEW.id, v_token, NEW.created_by, true);
  
  RETURN NEW;
END;
$function$;

-- 3) Create trigger on audit insert
DROP TRIGGER IF EXISTS trg_auto_create_share_link ON public.audit;
CREATE TRIGGER trg_auto_create_share_link
  AFTER INSERT ON public.audit
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_share_link();

-- 4) Backfill: create share links for existing audits that don't have one
INSERT INTO audit_shares (audit_id, share_token, created_by, is_active)
SELECT a.id, encode(gen_random_bytes(24), 'hex'), a.created_by, true
FROM audit a
WHERE NOT EXISTS (
  SELECT 1 FROM audit_shares s WHERE s.audit_id = a.id AND s.is_active = true
)
AND a.created_by IS NOT NULL;
