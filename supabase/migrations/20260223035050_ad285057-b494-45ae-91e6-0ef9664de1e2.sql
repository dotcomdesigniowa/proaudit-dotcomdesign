
-- Add notify_on_open to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS notify_on_open boolean NOT NULL DEFAULT true;

-- Update record_share_view to check profile-level setting
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
BEGIN
  SELECT * INTO v_share FROM audit_shares
  WHERE share_token = p_share_token
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now());

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

  -- Check creator's profile-level notification preference
  SELECT COALESCE(p.notify_on_open, true) INTO v_creator_notify
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
    'view_count', v_share.view_count + 1
  );
END;
$function$;
