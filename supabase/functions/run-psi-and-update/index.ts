import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const logError = async (action: string, message: string, metadata?: Record<string, unknown>) => {
    try {
      await supabase.from("error_logs").insert({
        severity: "error",
        page: "edge-function",
        action,
        message,
        metadata: metadata ?? null,
      });
    } catch (_) { /* fire-and-forget */ }
  };

  try {
    const { audit_id, website_url } = await req.json();
    console.log("run-psi-and-update called:", { audit_id, website_url });

    if (!audit_id || !website_url) {
      return new Response(
        JSON.stringify({ success: false, error: "audit_id and website_url required" }),
        { status: 400, headers: jsonHeaders },
      );
    }

    await supabase.from("audit").update({ psi_status: "fetching" }).eq("id", audit_id);

    const apiKey = Deno.env.get("PSI_API_KEY");
    if (!apiKey) {
      const err = "PSI_API_KEY not configured";
      console.error(err);
      await logError("run-psi-and-update", err, { audit_id });
      await supabase.from("audit").update({ psi_status: "error", psi_last_error: err }).eq("id", audit_id);
      return new Response(JSON.stringify({ success: false, error: err }), { status: 500, headers: jsonHeaders });
    }

    let normalizedUrl = website_url.trim();
    if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
      normalizedUrl = `https://${normalizedUrl}`;
    }

    const psiUrl = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
    psiUrl.searchParams.set("url", normalizedUrl);
    psiUrl.searchParams.set("strategy", "mobile");
    psiUrl.searchParams.set("category", "performance");
    psiUrl.searchParams.set("key", apiKey);

    const fetchPsi = async (attempt: number): Promise<Response> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 55000);
      try {
        const res = await fetch(psiUrl.toString(), { signal: controller.signal });
        clearTimeout(timeout);
        return res;
      } catch (err) {
        clearTimeout(timeout);
        if (attempt < 2) {
          console.log(`PSI attempt ${attempt} failed, retrying...`);
          return fetchPsi(attempt + 1);
        }
        throw err;
      }
    };

    let response: Response;
    try {
      response = await fetchPsi(1);
    } catch (err) {
      const errMsg = `PSI fetch failed: ${err.message}`;
      console.error(errMsg);
      await logError("run-psi-and-update", errMsg, { audit_id, website_url: normalizedUrl });
      await supabase.from("audit").update({ psi_status: "error", psi_last_error: errMsg }).eq("id", audit_id);
      return new Response(JSON.stringify({ success: false, error: errMsg }), { status: 504, headers: jsonHeaders });
    }

    if (!response.ok) {
      const body = await response.text();
      const errMsg = `PSI API error ${response.status}: ${body.substring(0, 200)}`;
      console.error(errMsg);
      await logError("run-psi-and-update", errMsg, { audit_id, website_url: normalizedUrl, status: response.status });
      await supabase.from("audit").update({ psi_status: "error", psi_last_error: errMsg }).eq("id", audit_id);
      return new Response(JSON.stringify({ success: false, error: errMsg }), { status: 502, headers: jsonHeaders });
    }

    const data = await response.json();
    const rawScore = data?.lighthouseResult?.categories?.performance?.score;

    if (rawScore == null) {
      const errMsg = "Could not extract performance score from PSI response";
      await logError("run-psi-and-update", errMsg, { audit_id });
      await supabase.from("audit").update({ psi_status: "error", psi_last_error: errMsg }).eq("id", audit_id);
      return new Response(JSON.stringify({ success: false, error: errMsg }), { status: 502, headers: jsonHeaders });
    }

    const psi_mobile_score = Math.round(rawScore * 100);
    const psi_audit_url = `https://pagespeed.web.dev/report?url=${encodeURIComponent(normalizedUrl)}`;

    const { error: updateError } = await supabase
      .from("audit")
      .update({
        psi_mobile_score,
        psi_audit_url,
        psi_status: "success",
        psi_last_error: null,
        psi_fetched_at: new Date().toISOString(),
      })
      .eq("id", audit_id);

    if (updateError) {
      console.error("Failed to update audit:", updateError.message);
      await logError("run-psi-and-update", `DB update failed: ${updateError.message}`, { audit_id });
      return new Response(
        JSON.stringify({ success: false, error: updateError.message }),
        { status: 500, headers: jsonHeaders },
      );
    }

    console.log("Success! Score:", psi_mobile_score, "for audit:", audit_id);
    return new Response(
      JSON.stringify({ success: true, psi_mobile_score, psi_audit_url }),
      { headers: jsonHeaders },
    );
  } catch (err) {
    console.error("Unexpected error:", err.message);
    await logError("run-psi-and-update", `Unexpected: ${err.message}`);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: jsonHeaders },
    );
  }
});
