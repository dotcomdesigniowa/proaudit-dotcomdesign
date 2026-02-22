
CREATE TABLE public.audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Prospect Info
  company_name TEXT,
  website_url TEXT,
  location_city TEXT,
  location_state TEXT,
  provider TEXT,
  
  -- Prepared By
  prepared_by_name TEXT,
  prepared_by_email TEXT,
  prepared_by_phone TEXT,
  prepared_date DATE DEFAULT CURRENT_DATE,
  
  -- Metrics (Raw Inputs)
  w3c_issue_count INTEGER,
  w3c_audit_url TEXT,
  psi_mobile_score INTEGER,
  psi_audit_url TEXT,
  accessibility_score INTEGER,
  accessibility_audit_url TEXT,
  
  -- Design
  design_score INTEGER DEFAULT 35,
  
  -- Assets
  under_the_hood_graphic_url TEXT,
  presence_scan_image_url TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.audit ENABLE ROW LEVEL SECURITY;

-- Public read/write for now (no auth required)
CREATE POLICY "Allow public read access" ON public.audit FOR SELECT USING (true);
CREATE POLICY "Allow public insert access" ON public.audit FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update access" ON public.audit FOR UPDATE USING (true);
CREATE POLICY "Allow public delete access" ON public.audit FOR DELETE USING (true);
