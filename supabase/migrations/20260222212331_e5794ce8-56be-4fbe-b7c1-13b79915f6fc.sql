
-- 1. Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- 2. Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 3. Add created_by to audit table
ALTER TABLE public.audit ADD COLUMN created_by UUID REFERENCES auth.users(id);

-- 4. Replace existing RLS policies on audit with proper ones
DROP POLICY IF EXISTS "Allow public delete access" ON public.audit;
DROP POLICY IF EXISTS "Allow public insert access" ON public.audit;
DROP POLICY IF EXISTS "Allow public read access" ON public.audit;
DROP POLICY IF EXISTS "Allow public update access" ON public.audit;

-- Authenticated users can insert (created_by must match)
CREATE POLICY "Authenticated users can insert audits"
  ON public.audit FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

-- Users can view their own audits
CREATE POLICY "Users can view own audits"
  ON public.audit FOR SELECT
  TO authenticated
  USING (auth.uid() = created_by);

-- Users can update their own audits
CREATE POLICY "Users can update own audits"
  ON public.audit FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by);

-- Users can delete their own audits
CREATE POLICY "Users can delete own audits"
  ON public.audit FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by);

-- Public read for audit reports (so shared links work without login)
CREATE POLICY "Public can view audits by id"
  ON public.audit FOR SELECT
  TO anon
  USING (true);

-- 5. Auto-set created_by on insert
CREATE OR REPLACE FUNCTION public.set_audit_created_by()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.created_by := auth.uid();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_audit_created_by_trigger
  BEFORE INSERT ON public.audit
  FOR EACH ROW
  EXECUTE FUNCTION public.set_audit_created_by();
