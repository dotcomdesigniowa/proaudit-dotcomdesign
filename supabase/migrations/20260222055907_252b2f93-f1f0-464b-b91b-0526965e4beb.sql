
ALTER TABLE public.audit
  ADD COLUMN w3c_score INTEGER,
  ADD COLUMN w3c_grade TEXT,
  ADD COLUMN psi_grade TEXT,
  ADD COLUMN accessibility_grade TEXT,
  ADD COLUMN design_grade TEXT,
  ADD COLUMN overall_score INTEGER,
  ADD COLUMN overall_grade TEXT,
  ADD COLUMN legal_risk_flag BOOLEAN DEFAULT false;
