import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Copy, Link2, Eye, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface ShareData {
  id: string;
  share_token: string;
  slug: string | null;
  is_active: boolean;
  view_count: number;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  created_at: string;
}

interface ViewEvent {
  id: string;
  viewed_at: string;
  user_agent: string | null;
  referrer: string | null;
}

function generateToken(len = 48): string {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, len);
}

const fmt = (d: string | null) => {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
};

const shortUA = (ua: string | null) => {
  if (!ua) return "—";
  if (ua.length <= 60) return ua;
  return ua.slice(0, 57) + "…";
};

export default function AuditSharePanel({ auditId }: { auditId: string }) {
  const { user } = useAuth();
  const [share, setShare] = useState<ShareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [views, setViews] = useState<ViewEvent[]>([]);

  const shareUrl = share
    ? `${window.location.origin}/${share.slug || share.share_token}`
    : "";

  useEffect(() => {
    if (!user) return;
    supabase
      .from("audit_shares")
      .select("id, share_token, slug, is_active, view_count, first_viewed_at, last_viewed_at, created_at")
      .eq("audit_id", auditId)
      .eq("is_active", true)
      .limit(1)
      .then(({ data }) => {
        setShare((data && data[0]) || null);
        setLoading(false);
      });
  }, [auditId, user]);

  const handleGenerate = async () => {
    if (!user) return;
    setCreating(true);
    const token = generateToken();
    const { data, error } = await supabase
      .from("audit_shares")
      .insert({ audit_id: auditId, share_token: token, created_by: user.id })
      .select("id, share_token, slug, is_active, view_count, first_viewed_at, last_viewed_at, created_at")
      .single();
    if (error) {
      toast.error("Failed to generate link");
    } else {
      setShare(data);
      toast.success("Share link created");
    }
    setCreating(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    toast.success("Link copied");
  };

  const handleDeactivate = async () => {
    if (!share) return;
    await supabase.from("audit_shares").update({ is_active: false }).eq("id", share.id);
    setShare(null);
    toast.success("Share link deactivated");
  };

  const loadViews = async () => {
    if (!share) return;
    const { data } = await supabase
      .from("audit_share_views")
      .select("id, viewed_at, user_agent, referrer")
      .eq("share_id", share.id)
      .order("viewed_at", { ascending: false })
      .limit(10);
    setViews(data || []);
  };

  if (!user) return null;

  return (
    <div className="shareEngagementRow">
      {/* SHARE PANEL */}
      <div className="sharePanel">
        <div className="panelHeader">
          <Link2 size={16} />
          <span>Share Link</span>
        </div>
        {loading ? (
          <p className="panelMuted">Loading…</p>
        ) : share ? (
          <div className="shareBody">
            <div className="shareLinkRow">
              <input readOnly value={shareUrl} className="shareLinkInput" onClick={handleCopy} />
              <Button size="sm" variant="outline" onClick={handleCopy} className="gap-1">
                <Copy size={14} /> Copy
              </Button>
            </div>
            <Button size="sm" variant="ghost" onClick={handleDeactivate} className="gap-1 text-destructive hover:text-destructive">
              <X size={14} /> Deactivate
            </Button>
          </div>
        ) : (
          <Button size="sm" onClick={handleGenerate} disabled={creating} className="gap-1">
            {creating ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
            Generate Share Link
          </Button>
        )}
      </div>

      {/* ENGAGEMENT PANEL */}
      <div className="engagementPanel">
        <div className="panelHeader">
          <Eye size={16} />
          <span>Engagement</span>
        </div>
        {share ? (
          <div className="engagementBody">
            <div className="engStat">
              <span className="engLabel">Views</span>
              <span className="engValue">{share.view_count}</span>
            </div>
            <div className="engStat">
              <span className="engLabel">First opened</span>
              <span className="engValue">{share.first_viewed_at ? fmt(share.first_viewed_at) : "Not opened yet"}</span>
            </div>
            <div className="engStat">
              <span className="engLabel">Last opened</span>
              <span className="engValue">{fmt(share.last_viewed_at)}</span>
            </div>
            <Dialog>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" onClick={loadViews} className="gap-1 mt-1">
                  <Eye size={14} /> View activity
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Recent View Activity</DialogTitle>
                </DialogHeader>
                {views.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">No views yet.</p>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {views.map((v) => (
                      <div key={v.id} className="rounded border border-border p-2 text-xs space-y-0.5">
                        <div className="font-medium">{fmt(v.viewed_at)}</div>
                        <div className="text-muted-foreground truncate">{shortUA(v.user_agent)}</div>
                        {v.referrer && <div className="text-muted-foreground truncate">From: {v.referrer}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </div>
        ) : (
          <p className="panelMuted">Generate a share link to see engagement data.</p>
        )}
      </div>
    </div>
  );
}
