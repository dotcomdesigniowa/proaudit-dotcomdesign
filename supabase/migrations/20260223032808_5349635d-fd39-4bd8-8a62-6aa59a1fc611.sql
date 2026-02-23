
-- Allow authenticated users to delete share views for shares they own
CREATE POLICY "Users can delete views for own shares"
ON public.audit_share_views
FOR DELETE
TO authenticated
USING (
  share_id IN (
    SELECT id FROM public.audit_shares WHERE created_by = auth.uid()
  )
);
