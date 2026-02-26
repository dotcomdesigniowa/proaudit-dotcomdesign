import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TIMEOUT_MS = 15_000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** Count errors + warnings from W3C Nu validator JSON output */
function countIssues(messages: Array<{ type?: string; subType?: string }>): number {
  let count = 0;
  for (const m of messages) {
    if (m.type === "error") count++;
    else if (m.type === "info" && m.subType === "warning") count++;
  }
  return count;
}

const BROWSER_HEADERS = {
  "User-Agent": USER_AGENT,
  Accept: "application/json, text/html, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
};

/** Attempt with a given validator base URL (direct doc= check) */
async function attemptDirect(validatorBase: string, websiteUrl: string): Promise<number> {
  const url = `${validatorBase}?doc=${encodeURIComponent(websiteUrl)}&out=json`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Validator returned ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    if (!data.messages || !Array.isArray(data.messages)) {
      throw new Error("Unexpected validator response format");
    }

    return countIssues(data.messages);
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

/** Attempt POST: Fetch HTML server-side, POST to a validator */
async function attemptPost(validatorBase: string, websiteUrl: string): Promise<number> {
  const controller1 = new AbortController();
  const timer1 = setTimeout(() => controller1.abort(), TIMEOUT_MS);
  let html: string;

  try {
    const res = await fetch(websiteUrl, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller1.signal,
      redirect: "follow",
    });
    clearTimeout(timer1);
    html = await res.text();
  } catch (e) {
    clearTimeout(timer1);
    throw new Error(`Failed to fetch website HTML: ${e}`);
  }

  const controller2 = new AbortController();
  const timer2 = setTimeout(() => controller2.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${validatorBase}?out=json`, {
      method: "POST",
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        ...BROWSER_HEADERS,
      },
      body: html,
      signal: controller2.signal,
    });
    clearTimeout(timer2);

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Validator POST returned ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    if (!data.messages || !Array.isArray(data.messages)) {
      throw new Error("Unexpected validator POST response format");
    }

    return countIssues(data.messages);
  } catch (e) {
    clearTimeout(timer2);
    throw e;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { audit_id, website_url } = await req.json();
    if (!audit_id || !website_url) {
      return new Response(
        JSON.stringify({ error: "missing audit_id or website_url" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Mark as fetching
    await supabase
      .from("audit")
      .update({ w3c_status: "fetching", w3c_last_error: null })
      .eq("id", audit_id);

    let issueCount: number | undefined;
    const errors: string[] = [];

    const VALIDATORS = [
      "https://validator.w3.org/nu/",
      "https://html5.validator.nu/",
    ];

    // Try direct doc= check on each validator
    for (const base of VALIDATORS) {
      if (issueCount !== undefined) break;
      try {
        issueCount = await attemptDirect(base, website_url);
        console.log(`[W3C] Direct success via ${base}`);
      } catch (e) {
        const msg = `Direct ${base}: ${String(e).slice(0, 100)}`;
        console.log(`[W3C] ${msg}`);
        errors.push(msg);
      }
    }

    // Try POST with fetched HTML on each validator
    for (const base of VALIDATORS) {
      if (issueCount !== undefined) break;
      try {
        issueCount = await attemptPost(base, website_url);
        console.log(`[W3C] POST success via ${base}`);
      } catch (e) {
        const msg = `POST ${base}: ${String(e).slice(0, 100)}`;
        console.log(`[W3C] ${msg}`);
        errors.push(msg);
      }
    }

    if (issueCount === undefined) {
      const errorMsg = errors.join(" | ").slice(0, 500);
      await supabase
        .from("audit")
        .update({ w3c_status: "error", w3c_last_error: errorMsg })
        .eq("id", audit_id);

      return new Response(
        JSON.stringify({ success: false, error: errorMsg }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Success: update audit
    const { error: updateError } = await supabase
      .from("audit")
      .update({
        w3c_issue_count: issueCount,
        w3c_status: "success",
        w3c_last_error: null,
        w3c_fetched_at: new Date().toISOString(),
      })
      .eq("id", audit_id);

    if (updateError) {
      return new Response(
        JSON.stringify({ success: false, error: updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[W3C] Success for ${website_url}: ${issueCount} issues`);

    return new Response(
      JSON.stringify({ success: true, issue_count: issueCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
