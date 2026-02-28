import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Helpers ──

function normalizeUrl(raw: string): string {
  let url = raw.trim();
  if (!url) return "";
  if (!url.startsWith("http://") && !url.startsWith("https://")) url = `https://${url}`;
  url = url.replace(/\/+$/, "");
  return url;
}

function stripHtmlTags(html: string, stripNav = true): string {
  let h = html;
  // Remove script, style, noscript
  h = h.replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, " ");
  if (stripNav) {
    h = h.replace(/<(nav|footer|header)[^>]*>[\s\S]*?<\/\1>/gi, " ");
  }
  // Remove tags
  h = h.replace(/<[^>]+>/g, " ");
  // Decode common entities
  h = h.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
  // Collapse whitespace
  h = h.replace(/\s+/g, " ").trim();
  return h;
}

function safeFetch(url: string, ua: string, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, {
    headers: { "User-Agent": ua },
    redirect: "follow",
    signal: controller.signal,
  }).finally(() => clearTimeout(t));
}

function isChallengeResponse(body: string, status: number): boolean {
  if ([403, 429, 503].includes(status)) return true;
  const lower = body.toLowerCase();
  const markers = ["captcha", "cloudflare", "attention required", "verify you are human", "enable javascript", "just a moment"];
  return markers.some((m) => lower.includes(m));
}

function extractInternalLinks(html: string, origin: string, keywords: string[]): string[] {
  const seen = new Set<string>();
  const matches = html.matchAll(/<a\s[^>]*href=["']([^"'#]+)["'][^>]*>/gi);
  const prioritized: string[] = [];
  const others: string[] = [];
  for (const m of matches) {
    let href = m[1];
    if (!href || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) continue;
    if (href.startsWith("/")) href = origin + href;
    try {
      const u = new URL(href);
      if (u.origin !== origin) continue;
      if (u.search) continue; // prefer clean URLs
      const key = u.pathname.replace(/\/+$/, "") || "/";
      if (key === "/" || seen.has(key)) continue;
      seen.add(key);
      const full = u.origin + key;
      if (keywords.some((kw) => key.toLowerCase().includes(kw))) prioritized.push(full);
      else others.push(full);
    } catch { /* skip malformed */ }
  }
  return [...prioritized, ...others];
}

function parseSitemapUrls(xml: string): string[] {
  const urls: string[] = [];
  const re = /<loc>(.*?)<\/loc>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const u = m[1].trim();
    if (u.startsWith("http")) urls.push(u);
  }
  return urls;
}

function parseSitemapDirectives(robotsTxt: string): string[] {
  const urls: string[] = [];
  for (const line of robotsTxt.split("\n")) {
    const m = line.match(/^Sitemap:\s*(.+)/i);
    if (m) urls.push(m[1].trim());
  }
  return urls;
}

interface RobotsAnalysis {
  reachable: boolean;
  statusCode: number;
  disallowAll: boolean;
  gptBotBlocked: boolean;
  oaiSearchBotBlocked: boolean;
  chatGptUserBlocked: boolean;
  sitemapDirectives: string[];
  rawSnippet: string;
}

function analyzeRobots(text: string, statusCode: number): RobotsAnalysis {
  const reachable = statusCode === 200;
  const lines = text.split("\n").map((l) => l.trim());
  let currentAgent = "";
  let disallowAll = false;
  let gptBotBlocked = false;
  let oaiSearchBotBlocked = false;
  let chatGptUserBlocked = false;

  for (const line of lines) {
    const agentMatch = line.match(/^User-agent:\s*(.+)/i);
    if (agentMatch) {
      currentAgent = agentMatch[1].trim().toLowerCase();
      continue;
    }
    const disallowMatch = line.match(/^Disallow:\s*(.+)/i);
    if (disallowMatch) {
      const path = disallowMatch[1].trim();
      if (path === "/") {
        if (currentAgent === "*") disallowAll = true;
        if (currentAgent === "gptbot") gptBotBlocked = true;
        if (currentAgent === "oai-searchbot") oaiSearchBotBlocked = true;
        if (currentAgent === "chatgpt-user") chatGptUserBlocked = true;
      }
    }
  }

  return {
    reachable,
    statusCode,
    disallowAll,
    gptBotBlocked,
    oaiSearchBotBlocked,
    chatGptUserBlocked,
    sitemapDirectives: parseSitemapDirectives(text),
    rawSnippet: text.slice(0, 500),
  };
}

function gradeFromScore(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

// Phone, email, address, hours patterns
const PHONE_RE = /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const ADDRESS_RE = /\d{2,5}\s+[\w\s]+(?:street|st|avenue|ave|boulevard|blvd|road|rd|drive|dr|lane|ln|way|court|ct|place|pl)/i;
const HOURS_RE = /(?:mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)[\s\-–]+(?:fri|sun|sat|monday|friday|saturday|sunday)?[\s:]*\d{1,2}/i;

const PAGE_KEYWORDS = ["about", "services", "contact", "locations", "service-area", "faq"];
const MAX_SAMPLE_PAGES = 8;
const DEFAULT_UA = "Mozilla/5.0 (compatible; ProAuditBot/1.0)";

// ── Main ──

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const logError = async (action: string, message: string, metadata?: Record<string, unknown>) => {
    try {
      await supabase.from("error_logs").insert({ severity: "error", page: "edge-function", action, message, metadata: metadata ?? null });
    } catch (_) { /* fire-and-forget */ }
  };

  try {
    const { audit_id, website_url } = await req.json();
    console.log("run-ai-friendly called:", { audit_id, website_url });

    if (!audit_id || !website_url) {
      return new Response(JSON.stringify({ success: false, error: "audit_id and website_url required" }), { status: 400, headers: jsonHeaders });
    }

    const baseUrl = normalizeUrl(website_url);
    if (!baseUrl.startsWith("http")) {
      return new Response(JSON.stringify({ success: false, error: "Invalid URL" }), { status: 400, headers: jsonHeaders });
    }

    // Mark fetching
    await supabase.from("audit").update({ ai_status: "fetching", ai_last_error: null, ai_fetched_at: new Date().toISOString() }).eq("id", audit_id);

    const origin = new URL(baseUrl).origin;

    // ── Fetch homepage ──
    let homepageHtml = "";
    let homepageStatus = 0;
    try {
      const res = await safeFetch(baseUrl, DEFAULT_UA, 20000);
      homepageStatus = res.status;
      homepageHtml = await res.text();
    } catch (e) {
      homepageHtml = "";
      homepageStatus = 0;
    }

    // ── Robots.txt ──
    let robotsTxt = "";
    let robotsStatus = 0;
    try {
      const res = await safeFetch(`${origin}/robots.txt`, DEFAULT_UA);
      robotsStatus = res.status;
      robotsTxt = await res.text();
    } catch { robotsStatus = 0; }

    const robotsAnalysis = analyzeRobots(robotsTxt, robotsStatus);

    // ── Sitemap ──
    const sitemapCandidates = [`${origin}/sitemap.xml`, ...robotsAnalysis.sitemapDirectives];
    let sitemapUrls: string[] = [];
    let sitemapReachable = false;
    let sitemapParseable = false;

    for (const sUrl of [...new Set(sitemapCandidates)]) {
      try {
        const res = await safeFetch(sUrl, DEFAULT_UA);
        if (res.status === 200) {
          sitemapReachable = true;
          const xml = await res.text();
          const urls = parseSitemapUrls(xml);
          if (urls.length > 0) {
            sitemapParseable = true;
            sitemapUrls = urls;
            break;
          }
        } else {
          await res.text(); // consume body
        }
      } catch { /* skip */ }
    }

    // ── Select sample pages ──
    let samplePages: string[] = [];
    if (sitemapUrls.length > 0) {
      // Prefer keyword-containing URLs, then others
      const kwUrls = sitemapUrls.filter((u) => PAGE_KEYWORDS.some((kw) => u.toLowerCase().includes(kw)));
      const otherUrls = sitemapUrls.filter((u) => !kwUrls.includes(u) && !u.includes("?"));
      samplePages = [...kwUrls, ...otherUrls].slice(0, MAX_SAMPLE_PAGES);
    } else {
      samplePages = extractInternalLinks(homepageHtml, origin, PAGE_KEYWORDS).slice(0, MAX_SAMPLE_PAGES);
    }

    // Ensure homepage is first, deduplicate
    const allPages = [baseUrl, ...samplePages.filter((u) => u !== baseUrl)].slice(0, MAX_SAMPLE_PAGES + 1);

    // ── Fetch all pages (raw HTML) ──
    interface PageData {
      url: string;
      status: number;
      html: string;
      textRaw: string;
      textLen: number;
      titleLen: number;
      h1Count: number;
      h2Count: number;
      h3Count: number;
      scriptCount: number;
      jsShell: boolean;
      jsonLdBlocks: { valid: boolean; types: string[] }[];
    }

    const pageResults: PageData[] = [];

    for (const pageUrl of allPages) {
      try {
        const res = await safeFetch(pageUrl, DEFAULT_UA);
        const status = res.status;
        const html = (await res.text()).slice(0, 500_000); // cap to avoid memory issues
        const textRaw = stripHtmlTags(html);
        const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const titleLen = titleMatch ? titleMatch[1].trim().length : 0;
        const h1Count = (html.match(/<h1[\s>]/gi) || []).length;
        const h2Count = (html.match(/<h2[\s>]/gi) || []).length;
        const h3Count = (html.match(/<h3[\s>]/gi) || []).length;
        const scriptCount = (html.match(/<script[\s>]/gi) || []).length;
        const jsShell = textRaw.length < 200 && scriptCount > 10;

        // JSON-LD
        const ldBlocks: { valid: boolean; types: string[] }[] = [];
        const ldMatches = html.matchAll(/<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
        for (const ldm of ldMatches) {
          try {
            const parsed = JSON.parse(ldm[1]);
            const types: string[] = [];
            if (parsed["@type"]) types.push(String(parsed["@type"]));
            if (Array.isArray(parsed["@graph"])) {
              for (const g of parsed["@graph"]) {
                if (g["@type"]) types.push(String(g["@type"]));
              }
            }
            ldBlocks.push({ valid: true, types });
          } catch {
            ldBlocks.push({ valid: false, types: [] });
          }
        }

        pageResults.push({ url: pageUrl, status, html: "", textRaw, textLen: textRaw.length, titleLen, h1Count, h2Count, h3Count, scriptCount, jsShell, jsonLdBlocks: ldBlocks });
      } catch {
        pageResults.push({ url: pageUrl, status: 0, html: "", textRaw: "", textLen: 0, titleLen: 0, h1Count: 0, h2Count: 0, h3Count: 0, scriptCount: 0, jsShell: false, jsonLdBlocks: [] });
      }
    }

    // ── 1. ACCESS & PERMISSION (30 pts) ──

    // 1.1 Robots reachable (5 pts)
    const robotsReachableScore = robotsAnalysis.reachable ? 5 : 0;

    // 1.2 AI agent rules (10 pts)
    let aiAgentScore = 10;
    if (robotsAnalysis.disallowAll) {
      aiAgentScore = 0;
    } else {
      if (robotsAnalysis.gptBotBlocked) aiAgentScore -= 3;
      if (robotsAnalysis.oaiSearchBotBlocked) aiAgentScore -= 3;
      if (robotsAnalysis.chatGptUserBlocked) aiAgentScore -= 2;
      aiAgentScore = Math.max(0, aiAgentScore);
    }

    // 1.3 Live fetch viability (15 pts)
    const fetchTestPages = [allPages[0], ...allPages.slice(1, 4)].filter(Boolean);
    const userAgents = [DEFAULT_UA, "GPTBot/1.0", "OAI-SearchBot/1.0"];
    let totalFetchTests = 0;
    let successfulFetches = 0;
    const fetchTestResults: { url: string; ua: string; status: number; challenge: boolean; bytes: number }[] = [];

    for (const testUrl of fetchTestPages) {
      for (const ua of userAgents) {
        totalFetchTests++;
        try {
          const res = await safeFetch(testUrl, ua, 10000);
          const body = (await res.text()).slice(0, 50000);
          const challenge = isChallengeResponse(body, res.status);
          if (res.status === 200 && !challenge) successfulFetches++;
          fetchTestResults.push({ url: testUrl, ua, status: res.status, challenge, bytes: body.length });
        } catch {
          fetchTestResults.push({ url: testUrl, ua, status: 0, challenge: false, bytes: 0 });
        }
      }
    }
    const fetchViabilityScore = totalFetchTests > 0 ? Math.round(15 * (successfulFetches / totalFetchTests)) : 0;

    const accessScore = robotsReachableScore + aiAgentScore + fetchViabilityScore;

    // ── 2. EXTRACTABILITY (40 pts) ──
    const extractPages = allPages.slice(0, 6); // homepage + 5

    // 2.1 Raw content availability (20 pts) — 5 pages * 4 pts max
    let rawContentScore = 0;
    const rawContentDetails: { url: string; textLen: number; pts: number }[] = [];
    for (const p of pageResults.filter((pr) => extractPages.includes(pr.url)).slice(0, 5)) {
      let pts = 0;
      if (p.textLen >= 2000) pts = 4;
      else if (p.textLen >= 1000) pts = 3;
      else if (p.textLen >= 400) pts = 2;
      else if (p.textLen >= 100) pts = 1;
      rawContentScore += pts;
      rawContentDetails.push({ url: p.url, textLen: p.textLen, pts });
    }

    // 2.2 Structural clarity (10 pts) — 4 pages * 3 pts, capped at 10
    let structuralScore = 0;
    const structuralDetails: { url: string; titleLen: number; h1Count: number; headingCount: number; pts: number }[] = [];
    for (const p of pageResults.filter((pr) => extractPages.includes(pr.url)).slice(0, 4)) {
      let pts = 0;
      if (p.titleLen >= 10 && p.titleLen <= 70) pts += 1;
      if (p.h1Count === 1) pts += 1;
      if (p.h2Count + p.h3Count >= 2) pts += 1;
      structuralScore += pts;
      structuralDetails.push({ url: p.url, titleLen: p.titleLen, h1Count: p.h1Count, headingCount: p.h2Count + p.h3Count, pts });
    }
    structuralScore = Math.min(10, structuralScore);

    // 2.3 JS-shell risk (10 pts)
    let jsShellScore = 10;
    const jsShellPages: string[] = [];
    for (const p of pageResults) {
      if (p.jsShell) {
        jsShellScore -= 2;
        jsShellPages.push(p.url);
      }
    }
    jsShellScore = Math.max(0, jsShellScore);

    const extractabilityScore = rawContentScore + structuralScore + jsShellScore;

    // ── 3. ENTITY CLARITY (20 pts) ──

    // 3.1 JSON-LD (10 pts)
    const jsonLdPages = pageResults.slice(0, 4);
    let totalValidLd = 0;
    const ldTypes: string[] = [];
    for (const p of jsonLdPages) {
      for (const b of p.jsonLdBlocks) {
        if (b.valid) { totalValidLd++; ldTypes.push(...b.types); }
      }
    }
    let jsonLdScore = 0;
    if (totalValidLd >= 2) jsonLdScore = 10;
    else if (totalValidLd === 1) jsonLdScore = 6;

    // 3.2 Business facts (10 pts)
    let factsScore = 0;
    const factsFound: { phone: boolean; email: boolean; address: boolean; hours: boolean } = { phone: false, email: false, address: false, hours: false };
    const factsText = pageResults.slice(0, 4).map((p) => p.textRaw).join(" ");
    if (PHONE_RE.test(factsText)) { factsScore += 3; factsFound.phone = true; }
    if (EMAIL_RE.test(factsText)) { factsScore += 2; factsFound.email = true; }
    if (ADDRESS_RE.test(factsText)) { factsScore += 3; factsFound.address = true; }
    if (HOURS_RE.test(factsText)) { factsScore += 2; factsFound.hours = true; }
    factsScore = Math.min(10, factsScore);

    const entityClarityScore = jsonLdScore + factsScore;

    // ── 4. AI AFFORDANCES (10 pts) ──

    // 4.1 Sitemap health (5 pts)
    let sitemapScore = 0;
    if (sitemapParseable) sitemapScore = 5;
    else if (sitemapReachable) sitemapScore = 2;

    // 4.2 llms.txt (5 pts)
    let llmsTxtScore = 0;
    let llmsTxtPath: string | null = null;
    for (const p of ["/llms.txt", "/.well-known/llms.txt"]) {
      try {
        const res = await safeFetch(`${origin}${p}`, DEFAULT_UA, 8000);
        const body = await res.text();
        if (res.status === 200 && body.trim().length > 0) {
          if (body.trim().length >= 200) { llmsTxtScore = 5; llmsTxtPath = p; break; }
          else { llmsTxtScore = 2; llmsTxtPath = p; }
        }
      } catch { /* skip */ }
    }

    const aiAffordancesScore = sitemapScore + llmsTxtScore;

    // ── Total ──
    const totalScore = Math.min(100, accessScore + extractabilityScore + entityClarityScore + aiAffordancesScore);
    const grade = gradeFromScore(totalScore);

    // ── Findings ──
    const findings: { severity: string; title: string; description: string; recommendation: string }[] = [];

    if (robotsAnalysis.disallowAll) findings.push({ severity: "high", title: "robots.txt blocks all bots", description: "Disallow: / under User-agent: * prevents AI systems from crawling the site.", recommendation: "Review robots.txt and selectively allow trusted AI agents." });
    if (robotsAnalysis.gptBotBlocked) findings.push({ severity: "med", title: "GPTBot is blocked", description: "GPTBot is explicitly disallowed in robots.txt, preventing OpenAI from accessing site content.", recommendation: "Consider allowing GPTBot if you want your content discoverable by ChatGPT." });
    if (jsShellPages.length > 0) findings.push({ severity: "high", title: "JS-heavy pages with little raw content", description: `${jsShellPages.length} page(s) appear to be JavaScript shells with minimal server-rendered text. AI systems that don't execute JS will see an empty page.`, recommendation: "Implement server-side rendering (SSR) or static generation for key pages." });
    if (totalValidLd === 0) findings.push({ severity: "med", title: "No JSON-LD structured data found", description: "No valid JSON-LD blocks were detected, making it harder for AI systems to extract business facts.", recommendation: "Add JSON-LD markup (LocalBusiness, Organization, etc.) to your homepage and key pages." });
    if (!factsFound.phone && !factsFound.email) findings.push({ severity: "med", title: "Contact info not found in page text", description: "Neither a phone number nor email address was detected in visible text on key pages.", recommendation: "Include contact information in visible text (not just images or JavaScript-rendered elements)." });
    if (!sitemapParseable) findings.push({ severity: "low", title: "Sitemap missing or unparseable", description: sitemapReachable ? "Sitemap was reachable but could not be parsed." : "No sitemap.xml was found.", recommendation: "Create a valid XML sitemap and reference it in robots.txt." });
    if (llmsTxtScore === 0) findings.push({ severity: "low", title: "No llms.txt found", description: "No /llms.txt or /.well-known/llms.txt was detected. This emerging standard helps AI systems understand your site.", recommendation: "Consider creating an llms.txt file to provide AI-specific guidance about your site." });
    if (fetchViabilityScore < 10) findings.push({ severity: "med", title: "Some bot user-agents are blocked or challenged", description: `Only ${successfulFetches}/${totalFetchTests} fetch attempts succeeded without being challenged or blocked.`, recommendation: "Review firewall/CDN rules to ensure legitimate bot user-agents can access content." });

    // ── ai_details ──
    const aiDetails = {
      version: "1.0",
      website_url: baseUrl,
      score: totalScore,
      grade,
      subscores: {
        access_permission: {
          score: accessScore,
          max: 30,
          details: {
            robots_reachable: { score: robotsReachableScore, max: 5, status_code: robotsStatus },
            ai_agent_rules: { score: aiAgentScore, max: 10, disallow_all: robotsAnalysis.disallowAll, gptbot_blocked: robotsAnalysis.gptBotBlocked, oai_searchbot_blocked: robotsAnalysis.oaiSearchBotBlocked, chatgpt_user_blocked: robotsAnalysis.chatGptUserBlocked },
            fetch_viability: { score: fetchViabilityScore, max: 15, successful: successfulFetches, total: totalFetchTests },
          },
        },
        extractability: {
          score: extractabilityScore,
          max: 40,
          details: {
            raw_content: { score: rawContentScore, max: 20, pages: rawContentDetails },
            structural_clarity: { score: structuralScore, max: 10, pages: structuralDetails },
            js_shell_risk: { score: jsShellScore, max: 10, flagged_pages: jsShellPages },
          },
        },
        entity_clarity: {
          score: entityClarityScore,
          max: 20,
          details: {
            json_ld: { score: jsonLdScore, max: 10, valid_blocks: totalValidLd, types: [...new Set(ldTypes)] },
            business_facts: { score: factsScore, max: 10, found: factsFound },
          },
        },
        ai_affordances: {
          score: aiAffordancesScore,
          max: 10,
          details: {
            sitemap: { score: sitemapScore, max: 5, reachable: sitemapReachable, parseable: sitemapParseable },
            llms_txt: { score: llmsTxtScore, max: 5, path: llmsTxtPath },
          },
        },
      },
      findings: findings.slice(0, 8),
      page_samples: pageResults.slice(0, 6).map((p) => ({
        url: p.url,
        status: p.status,
        text_len: p.textLen,
        title_len: p.titleLen,
        h1_count: p.h1Count,
        heading_count: p.h2Count + p.h3Count,
        script_count: p.scriptCount,
        js_shell: p.jsShell,
        json_ld_blocks: p.jsonLdBlocks.length,
      })),
    };

    // ── Update audit ──
    const { error: updateError } = await supabase.from("audit").update({
      ai_status: "success",
      ai_score: totalScore,
      ai_grade: grade,
      ai_details: aiDetails,
      ai_last_error: null,
      ai_fetched_at: new Date().toISOString(),
    }).eq("id", audit_id);

    if (updateError) {
      console.error("DB update failed:", updateError.message);
      await logError("run-ai-friendly", `DB update failed: ${updateError.message}`, { audit_id });
      return new Response(JSON.stringify({ success: false, error: updateError.message }), { status: 500, headers: jsonHeaders });
    }

    // Trigger overall score recalculation by doing a no-op update that fires the calculate_audit_scores trigger
    const { error: recalcError } = await supabase.from("audit").update({ ai_score: totalScore }).eq("id", audit_id);
    if (recalcError) {
      console.warn("Recalc trigger update failed:", recalcError.message);
    }

    console.log("AI audit success! Score:", totalScore, "Grade:", grade, "for audit:", audit_id);
    return new Response(JSON.stringify({ success: true, score: totalScore, grade }), { headers: jsonHeaders });
  } catch (err) {
    const errMsg = `Unexpected: ${(err as Error).message}`;
    console.error(errMsg);
    try {
      const { audit_id } = await req.clone().json().catch(() => ({ audit_id: null }));
      if (audit_id) {
        await supabase.from("audit").update({ ai_status: "error", ai_last_error: errMsg }).eq("id", audit_id);
      }
    } catch { /* ignore */ }
    await logError("run-ai-friendly", errMsg);
    return new Response(JSON.stringify({ success: false, error: errMsg }), { status: 500, headers: jsonHeaders });
  }
});
