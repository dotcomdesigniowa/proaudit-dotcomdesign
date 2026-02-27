import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CopyTemplate {
  id: string;
  section_key: string;
  label: string;
  content: string;
  sort_order: number;
}

let cachedTemplates: Record<string, string> | null = null;

export function useAuditCopy() {
  const [templates, setTemplates] = useState<Record<string, string>>(cachedTemplates || {});
  const [loading, setLoading] = useState(!cachedTemplates);

  useEffect(() => {
    if (cachedTemplates) return;
    (async () => {
      const { data } = await supabase
        .from("audit_copy_templates" as any)
        .select("section_key, content")
        .order("sort_order");
      if (data) {
        const map: Record<string, string> = {};
        for (const row of data as any[]) {
          map[row.section_key] = row.content;
        }
        cachedTemplates = map;
        setTemplates(map);
      }
      setLoading(false);
    })();
  }, []);

  const getCopy = (key: string, fallback: string = ""): string => {
    return templates[key] ?? fallback;
  };

  /** Replaces {{name}} placeholder with actual company name */
  const getCopyWithName = (key: string, companyName: string | null, fallback: string = ""): string => {
    const raw = getCopy(key, fallback);
    return raw.replace(/\{\{name\}\}/g, companyName || "This company");
  };

  return { templates, loading, getCopy, getCopyWithName };
}

/** Invalidate cache so next mount refetches */
export function invalidateCopyCache() {
  cachedTemplates = null;
}
