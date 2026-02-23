
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.auto_create_share_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_token text;
BEGIN
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  
  INSERT INTO audit_shares (audit_id, share_token, created_by, is_active)
  VALUES (NEW.id, v_token, NEW.created_by, true);
  
  RETURN NEW;
END;
$function$;
