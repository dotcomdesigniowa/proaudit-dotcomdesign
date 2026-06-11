
-- 1) Prevent privilege escalation via profiles UPDATE
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND is_admin = (SELECT p.is_admin FROM public.profiles p WHERE p.id = auth.uid())
);

-- 2) Tighten error_logs INSERT (was WITH CHECK true)
DROP POLICY IF EXISTS "Authenticated users can insert error logs" ON public.error_logs;
CREATE POLICY "Authenticated users can insert error logs"
ON public.error_logs
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- 3) Explicit no-op INSERT policy on audit_share_views (server-side SECURITY DEFINER fn handles writes via service role; this just documents that direct client inserts are blocked)
-- No policy needed because absence = deny. Skipping.

-- 4) Restrict EXECUTE on internal/admin/trigger functions
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_audit_created_by() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.calculate_audit_scores() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_create_share_link() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_share_view(text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalculate_all_audits(integer) FROM PUBLIC, anon;

-- 5) Avatars storage bucket: keep public reads of individual files, but block listing
-- Drop any broad public SELECT and replace with a no-list policy (object-level reads via getPublicUrl still work because they go through the public CDN, not storage.objects SELECT)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND qual ILIKE '%avatars%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "Avatars: users manage own files"
ON storage.objects
FOR ALL
TO authenticated
USING (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1]);
