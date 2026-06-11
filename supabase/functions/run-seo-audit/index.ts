import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function normalizeDomain(raw: string): string {
  let d = raw.trim();
  d = d.replace(/^https?:\/\//, "");
  d = d.replace(/^www\./, "");
  d = d.replace(/\/+$/, "");
  return d;
}

function safeFetch(url: string, timeoutMs = 12000): Promise<Response> {
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
  h = h.replace(/<[^>]+>/g, " ");
  h = h.replace(/&amp;/g, "&").replace(/&nbsp;/g, " ");
  return h.replace(/\s+/g, " ").trim();
}

type Status = "pass" | "warn" | "fail";

interface Factor {
  id: number;
  name: string;
  pillar: 1 | 2 | 3 | 4;
  status: Status;
  finding: string;
  fix: string;
}

const PILLAR_MAX: Record<1 | 2 | 3 | 4, number> = { 1: 8, 2: 10, 3: 7, 4: 5 };

function push(arr: Factor[], f: Factor) { arr.push(f); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let auditId = "";
  try {
    const body = await req.json();
    auditId = (body.audit_id || "") as string;
    const rawUrl = (body.website_url || body.domain || "") as string;
    if (!auditId || !rawUrl) {
      return new Response(JSON.stringify({ success: false, error: "audit_id and website_url required" }), { status: 400, headers: jsonHeaders });
    }

    const domain = normalizeDomain(rawUrl);
    const baseUrl = `https://${domain}`;
    console.log("run-seo-audit:", { auditId, domain });

    await supabase.from("audit").update({ seo_status: "fetching", seo_error: null } as any).eq("id", auditId);

    // Fetch in parallel
    const [homepageRes, robotsRes, sitemapRes] = await Promise.allSettled([
      safeFetch(baseUrl, 15000).then(async r => ({ status: r.status, html: (await r.text()).slice(0, 500000), url: r.url })),
      safeFetch(`${baseUrl}/robots.txt`).then(async r => ({ status: r.status, text: await r.text() })),
      safeFetch(`${baseUrl}/sitemap.xml`).then(async r => ({ status: r.status, text: (await r.text()).slice(0, 100000) })),
    ]);

    const homepage = homepageRes.status === "fulfilled" ? homepageRes.value : { status: 0, html: "", url: baseUrl };
    const robots = robotsRes.status === "fulfilled" ? robotsRes.value : { status: 0, text: "" };
    const sitemap = sitemapRes.status === "fulfilled" ? sitemapRes.value : { status: 0, text: "" };

    const html = homepage.html;
    const htmlLower = html.toLowerCase();
    const plainText = stripHtml(html);
    const wordCount = plainText.split(/\s+/).filter(w => w.length > 0).length;

    const factors: Factor[] = [];

    // ===== Pillar 1: Crawlability & Indexing (8) =====
    // 1. robots.txt exists
    if (robots.status === 200 && robots.text.trim().length > 0) {
      push(factors, { id: 1, name: "robots.txt exists", pillar: 1, status: "pass", finding: "robots.txt is reachable.", fix: "" });
    } else {
      push(factors, { id: 1, name: "robots.txt exists", pillar: 1, status: "fail", finding: "robots.txt not found at /robots.txt.", fix: "Add a robots.txt file at the site root." });
    }

    // 2. robots.txt allows crawling
    {
      const rt = robots.text;
      let wildcardBlock = false;
      let currentAgent = "";
      for (const line of rt.split("\n")) {
        const am = line.match(/^User-agent:\s*(.+)/i);
        if (am) { currentAgent = am[1].trim(); continue; }
        if (currentAgent === "*" && /^Disallow:\s*\/\s*$/i.test(line)) wildcardBlock = true;
      }
      if (!wildcardBlock) {
        push(factors, { id: 2, name: "Crawlers not blocked site-wide", pillar: 1, status: "pass", finding: "No global Disallow: / rule found.", fix: "" });
      } else {
        push(factors, { id: 2, name: "Crawlers not blocked site-wide", pillar: 1, status: "fail", finding: "robots.txt blocks ALL crawlers with Disallow: /.", fix: "Remove the Disallow: / rule so search engines can crawl your site." });
      }
    }

    // 3. sitemap.xml exists
    {
      const locCount = (sitemap.text.match(/<loc>/gi) || []).length;
      if (sitemap.status === 200 && locCount >= 1) {
        push(factors, { id: 3, name: "XML sitemap available", pillar: 1, status: locCount >= 5 ? "pass" : "warn", finding: `Sitemap has ${locCount} URL(s).`, fix: locCount >= 5 ? "" : "Add more pages to the sitemap." });
      } else {
        push(factors, { id: 3, name: "XML sitemap available", pillar: 1, status: "fail", finding: "No sitemap.xml found.", fix: "Generate and publish a sitemap.xml at the site root." });
      }
    }

    // 4. Sitemap referenced in robots.txt
    if (/sitemap:\s*http/i.test(robots.text)) {
      push(factors, { id: 4, name: "Sitemap referenced in robots.txt", pillar: 1, status: "pass", finding: "Sitemap is declared in robots.txt.", fix: "" });
    } else {
      push(factors, { id: 4, name: "Sitemap referenced in robots.txt", pillar: 1, status: "warn", finding: "robots.txt does not reference a sitemap.", fix: "Add a Sitemap: https://yourdomain.com/sitemap.xml line to robots.txt." });
    }

    // 5. HTTPS active
    if (homepage.status === 200 && (homepage.url || "").startsWith("https://")) {
      push(factors, { id: 5, name: "HTTPS active", pillar: 1, status: "pass", finding: "Site loads over HTTPS.", fix: "" });
    } else {
      push(factors, { id: 5, name: "HTTPS active", pillar: 1, status: "fail", finding: "Site does not load over HTTPS.", fix: "Install an SSL certificate and serve all pages over HTTPS." });
    }

    // 6. HTTP redirects to HTTPS
    {
      let redirects = false;
      try {
        const r = await safeFetch(`http://${domain}`, 6000);
        redirects = (r.url || "").startsWith("https://");
        await r.text();
      } catch { /* ignore */ }
      push(factors, redirects
        ? { id: 6, name: "HTTP redirects to HTTPS", pillar: 1, status: "pass", finding: "HTTP traffic redirects to HTTPS.", fix: "" }
        : { id: 6, name: "HTTP redirects to HTTPS", pillar: 1, status: "warn", finding: "HTTP does not redirect to HTTPS.", fix: "Configure a 301 redirect from HTTP to HTTPS." });
    }

    // 7. Canonical tag present
    if (/<link[^>]+rel=["']canonical["']/i.test(html)) {
      push(factors, { id: 7, name: "Canonical tag present", pillar: 1, status: "pass", finding: "Canonical link element found.", fix: "" });
    } else {
      push(factors, { id: 7, name: "Canonical tag present", pillar: 1, status: "warn", finding: "No canonical link element found.", fix: "Add <link rel=\"canonical\" href=\"...\"> to the page head." });
    }

    // 8. No noindex
    if (/<meta[^>]+name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(html)) {
      push(factors, { id: 8, name: "Page is indexable", pillar: 1, status: "fail", finding: "Homepage has a noindex meta tag — it will not appear in search.", fix: "Remove the noindex meta robots tag from the homepage." });
    } else {
      push(factors, { id: 8, name: "Page is indexable", pillar: 1, status: "pass", finding: "No noindex meta tag detected.", fix: "" });
    }

    // ===== Pillar 2: On-Page SEO (10) =====
    // 9. Title tag
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : "";
    if (title.length > 0) {
      push(factors, { id: 9, name: "Title tag exists", pillar: 2, status: "pass", finding: `Title: "${title.slice(0, 80)}"`, fix: "" });
    } else {
      push(factors, { id: 9, name: "Title tag exists", pillar: 2, status: "fail", finding: "No <title> tag found.", fix: "Add a descriptive <title> to the page head." });
    }

    // 10. Title length
    if (title.length >= 30 && title.length <= 60) {
      push(factors, { id: 10, name: "Title length 30-60 chars", pillar: 2, status: "pass", finding: `Title is ${title.length} characters.`, fix: "" });
    } else if (title.length > 0) {
      push(factors, { id: 10, name: "Title length 30-60 chars", pillar: 2, status: "warn", finding: `Title is ${title.length} characters (recommended 30-60).`, fix: title.length < 30 ? "Lengthen the title with more descriptive keywords." : "Shorten the title — Google truncates titles over ~60 characters." });
    } else {
      push(factors, { id: 10, name: "Title length 30-60 chars", pillar: 2, status: "fail", finding: "No title to measure.", fix: "Add a title tag." });
    }

    // 11. Meta description exists
    const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i);
    const desc = descMatch ? descMatch[1].trim() : "";
    if (desc.length > 0) {
      push(factors, { id: 11, name: "Meta description exists", pillar: 2, status: "pass", finding: `Description: "${desc.slice(0, 80)}…"`, fix: "" });
    } else {
      push(factors, { id: 11, name: "Meta description exists", pillar: 2, status: "fail", finding: "No meta description found.", fix: "Add <meta name=\"description\" content=\"...\"> with a 120-160 character summary." });
    }

    // 12. Meta description length
    if (desc.length >= 120 && desc.length <= 160) {
      push(factors, { id: 12, name: "Meta description length", pillar: 2, status: "pass", finding: `Description is ${desc.length} characters.`, fix: "" });
    } else if (desc.length > 0) {
      push(factors, { id: 12, name: "Meta description length", pillar: 2, status: "warn", finding: `Description is ${desc.length} characters (recommended 120-160).`, fix: desc.length < 120 ? "Expand the meta description." : "Tighten the meta description — search engines truncate around 160 characters." });
    } else {
      push(factors, { id: 12, name: "Meta description length", pillar: 2, status: "fail", finding: "No description to measure.", fix: "Add a meta description." });
    }

    // 13. Single H1
    const h1Count = (html.match(/<h1[\s>]/gi) || []).length;
    if (h1Count === 1) {
      push(factors, { id: 13, name: "Exactly one H1", pillar: 2, status: "pass", finding: "Page has exactly one H1.", fix: "" });
    } else if (h1Count === 0) {
      push(factors, { id: 13, name: "Exactly one H1", pillar: 2, status: "fail", finding: "No H1 found.", fix: "Add a single H1 that describes the page topic." });
    } else {
      push(factors, { id: 13, name: "Exactly one H1", pillar: 2, status: "warn", finding: `${h1Count} H1 tags found.`, fix: "Use exactly one H1 per page; convert the rest to H2s." });
    }

    // 14. Multiple H2s
    const h2Count = (html.match(/<h2[\s>]/gi) || []).length;
    if (h2Count >= 2) {
      push(factors, { id: 14, name: "Multiple H2 subheadings", pillar: 2, status: "pass", finding: `${h2Count} H2 subheadings.`, fix: "" });
    } else {
      push(factors, { id: 14, name: "Multiple H2 subheadings", pillar: 2, status: "warn", finding: `${h2Count} H2 subheading(s).`, fix: "Add at least 2-3 H2 subheadings to structure the page." });
    }

    // 15. Heading hierarchy
    const h3Count = (html.match(/<h3[\s>]/gi) || []).length;
    if (h1Count >= 1 && (h2Count > 0 || h3Count === 0)) {
      push(factors, { id: 15, name: "Heading hierarchy clean", pillar: 2, status: "pass", finding: `H1:${h1Count} H2:${h2Count} H3:${h3Count}`, fix: "" });
    } else {
      push(factors, { id: 15, name: "Heading hierarchy clean", pillar: 2, status: "warn", finding: `H3s present without H2s (H1:${h1Count} H2:${h2Count} H3:${h3Count}).`, fix: "Don't skip heading levels — use H2 before H3." });
    }

    // 16. Image alt coverage
    const imgs = html.match(/<img[^>]*>/gi) || [];
    const imgsWithAlt = imgs.filter(img => /\salt\s*=\s*["'][^"']*["']/i.test(img) && !/\salt\s*=\s*["']\s*["']/i.test(img));
    const altPct = imgs.length > 0 ? Math.round((imgsWithAlt.length / imgs.length) * 100) : 100;
    if (imgs.length === 0) {
      push(factors, { id: 16, name: "Image alt text coverage", pillar: 2, status: "pass", finding: "No images on homepage.", fix: "" });
    } else if (altPct >= 90) {
      push(factors, { id: 16, name: "Image alt text coverage", pillar: 2, status: "pass", finding: `${imgsWithAlt.length}/${imgs.length} images have alt text (${altPct}%).`, fix: "" });
    } else if (altPct >= 60) {
      push(factors, { id: 16, name: "Image alt text coverage", pillar: 2, status: "warn", finding: `${imgsWithAlt.length}/${imgs.length} images have alt text (${altPct}%).`, fix: "Add descriptive alt attributes to all images." });
    } else {
      push(factors, { id: 16, name: "Image alt text coverage", pillar: 2, status: "fail", finding: `Only ${altPct}% of images have alt text.`, fix: "Add descriptive alt attributes to every image." });
    }

    // 17. Word count
    if (wordCount >= 300) {
      push(factors, { id: 17, name: "Sufficient page content", pillar: 2, status: "pass", finding: `${wordCount} words of body content.`, fix: "" });
    } else if (wordCount >= 100) {
      push(factors, { id: 17, name: "Sufficient page content", pillar: 2, status: "warn", finding: `${wordCount} words of body content.`, fix: "Aim for at least 300 words of helpful, descriptive content on the homepage." });
    } else {
      push(factors, { id: 17, name: "Sufficient page content", pillar: 2, status: "fail", finding: `Only ${wordCount} words of body content.`, fix: "Add substantive page copy describing services, value, and audience." });
    }

    // 18. Internal links
    const internalLinks = (html.match(/<a[^>]+href=["'](?:\/|https?:\/\/[^"']*?)["']/gi) || []).length;
    if (internalLinks >= 10) {
      push(factors, { id: 18, name: "Healthy internal linking", pillar: 2, status: "pass", finding: `${internalLinks} link(s) on the homepage.`, fix: "" });
    } else if (internalLinks >= 3) {
      push(factors, { id: 18, name: "Healthy internal linking", pillar: 2, status: "warn", finding: `${internalLinks} links on the homepage.`, fix: "Add more internal links to important pages." });
    } else {
      push(factors, { id: 18, name: "Healthy internal linking", pillar: 2, status: "fail", finding: `Only ${internalLinks} links found.`, fix: "Build out internal navigation linking to key pages." });
    }

    // ===== Pillar 3: Technical SEO (7) =====
    // 19. Mobile viewport
    if (/<meta[^>]+name=["']viewport["']/i.test(html)) {
      push(factors, { id: 19, name: "Mobile viewport meta tag", pillar: 3, status: "pass", finding: "Viewport meta tag present.", fix: "" });
    } else {
      push(factors, { id: 19, name: "Mobile viewport meta tag", pillar: 3, status: "fail", finding: "No viewport meta tag.", fix: "Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"> for mobile." });
    }

    // 20. Charset
    if (/<meta[^>]+charset/i.test(html)) {
      push(factors, { id: 20, name: "Charset declared", pillar: 3, status: "pass", finding: "Charset meta tag present.", fix: "" });
    } else {
      push(factors, { id: 20, name: "Charset declared", pillar: 3, status: "warn", finding: "No charset meta tag found.", fix: "Add <meta charset=\"UTF-8\"> to the head." });
    }

    // 21. Structured data (JSON-LD)
    const jsonLdBlocks = (html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || []);
    if (jsonLdBlocks.length > 0) {
      push(factors, { id: 21, name: "Structured data (JSON-LD)", pillar: 3, status: "pass", finding: `${jsonLdBlocks.length} JSON-LD block(s) found.`, fix: "" });
    } else {
      push(factors, { id: 21, name: "Structured data (JSON-LD)", pillar: 3, status: "fail", finding: "No JSON-LD structured data found.", fix: "Add Organization or LocalBusiness JSON-LD to help search engines understand your business." });
    }

    // 22. LocalBusiness/Organization schema
    const hasBusinessSchema = jsonLdBlocks.some(b => /"@type"\s*:\s*"(LocalBusiness|Organization|[A-Z][a-zA-Z]*Business)"/i.test(b));
    if (hasBusinessSchema) {
      push(factors, { id: 22, name: "Business schema present", pillar: 3, status: "pass", finding: "Organization or LocalBusiness schema detected.", fix: "" });
    } else {
      push(factors, { id: 22, name: "Business schema present", pillar: 3, status: "warn", finding: "No Organization or LocalBusiness schema.", fix: "Add LocalBusiness JSON-LD with name, address, phone, and hours." });
    }

    // 23. Favicon
    if (/<link[^>]+rel=["'](?:icon|shortcut icon|apple-touch-icon)["']/i.test(html)) {
      push(factors, { id: 23, name: "Favicon declared", pillar: 3, status: "pass", finding: "Favicon link tag present.", fix: "" });
    } else {
      push(factors, { id: 23, name: "Favicon declared", pillar: 3, status: "warn", finding: "No favicon link tag.", fix: "Add <link rel=\"icon\" href=\"/favicon.ico\"> to the head." });
    }

    // 24. lang attribute
    if (/<html[^>]+lang=["'][a-z-]+["']/i.test(html)) {
      push(factors, { id: 24, name: "HTML lang attribute", pillar: 3, status: "pass", finding: "<html> has a lang attribute.", fix: "" });
    } else {
      push(factors, { id: 24, name: "HTML lang attribute", pillar: 3, status: "warn", finding: "<html> tag is missing a lang attribute.", fix: "Add lang=\"en\" (or your language) to the <html> tag." });
    }

    // 25. No mixed content (basic)
    const httpRefs = (html.match(/(?:src|href)=["']http:\/\//gi) || []).length;
    if (httpRefs === 0) {
      push(factors, { id: 25, name: "No mixed content", pillar: 3, status: "pass", finding: "No insecure http:// resources detected.", fix: "" });
    } else if (httpRefs <= 2) {
      push(factors, { id: 25, name: "No mixed content", pillar: 3, status: "warn", finding: `${httpRefs} insecure http:// resource(s).`, fix: "Update http:// resource URLs to https://." });
    } else {
      push(factors, { id: 25, name: "No mixed content", pillar: 3, status: "fail", finding: `${httpRefs} insecure http:// resources.`, fix: "Replace all http:// resource URLs with https:// to avoid mixed-content warnings." });
    }

    // ===== Pillar 4: Social & Discoverability (5) =====
    // 26. og:title
    if (/<meta[^>]+property=["']og:title["']/i.test(html)) {
      push(factors, { id: 26, name: "Open Graph title", pillar: 4, status: "pass", finding: "og:title tag present.", fix: "" });
    } else {
      push(factors, { id: 26, name: "Open Graph title", pillar: 4, status: "fail", finding: "No og:title meta tag.", fix: "Add <meta property=\"og:title\" content=\"...\"> for social sharing." });
    }
    // 27. og:description
    if (/<meta[^>]+property=["']og:description["']/i.test(html)) {
      push(factors, { id: 27, name: "Open Graph description", pillar: 4, status: "pass", finding: "og:description tag present.", fix: "" });
    } else {
      push(factors, { id: 27, name: "Open Graph description", pillar: 4, status: "fail", finding: "No og:description meta tag.", fix: "Add <meta property=\"og:description\" content=\"...\">." });
    }
    // 28. og:image
    if (/<meta[^>]+property=["']og:image["']/i.test(html)) {
      push(factors, { id: 28, name: "Open Graph image", pillar: 4, status: "pass", finding: "og:image tag present.", fix: "" });
    } else {
      push(factors, { id: 28, name: "Open Graph image", pillar: 4, status: "warn", finding: "No og:image meta tag.", fix: "Add <meta property=\"og:image\" content=\"...\"> with a 1200x630 image." });
    }
    // 29. Twitter card
    if (/<meta[^>]+name=["']twitter:card["']/i.test(html)) {
      push(factors, { id: 29, name: "Twitter card tag", pillar: 4, status: "pass", finding: "twitter:card meta tag present.", fix: "" });
    } else {
      push(factors, { id: 29, name: "Twitter card tag", pillar: 4, status: "warn", finding: "No twitter:card meta tag.", fix: "Add <meta name=\"twitter:card\" content=\"summary_large_image\">." });
    }
    // 30. Social profile links
    const socialPatterns = /facebook\.com|instagram\.com|linkedin\.com|twitter\.com|x\.com|youtube\.com|tiktok\.com/i;
    if (socialPatterns.test(htmlLower)) {
      push(factors, { id: 30, name: "Social profile links", pillar: 4, status: "pass", finding: "Social profile links detected on page.", fix: "" });
    } else {
      push(factors, { id: 30, name: "Social profile links", pillar: 4, status: "warn", finding: "No social profile links found.", fix: "Link to your social profiles (Facebook, Instagram, LinkedIn) from the footer." });
    }

    // ===== Tally =====
    const passCount = factors.filter(f => f.status === "pass").length;
    const warnCount = factors.filter(f => f.status === "warn").length;
    const failCount = factors.filter(f => f.status === "fail").length;
    const score100 = Math.round((passCount / 30) * 100);

    const p1 = factors.filter(f => f.pillar === 1 && f.status === "pass").length;
    const p2 = factors.filter(f => f.pillar === 2 && f.status === "pass").length;
    const p3 = factors.filter(f => f.pillar === 3 && f.status === "pass").length;
    const p4 = factors.filter(f => f.pillar === 4 && f.status === "pass").length;

    await supabase.from("audit").update({
      seo_status: "success",
      seo_score: score100,
      seo_pillar_crawlability: p1,
      seo_pillar_onpage: p2,
      seo_pillar_technical: p3,
      seo_pillar_social: p4,
      seo_factors: factors,
      seo_run_at: new Date().toISOString(),
      seo_error: null,
    } as any).eq("id", auditId);

    console.log(`SEO audit complete: score=${score100} pass=${passCount}/30 warn=${warnCount} fail=${failCount}`);
    return new Response(JSON.stringify({ success: true, score: score100, pass: passCount, warn: warnCount, fail: failCount }), { headers: jsonHeaders });
  } catch (err) {
    const errMsg = (err as Error).message || "Unknown error";
    console.error("run-seo-audit error:", errMsg);
    if (auditId) {
      await supabase.from("audit").update({ seo_status: "error", seo_error: errMsg.slice(0, 500) } as any).eq("id", auditId);
    }
    return new Response(JSON.stringify({ success: false, error: errMsg }), { status: 500, headers: jsonHeaders });
  }
});
