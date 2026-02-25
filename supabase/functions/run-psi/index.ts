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

  try {
    const { website_url } = await req.json();
    console.log("run-psi called with:", website_url);

    if (!website_url) {
      return new Response(
        JSON.stringify({ success: false, error: "website_url is required" }),
        { status: 400, headers: jsonHeaders },
      );
    }

    const apiKey = Deno.env.get("PSI_API_KEY");
    if (!apiKey) {
      console.error("PSI_API_KEY not set");
      return new Response(
        JSON.stringify({ success: false, error: "PSI_API_KEY not configured" }),
        { status: 500, headers: jsonHeaders },
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
    psiUrl.searchParams.set("category", "performance");
    psiUrl.searchParams.set("key", apiKey);

    console.log("Fetching PSI API...");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    let response: Response;
    try {
      response = await fetch(psiUrl.toString(), { signal: controller.signal });
    } catch (err) {
      clearTimeout(timeout);
      const isTimeout = err instanceof DOMException && err.name === "AbortError";
      console.error("PSI fetch error:", err.message);
      return new Response(
        JSON.stringify({
          success: false,
          error: isTimeout ? "PSI API timed out — try again or enter manually" : `Fetch failed: ${err.message}`,
        }),
        { status: 504, headers: jsonHeaders },
      );
    }
    clearTimeout(timeout);

    console.log("PSI API status:", response.status);

    if (!response.ok) {
      const body = await response.text();
      console.error("PSI API error:", body.substring(0, 500));
      return new Response(
        JSON.stringify({ success: false, error: `PSI API error ${response.status}`, details: body }),
        { status: 502, headers: jsonHeaders },
      );
    }

    const data = await response.json();
    const rawScore = data?.lighthouseResult?.categories?.performance?.score;
    console.log("Raw score:", rawScore);

    if (rawScore == null) {
      return new Response(
        JSON.stringify({ success: false, error: "Could not extract performance score from PSI response" }),
        { status: 502, headers: jsonHeaders },
      );
    }

    const psi_mobile_score = Math.round(rawScore * 100);
    const encodedUrl = encodeURIComponent(normalizedUrl);
    const psi_audit_url = `https://pagespeed.web.dev/report?url=${encodedUrl}`;

    console.log("Success! Score:", psi_mobile_score);

    return new Response(
      JSON.stringify({ success: true, psi_mobile_score, psi_audit_url }),
      { headers: jsonHeaders },
    );
  } catch (err) {
    console.error("Unexpected error:", err.message);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: jsonHeaders },
    );
  }
});
