ALTER TABLE public.audit
  ADD COLUMN IF NOT EXISTS psi_status text NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS psi_last_error text,
  ADD COLUMN IF NOT EXISTS psi_fetched_at timestamp with time zone;