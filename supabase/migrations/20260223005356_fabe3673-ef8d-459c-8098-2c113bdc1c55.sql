
-- Table: audit_shares
CREATE TABLE public.audit_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL REFERENCES public.audit(id) ON DELETE CASCADE,
  share_token text NOT NULL UNIQUE,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  view_count integer NOT NULL DEFAULT 0,
  first_viewed_at timestamptz,
  last_viewed_at timestamptz
);

CREATE INDEX idx_audit_shares_token ON public.audit_shares(share_token);
CREATE INDEX idx_audit_shares_audit_id ON public.audit_shares(audit_id);

ALTER TABLE public.audit_shares ENABLE ROW LEVEL SECURITY;

-- Authenticated users can manage their own share links
CREATE POLICY "Users can insert own share links"
ON public.audit_shares FOR INSERT TO authenticated
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can view own share links"
ON public.audit_shares FOR SELECT TO authenticated
USING (auth.uid() = created_by);

CREATE POLICY "Users can update own share links"
ON public.audit_shares FOR UPDATE TO authenticated
USING (auth.uid() = created_by);

CREATE POLICY "Users can delete own share links"
ON public.audit_shares FOR DELETE TO authenticated
USING (auth.uid() = created_by);

-- Public can look up active shares by token (for the shared route)
CREATE POLICY "Public can lookup share by token"
ON public.audit_shares FOR SELECT TO anon
USING (is_active = true AND share_token IS NOT NULL);

-- Table: audit_share_views
CREATE TABLE public.audit_share_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id uuid NOT NULL REFERENCES public.audit_shares(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text,
  referrer text
);

CREATE INDEX idx_audit_share_views_share_id ON public.audit_share_views(share_id);

ALTER TABLE public.audit_share_views ENABLE ROW LEVEL SECURITY;

-- Authenticated users can view events for their own shares
CREATE POLICY "Users can view own share views"
ON public.audit_share_views FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.audit_shares
    WHERE audit_shares.id = audit_share_views.share_id
    AND audit_shares.created_by = auth.uid()
  )
);

-- RPC function to record a view (called from edge function with service role)
CREATE OR REPLACE FUNCTION public.record_share_view(
  p_share_token text,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_referrer text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_share audit_shares%ROWTYPE;
  v_audit audit%ROWTYPE;
BEGIN
  SELECT * INTO v_share FROM audit_shares
  WHERE share_token = p_share_token
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now());

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

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

  RETURN jsonb_build_object(
    'audit_id', v_share.audit_id,
    'audit', row_to_json(v_audit)::jsonb
  );
END;
$$;
