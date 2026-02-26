const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
    const { audit_id } = await req.json();

    if (!audit_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'audit_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const SCREENSHOTONE_API_KEY = Deno.env.get('SCREENSHOTONE_API_KEY');
    if (!SCREENSHOTONE_API_KEY) {
      const err = 'SCREENSHOTONE_API_KEY is not configured';
      await logError("capture-website-screenshot", err, { audit_id });
      return new Response(
        JSON.stringify({ success: false, error: err }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: audit, error: auditError } = await supabase
      .from('audit')
      .select('website_url')
      .eq('id', audit_id)
      .single();

    if (auditError || !audit) {
      const err = 'Audit not found';
      await logError("capture-website-screenshot", err, { audit_id, dbError: auditError?.message });
      return new Response(
        JSON.stringify({ success: false, error: err }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!audit.website_url) {
      await supabase
        .from('audit')
        .update({ website_screenshot_url: null, website_screenshot_updated_at: new Date().toISOString() })
        .eq('id', audit_id);

      return new Response(
        JSON.stringify({ success: true, website_screenshot_url: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let targetUrl = audit.website_url.trim();
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = `https://${targetUrl}`;
    }

    const params = new URLSearchParams({
      access_key: SCREENSHOTONE_API_KEY,
      url: targetUrl,
      viewport_width: '1280',
      viewport_height: '720',
      full_page: 'true',
      full_page_scroll: 'true',
      full_page_scroll_delay: '400',
      format: 'jpg',
      image_quality: '80',
      device_scale_factor: '1',
      block_ads: 'true',
      block_cookie_banners: 'true',
      block_chats: 'true',
      block_banners_by_heuristics: 'true',
      cache: 'true',
    });

    const screenshotUrl = `https://api.screenshotone.com/take?${params.toString()}`;

    const { error: updateError } = await supabase
      .from('audit')
      .update({
        website_screenshot_url: screenshotUrl,
        website_screenshot_updated_at: new Date().toISOString(),
      })
      .eq('id', audit_id);

    if (updateError) {
      console.error('Update error:', updateError);
      await logError("capture-website-screenshot", `DB update failed: ${updateError.message}`, { audit_id });
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
    await logError("capture-website-screenshot", `Unexpected: ${error instanceof Error ? error.message : String(error)}`);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
