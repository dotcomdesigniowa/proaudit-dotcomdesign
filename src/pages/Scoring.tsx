import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import CopyTemplateEditor from "@/components/CopyTemplateEditor";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/useAuth";
import { RefreshCw, Save, Calculator } from "lucide-react";

interface ScoringSettings {
  id: string;
  weight_w3c: number;
  weight_psi_mobile: number;
  weight_accessibility: number;
  weight_design: number;
  weight_ai: number;
  w3c_issue_penalty: number;
  grade_a_min: number;
  grade_b_min: number;
  grade_c_min: number;
  grade_d_min: number;
}

const defaultSettings: Omit<ScoringSettings, "id"> = {
  weight_w3c: 0.27,
  weight_psi_mobile: 0.27,
  weight_accessibility: 0.18,
  weight_design: 0.18,
  weight_ai: 0.10,
  w3c_issue_penalty: 0.5,
  grade_a_min: 90,
  grade_b_min: 80,
  grade_c_min: 70,
  grade_d_min: 60,
};

function computeGrade(score: number, a: number, b: number, c: number, d: number) {
  if (score >= a) return "A";
  if (score >= b) return "B";
  if (score >= c) return "C";
  if (score >= d) return "D";
  return "F";
}

const Scoring = () => {
  const { user } = useAuth();
  const [settings, setSettings] = useState<ScoringSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  // Preview calculator state
  const [preview, setPreview] = useState({ w3c_issues: 10, psi: 65, accessibility: 85, design: 35, ai: 80 });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const { data, error } = await supabase
      .from("scoring_settings")
      .select("*")
      .eq("is_active", true)
      .limit(1)
      .single();

    if (error) {
      toast({ title: "Error loading settings", description: error.message, variant: "destructive" });
    } else {
      setSettings(data as unknown as ScoringSettings);
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!settings || !user) return;

    const sum = settings.weight_w3c + settings.weight_psi_mobile + settings.weight_accessibility + settings.weight_design + settings.weight_ai;
    if (Math.abs(sum - 1) > 0.01) {
      toast({ title: "Weights must sum to 1.00", description: `Current sum: ${sum.toFixed(2)}`, variant: "destructive" });
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("scoring_settings")
      .update({
        weight_w3c: settings.weight_w3c,
        weight_psi_mobile: settings.weight_psi_mobile,
        weight_accessibility: settings.weight_accessibility,
        weight_design: settings.weight_design,
        weight_ai: settings.weight_ai,
        w3c_issue_penalty: settings.w3c_issue_penalty,
        grade_a_min: settings.grade_a_min,
        grade_b_min: settings.grade_b_min,
        grade_c_min: settings.grade_c_min,
        grade_d_min: settings.grade_d_min,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      } as any)
      .eq("id", settings.id);

    setSaving(false);
    if (error) {
      toast({ title: "Error saving", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Settings saved", description: "New audits will use updated scoring." });
    }
  };

  const handleRecalculate = async (sinceDays?: number) => {
    setRecalculating(true);
    const { data, error } = await supabase.rpc("recalculate_all_audits", {
      since_days: sinceDays ?? null,
    });
    setRecalculating(false);

    if (error) {
      toast({ title: "Recalculation failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Recalculation complete", description: `${data} audits updated.` });
    }
  };

  const updateWeight = (key: keyof ScoringSettings, value: string) => {
    if (!settings) return;
    setSettings({ ...settings, [key]: parseFloat(value) || 0 });
  };

  const updateInt = (key: keyof ScoringSettings, value: string) => {
    if (!settings) return;
    setSettings({ ...settings, [key]: parseInt(value) || 0 });
  };

  // Preview computation
  const previewW3cScore = settings
    ? Math.max(0, Math.min(100, 100 - preview.w3c_issues * settings.w3c_issue_penalty))
    : 0;
  const previewOverall = settings
    ? Math.round(
        previewW3cScore * settings.weight_w3c +
        preview.psi * settings.weight_psi_mobile +
        preview.accessibility * settings.weight_accessibility +
        preview.design * settings.weight_design +
        preview.ai * settings.weight_ai
      )
    : 0;
  const previewGrade = settings
    ? computeGrade(previewOverall, settings.grade_a_min, settings.grade_b_min, settings.grade_c_min, settings.grade_d_min)
    : "—";

  const weightSum = settings
    ? (settings.weight_w3c + settings.weight_psi_mobile + settings.weight_accessibility + settings.weight_design + settings.weight_ai).toFixed(2)
    : "0.00";

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  }

  if (!settings) {
    return <div className="p-8 text-center text-destructive">No scoring settings found.</div>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 py-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Scoring Settings</h1>
        <p className="text-sm text-muted-foreground">Configure how audit scores are calculated.</p>
      </div>

      {/* A) Overall Weighting */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Overall Weighting</CardTitle>
          <CardDescription>
            Set the weight for each category. Must sum to 1.00.
            <span className={`ml-2 font-semibold ${Math.abs(parseFloat(weightSum) - 1) > 0.01 ? "text-destructive" : "text-green-600"}`}>
              Sum = {weightSum}
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {([
            ["weight_w3c", "W3C"],
            ["weight_psi_mobile", "PSI Mobile"],
            ["weight_accessibility", "Accessibility"],
            ["weight_design", "Design"],
            ["weight_ai", "AI Friendliness"],
          ] as const).map(([key, label]) => (
            <div key={key} className="space-y-1">
              <Label htmlFor={key}>{label}</Label>
              <Input
                id={key}
                type="number"
                step="0.05"
                min="0"
                max="1"
                value={settings[key]}
                onChange={(e) => updateWeight(key, e.target.value)}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* B) W3C Penalty */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">W3C Penalty</CardTitle>
          <CardDescription>
            W3C Score = max(0, min(100, 100 − issues × penalty))
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-xs space-y-1">
            <Label htmlFor="w3c_penalty">Penalty per issue</Label>
            <Input
              id="w3c_penalty"
              type="number"
              step="0.1"
              min="0"
              value={settings.w3c_issue_penalty}
              onChange={(e) => updateWeight("w3c_issue_penalty", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              E.g. 20 issues × {settings.w3c_issue_penalty} penalty = score of {Math.max(0, 100 - 20 * settings.w3c_issue_penalty)}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* C) Grade Thresholds */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Grade Thresholds</CardTitle>
          <CardDescription>
            Score ≥ A_min → A, ≥ B_min → B, ≥ C_min → C, ≥ D_min → D, else F
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {([
            ["grade_a_min", "A min"],
            ["grade_b_min", "B min"],
            ["grade_c_min", "C min"],
            ["grade_d_min", "D min"],
          ] as const).map(([key, label]) => (
            <div key={key} className="space-y-1">
              <Label htmlFor={key}>{label}</Label>
              <Input
                id={key}
                type="number"
                min="0"
                max="100"
                value={settings[key]}
                onChange={(e) => updateInt(key, e.target.value)}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Save button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? "Saving…" : "Save Settings"}
        </Button>
      </div>

      <Separator />

      {/* D) Preview Calculator */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Preview Calculator
          </CardTitle>
          <CardDescription>Test how sample values score with current settings.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <div className="space-y-1">
              <Label>W3C Issues</Label>
              <Input type="number" min="0" value={preview.w3c_issues} onChange={(e) => setPreview({ ...preview, w3c_issues: parseInt(e.target.value) || 0 })} />
            </div>
            <div className="space-y-1">
              <Label>PSI Mobile</Label>
              <Input type="number" min="0" max="100" value={preview.psi} onChange={(e) => setPreview({ ...preview, psi: parseInt(e.target.value) || 0 })} />
            </div>
            <div className="space-y-1">
              <Label>Accessibility</Label>
              <Input type="number" min="0" max="100" value={preview.accessibility} onChange={(e) => setPreview({ ...preview, accessibility: parseInt(e.target.value) || 0 })} />
            </div>
            <div className="space-y-1">
              <Label>Design</Label>
              <Input type="number" min="0" max="100" value={preview.design} onChange={(e) => setPreview({ ...preview, design: parseInt(e.target.value) || 0 })} />
            </div>
            <div className="space-y-1">
              <Label>AI Friendliness</Label>
              <Input type="number" min="0" max="100" value={preview.ai} onChange={(e) => setPreview({ ...preview, ai: parseInt(e.target.value) || 0 })} />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-6 rounded-md bg-muted p-4">
            <div>
              <p className="text-xs text-muted-foreground">W3C Score</p>
              <p className="text-lg font-bold">{Math.round(previewW3cScore)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Overall Score</p>
              <p className="text-lg font-bold">{previewOverall}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Grade</p>
              <p className="text-2xl font-bold">{previewGrade}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* E) Recalculate */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recalculate Existing Audits</CardTitle>
          <CardDescription>Re-run scoring formulas on existing audits using current settings.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" disabled={recalculating}>
                <RefreshCw className={`mr-2 h-4 w-4 ${recalculating ? "animate-spin" : ""}`} />
                Recalculate Last 30 Days
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Recalculate recent audits?</AlertDialogTitle>
                <AlertDialogDescription>This will update scores for audits created in the last 30 days.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleRecalculate(30)}>Recalculate</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={recalculating}>
                <RefreshCw className={`mr-2 h-4 w-4 ${recalculating ? "animate-spin" : ""}`} />
                Recalculate All Audits
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Recalculate ALL audits?</AlertDialogTitle>
                <AlertDialogDescription>This will update scores for every audit in the system. This cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleRecalculate()}>Recalculate All</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      <Separator />

      {/* AI Friendliness Guide */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">How to Get a 100 in AI Friendliness</CardTitle>
          <CardDescription>
            This checklist shows what a website needs in order to score a perfect AI Friendliness Score. These are technical building blocks that help AI systems access and understand a website. Most businesses don't need a perfect 100 — the goal is to remove blockers and make services and contact details easy to understand.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Subsection 1 */}
          <div>
            <h3 className="font-semibold text-foreground mb-1">AI Can Access Your Website</h3>
            <p className="text-sm text-muted-foreground mb-2">Checks whether AI tools can reach your website without being blocked.</p>
            <p className="text-sm font-medium text-foreground mb-1">Checklist:</p>
            <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-0.5 mb-2">
              <li>robots.txt loads successfully (yourwebsite.com/robots.txt)</li>
              <li>Your site is not blocking all automated visitors site-wide</li>
              <li>Key pages load normally (no captcha / "verify you are human" / "enable JavaScript" walls)</li>
              <li>Main pages return normal responses (not 403/429/503) when accessed by automated checks</li>
            </ul>
            <p className="text-sm font-medium text-foreground mb-1">Common reasons you lose points:</p>
            <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-0.5">
              <li>robots.txt missing or unreachable</li>
              <li>Site-wide bot blocking or firewall challenge pages</li>
              <li>Important pages returning 403/429/503</li>
            </ul>
          </div>

          <Separator />

          {/* Subsection 2 */}
          <div>
            <h3 className="font-semibold text-foreground mb-1">AI Can Understand Your Pages</h3>
            <p className="text-sm text-muted-foreground mb-2">Checks whether your pages contain real, readable written content that AI systems can interpret.</p>
            <p className="text-sm font-medium text-foreground mb-1">Checklist:</p>
            <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-0.5 mb-2">
              <li>Key pages contain real text (not just images)</li>
              <li>Important pages have enough written content (aim for strong, descriptive page copy)</li>
              <li>Each page has a clear page title</li>
              <li>Each page has a clear main headline and supporting headings</li>
              <li>Core content is visible without relying entirely on heavy scripts</li>
            </ul>
            <p className="text-sm font-medium text-foreground mb-1">Common reasons you lose points:</p>
            <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-0.5">
              <li>Thin pages with very little text</li>
              <li>Pages built like "blank shells" that only show content after scripts run</li>
              <li>Missing titles or missing clear headings</li>
              <li>Pages that are mostly images with little text</li>
            </ul>
          </div>

          <Separator />

          {/* Subsection 3 */}
          <div>
            <h3 className="font-semibold text-foreground mb-1">Clear Business Details</h3>
            <p className="text-sm text-muted-foreground mb-2">Checks whether your website clearly communicates who you are, what you do, and how to contact you.</p>
            <p className="text-sm font-medium text-foreground mb-1">Checklist:</p>
            <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-0.5 mb-2">
              <li>Phone number is visible on the site as text</li>
              <li>Contact method is clear (email and/or contact form)</li>
              <li>Service area or location details are clear</li>
              <li>Business hours are listed (if applicable)</li>
              <li>Website includes structured business info (schema) to define your company</li>
            </ul>
            <p className="text-sm font-medium text-foreground mb-1">Common reasons you lose points:</p>
            <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-0.5">
              <li>Contact info only in images or hidden elements</li>
              <li>No clear service area/location listed</li>
              <li>No structured data (schema) present</li>
            </ul>
          </div>

          <Separator />

          {/* Subsection 4 */}
          <div>
            <h3 className="font-semibold text-foreground mb-1">Technical Setup for AI</h3>
            <p className="text-sm text-muted-foreground mb-2">Checks for behind-the-scenes setup that helps AI systems find and navigate your pages.</p>
            <p className="text-sm font-medium text-foreground mb-1">Checklist:</p>
            <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-0.5 mb-2">
              <li>Sitemap is available and working (yourwebsite.com/sitemap.xml) OR sitemap is listed in robots.txt</li>
              <li>Optional: llms.txt exists at /llms.txt or /.well-known/llms.txt and contains helpful links</li>
            </ul>
            <p className="text-sm font-medium text-foreground mb-1">Common reasons you lose points:</p>
            <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-0.5">
              <li>Missing or broken sitemap</li>
              <li>No llms.txt present (optional)</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* F) Audit Report Copy */}
      <div>
        <h2 className="text-xl font-bold text-foreground mb-1">Audit Report Copy</h2>
        <p className="text-sm text-muted-foreground mb-4">Edit the text that appears in audit reports. Changes take effect immediately for new report views.</p>
      </div>
      <CopyTemplateEditor />
    </div>
  );
};

export default Scoring;
