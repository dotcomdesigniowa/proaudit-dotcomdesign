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
    console.log("run-gtmetrix called:", { audit_id, website_url });

    if (!audit_id || !website_url) {
      return new Response(
        JSON.stringify({ success: false, error: "audit_id and website_url required" }),
        { status: 400, headers: jsonHeaders },
      );
    }

    await supabase.from("audit").update({ gtmetrix_status: "fetching" }).eq("id", audit_id);

    const apiKey = Deno.env.get("GTMETRIX_API_KEY");
    if (!apiKey) {
      const err = "GTMETRIX_API_KEY not configured";
      console.error(err);
      await logError("run-gtmetrix", err, { audit_id });
      await supabase.from("audit").update({ gtmetrix_status: "error", gtmetrix_last_error: err }).eq("id", audit_id);
      return new Response(JSON.stringify({ success: false, error: err }), { status: 500, headers: jsonHeaders });
    }

    let normalizedUrl = website_url.trim();
    if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
      normalizedUrl = `https://${normalizedUrl}`;
    }

    // GTmetrix uses Basic Auth with email:apikey — but API key alone works as username with empty password
    const authHeader = "Basic " + btoa(apiKey + ":");

    // Step 1: Create test
    console.log("Creating GTmetrix test for:", normalizedUrl);
    let testId: string;
    try {
      const createRes = await fetch("https://gtmetrix.com/api/2.0/tests", {
        method: "POST",
        headers: {
          "Authorization": authHeader,
          "Content-Type": "application/vnd.api+json",
        },
        body: JSON.stringify({ data: { type: "test", attributes: { url: normalizedUrl } } }),
      });

      if (!createRes.ok) {
        const body = await createRes.text();
        const errMsg = `GTmetrix create test failed [${createRes.status}]: ${body.substring(0, 200)}`;
        console.error(errMsg);
        await logError("run-gtmetrix", errMsg, { audit_id });
        await supabase.from("audit").update({ gtmetrix_status: "error", gtmetrix_last_error: errMsg }).eq("id", audit_id);
        return new Response(JSON.stringify({ success: false, error: errMsg }), { status: 502, headers: jsonHeaders });
      }

      const createData = await createRes.json();
      testId = createData.data?.id;
      if (!testId) {
        throw new Error("No test ID returned from GTmetrix");
      }
      console.log("Test created:", testId);
    } catch (err) {
      const errMsg = `GTmetrix create test error: ${err.message}`;
      console.error(errMsg);
      await logError("run-gtmetrix", errMsg, { audit_id });
      await supabase.from("audit").update({ gtmetrix_status: "error", gtmetrix_last_error: errMsg }).eq("id", audit_id);
      return new Response(JSON.stringify({ success: false, error: errMsg }), { status: 502, headers: jsonHeaders });
    }

    // Step 2: Poll for results (max ~3 minutes)
    const MAX_POLLS = 36;
    const POLL_INTERVAL = 5000;
    let testData: any = null;

    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL));

      try {
        const pollRes = await fetch(`https://gtmetrix.com/api/2.0/tests/${testId}`, {
          headers: { "Authorization": authHeader },
        });

        if (!pollRes.ok) {
          console.log(`Poll ${i + 1} returned ${pollRes.status}, retrying...`);
          continue;
        }

        const pollData = await pollRes.json();
        const state = pollData.data?.attributes?.state;
        console.log(`Poll ${i + 1}: state=${state}`);

        if (state === "completed") {
          testData = pollData.data;
          break;
        } else if (state === "error") {
          const errMsg = `GTmetrix test failed: ${pollData.data?.attributes?.error || "Unknown error"}`;
          console.error(errMsg);
          await logError("run-gtmetrix", errMsg, { audit_id, testId });
          await supabase.from("audit").update({ gtmetrix_status: "error", gtmetrix_last_error: errMsg }).eq("id", audit_id);
          return new Response(JSON.stringify({ success: false, error: errMsg }), { status: 502, headers: jsonHeaders });
        }
        // state is "queued" or "started" — keep polling
      } catch (err) {
        console.log(`Poll ${i + 1} fetch error: ${err.message}, retrying...`);
      }
    }

    if (!testData) {
      const errMsg = "GTmetrix test timed out after 3 minutes";
      console.error(errMsg);
      await logError("run-gtmetrix", errMsg, { audit_id, testId });
      await supabase.from("audit").update({ gtmetrix_status: "error", gtmetrix_last_error: errMsg }).eq("id", audit_id);
      return new Response(JSON.stringify({ success: false, error: errMsg }), { status: 504, headers: jsonHeaders });
    }

    // Step 3: Extract results
    const attrs = testData.attributes;
    const gtmetrix_grade = attrs.gtmetrix_grade || null;
    const gtmetrix_performance = attrs.performance_score != null ? Math.round(attrs.performance_score * 100) : null;
    const gtmetrix_structure = attrs.structure_score != null ? Math.round(attrs.structure_score * 100) : null;
    const gtmetrix_lcp = attrs.lcp ?? null; // in ms
    const gtmetrix_tbt = attrs.tbt ?? null; // in ms
    const gtmetrix_cls = attrs.cls ?? null;  // decimal
    const gtmetrix_report_url = attrs.report_url || `https://gtmetrix.com/reports/${testId}`;

    console.log("GTmetrix results:", { gtmetrix_grade, gtmetrix_performance, gtmetrix_structure, gtmetrix_lcp, gtmetrix_tbt, gtmetrix_cls });

    // Step 4: Update audit
    const { error: updateError } = await supabase
      .from("audit")
      .update({
        gtmetrix_grade,
        gtmetrix_performance,
        gtmetrix_structure,
        gtmetrix_lcp,
        gtmetrix_tbt,
        gtmetrix_cls,
        gtmetrix_report_url,
        gtmetrix_status: "success",
        gtmetrix_last_error: null,
        gtmetrix_fetched_at: new Date().toISOString(),
        // Also sync to psi fields for backward compat with scoring trigger
        psi_mobile_score: gtmetrix_performance,
        psi_audit_url: gtmetrix_report_url,
        psi_status: "success",
        psi_last_error: null,
        psi_fetched_at: new Date().toISOString(),
      })
      .eq("id", audit_id);

    if (updateError) {
      console.error("Failed to update audit:", updateError.message);
      await logError("run-gtmetrix", `DB update failed: ${updateError.message}`, { audit_id });
      return new Response(
        JSON.stringify({ success: false, error: updateError.message }),
        { status: 500, headers: jsonHeaders },
      );
    }

    console.log("Success! GTmetrix results saved for audit:", audit_id);
    return new Response(
      JSON.stringify({ success: true, gtmetrix_grade, gtmetrix_performance, gtmetrix_structure, gtmetrix_lcp, gtmetrix_tbt, gtmetrix_cls }),
      { headers: jsonHeaders },
    );
  } catch (err) {
    console.error("Unexpected error:", err.message);
    await logError("run-gtmetrix", `Unexpected: ${err.message}`);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: jsonHeaders },
    );
  }
});
