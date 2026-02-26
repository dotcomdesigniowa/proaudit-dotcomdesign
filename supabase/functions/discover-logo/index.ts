import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const logError = async (severity: string, message: string, metadata?: Record<string, unknown>) => {
    try {
      await supabase.from("error_logs").insert({
        severity,
        page: "edge-function",
        action: "discover-logo",
        message,
        metadata: metadata ?? null,
      });
    } catch (_) { /* fire-and-forget */ }
  };

  try {
    const { website_url } = await req.json();

    if (!website_url) {
      return new Response(
        JSON.stringify({ success: false, error: 'website_url is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let url = website_url.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`;
    }

    console.log('Fetching homepage:', url);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    let resp: Response;
    try {
      resp = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LogoBot/1.0)' },
        redirect: 'follow',
        signal: controller.signal,
      });
      clearTimeout(timer);
    } catch (e) {
      clearTimeout(timer);
      const err = `Failed to fetch homepage: ${(e as Error).message}`;
      await logError("error", err, { website_url: url });
      return new Response(
        JSON.stringify({ success: false, error: err }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!resp.ok) {
      const err = `Failed to fetch: ${resp.status}`;
      await logError("error", err, { website_url: url, status: resp.status });
      return new Response(
        JSON.stringify({ success: false, error: err }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const html = await resp.text();
    const baseUrl = new URL(url);

    function resolveUrl(src: string): string {
      if (!src) return '';
      if (src.startsWith('data:')) return '';
      if (src.startsWith('http://') || src.startsWith('https://')) return src;
      if (src.startsWith('//')) return baseUrl.protocol + src;
      if (src.startsWith('/')) return baseUrl.origin + src;
      return baseUrl.origin + '/' + src;
    }

    function extractSrc(tag: string): string {
      const srcMatch = tag.match(/src\s*=\s*["']([^"']+)["']/i);
      return srcMatch?.[1] ? resolveUrl(srcMatch[1]) : '';
    }

    let logoUrl = '';

    // Strategy 1: <img> tag itself contains "logo" in any attribute
    const imgRegex = /<img\s[^>]*?>/gi;
    let match: RegExpExecArray | null;
    while ((match = imgRegex.exec(html)) !== null) {
      const tag = match[0].toLowerCase();
      if (tag.includes('logo') && !tag.includes('logo-placeholder') && !tag.includes('data:image')) {
        const src = extractSrc(match[0]);
        if (src) { logoUrl = src; break; }
      }
    }

    // Strategy 2: <img> inside a parent element with "logo" in class/id
    // Match patterns like <div class="...logo..."><img src="...">
    if (!logoUrl) {
      const parentLogoRegex = /<(?:div|a|span|header|figure)[^>]*?(?:class|id)\s*=\s*["'][^"']*logo[^"']*["'][^>]*>[\s\S]*?<img\s[^>]*?>/gi;
      while ((match = parentLogoRegex.exec(html)) !== null) {
        const src = extractSrc(match[0]);
        if (src) { logoUrl = src; break; }
      }
    }

    // Strategy 3: <link rel="icon"> or <link rel="apple-touch-icon">
    if (!logoUrl) {
      const iconMatch = html.match(/<link\s[^>]*rel\s*=\s*["']apple-touch-icon["'][^>]*href\s*=\s*["']([^"']+)["']/i)
        || html.match(/<link\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*rel\s*=\s*["']apple-touch-icon["']/i);
      if (iconMatch?.[1]) {
        logoUrl = resolveUrl(iconMatch[1]);
      }
    }

    // Strategy 4: <a> with "custom-logo-link" class (WordPress standard)
    if (!logoUrl) {
      const wpLogoMatch = html.match(/<a[^>]*class\s*=\s*["'][^"']*custom-logo-link[^"']*["'][^>]*>[\s\S]*?<img\s[^>]*?>/i);
      if (wpLogoMatch) {
        const src = extractSrc(wpLogoMatch[0]);
        if (src) logoUrl = src;
      }
    }

    // Strategy 5: og:image fallback
    if (!logoUrl) {
      const ogMatch = html.match(/<meta\s[^>]*property\s*=\s*["']og:image["'][^>]*content\s*=\s*["']([^"']+)["']/i)
        || html.match(/<meta\s[^>]*content\s*=\s*["']([^"']+)["'][^>]*property\s*=\s*["']og:image["']/i);
      if (ogMatch?.[1]) {
        logoUrl = resolveUrl(ogMatch[1]);
      }
    }

    console.log('Discovered logo:', logoUrl || '(none)');

    // Log a warning when no logo is found so it shows in Error Logs
    if (!logoUrl) {
      await logError("warning", `No logo discovered for ${url}`, { website_url: url });
    }

    return new Response(
      JSON.stringify({ success: true, logo_url: logoUrl || null }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error discovering logo:', error);
    await logError("error", `Unexpected: ${error instanceof Error ? error.message : String(error)}`);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
