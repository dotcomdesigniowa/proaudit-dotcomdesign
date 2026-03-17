import { supabase } from "@/integrations/supabase/client";
import { logError } from "@/lib/errorLogger";

/**
 * Re-runs all automated scans for an existing audit.
 * Resets statuses to 'fetching' and fires off edge functions.
 */
export async function reRunAudit(auditId: string): Promise<boolean> {
  // 1. Fetch the audit's website_url
  const { data: audit, error } = await supabase
    .from("audit")
    .select("website_url")
    .eq("id", auditId)
    .single();

  if (error || !audit?.website_url) {
    logError({
      page: "re-run-audit",
      action: "fetch-audit",
      message: error?.message || "No website URL found for audit",
    });
    return false;
  }

  const websiteUrl = audit.website_url;

  // 2. Reset all statuses to 'fetching'
  await supabase
    .from("audit")
    .update({
      psi_status: "fetching",
      psi_last_error: null,
      wave_status: "fetching",
      wave_last_error: null,
      w3c_status: "fetching",
      w3c_last_error: null,
      ai_status: "fetching",
      ai_last_error: null,
    })
    .eq("id", auditId);

  // 3. Fire-and-forget: re-run all scans
  supabase.functions
    .invoke("capture-website-screenshot", { body: { audit_id: auditId } })
    .catch((err) =>
      logError({ page: "re-run-audit", action: "capture-screenshot", message: err?.message || "Screenshot capture failed" })
    );

  supabase.functions
    .invoke("run-psi-and-update", { body: { audit_id: auditId, website_url: websiteUrl } })
    .catch((err) =>
      logError({ page: "re-run-audit", action: "run-psi", message: err?.message || "PSI fetch failed" })
    );

  supabase.functions
    .invoke("run-wave", { body: { audit_id: auditId, website_url: websiteUrl } })
    .catch((err) =>
      logError({ page: "re-run-audit", action: "run-wave", message: err?.message || "WAVE fetch failed" })
    );

  supabase.functions
    .invoke("run-w3c", { body: { audit_id: auditId, website_url: websiteUrl } })
    .catch((err) =>
      logError({ page: "re-run-audit", action: "run-w3c", message: err?.message || "W3C fetch failed" })
    );

  supabase.functions
    .invoke("run-ai-friendly", { body: { audit_id: auditId, website_url: websiteUrl } })
    .catch((err) =>
      logError({ page: "re-run-audit", action: "run-ai-friendly", message: err?.message || "AI audit failed" })
    );

  return true;
}
