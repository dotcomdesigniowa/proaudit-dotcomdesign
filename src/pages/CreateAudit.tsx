import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<{ full_name: string | null; phone: string | null }>({ full_name: null, phone: null });

  const [form, setForm] = useState({
    company_name: "",
    website_url: "",
    location_city: "",
    location_state: "",
    provider: "",
    business_phone: "",
    w3c_issue_count: "",
    w3c_audit_url: "",
    accessibility_score: "",
    accessibility_audit_url: "",
    design_score: "35",
  });

  // Fetch profile for auto-fill
  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("full_name, phone")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data) setProfile(data);
      });
  }, [user]);

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  // Auto-generate W3C and Accessibility URLs from website URL
  useEffect(() => {
    const url = form.website_url.trim();
    if (!url) return;
    let normalized = url;
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
      normalized = `https://${normalized}`;
    }
    if (!normalized.endsWith('/')) normalized += '/';
    const encoded = encodeURIComponent(normalized);
    setForm((f) => ({
      ...f,
      w3c_audit_url: `https://validator.w3.org/nu/?doc=${encoded}`,
      accessibility_audit_url: `https://www.accessibilitychecker.org/audit/?website=${encoded}&flag=us`,
    }));
  }, [form.website_url]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Auto-discover logo from website URL
    let discoveredLogo: string | null = null;
    if (form.website_url) {
      try {
        const { data } = await supabase.functions.invoke("discover-logo", {
          body: { website_url: form.website_url },
        });
        if (data?.success && data?.logo_url) {
          discoveredLogo = data.logo_url;
        }
      } catch {
        // Best-effort
      }
    }

    // Build deterministic PSI audit URL
    const trimmedUrl = form.website_url.trim();
    const normalizedForPsi = trimmedUrl.startsWith('http') ? trimmedUrl : `https://${trimmedUrl}`;
    const psiAuditUrl = trimmedUrl ? `https://pagespeed.web.dev/report?url=${encodeURIComponent(normalizedForPsi)}` : null;

    const payload: Record<string, unknown> = {
      company_name: form.company_name || null,
      website_url: form.website_url || null,
      location_city: form.location_city || null,
      location_state: form.location_state || null,
      provider: form.provider || null,
      business_phone: form.business_phone || null,
      prepared_by_name: profile.full_name || null,
      prepared_by_email: user?.email || null,
      prepared_by_phone: profile.phone || null,
      w3c_issue_count: form.w3c_issue_count ? parseInt(form.w3c_issue_count) : null,
      w3c_audit_url: form.w3c_audit_url || null,
      psi_mobile_score: null,
      psi_audit_url: psiAuditUrl,
      accessibility_score: form.accessibility_score ? parseInt(form.accessibility_score) : null,
      accessibility_audit_url: form.accessibility_audit_url || null,
      design_score: form.design_score ? parseInt(form.design_score) : 35,
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

    // Fire-and-forget: capture website screenshot
    supabase.functions.invoke("capture-website-screenshot", {
      body: { audit_id: data.id },
    }).catch(() => {});

    // Fire-and-forget: fetch PSI score automatically
    if (trimmedUrl) {
      supabase.functions.invoke("run-psi-and-update", {
        body: { audit_id: data.id, website_url: trimmedUrl },
      }).catch(() => {});
    }

    navigate(`/audit/${data.id}`);
  };

  return (
    <div className="p-6 md:p-10">
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
                  <Field label="Business Phone Number" name="business_phone" placeholder="(313) 555-1234" value={form.business_phone} onChange={set("business_phone")} />
                  <div className="space-y-1.5">
                    <Label htmlFor="provider">Provider</Label>
                    <Select value={form.provider} onValueChange={(val) => setForm((f) => ({ ...f, provider: val }))}>
                      <SelectTrigger id="provider">
                        <SelectValue placeholder="Select provider" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Hibu (Duda)">Hibu (Duda)</SelectItem>
                        <SelectItem value="Thryv (Duda)">Thryv (Duda)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </section>

              {/* Prepared By info display */}
              <section className="space-y-2">
                <h3 className="text-lg font-semibold text-foreground">Prepared By</h3>
                <p className="text-sm text-muted-foreground">
                  Auto-filled from your profile: <strong>{profile.full_name || "—"}</strong> · {user?.email || "—"} · {profile.phone || "—"}
                </p>
                {!profile.full_name && (
                  <p className="text-sm text-destructive">
                    Please <a href="/profile" className="underline">update your profile</a> to set your name and phone.
                  </p>
                )}
              </section>

              {/* Scores */}
              <section className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground">Audit Scores</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="W3C Issue Count" name="w3c_issue_count" type="number" value={form.w3c_issue_count} onChange={set("w3c_issue_count")} />
                  <Field label="W3C Audit URL" name="w3c_audit_url" placeholder="https://..." value={form.w3c_audit_url} onChange={set("w3c_audit_url")} />
                  <p className="text-xs text-muted-foreground sm:col-span-2">PSI Mobile Score will be fetched automatically after creation.</p>
                  <Field label="Accessibility Score (0-100)" name="accessibility_score" type="number" value={form.accessibility_score} onChange={set("accessibility_score")} />
                  <Field label="Accessibility Audit URL" name="accessibility_audit_url" placeholder="https://..." value={form.accessibility_audit_url} onChange={set("accessibility_audit_url")} />
                  <Field label="Design Score (0-100)" name="design_score" type="number" value={form.design_score} onChange={set("design_score")} />
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
