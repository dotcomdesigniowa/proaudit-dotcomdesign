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
import { formatPhone } from "@/lib/formatPhone";

interface FieldProps {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: () => void;
}

const Field = ({ label, name, type = "text", placeholder = "", value, onChange, onBlur }: FieldProps) => (
  <div className="space-y-1.5">
    <Label htmlFor={name}>{label}</Label>
    <Input id={name} type={type} placeholder={placeholder} value={value} onChange={onChange} onBlur={onBlur} />
  </div>
);

/** Normalize a URL: trim, strip protocol + www, re-add https:// */
const normalizeUrl = (raw: string): string => {
  let url = raw.trim();
  if (!url) return "";
  // Remove protocol
  url = url.replace(/^https?:\/\//, "");
  // Remove www.
  url = url.replace(/^www\./, "");
  // Remove trailing slash (only bare domain)
  url = url.replace(/\/+$/, "");
  return url ? `https://${url}` : "";
};

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

    // Normalize website_url (safety net)
    const normalizedUrl = normalizeUrl(form.website_url);

    // Build deterministic PSI audit URL
    const psiAuditUrl = normalizedUrl ? `https://pagespeed.web.dev/report?url=${encodeURIComponent(normalizedUrl)}` : null;

    const payload: Record<string, unknown> = {
      company_name: form.company_name || null,
      website_url: normalizedUrl || null,
      location_city: form.location_city || null,
      location_state: form.location_state || null,
      provider: form.provider || null,
      business_phone: form.business_phone || null,
      prepared_by_name: profile.full_name || null,
      prepared_by_email: user?.email || null,
      prepared_by_phone: profile.phone || null,
      w3c_issue_count: form.w3c_issue_count ? parseInt(form.w3c_issue_count) : null,
      w3c_audit_url: form.w3c_audit_url || null,
      w3c_status: normalizedUrl && !form.w3c_issue_count ? 'fetching' : (form.w3c_issue_count ? 'success' : 'idle'),
      psi_mobile_score: null,
      psi_audit_url: psiAuditUrl,
      psi_status: normalizedUrl ? 'fetching' : 'idle',
      accessibility_score: null,
      accessibility_audit_url: normalizedUrl ? `https://wave.webaim.org/report#/${encodeURIComponent(normalizedUrl)}` : null,
      wave_status: normalizedUrl ? 'fetching' : 'idle',
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
    if (normalizedUrl) {
      supabase.functions.invoke("run-psi-and-update", {
        body: { audit_id: data.id, website_url: normalizedUrl },
      }).catch(() => {});

      // Fire-and-forget: fetch WAVE accessibility score automatically
      supabase.functions.invoke("run-wave", {
        body: { audit_id: data.id, website_url: normalizedUrl },
      }).catch(() => {});

      // Fire-and-forget: fetch W3C issue count automatically (only if not manually entered)
      if (!form.w3c_issue_count) {
        supabase.functions.invoke("run-w3c", {
          body: { audit_id: data.id, website_url: normalizedUrl },
        }).catch(() => {});
      }
    }

    navigate(`/${data.id}`);
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
                  <Field label="Website URL" name="website_url" placeholder="centralroof.com" value={form.website_url} onChange={set("website_url")} onBlur={() => setForm(f => ({ ...f, website_url: normalizeUrl(f.website_url) }))} />
                  <Field label="City" name="location_city" value={form.location_city} onChange={set("location_city")} />
                  <Field label="State" name="location_state" value={form.location_state} onChange={set("location_state")} />
                  <Field label="Business Phone Number" name="business_phone" placeholder="(313) 555-1234" value={form.business_phone} onChange={set("business_phone")} onBlur={() => setForm(f => ({ ...f, business_phone: formatPhone(f.business_phone) }))} />
                  <div className="space-y-1.5">
                    <Label htmlFor="provider">Provider</Label>
                    <Select value={form.provider} onValueChange={(val) => setForm((f) => ({ ...f, provider: val }))}>
                      <SelectTrigger id="provider">
                        <SelectValue placeholder="Select provider" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Hibu">Hibu</SelectItem>
                        <SelectItem value="Thryv">Thryv</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
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
                  <div className="space-y-1.5">
                    <Label htmlFor="w3c_issue_count">W3C Issue Count (optional)</Label>
                    <Input id="w3c_issue_count" type="number" value={form.w3c_issue_count} onChange={set("w3c_issue_count")} placeholder="Auto-fetched if left blank" />
                    <p className="text-xs text-muted-foreground">Will auto-fetch after creation if left blank.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>W3C Validator</Label>
                    {form.website_url ? (
                      <a href={`https://validator.w3.org/nu/?doc=${encodeURIComponent(form.w3c_audit_url || form.website_url)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-primary underline">
                        Open W3C Validator →
                      </a>
                    ) : (
                      <p className="text-xs text-muted-foreground">Enter a website URL first.</p>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground sm:col-span-2">PSI Mobile Score, Accessibility Score, W3C count, and Design Score are set automatically.</p>
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
