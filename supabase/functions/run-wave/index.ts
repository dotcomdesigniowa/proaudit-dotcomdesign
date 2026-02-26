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
    console.log("run-wave called:", { audit_id, website_url });

    if (!audit_id || !website_url) {
      return new Response(
        JSON.stringify({ success: false, error: "audit_id and website_url required" }),
        { status: 400, headers: jsonHeaders },
      );
    }

    await supabase.from("audit").update({ wave_status: "fetching" }).eq("id", audit_id);

    const apiKey = Deno.env.get("WAVE_API_KEY");
    if (!apiKey) {
      const err = "WAVE_API_KEY not configured";
      console.error(err);
      await logError("run-wave", err, { audit_id });
      await supabase.from("audit").update({ wave_status: "error", wave_last_error: err }).eq("id", audit_id);
      return new Response(JSON.stringify({ success: false, error: err }), { status: 500, headers: jsonHeaders });
    }

    let normalizedUrl = website_url.trim();
    if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
      normalizedUrl = `https://${normalizedUrl}`;
    }

    const waveUrl = `https://wave.webaim.org/api/request?key=${encodeURIComponent(apiKey)}&url=${encodeURIComponent(normalizedUrl)}&reporttype=1&format=json`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    let response: Response;
    try {
      response = await fetch(waveUrl, { signal: controller.signal });
    } catch (err) {
      clearTimeout(timeout);
      const errMsg = `WAVE fetch failed: ${(err as Error).message}`;
      console.error(errMsg);
      await logError("run-wave", errMsg, { audit_id, website_url: normalizedUrl });
      await supabase.from("audit").update({ wave_status: "error", wave_last_error: errMsg }).eq("id", audit_id);
      return new Response(JSON.stringify({ success: false, error: errMsg }), { status: 504, headers: jsonHeaders });
    }
    clearTimeout(timeout);

    if (!response.ok) {
      const body = await response.text();
      const errMsg = `WAVE API error ${response.status}: ${body.substring(0, 200)}`;
      console.error(errMsg);
      await logError("run-wave", errMsg, { audit_id, website_url: normalizedUrl, status: response.status });
      await supabase.from("audit").update({ wave_status: "error", wave_last_error: errMsg }).eq("id", audit_id);
      return new Response(JSON.stringify({ success: false, error: errMsg }), { status: 502, headers: jsonHeaders });
    }

    const data = await response.json();
    console.log("WAVE full statistics:", JSON.stringify(data?.statistics));
    console.log("WAVE response categories:", JSON.stringify(data?.categories));

    const categories = data?.categories;
    if (!categories) {
      const errMsg = "Could not extract categories from WAVE response";
      await logError("run-wave", errMsg, { audit_id });
      await supabase.from("audit").update({ wave_status: "error", wave_last_error: errMsg }).eq("id", audit_id);
      return new Response(JSON.stringify({ success: false, error: errMsg }), { status: 502, headers: jsonHeaders });
    }

    const errors = categories.error?.count ?? 0;
    const alerts = categories.alert?.count ?? 0;
    const contrast = categories.contrast?.count ?? 0;

    let score10: number;
    let aimSource: string;
    const rawAIM = data?.statistics?.AIMscore;

    if (rawAIM != null && typeof rawAIM === "number" && rawAIM >= 0) {
      score10 = Math.round(Math.max(1, Math.min(10, rawAIM)) * 10) / 10;
      aimSource = `statistics.AIMscore = ${rawAIM}`;
      console.log(`[AIM] Using official AIM score: ${rawAIM} -> clamped: ${score10}`);
    } else {
      const elements = categories.structure?.count ?? 1;
      const density = errors / Math.max(1, elements);
      const impact = (errors * 3) + (alerts * 1) + (contrast * 2) + (density * 1000);
      const raw = 10 - (Math.log1p(impact) / Math.log1p(200)) * 9;
      score10 = Math.round(Math.max(1, Math.min(10, raw)) * 10) / 10;
      aimSource = `FALLBACK computed (AIMscore missing/invalid: ${JSON.stringify(rawAIM)})`;
      console.warn(`[AIM] FALLBACK: AIMscore not found in response, computed: ${score10}`);
      await logError("run-wave", `AIM score fallback used`, { audit_id, rawAIM, computed: score10 });
    }

    const accessibilityAuditUrl = `https://wave.webaim.org/report#/${encodeURIComponent(normalizedUrl)}`;

    const { error: updateError } = await supabase
      .from("audit")
      .update({
        accessibility_score: score10,
        accessibility_audit_url: accessibilityAuditUrl,
        wave_status: "success",
        wave_last_error: null,
        wave_fetched_at: new Date().toISOString(),
      })
      .eq("id", audit_id);

    if (updateError) {
      console.error("Failed to update audit:", updateError.message);
      await logError("run-wave", `DB update failed: ${updateError.message}`, { audit_id });
      return new Response(
        JSON.stringify({ success: false, error: updateError.message }),
        { status: 500, headers: jsonHeaders },
      );
    }

    console.log("Success! WAVE score:", score10, "source:", aimSource, "for audit:", audit_id);
    return new Response(
      JSON.stringify({ success: true, accessibility_score: score10, errors, alerts, contrast, aim_source: aimSource }),
      { headers: jsonHeaders },
    );
  } catch (err) {
    console.error("Unexpected error:", (err as Error).message);
    await logError("run-wave", `Unexpected: ${(err as Error).message}`);
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: jsonHeaders },
    );
  }
});
