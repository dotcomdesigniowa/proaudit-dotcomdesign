const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

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

    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LogoBot/1.0)' },
      redirect: 'follow',
    });

    if (!resp.ok) {
      return new Response(
        JSON.stringify({ success: false, error: `Failed to fetch: ${resp.status}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const html = await resp.text();
    const baseUrl = new URL(url);

    function resolveUrl(src: string): string {
      if (!src) return '';
      if (src.startsWith('http://') || src.startsWith('https://')) return src;
      if (src.startsWith('//')) return baseUrl.protocol + src;
      if (src.startsWith('/')) return baseUrl.origin + src;
      return baseUrl.origin + '/' + src;
    }

    // Strategy 1: Find <img> with logo in class/id/alt/src
    const imgRegex = /<img\s[^>]*?>/gi;
    let match: RegExpExecArray | null;
    let logoUrl = '';

    while ((match = imgRegex.exec(html)) !== null) {
      const tag = match[0].toLowerCase();
      if (
        tag.includes('logo') &&
        !tag.includes('logo-placeholder') &&
        !tag.includes('data:image')
      ) {
        const srcMatch = match[0].match(/src\s*=\s*["']([^"']+)["']/i);
        if (srcMatch?.[1]) {
          logoUrl = resolveUrl(srcMatch[1]);
          break;
        }
      }
    }

    // Strategy 2: og:image fallback
    if (!logoUrl) {
      const ogMatch = html.match(/<meta\s[^>]*property\s*=\s*["']og:image["'][^>]*content\s*=\s*["']([^"']+)["']/i)
        || html.match(/<meta\s[^>]*content\s*=\s*["']([^"']+)["'][^>]*property\s*=\s*["']og:image["']/i);
      if (ogMatch?.[1]) {
        logoUrl = resolveUrl(ogMatch[1]);
      }
    }

    console.log('Discovered logo:', logoUrl || '(none)');

    return new Response(
      JSON.stringify({ success: true, logo_url: logoUrl || null }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error discovering logo:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
