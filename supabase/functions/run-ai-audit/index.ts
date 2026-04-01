import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Helpers ──

function normalizeDomain(raw: string): string {
  let d = raw.trim();
  d = d.replace(/^https?:\/\//, "");
  d = d.replace(/^www\./, "");
  d = d.replace(/\/+$/, "");
  return d;
}

function safeFetch(url: string, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; ProAuditBot/1.0)" },
    redirect: "follow",
    signal: controller.signal,
  }).finally(() => clearTimeout(t));
}

function stripHtml(html: string): string {
  let h = html;
  h = h.replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, " ");
  h = h.replace(/<(nav|footer|header)[^>]*>[\s\S]*?<\/\1>/gi, " ");
  h = h.replace(/<[^>]+>/g, " ");
  h = h.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
  h = h.replace(/\s+/g, " ").trim();
  return h;
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(w => w.length > 0).length;
}

interface FactorResult {
  factor_id: number;
  factor_name: string;
  pillar: number;
  check_method: string;
  status: "pass" | "warn" | "fail";
  finding: string;
  fix: string;
}

function safeResult(factorId: number, name: string, pillar: number, method: string, fallback: string): FactorResult {
  return { factor_id: factorId, factor_name: name, pillar, check_method: method, status: "warn", finding: `Check could not be completed — ${fallback}`, fix: "Verify manually." };
}

// ── Main ──

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const PSI_KEY = Deno.env.get("PSI_API_KEY") || "";
  const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY") || "";

  try {
    const body = await req.json();
    const auditId = body.audit_id as string;
    const rawUrl = (body.website_url || body.domain || "") as string;

    if (!auditId || !rawUrl) {
      return new Response(JSON.stringify({ success: false, error: "audit_id and website_url/domain required" }), { status: 400, headers: jsonHeaders });
    }

    const domain = normalizeDomain(rawUrl);
    const baseUrl = `https://${domain}`;
    console.log("run-ai-audit:", { auditId, domain });

    // Check for cached results (last 7 days)
    const { data: cached } = await supabase
      .from("ai_audit_runs")
      .select("id, score, letter_grade, completed_at")
      .eq("audit_id", auditId)
      .eq("status", "complete")
      .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString())
      .order("created_at", { ascending: false })
      .limit(1);

    if (cached && cached.length > 0) {
      console.log("Using cached AI audit results:", cached[0].id);
      // Update audit table with cached score
      await supabase.from("audit").update({
        ai_status: "success",
        ai_score: cached[0].score,
        ai_grade: cached[0].letter_grade,
        ai_fetched_at: new Date().toISOString(),
        ai_last_error: null,
      }).eq("id", auditId);
      return new Response(JSON.stringify({ success: true, cached: true, run_id: cached[0].id }), { headers: jsonHeaders });
    }

    // Mark fetching
    await supabase.from("audit").update({ ai_status: "fetching", ai_last_error: null }).eq("id", auditId);

    // Create audit run
    const { data: run, error: runErr } = await supabase
      .from("ai_audit_runs")
      .insert({ audit_id: auditId, domain, status: "running" })
      .select("id")
      .single();

    if (runErr || !run) {
      throw new Error(`Failed to create audit run: ${runErr?.message}`);
    }
    const runId = run.id;

    // ── Fetch resources in parallel ──
    const [homepageRes, robotsRes, sitemapRes, llmsRes] = await Promise.allSettled([
      safeFetch(baseUrl, 20000).then(async r => ({ status: r.status, html: (await r.text()).slice(0, 500000) })),
      safeFetch(`${baseUrl}/robots.txt`).then(async r => ({ status: r.status, text: await r.text() })),
      safeFetch(`${baseUrl}/sitemap.xml`).then(async r => ({ status: r.status, text: await r.text() })),
      safeFetch(`${baseUrl}/llms.txt`, 8000).then(async r => ({ status: r.status, text: await r.text() })),
    ]);

    const homepage = homepageRes.status === "fulfilled" ? homepageRes.value : { status: 0, html: "" };
    const robots = robotsRes.status === "fulfilled" ? robotsRes.value : { status: 0, text: "" };
    const sitemap = sitemapRes.status === "fulfilled" ? sitemapRes.value : { status: 0, text: "" };
    const llms = llmsRes.status === "fulfilled" ? llmsRes.value : { status: 0, text: "" };

    const html = homepage.html;
    const plainText = stripHtml(html);
    const wordCount = countWords(plainText);

    const results: FactorResult[] = [];

    // ══════════════════════════════════════════════
    // PILLAR 1 — Technical Infrastructure (7 factors)
    // ══════════════════════════════════════════════

    // Factor 1 — AI Crawler Allow-listing
    try {
      const rt = robots.text.toLowerCase();
      const bots = ["gptbot", "claudebot", "perplexitybot", "anthropic-ai"];
      const lines = robots.text.split("\n");
      let currentAgent = "";
      const blocked: string[] = [];
      for (const line of lines) {
        const agentMatch = line.match(/^User-agent:\s*(.+)/i);
        if (agentMatch) { currentAgent = agentMatch[1].trim().toLowerCase(); continue; }
        const disMatch = line.match(/^Disallow:\s*\/\s*$/i);
        if (disMatch && bots.includes(currentAgent)) blocked.push(currentAgent);
      }
      // Also check wildcard disallow
      let wildcardBlocked = false;
      let curAgent2 = "";
      for (const line of lines) {
        const am = line.match(/^User-agent:\s*(.+)/i);
        if (am) { curAgent2 = am[1].trim(); continue; }
        if (curAgent2 === "*" && /^Disallow:\s*\/\s*$/i.test(line)) wildcardBlocked = true;
      }

      const foundBots = bots.filter(b => rt.includes(b));
      const allowedBots = foundBots.filter(b => !blocked.includes(b));

      if (wildcardBlocked && allowedBots.length === 0) {
        results.push({ factor_id: 1, factor_name: "AI Crawler Allow-listing", pillar: 1, check_method: "HTTP Fetch", status: "fail", finding: "robots.txt blocks all crawlers with Disallow: / and no AI bots are explicitly allowed.", fix: "Add specific Allow rules for GPTBot, ClaudeBot, PerplexityBot, and anthropic-ai." });
      } else if (foundBots.length >= 4 && blocked.length === 0) {
        results.push({ factor_id: 1, factor_name: "AI Crawler Allow-listing", pillar: 1, check_method: "HTTP Fetch", status: "pass", finding: `All 4 AI bots found and allowed in robots.txt.`, fix: "" });
      } else if (foundBots.length > 0) {
        results.push({ factor_id: 1, factor_name: "AI Crawler Allow-listing", pillar: 1, check_method: "HTTP Fetch", status: "warn", finding: `${foundBots.length}/4 AI bots mentioned in robots.txt. ${blocked.length > 0 ? `Blocked: ${blocked.join(", ")}` : ""}`, fix: "Ensure GPTBot, ClaudeBot, PerplexityBot, and anthropic-ai are all explicitly allowed." });
      } else {
        results.push({ factor_id: 1, factor_name: "AI Crawler Allow-listing", pillar: 1, check_method: "HTTP Fetch", status: wildcardBlocked ? "fail" : "warn", finding: "No AI-specific bot rules found in robots.txt.", fix: "Add User-agent rules for GPTBot, ClaudeBot, PerplexityBot, and anthropic-ai with Allow: /." });
      }
    } catch { results.push(safeResult(1, "AI Crawler Allow-listing", 1, "HTTP Fetch", "robots.txt could not be analyzed")); }

    // Factor 2 — Server-Side Rendering
    try {
      if (wordCount >= 100) {
        results.push({ factor_id: 2, factor_name: "Server-Side Rendering", pillar: 1, check_method: "HTTP Fetch", status: "pass", finding: `${wordCount} words of visible text found in raw HTML — content is server-rendered.`, fix: "" });
      } else if (wordCount >= 20) {
        results.push({ factor_id: 2, factor_name: "Server-Side Rendering", pillar: 1, check_method: "HTTP Fetch", status: "warn", finding: `Only ${wordCount} words found in raw HTML. Some content may be client-rendered.`, fix: "Implement server-side rendering to ensure AI crawlers can read your content." });
      } else {
        results.push({ factor_id: 2, factor_name: "Server-Side Rendering", pillar: 1, check_method: "HTTP Fetch", status: "fail", finding: `Only ${wordCount} words found in raw HTML. Page appears JavaScript-rendered.`, fix: "Implement SSR or static generation so AI crawlers can access your content." });
      }
    } catch { results.push(safeResult(2, "Server-Side Rendering", 1, "HTTP Fetch", "could not parse homepage")); }

    // Factor 3 — Mobile Page Speed (PSI API)
    let psiData: any = null;
    try {
      if (PSI_KEY) {
        const psiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(baseUrl)}&strategy=mobile&key=${PSI_KEY}`;
        const psiRes = await safeFetch(psiUrl, 20000);
        psiData = await psiRes.json();
        const perfScore = Math.round((psiData?.lighthouseResult?.categories?.performance?.score || 0) * 100);
        if (perfScore >= 90) {
          results.push({ factor_id: 3, factor_name: "Mobile Page Speed", pillar: 1, check_method: "Google PSI API", status: "pass", finding: `Mobile PageSpeed score: ${perfScore}/100`, fix: "" });
        } else if (perfScore >= 50) {
          results.push({ factor_id: 3, factor_name: "Mobile Page Speed", pillar: 1, check_method: "Google PSI API", status: "warn", finding: `Mobile PageSpeed score: ${perfScore}/100`, fix: "Optimize images, reduce JavaScript, and improve server response time." });
        } else {
          results.push({ factor_id: 3, factor_name: "Mobile Page Speed", pillar: 1, check_method: "Google PSI API", status: "fail", finding: `Mobile PageSpeed score: ${perfScore}/100`, fix: "Page is very slow on mobile. Optimize images, minimize JS, use caching." });
        }
      } else {
        results.push(safeResult(3, "Mobile Page Speed", 1, "Google PSI API", "PSI API key not configured"));
      }
    } catch { results.push(safeResult(3, "Mobile Page Speed", 1, "Google PSI API", "PageSpeed API call failed")); }

    // Factor 4 — HTTPS Security
    try {
      const httpsOk = homepage.status === 200;
      let httpRedirects = false;
      try {
        const httpRes = await safeFetch(`http://${domain}`, 8000);
        const finalUrl = httpRes.url || "";
        httpRedirects = finalUrl.startsWith("https://");
        await httpRes.text(); // consume
      } catch { /* http might not respond */ }

      if (httpsOk && httpRedirects) {
        results.push({ factor_id: 4, factor_name: "HTTPS Security", pillar: 1, check_method: "HTTP Fetch", status: "pass", finding: "HTTPS is active and HTTP redirects to HTTPS.", fix: "" });
      } else if (httpsOk) {
        results.push({ factor_id: 4, factor_name: "HTTPS Security", pillar: 1, check_method: "HTTP Fetch", status: "warn", finding: "HTTPS works but HTTP does not redirect to HTTPS.", fix: "Configure HTTP to HTTPS redirect for all traffic." });
      } else {
        results.push({ factor_id: 4, factor_name: "HTTPS Security", pillar: 1, check_method: "HTTP Fetch", status: "fail", finding: "HTTPS does not respond with a 200 status.", fix: "Install an SSL certificate and ensure HTTPS is properly configured." });
      }
    } catch { results.push(safeResult(4, "HTTPS Security", 1, "HTTP Fetch", "HTTPS check failed")); }

    // Factor 5 — Clean XML Sitemap
    try {
      const sitemapOk = sitemap.status === 200;
      const locCount = (sitemap.text.match(/<loc>/gi) || []).length;
      if (sitemapOk && locCount >= 5) {
        results.push({ factor_id: 5, factor_name: "Clean XML Sitemap", pillar: 1, check_method: "HTTP Fetch", status: "pass", finding: `Valid sitemap with ${locCount} URLs.`, fix: "" });
      } else if (sitemapOk && locCount > 0) {
        results.push({ factor_id: 5, factor_name: "Clean XML Sitemap", pillar: 1, check_method: "HTTP Fetch", status: "warn", finding: `Sitemap found but only ${locCount} URLs.`, fix: "Add more pages to your sitemap for better AI crawl coverage." });
      } else {
        results.push({ factor_id: 5, factor_name: "Clean XML Sitemap", pillar: 1, check_method: "HTTP Fetch", status: "fail", finding: sitemapOk ? "Sitemap exists but contains no valid URLs." : "No sitemap.xml found (404).", fix: "Create a valid XML sitemap at /sitemap.xml with all important pages." });
      }
    } catch { results.push(safeResult(5, "Clean XML Sitemap", 1, "HTTP Fetch", "sitemap check failed")); }

    // Factor 6 — Zero Render-Blocking Resources (PSI)
    try {
      if (psiData) {
        const rbScore = psiData?.lighthouseResult?.audits?.["render-blocking-resources"]?.score ?? null;
        if (rbScore === null) {
          results.push(safeResult(6, "Zero Render-Blocking Resources", 1, "Google PSI API", "audit data unavailable"));
        } else if (rbScore >= 0.9) {
          results.push({ factor_id: 6, factor_name: "Zero Render-Blocking Resources", pillar: 1, check_method: "Google PSI API", status: "pass", finding: "No significant render-blocking resources detected.", fix: "" });
        } else if (rbScore >= 0.5) {
          results.push({ factor_id: 6, factor_name: "Zero Render-Blocking Resources", pillar: 1, check_method: "Google PSI API", status: "warn", finding: "Some render-blocking resources detected.", fix: "Defer non-critical CSS/JS to improve page load and crawlability." });
        } else {
          results.push({ factor_id: 6, factor_name: "Zero Render-Blocking Resources", pillar: 1, check_method: "Google PSI API", status: "fail", finding: "Significant render-blocking resources slow page rendering.", fix: "Inline critical CSS and defer non-essential scripts." });
        }
      } else {
        results.push(safeResult(6, "Zero Render-Blocking Resources", 1, "Google PSI API", "PSI data not available"));
      }
    } catch { results.push(safeResult(6, "Zero Render-Blocking Resources", 1, "Google PSI API", "check failed")); }

    // Factor 7 — Clean Internal Linking
    try {
      const brokenPatterns = (html.match(/href\s*=\s*["']\s*(javascript:void|javascript:|#)\s*["']/gi) || []).length;
      const emptyHrefs = (html.match(/href\s*=\s*["']\s*["']/gi) || []).length;
      const total = brokenPatterns + emptyHrefs;
      if (total === 0) {
        results.push({ factor_id: 7, factor_name: "Clean Internal Linking", pillar: 1, check_method: "HTTP Fetch", status: "pass", finding: "No broken link patterns (javascript:void, empty href) found.", fix: "" });
      } else if (total <= 3) {
        results.push({ factor_id: 7, factor_name: "Clean Internal Linking", pillar: 1, check_method: "HTTP Fetch", status: "warn", finding: `${total} broken link pattern(s) found (javascript: or empty href).`, fix: "Replace javascript: links with proper URLs or button elements." });
      } else {
        results.push({ factor_id: 7, factor_name: "Clean Internal Linking", pillar: 1, check_method: "HTTP Fetch", status: "fail", finding: `${total} broken link patterns found.`, fix: "Fix all javascript: and empty href links to use proper URLs." });
      }
    } catch { results.push(safeResult(7, "Clean Internal Linking", 1, "HTTP Fetch", "link analysis failed")); }

    // ══════════════════════════════════════════════
    // PILLAR 2 — Content Structure & Extractability (12 factors)
    // ══════════════════════════════════════════════

    // Factor 9 — Granular Heading Hierarchy
    try {
      const h1s = (html.match(/<h1[\s>]/gi) || []).length;
      const h2s = (html.match(/<h2[\s>]/gi) || []).length;
      const h3s = (html.match(/<h3[\s>]/gi) || []).length;
      const skipped = (h1s > 0 && h3s > 0 && h2s === 0);
      if (h1s === 1 && h2s >= 2 && !skipped) {
        results.push({ factor_id: 9, factor_name: "Granular Heading Hierarchy", pillar: 2, check_method: "HTTP Fetch", status: "pass", finding: `Clean heading structure: 1 H1, ${h2s} H2s, ${h3s} H3s.`, fix: "" });
      } else if (h1s > 1 || h2s <= 1) {
        results.push({ factor_id: 9, factor_name: "Granular Heading Hierarchy", pillar: 2, check_method: "HTTP Fetch", status: "warn", finding: `${h1s} H1(s), ${h2s} H2(s), ${h3s} H3(s). ${h1s > 1 ? "Multiple H1s detected." : ""}${h2s <= 1 ? " Too few H2 subheadings." : ""}`, fix: "Use exactly one H1, at least 2 H2 subheadings, and maintain proper hierarchy." });
      } else {
        results.push({ factor_id: 9, factor_name: "Granular Heading Hierarchy", pillar: 2, check_method: "HTTP Fetch", status: "fail", finding: "No H1 tag found on the page.", fix: "Add a single H1 heading that describes the main topic of the page." });
      }
    } catch { results.push(safeResult(9, "Granular Heading Hierarchy", 2, "HTTP Fetch", "heading parse failed")); }

    // Factor 11 — Numbered Lists for Processes
    try {
      const olCount = (html.match(/<ol[\s>]/gi) || []).length;
      if (olCount >= 1) {
        results.push({ factor_id: 11, factor_name: "Numbered Lists for Processes", pillar: 2, check_method: "HTTP Fetch", status: "pass", finding: `${olCount} ordered list(s) found.`, fix: "" });
      } else {
        results.push({ factor_id: 11, factor_name: "Numbered Lists for Processes", pillar: 2, check_method: "HTTP Fetch", status: "warn", finding: "No ordered lists (<ol>) found.", fix: "Use numbered lists for step-by-step processes and procedures." });
      }
    } catch { results.push(safeResult(11, "Numbered Lists for Processes", 2, "HTTP Fetch", "check failed")); }

    // Factor 12 — Bullet Points for Features
    try {
      const ulCount = (html.match(/<ul[\s>]/gi) || []).length;
      if (ulCount >= 3) {
        results.push({ factor_id: 12, factor_name: "Bullet Points for Features", pillar: 2, check_method: "HTTP Fetch", status: "pass", finding: `${ulCount} unordered lists found.`, fix: "" });
      } else if (ulCount >= 1) {
        results.push({ factor_id: 12, factor_name: "Bullet Points for Features", pillar: 2, check_method: "HTTP Fetch", status: "warn", finding: `Only ${ulCount} unordered list(s) found.`, fix: "Use bullet lists to organize features, benefits, and service details." });
      } else {
        results.push({ factor_id: 12, factor_name: "Bullet Points for Features", pillar: 2, check_method: "HTTP Fetch", status: "fail", finding: "No unordered lists found.", fix: "Add <ul> bullet lists to present features and benefits clearly." });
      }
    } catch { results.push(safeResult(12, "Bullet Points for Features", 2, "HTTP Fetch", "check failed")); }

    // Factor 13 — Comparison Tables
    try {
      const tableCount = (html.match(/<table[\s>]/gi) || []).length;
      if (tableCount >= 1) {
        results.push({ factor_id: 13, factor_name: "Comparison Tables", pillar: 2, check_method: "HTTP Fetch", status: "pass", finding: `${tableCount} table(s) found.`, fix: "" });
      } else {
        results.push({ factor_id: 13, factor_name: "Comparison Tables", pillar: 2, check_method: "HTTP Fetch", status: "warn", finding: "No comparison tables found.", fix: "Add tables to compare services, pricing, or features for better AI extraction." });
      }
    } catch { results.push(safeResult(13, "Comparison Tables", 2, "HTTP Fetch", "check failed")); }

    // Factor 14 — Short Paragraphs
    try {
      const pMatches = html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi);
      const sentenceCounts: number[] = [];
      for (const m of pMatches) {
        const text = m[1].replace(/<[^>]+>/g, " ").trim();
        if (text.length > 20) {
          const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 5).length;
          sentenceCounts.push(sentences);
        }
      }
      const avg = sentenceCounts.length > 0 ? sentenceCounts.reduce((a, b) => a + b, 0) / sentenceCounts.length : 0;
      if (sentenceCounts.length === 0) {
        results.push(safeResult(14, "Short Paragraphs", 2, "HTTP Fetch", "no paragraphs found to analyze"));
      } else if (avg <= 4) {
        results.push({ factor_id: 14, factor_name: "Short Paragraphs", pillar: 2, check_method: "HTTP Fetch", status: "pass", finding: `Average ${avg.toFixed(1)} sentences per paragraph — concise and AI-friendly.`, fix: "" });
      } else if (avg <= 6) {
        results.push({ factor_id: 14, factor_name: "Short Paragraphs", pillar: 2, check_method: "HTTP Fetch", status: "warn", finding: `Average ${avg.toFixed(1)} sentences per paragraph — slightly long.`, fix: "Break long paragraphs into 2-3 sentence chunks for better readability." });
      } else {
        results.push({ factor_id: 14, factor_name: "Short Paragraphs", pillar: 2, check_method: "HTTP Fetch", status: "fail", finding: `Average ${avg.toFixed(1)} sentences per paragraph — too dense.`, fix: "Rewrite paragraphs to be 2-4 sentences. Use headings and lists instead." });
      }
    } catch { results.push(safeResult(14, "Short Paragraphs", 2, "HTTP Fetch", "paragraph analysis failed")); }

    // Factor 16 — FAQ Sections
    try {
      const htmlLower = html.toLowerCase();
      const hasFaqClass = /class\s*=\s*["'][^"']*faq[^"']*["']/i.test(html);
      const hasFaqId = /id\s*=\s*["'][^"']*faq[^"']*["']/i.test(html);
      const hasFaqHeading = /<h[23][^>]*>[^<]*(faq|frequently asked|common questions)[^<]*<\/h[23]>/i.test(html);
      const hasFaqSchema = htmlLower.includes('"faqpage"') || htmlLower.includes("'faqpage'");
      if (hasFaqClass || hasFaqId || hasFaqHeading || hasFaqSchema) {
        results.push({ factor_id: 16, factor_name: "FAQ Sections", pillar: 2, check_method: "HTTP Fetch", status: "pass", finding: "FAQ section detected on the page.", fix: "" });
      } else {
        results.push({ factor_id: 16, factor_name: "FAQ Sections", pillar: 2, check_method: "HTTP Fetch", status: "warn", finding: "No FAQ section found.", fix: "Add an FAQ section with common questions — AI systems frequently extract these." });
      }
    } catch { results.push(safeResult(16, "FAQ Sections", 2, "HTTP Fetch", "FAQ check failed")); }

    // ══════════════════════════════════════════════
    // PILLAR 3 — Entity & Authority Signals (8 factors)
    // ══════════════════════════════════════════════

    // Factor 20 — Comprehensive Schema Markup
    try {
      const ldMatches = html.matchAll(/<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
      const allTypes = new Set<string>();
      for (const m of ldMatches) {
        try {
          const parsed = JSON.parse(m[1]);
          if (parsed["@type"]) allTypes.add(String(parsed["@type"]));
          if (Array.isArray(parsed["@graph"])) {
            for (const g of parsed["@graph"]) if (g["@type"]) allTypes.add(String(g["@type"]));
          }
        } catch { /* skip invalid */ }
      }
      if (allTypes.size >= 3) {
        results.push({ factor_id: 20, factor_name: "Comprehensive Schema Markup", pillar: 3, check_method: "HTTP Fetch", status: "pass", finding: `${allTypes.size} schema types found: ${[...allTypes].join(", ")}.`, fix: "" });
      } else if (allTypes.size >= 1) {
        results.push({ factor_id: 20, factor_name: "Comprehensive Schema Markup", pillar: 3, check_method: "HTTP Fetch", status: "warn", finding: `Only ${allTypes.size} schema type(s): ${[...allTypes].join(", ")}.`, fix: "Add FAQPage, Service, and Organization schema types for better AI understanding." });
      } else {
        results.push({ factor_id: 20, factor_name: "Comprehensive Schema Markup", pillar: 3, check_method: "HTTP Fetch", status: "fail", finding: "No JSON-LD structured data found.", fix: "Add JSON-LD schema markup (Organization, LocalBusiness, FAQPage) to your pages." });
      }
    } catch { results.push(safeResult(20, "Comprehensive Schema Markup", 3, "HTTP Fetch", "schema analysis failed")); }

    // Factor 22 — Author Schema (Person)
    try {
      const hasPersonSchema = /"@type"\s*:\s*"Person"/i.test(html) && /"name"\s*:/i.test(html);
      if (hasPersonSchema) {
        results.push({ factor_id: 22, factor_name: "Author Schema (Person)", pillar: 3, check_method: "HTTP Fetch", status: "pass", finding: "Person schema with name property found.", fix: "" });
      } else {
        results.push({ factor_id: 22, factor_name: "Author Schema (Person)", pillar: 3, check_method: "HTTP Fetch", status: "warn", finding: "No Person schema markup found.", fix: "Add JSON-LD Person schema for authors/team members with credentials." });
      }
    } catch { results.push(safeResult(22, "Author Schema (Person)", 3, "HTTP Fetch", "check failed")); }

    // Factor 25 — Content Freshness
    try {
      const dateModifiedMatch = html.match(/"dateModified"\s*:\s*"([^"]+)"/i) || html.match(/"datePublished"\s*:\s*"([^"]+)"/i);
      const textDateMatch = plainText.match(/(?:updated|last updated|modified)\s+(?:on\s+)?(\w+\s+\d{1,2},?\s+\d{4}|\d{4})/i);
      let dateStr = dateModifiedMatch?.[1] || textDateMatch?.[1] || null;
      if (dateStr) {
        const d = new Date(dateStr);
        const monthsAgo = (Date.now() - d.getTime()) / (30 * 86400000);
        if (!isNaN(d.getTime()) && monthsAgo <= 12) {
          results.push({ factor_id: 25, factor_name: "Content Freshness", pillar: 3, check_method: "HTTP Fetch", status: "pass", finding: `Content date found: ${dateStr} (within last 12 months).`, fix: "" });
        } else {
          results.push({ factor_id: 25, factor_name: "Content Freshness", pillar: 3, check_method: "HTTP Fetch", status: "warn", finding: `Date found (${dateStr}) but may be older than 12 months.`, fix: "Update content regularly and include visible 'Last Updated' dates." });
        }
      } else {
        results.push({ factor_id: 25, factor_name: "Content Freshness", pillar: 3, check_method: "HTTP Fetch", status: "fail", finding: "No content dates found in schema or page text.", fix: "Add dateModified to your schema and visible 'Last Updated' dates on pages." });
      }
    } catch { results.push(safeResult(25, "Content Freshness", 3, "HTTP Fetch", "date check failed")); }

    // Factor 26 — Consistent NAP Information
    try {
      const phoneRe = /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
      const addressRe = /\d{2,5}\s+[\w\s]+(?:street|st|avenue|ave|boulevard|blvd|road|rd|drive|dr|lane|ln|way|court|ct|place|pl)/i;
      const cityStateRe = /[A-Z][a-z]+(?:\s[A-Z][a-z]+)?,?\s+[A-Z]{2}\s+\d{5}/;
      const hasPhone = phoneRe.test(plainText);
      const hasAddress = addressRe.test(plainText);
      const hasCityState = cityStateRe.test(plainText);
      const count = [hasPhone, hasAddress, hasCityState].filter(Boolean).length;
      if (count === 3) {
        results.push({ factor_id: 26, factor_name: "Consistent NAP Information", pillar: 3, check_method: "HTTP Fetch", status: "pass", finding: "Phone, address, and city/state/zip all found in page text.", fix: "" });
      } else if (count >= 1) {
        results.push({ factor_id: 26, factor_name: "Consistent NAP Information", pillar: 3, check_method: "HTTP Fetch", status: "warn", finding: `Only ${count}/3 NAP elements found. ${!hasPhone ? "Missing phone. " : ""}${!hasAddress ? "Missing address. " : ""}${!hasCityState ? "Missing city/state/zip." : ""}`, fix: "Include complete Name, Address, Phone (NAP) information in visible text." });
      } else {
        results.push({ factor_id: 26, factor_name: "Consistent NAP Information", pillar: 3, check_method: "HTTP Fetch", status: "fail", finding: "No phone, address, or city/state/zip found in page text.", fix: "Add complete business contact information in plain text on your website." });
      }
    } catch { results.push(safeResult(26, "Consistent NAP Information", 3, "HTTP Fetch", "NAP check failed")); }

    // ══════════════════════════════════════════════
    // PILLAR 4 — Strategic AI Assets (5 factors)
    // ══════════════════════════════════════════════

    // Factor 28 — The llms.txt File
    try {
      if (llms.status === 200 && llms.text.trim().length > 0) {
        results.push({ factor_id: 28, factor_name: "The llms.txt File", pillar: 4, check_method: "HTTP Fetch", status: "pass", finding: "llms.txt found with content.", fix: "" });
      } else {
        results.push({ factor_id: 28, factor_name: "The llms.txt File", pillar: 4, check_method: "HTTP Fetch", status: "fail", finding: "No llms.txt file found.", fix: "Create an /llms.txt file with a brand summary for AI systems." });
      }
    } catch { results.push(safeResult(28, "The llms.txt File", 4, "HTTP Fetch", "llms.txt check failed")); }

    // Factor 31 — Video Transcript Integration
    try {
      const hasVideo = /<iframe[^>]*(youtube|vimeo)[^>]*>/i.test(html);
      if (!hasVideo) {
        results.push({ factor_id: 31, factor_name: "Video Transcript Integration", pillar: 4, check_method: "HTTP Fetch", status: "pass", finding: "No embedded videos found — N/A (counts as pass).", fix: "" });
      } else {
        const hasTranscript = /transcript/i.test(plainText);
        if (hasTranscript) {
          results.push({ factor_id: 31, factor_name: "Video Transcript Integration", pillar: 4, check_method: "HTTP Fetch", status: "pass", finding: "Videos found with transcript text nearby.", fix: "" });
        } else {
          results.push({ factor_id: 31, factor_name: "Video Transcript Integration", pillar: 4, check_method: "HTTP Fetch", status: "warn", finding: "Embedded videos found but no transcript text detected.", fix: "Add text transcripts below videos so AI systems can read the content." });
        }
      }
    } catch { results.push(safeResult(31, "Video Transcript Integration", 4, "HTTP Fetch", "video check failed")); }

    // Factor 32 — AI Attribution in Forms
    try {
      const hasForm = /<form[\s>]/i.test(html);
      if (!hasForm) {
        results.push({ factor_id: 32, factor_name: "AI Attribution in Forms", pillar: 4, check_method: "HTTP Fetch", status: "warn", finding: "No forms found on the homepage.", fix: "Consider adding a contact form with an AI/chatbot referral source option." });
      } else {
        const formArea = html.match(/<form[\s\S]*?<\/form>/gi)?.join(" ") || "";
        const hasAiOption = /how did you (find|hear)|referral|chatbot|ai\b/i.test(formArea);
        if (hasAiOption) {
          results.push({ factor_id: 32, factor_name: "AI Attribution in Forms", pillar: 4, check_method: "HTTP Fetch", status: "pass", finding: "Form found with AI/chatbot attribution option.", fix: "" });
        } else {
          results.push({ factor_id: 32, factor_name: "AI Attribution in Forms", pillar: 4, check_method: "HTTP Fetch", status: "warn", finding: "Form found but no AI/chatbot referral source option.", fix: "Add 'AI/Chatbot' as a 'How did you find us?' option in your forms." });
        }
      }
    } catch { results.push(safeResult(32, "AI Attribution in Forms", 4, "HTTP Fetch", "form check failed")); }

    // ══════════════════════════════════════════════
    // AI/NLP Checks (Factors 8, 10, 15, 17, 18, 19, 21, 23, 24, 27, 29, 30)
    // ══════════════════════════════════════════════
    const aiFactorIds = [8, 10, 15, 17, 18, 19, 21, 23, 24, 27, 29, 30];
    const aiFactorNames: Record<number, string> = {
      8: "Answer-First Structure",
      10: "Data-Driven Statistics",
      15: "Executive Summaries / Key Takeaways",
      17: "Active Voice",
      18: "Clear Definitions",
      19: "Comprehensive Service Details",
      21: "Author Profiles",
      23: "Citation of Primary Sources",
      24: "Text-Based Trust Signals",
      27: "First-Party Expert Quotes",
      29: "AI Disclosure / Training Page",
      30: "Competitor Comparison Pages",
    };
    const aiFactorKeys: Record<number, string> = {
      8: "answer_first",
      10: "data_statistics",
      15: "executive_summaries",
      17: "active_voice",
      18: "clear_definitions",
      19: "comprehensive_services",
      21: "author_profiles",
      23: "citation_sources",
      24: "trust_signals",
      27: "expert_quotes",
      29: "ai_disclosure_page",
      30: "competitor_comparison",
    };

    try {
      if (!LOVABLE_KEY) throw new Error("LOVABLE_API_KEY not configured");

      const truncatedText = plainText.slice(0, 8000);
      const prompt = `You are an AI readiness auditor analyzing a business website. Evaluate the following website content against 12 factors. Return ONLY a JSON object with exactly these 12 keys. For each key, provide an object with: "status" (exactly one of: "pass", "warn", or "fail"), "finding" (one sentence describing what you found), and "fix" (one sentence recommendation, or empty string if passing).

Keys to evaluate:
- answer_first: Does each major section lead with a direct answer before supporting detail?
- data_statistics: Does the content include specific verifiable statistics, percentages, or data points?
- executive_summaries: Does long-form content include summary sections or key takeaways?
- active_voice: Is the content primarily written in active voice?
- clear_definitions: Are key industry terms explicitly defined in plain language?
- comprehensive_services: Are all services, locations, credentials, and specialties listed in plain text?
- author_profiles: Are there author bios or team member profiles with credentials?
- citation_sources: Does the content link to or cite authoritative external sources?
- trust_signals: Are certifications, awards, and trust badges accompanied by explicit text descriptions?
- expert_quotes: Are there direct quotes from company leadership or subject matter experts?
- ai_disclosure_page: Is there a dedicated page or section providing a comprehensive brand summary for AI?
- competitor_comparison: Is there "Why Choose Us" or comparison content positioning the brand against alternatives?

Website content:
${truncatedText}`;

      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "You are an AI readiness auditor. Return only valid JSON." },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
        }),
      });

      if (!aiRes.ok) {
        const errText = await aiRes.text();
        throw new Error(`AI gateway error ${aiRes.status}: ${errText.slice(0, 200)}`);
      }

      const aiData = await aiRes.json();
      let content = aiData?.choices?.[0]?.message?.content || "";
      // Strip markdown code fences if present
      content = content.replace(/^```json\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
      const aiResults = JSON.parse(content);

      for (const [factorId, key] of Object.entries(aiFactorKeys)) {
        const fId = Number(factorId);
        const r = aiResults[key];
        if (r && ["pass", "warn", "fail"].includes(r.status)) {
          results.push({
            factor_id: fId,
            factor_name: aiFactorNames[fId],
            pillar: fId <= 19 ? 2 : (fId <= 27 ? 3 : 4),
            check_method: "AI/NLP",
            status: r.status,
            finding: r.finding || "",
            fix: r.fix || "",
          });
        } else {
          results.push(safeResult(fId, aiFactorNames[fId], fId <= 19 ? 2 : (fId <= 27 ? 3 : 4), "AI/NLP", "AI did not return a valid result for this factor"));
        }
      }
    } catch (aiErr) {
      console.error("AI/NLP checks failed:", (aiErr as Error).message);
      // Fill all AI factors with warn
      for (const fId of aiFactorIds) {
        results.push(safeResult(fId, aiFactorNames[fId], fId <= 19 ? 2 : (fId <= 27 ? 3 : 4), "AI/NLP", `AI analysis unavailable: ${(aiErr as Error).message?.slice(0, 100)}`));
      }
    }

    // ══════════════════════════════════════════════
    // SCORING
    // ══════════════════════════════════════════════
    const passCount = results.filter(r => r.status === "pass").length;
    const warnCount = results.filter(r => r.status === "warn").length;
    const failCount = results.filter(r => r.status === "fail").length;
    const score100 = Math.round((passCount / 32) * 100);

    let letterGrade: string;
    if (score100 >= 90) letterGrade = "A";
    else if (score100 >= 75) letterGrade = "B";
    else if (score100 >= 60) letterGrade = "C";
    else if (score100 >= 45) letterGrade = "D";
    else letterGrade = "F";

    const p1 = results.filter(r => r.pillar === 1 && r.status === "pass").length;
    const p2 = results.filter(r => r.pillar === 2 && r.status === "pass").length;
    const p3 = results.filter(r => r.pillar === 3 && r.status === "pass").length;
    const p4 = results.filter(r => r.pillar === 4 && r.status === "pass").length;

    // Store factor results
    const factorRows = results.map(r => ({ audit_run_id: runId, ...r }));
    await supabase.from("ai_audit_factor_results").insert(factorRows);

    // Update audit run
    await supabase.from("ai_audit_runs").update({
      status: "complete",
      completed_at: new Date().toISOString(),
      score: score100,
      score_pass: passCount,
      score_warn: warnCount,
      score_fail: failCount,
      pillar1_score: p1,
      pillar2_score: p2,
      pillar3_score: p3,
      pillar4_score: p4,
      letter_grade: letterGrade,
    }).eq("id", runId);

    // Update audit table for backward compatibility with overall scoring trigger
    await supabase.from("audit").update({
      ai_status: "success",
      ai_score: score100,
      ai_grade: letterGrade,
      ai_details: { version: "2.0", run_id: runId, score: score100, grade: letterGrade, pass: passCount, warn: warnCount, fail: failCount, pillar1: p1, pillar2: p2, pillar3: p3, pillar4: p4 },
      ai_last_error: null,
      ai_fetched_at: new Date().toISOString(),
    }).eq("id", auditId);

    console.log(`AI audit complete: score=${score100}, grade=${letterGrade}, pass=${passCount}/32`);
    return new Response(JSON.stringify({ success: true, run_id: runId, score: score100, grade: letterGrade, pass: passCount, warn: warnCount, fail: failCount }), { headers: jsonHeaders });

  } catch (err) {
    const errMsg = (err as Error).message || "Unknown error";
    console.error("run-ai-audit error:", errMsg);
    try {
      const b = await req.clone().json().catch(() => ({}));
      if (b.audit_id) {
        await supabase.from("audit").update({ ai_status: "error", ai_last_error: errMsg.slice(0, 500) }).eq("id", b.audit_id);
      }
    } catch { /* ignore */ }
    return new Response(JSON.stringify({ success: false, error: errMsg }), { status: 500, headers: jsonHeaders });
  }
});
