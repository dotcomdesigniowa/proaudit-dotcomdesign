
-- Add screenshot columns to audit table
ALTER TABLE public.audit
ADD COLUMN website_screenshot_url text,
ADD COLUMN website_screenshot_updated_at timestamp with time zone;
