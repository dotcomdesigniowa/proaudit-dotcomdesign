
-- Drop existing SELECT policies on audit
DROP POLICY IF EXISTS "Public can view audits by id" ON public.audit;
DROP POLICY IF EXISTS "Users can view own audits" ON public.audit;

-- Team-wide: all authenticated users can SELECT all audits
CREATE POLICY "Authenticated users can view all audits"
  ON public.audit FOR SELECT TO authenticated
  USING (true);

-- Drop existing SELECT policies on audit_shares
DROP POLICY IF EXISTS "Public can lookup share by token" ON public.audit_shares;
DROP POLICY IF EXISTS "Users can view own share links" ON public.audit_shares;

-- Team-wide: all authenticated users can SELECT all share links
CREATE POLICY "Authenticated users can view all share links"
  ON public.audit_shares FOR SELECT TO authenticated
  USING (true);

-- Public anon lookup by token (for edge function RPC usage)
CREATE POLICY "Anon can lookup active share by token"
  ON public.audit_shares FOR SELECT TO anon
  USING (is_active = true AND share_token IS NOT NULL);

-- Drop existing SELECT policy on audit_share_views
DROP POLICY IF EXISTS "Users can view own share views" ON public.audit_share_views;

-- Team-wide: all authenticated users can SELECT all share views
CREATE POLICY "Authenticated users can view all share views"
  ON public.audit_share_views FOR SELECT TO authenticated
  USING (true);
