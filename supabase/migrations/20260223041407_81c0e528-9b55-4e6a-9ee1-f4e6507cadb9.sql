
-- Add slug and short_token columns to audit_shares
ALTER TABLE public.audit_shares ADD COLUMN slug text;
ALTER TABLE public.audit_shares ADD COLUMN short_token text;

-- Create unique index on short_token (only for non-null values)
CREATE UNIQUE INDEX idx_audit_shares_short_token ON public.audit_shares (short_token) WHERE short_token IS NOT NULL;

-- Backfill existing rows: generate slug from audit.company_name, short_token from first 8 chars of share_token
UPDATE public.audit_shares AS s
SET 
  slug = LOWER(REGEXP_REPLACE(REGEXP_REPLACE(TRIM(COALESCE(a.company_name, 'audit')), '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g')),
  short_token = LEFT(s.share_token, 8)
FROM public.audit AS a
WHERE s.audit_id = a.id;

-- Update auto_create_share_link trigger to also generate slug and short_token
CREATE OR REPLACE FUNCTION public.auto_create_share_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_token text;
  v_slug text;
  v_short text;
BEGIN
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_short := LEFT(encode(extensions.gen_random_bytes(4), 'hex'), 8);
  v_slug := LOWER(REGEXP_REPLACE(REGEXP_REPLACE(TRIM(COALESCE(NEW.company_name, 'audit')), '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g'));

  INSERT INTO audit_shares (audit_id, share_token, created_by, is_active, slug, short_token)
  VALUES (NEW.id, v_token, NEW.created_by, true, v_slug, v_short);

  RETURN NEW;
END;
$function$;

-- Update record_share_view to also support lookup by short_token
CREATE OR REPLACE FUNCTION public.record_share_view(p_share_token text, p_ip_address text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text, p_referrer text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_share audit_shares%ROWTYPE;
  v_audit audit%ROWTYPE;
  v_is_first_open boolean := false;
  v_should_notify boolean := false;
  v_creator_email text;
  v_creator_notify boolean := false;
  v_scheduler_url text;
BEGIN
  -- Try full token first, then short_token
  SELECT * INTO v_share FROM audit_shares
  WHERE share_token = p_share_token
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now());

  IF NOT FOUND THEN
    SELECT * INTO v_share FROM audit_shares
    WHERE short_token = p_share_token
      AND is_active = true
      AND (expires_at IS NULL OR expires_at > now());
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  v_is_first_open := (v_share.first_viewed_at IS NULL);

  INSERT INTO audit_share_views (share_id, ip_address, user_agent, referrer)
  VALUES (v_share.id, p_ip_address, p_user_agent, p_referrer);

  UPDATE audit_shares SET
    view_count = view_count + 1,
    first_viewed_at = COALESCE(first_viewed_at, now()),
    last_viewed_at = now()
  WHERE id = v_share.id;

  SELECT * INTO v_audit FROM audit WHERE id = v_share.audit_id;

  SELECT COALESCE(p.notify_on_open, true), p.scheduler_url
  INTO v_creator_notify, v_scheduler_url
  FROM profiles p WHERE p.id = v_share.created_by;

  IF v_is_first_open AND v_creator_notify = true AND v_share.opened_notified_at IS NULL THEN
    v_should_notify := true;
    UPDATE audit_shares SET opened_notified_at = now() WHERE id = v_share.id;
    SELECT email INTO v_creator_email FROM auth.users WHERE id = v_share.created_by;
  END IF;

  RETURN jsonb_build_object(
    'audit_id', v_share.audit_id,
    'audit', row_to_json(v_audit)::jsonb,
    'should_notify', v_should_notify,
    'notify_email', v_creator_email,
    'company_name', v_audit.company_name,
    'share_token', p_share_token,
    'view_count', v_share.view_count + 1,
    'scheduler_url', v_scheduler_url,
    'slug', v_share.slug,
    'short_token', v_share.short_token
  );
END;
$function$;
