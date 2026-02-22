import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Tables } from "@/integrations/supabase/types";

type Audit = Tables<"audit">;

const gradeColor = (grade: string | null) => {
  switch (grade) {
    case "A": return "bg-green-600 text-white";
    case "B": return "bg-green-500 text-white";
    case "C": return "bg-yellow-500 text-white";
    case "D": return "bg-orange-500 text-white";
    case "F": return "bg-destructive text-destructive-foreground";
    default: return "bg-muted text-muted-foreground";
  }
};

const DESIGN_BULLETS = [
  "Does not reflect the quality of the actual work you do.",
  "Looks generic. Feels generic.",
  "Makes the company look small and below average.",
  "Weak first impression.",
  "Current site uses same template as restaurants, daycares, and funeral homes.",
  "Does not build immediate trust.",
];

const AuditReport = () => {
  const { id } = useParams<{ id: string }>();
  const [audit, setAudit] = useState<Audit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data, error } = await supabase.from("audit").select("*").eq("id", id).single();
      if (error) setError(error.message);
      else setAudit(data);
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  if (error || !audit) return <div className="flex min-h-screen items-center justify-center text-destructive">{error || "Audit not found"}</div>;

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">{children}</CardContent>
    </Card>
  );

  const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value ?? "—"}</span>
    </div>
  );

  const AuditLink = ({ url, label }: { url: string | null; label: string }) =>
    url ? (
      <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4 hover:text-primary/80">
        {label}
      </a>
    ) : <span className="text-muted-foreground">—</span>;

  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">{audit.company_name || "Untitled Audit"}</h1>
            <p className="text-muted-foreground">
              Prepared {audit.prepared_date} by {audit.prepared_by_name || "—"}
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link to="/create-audit">+ New Audit</Link>
          </Button>
        </div>

        {/* Overall */}
        <Card className="border-2">
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-sm text-muted-foreground">Overall Score</p>
              <p className="text-4xl font-bold text-foreground">{audit.overall_score ?? "—"}</p>
            </div>
            <Badge className={`text-2xl px-4 py-2 ${gradeColor(audit.overall_grade)}`}>
              {audit.overall_grade ?? "—"}
            </Badge>
          </CardContent>
        </Card>

        {/* Sections */}
        <div className="grid gap-4 md:grid-cols-2">
          <Section title="W3C Validation">
            <Row label="Issue Count" value={audit.w3c_issue_count} />
            <Row label="Score" value={audit.w3c_score} />
            <Row label="Grade" value={<Badge className={gradeColor(audit.w3c_grade)}>{audit.w3c_grade}</Badge>} />
            <Row label="Audit" value={<AuditLink url={audit.w3c_audit_url} label="View Report" />} />
          </Section>

          <Section title="PageSpeed Insights">
            <Row label="Mobile Score" value={audit.psi_mobile_score} />
            <Row label="Grade" value={<Badge className={gradeColor(audit.psi_grade)}>{audit.psi_grade}</Badge>} />
            <Row label="Audit" value={<AuditLink url={audit.psi_audit_url} label="View Report" />} />
          </Section>

          <Section title="Accessibility">
            <Row label="Score" value={audit.accessibility_score} />
            <Row label="Grade" value={<Badge className={gradeColor(audit.accessibility_grade)}>{audit.accessibility_grade}</Badge>} />
            <Row label="Legal Risk" value={
              audit.legal_risk_flag
                ? <Badge className="bg-destructive text-destructive-foreground">⚠ Risk</Badge>
                : <Badge className="bg-green-600 text-white">Clear</Badge>
            } />
            <Row label="Audit" value={<AuditLink url={audit.accessibility_audit_url} label="View Report" />} />
          </Section>

          <Section title="Design">
            <Row label="Score" value={audit.design_score} />
            <Row label="Grade" value={<Badge className={gradeColor(audit.design_grade)}>{audit.design_grade}</Badge>} />
            <ul className="mt-3 space-y-1.5 text-muted-foreground">
              {DESIGN_BULLETS.map((b, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-0.5 text-destructive">•</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </Section>
        </div>

        {/* Images */}
        {(audit.under_the_hood_graphic_url || audit.presence_scan_image_url) && (
          <div className="space-y-4">
            {audit.under_the_hood_graphic_url && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-lg">Under the Hood</CardTitle></CardHeader>
                <CardContent>
                  <img src={audit.under_the_hood_graphic_url} alt="Under the hood graphic" className="w-full rounded-md" />
                </CardContent>
              </Card>
            )}
            {audit.presence_scan_image_url && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-lg">Presence Scan</CardTitle></CardHeader>
                <CardContent>
                  <img src={audit.presence_scan_image_url} alt="Presence scan" className="w-full rounded-md" />
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditReport;
