
-- Add notification columns to audit_shares
ALTER TABLE public.audit_shares
  ADD COLUMN IF NOT EXISTS notify_on_open boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS opened_notified_at timestamptz;

-- Update record_share_view to return notification info for edge function to act on
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
BEGIN
  SELECT * INTO v_share FROM audit_shares
  WHERE share_token = p_share_token
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now());

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  -- Check if this is the first open
  v_is_first_open := (v_share.first_viewed_at IS NULL);

  -- Insert view record
  INSERT INTO audit_share_views (share_id, ip_address, user_agent, referrer)
  VALUES (v_share.id, p_ip_address, p_user_agent, p_referrer);

  -- Update counters
  UPDATE audit_shares SET
    view_count = view_count + 1,
    first_viewed_at = COALESCE(first_viewed_at, now()),
    last_viewed_at = now()
  WHERE id = v_share.id;

  -- Fetch audit
  SELECT * INTO v_audit FROM audit WHERE id = v_share.audit_id;

  -- Determine if we should notify
  IF v_is_first_open AND v_share.notify_on_open = true AND v_share.opened_notified_at IS NULL THEN
    v_should_notify := true;
    -- Mark as notified immediately to prevent duplicates
    UPDATE audit_shares SET opened_notified_at = now() WHERE id = v_share.id;
    -- Get creator email
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
