import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { website_url } = await req.json();
    if (!website_url) {
      return new Response(
        JSON.stringify({ success: false, error: "website_url is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const apiKey = Deno.env.get("PSI_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "PSI_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Normalize URL
    let normalizedUrl = website_url.trim();
    if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
      normalizedUrl = `https://${normalizedUrl}`;
    }

    const psiUrl = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
    psiUrl.searchParams.set("url", normalizedUrl);
    psiUrl.searchParams.set("strategy", "mobile");
    psiUrl.searchParams.set("key", apiKey);

    // 10-second timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    let response: Response;
    try {
      response = await fetch(psiUrl.toString(), { signal: controller.signal });
    } catch (err) {
      clearTimeout(timeout);
      const isTimeout = err instanceof DOMException && err.name === "AbortError";
      return new Response(
        JSON.stringify({
          success: false,
          error: isTimeout ? "Request timed out (10s)" : `Fetch failed: ${err.message}`,
        }),
        { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    clearTimeout(timeout);

    if (!response.ok) {
      const body = await response.text();
      return new Response(
        JSON.stringify({ success: false, error: `PSI API error ${response.status}`, details: body }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await response.json();
    const rawScore = data?.lighthouseResult?.categories?.performance?.score;

    if (rawScore == null) {
      return new Response(
        JSON.stringify({ success: false, error: "Could not extract performance score from PSI response" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const psi_mobile_score = Math.round(rawScore * 100);
    const encodedUrl = encodeURIComponent(normalizedUrl);
    const psi_audit_url = `https://pagespeed.web.dev/report?url=${encodedUrl}`;

    return new Response(
      JSON.stringify({ success: true, psi_mobile_score, psi_audit_url }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
