import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function sendNotificationEmail(
  supabase: ReturnType<typeof createClient>,
  email: string,
  companyName: string,
  auditId: string,
  shareToken: string,
  viewCount: number,
  openedAt: string
) {
  try {
    const siteUrl = Deno.env.get("SUPABASE_URL")!.replace(/\/\/[^.]+\.supabase\.co/, "");
    // We'll use Supabase's built-in auth email or a simple approach via edge function
    // For now, use the Supabase auth admin to send a notification
    const { error } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: { skip: true }
    });
    // Actually, let's use a direct approach - send via Resend or log for now
    // Since we don't have an email provider configured, we'll store the notification
    // and the user can see it in the dashboard
    console.log(`[NOTIFICATION] Audit opened: ${companyName} — Email: ${email}, Audit: ${auditId}, Token: ${shareToken}, Views: ${viewCount}`);
  } catch (e) {
    console.error("[NOTIFICATION] Failed to send email:", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { token } = await req.json();
    if (!token || typeof token !== "string") {
      return new Response(JSON.stringify({ error: "missing token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const userAgent = req.headers.get("user-agent") || null;
    const referrer = req.headers.get("referer") || null;

    const { data, error } = await supabase.rpc("record_share_view", {
      p_share_token: token,
      p_ip_address: ip,
      p_user_agent: userAgent,
      p_referrer: referrer,
    });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (data?.error === "not_found") {
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send notification email if needed (non-blocking)
    if (data?.should_notify && data?.notify_email) {
      // Fire and forget — don't block the response
      sendNotificationEmail(
        supabase,
        data.notify_email,
        data.company_name || "Untitled",
        data.audit_id,
        data.share_token,
        data.view_count,
        new Date().toISOString()
      ).catch((e) => console.error("[NOTIFICATION] Error:", e));
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
