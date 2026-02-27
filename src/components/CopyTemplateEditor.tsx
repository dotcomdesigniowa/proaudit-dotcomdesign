import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Save } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { invalidateCopyCache } from "@/hooks/useAuditCopy";

interface Template {
  id: string;
  section_key: string;
  label: string;
  content: string;
  sort_order: number;
}

const SECTION_GROUPS: { title: string; prefix: string }[] = [
  { title: "Under the Hood", prefix: "uth_" },
  { title: "Metric Descriptions", prefix: "metric_" },
  { title: "Design Bullets", prefix: "design_bullet_" },
  { title: "Online Presence", prefix: "presence_" },
  { title: "CTA", prefix: "cta_" },
  { title: "Other", prefix: "score_breakdown_" },
];

const CopyTemplateEditor = () => {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    const { data, error } = await supabase
      .from("audit_copy_templates" as any)
      .select("*")
      .order("sort_order");
    if (error) {
      toast({ title: "Error loading templates", description: error.message, variant: "destructive" });
    } else {
      setTemplates((data as any[]) || []);
    }
    setLoading(false);
  };

  const updateContent = (id: string, content: string) => {
    setTemplates((prev) =>
      prev.map((t) => (t.id === id ? { ...t, content } : t))
    );
    setDirty((prev) => new Set(prev).add(id));
  };

  const handleSave = async () => {
    if (!user || dirty.size === 0) return;
    setSaving(true);

    const updates = templates.filter((t) => dirty.has(t.id));
    let hasError = false;

    for (const t of updates) {
      const { error } = await supabase
        .from("audit_copy_templates" as any)
        .update({
          content: t.content,
          updated_at: new Date().toISOString(),
          updated_by: user.id,
        } as any)
        .eq("id", t.id);
      if (error) {
        hasError = true;
        toast({ title: `Error saving "${t.label}"`, description: error.message, variant: "destructive" });
      }
    }

    setSaving(false);
    if (!hasError) {
      setDirty(new Set());
      invalidateCopyCache();
      toast({ title: "Copy saved", description: `${updates.length} template(s) updated.` });
    }
  };

  if (loading) {
    return <div className="py-4 text-center text-muted-foreground">Loading copy templates…</div>;
  }

  const grouped = SECTION_GROUPS.map((group) => ({
    ...group,
    items: templates.filter((t) => t.section_key.startsWith(group.prefix)),
  })).filter((g) => g.items.length > 0);

  // Any remaining items not matched by a prefix
  const allGroupedKeys = new Set(grouped.flatMap((g) => g.items.map((t) => t.id)));
  const ungrouped = templates.filter((t) => !allGroupedKeys.has(t.id));
  if (ungrouped.length > 0) {
    grouped.push({ title: "Other", prefix: "", items: ungrouped });
  }

  return (
    <div className="space-y-6">
      {grouped.map((group) => (
        <Card key={group.title}>
          <CardHeader>
            <CardTitle className="text-lg">{group.title}</CardTitle>
            <CardDescription>
              Edit the text that appears in audit reports.{" "}
              {group.prefix === "uth_" && (
                <span className="text-xs">Use <code className="rounded bg-muted px-1">{"{{name}}"}</code> for the company name.</span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {group.items.map((t) => (
              <div key={t.id} className="space-y-1">
                <Label htmlFor={t.id} className="text-sm font-semibold">
                  {t.label}
                  {dirty.has(t.id) && <span className="ml-2 text-xs text-orange-500">unsaved</span>}
                </Label>
                <Textarea
                  id={t.id}
                  value={t.content}
                  onChange={(e) => updateContent(t.id, e.target.value)}
                  rows={t.content.length > 200 ? 5 : 2}
                  className="text-sm"
                />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving || dirty.size === 0}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? "Saving…" : `Save Copy (${dirty.size})`}
        </Button>
      </div>
    </div>
  );
};

export default CopyTemplateEditor;
