const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { audit_id } = await req.json();

    if (!audit_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'audit_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const SCREENSHOTONE_API_KEY = Deno.env.get('SCREENSHOTONE_API_KEY');
    if (!SCREENSHOTONE_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: 'SCREENSHOTONE_API_KEY is not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Load audit
    const { data: audit, error: auditError } = await supabase
      .from('audit')
      .select('website_url')
      .eq('id', audit_id)
      .single();

    if (auditError || !audit) {
      return new Response(
        JSON.stringify({ success: false, error: 'Audit not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!audit.website_url) {
      // No website URL, clear screenshot
      await supabase
        .from('audit')
        .update({ website_screenshot_url: null, website_screenshot_updated_at: new Date().toISOString() })
        .eq('id', audit_id);

      return new Response(
        JSON.stringify({ success: true, website_screenshot_url: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build ScreenshotOne URL
    let targetUrl = audit.website_url.trim();
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = `https://${targetUrl}`;
    }

    const params = new URLSearchParams({
      access_key: SCREENSHOTONE_API_KEY,
      url: targetUrl,
      viewport_width: '1280',
      viewport_height: '720',
      full_page: 'false',
      format: 'jpg',
      device_scale_factor: '1',
      block_ads: 'true',
      block_cookie_banners: 'true',
      cache: 'true',
    });

    const screenshotUrl = `https://api.screenshotone.com/take?${params.toString()}`;

    // Store the URL (not downloading the image)
    const { error: updateError } = await supabase
      .from('audit')
      .update({
        website_screenshot_url: screenshotUrl,
        website_screenshot_updated_at: new Date().toISOString(),
      })
      .eq('id', audit_id);

    if (updateError) {
      console.error('Update error:', updateError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to update audit' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Screenshot URL generated for audit:', audit_id);

    return new Response(
      JSON.stringify({ success: true, website_screenshot_url: screenshotUrl }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error capturing screenshot:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
