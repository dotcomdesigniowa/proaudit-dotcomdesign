import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";

interface FieldProps {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const Field = ({ label, name, type = "text", placeholder = "", value, onChange }: FieldProps) => (
  <div className="space-y-1.5">
    <Label htmlFor={name}>{label}</Label>
    <Input id={name} type={type} placeholder={placeholder} value={value} onChange={onChange} />
  </div>
);

const CreateAudit = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    company_name: "",
    website_url: "",
    location_city: "",
    location_state: "",
    provider: "",
    prepared_by_name: "",
    prepared_by_email: "",
    prepared_by_phone: "",
    w3c_issue_count: "",
    w3c_audit_url: "",
    psi_mobile_score: "",
    psi_audit_url: "",
    accessibility_score: "",
    accessibility_audit_url: "",
    design_score: "35",
    under_the_hood_graphic_url: "",
    presence_scan_image_url: "",
    scheduler_url: "",
    company_logo_url: "",
  });

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Best-effort logo discovery if no logo URL provided but website URL exists
    let discoveredLogo = form.company_logo_url || null;
    if (!discoveredLogo && form.website_url) {
      try {
        const { data } = await supabase.functions.invoke("discover-logo", {
          body: { website_url: form.website_url },
        });
        if (data?.success && data?.logo_url) {
          discoveredLogo = data.logo_url;
        }
      } catch {
        // Best-effort — ignore failures
      }
    }

    const payload: Record<string, unknown> = {
      company_name: form.company_name || null,
      website_url: form.website_url || null,
      location_city: form.location_city || null,
      location_state: form.location_state || null,
      provider: form.provider || null,
      prepared_by_name: form.prepared_by_name || null,
      prepared_by_email: form.prepared_by_email || null,
      prepared_by_phone: form.prepared_by_phone || null,
      w3c_issue_count: form.w3c_issue_count ? parseInt(form.w3c_issue_count) : null,
      w3c_audit_url: form.w3c_audit_url || null,
      psi_mobile_score: form.psi_mobile_score ? parseInt(form.psi_mobile_score) : null,
      psi_audit_url: form.psi_audit_url || null,
      accessibility_score: form.accessibility_score ? parseInt(form.accessibility_score) : null,
      accessibility_audit_url: form.accessibility_audit_url || null,
      design_score: form.design_score ? parseInt(form.design_score) : 35,
      under_the_hood_graphic_url: form.under_the_hood_graphic_url || null,
      presence_scan_image_url: form.presence_scan_image_url || null,
      scheduler_url: form.scheduler_url || null,
      company_logo_url: discoveredLogo,
    };

    const { data, error } = await supabase
      .from("audit")
      .insert(payload as any)
      .select("id")
      .single();

    setLoading(false);

    if (error) {
      toast({ title: "Error creating audit", description: error.message, variant: "destructive" });
      return;
    }

    navigate(`/audit/${data.id}`);
  };

  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      <div className="mx-auto max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Create New Audit</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-8">
              {/* Company Info */}
              <section className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground">Company Information</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Company Name" name="company_name" value={form.company_name} onChange={set("company_name")} />
                  <Field label="Website URL" name="website_url" placeholder="https://..." value={form.website_url} onChange={set("website_url")} />
                  <Field label="City" name="location_city" value={form.location_city} onChange={set("location_city")} />
                  <Field label="State" name="location_state" value={form.location_state} onChange={set("location_state")} />
                  <Field label="Provider" name="provider" value={form.provider} onChange={set("provider")} />
                  <Field label="Company Logo URL (optional)" name="company_logo_url" placeholder="https://..." value={form.company_logo_url} onChange={set("company_logo_url")} />
                </div>
              </section>

              {/* Prepared By */}
              <section className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground">Prepared By</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Name" name="prepared_by_name" value={form.prepared_by_name} onChange={set("prepared_by_name")} />
                  <Field label="Email" name="prepared_by_email" type="email" value={form.prepared_by_email} onChange={set("prepared_by_email")} />
                  <Field label="Phone" name="prepared_by_phone" type="tel" value={form.prepared_by_phone} onChange={set("prepared_by_phone")} />
                </div>
              </section>

              {/* Scores */}
              <section className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground">Audit Scores</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="W3C Issue Count" name="w3c_issue_count" type="number" value={form.w3c_issue_count} onChange={set("w3c_issue_count")} />
                  <Field label="W3C Audit URL" name="w3c_audit_url" placeholder="https://..." value={form.w3c_audit_url} onChange={set("w3c_audit_url")} />
                  <Field label="PSI Mobile Score (0-100)" name="psi_mobile_score" type="number" value={form.psi_mobile_score} onChange={set("psi_mobile_score")} />
                  <Field label="PSI Audit URL" name="psi_audit_url" placeholder="https://..." value={form.psi_audit_url} onChange={set("psi_audit_url")} />
                  <Field label="Accessibility Score (0-100)" name="accessibility_score" type="number" value={form.accessibility_score} onChange={set("accessibility_score")} />
                  <Field label="Accessibility Audit URL" name="accessibility_audit_url" placeholder="https://..." value={form.accessibility_audit_url} onChange={set("accessibility_audit_url")} />
                  <Field label="Design Score (0-100)" name="design_score" type="number" value={form.design_score} onChange={set("design_score")} />
                </div>
              </section>

              {/* Assets */}
              <section className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground">Assets & Links</h3>
                <div className="grid gap-4 sm:grid-cols-1">
                  <Field label="Under the Hood Graphic URL" name="under_the_hood_graphic_url" placeholder="https://..." value={form.under_the_hood_graphic_url} onChange={set("under_the_hood_graphic_url")} />
                  <Field label="Presence Scan Image URL" name="presence_scan_image_url" placeholder="https://..." value={form.presence_scan_image_url} onChange={set("presence_scan_image_url")} />
                  <Field label="Scheduler URL (optional)" name="scheduler_url" placeholder="https://..." value={form.scheduler_url} onChange={set("scheduler_url")} />
                </div>
              </section>

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Creating…" : "Create Audit"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CreateAudit;
