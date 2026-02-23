import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Search, Copy, Eye, Activity, Trash2, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";

interface AuditRow {
  id: string;
  company_name: string | null;
  overall_grade: string | null;
  overall_score: number | null;
  prepared_date: string | null;
  prepared_by_name: string | null;
  is_deleted: boolean;
}

interface ShareInfo {
  id: string;
  audit_id: string;
  share_token: string;
  view_count: number;
  is_active: boolean;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
}

interface ViewEvent {
  id: string;
  viewed_at: string;
  user_agent: string | null;
  referrer: string | null;
}

const gradeColor = (g: string | null) => {
  switch (g) {
    case "A": return "text-green-600";
    case "B": return "text-blue-600";
    case "C": return "text-yellow-600";
    case "D": return "text-orange-600";
    default: return "text-destructive";
  }
};

const fmt = (d: string | null) => {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
};

const shortUA = (ua: string | null) => {
  if (!ua) return "—";
  if (ua.length <= 50) return ua;
  return ua.slice(0, 47) + "…";
};

const Index = () => {
  const navigate = useNavigate();
  const [audits, setAudits] = useState<AuditRow[]>([]);
  const [shares, setShares] = useState<Record<string, ShareInfo>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [views, setViews] = useState<ViewEvent[]>([]);

  const fetchData = () => {
    Promise.all([
      supabase
        .from("audit")
        .select("id, company_name, overall_grade, overall_score, prepared_date, prepared_by_name, is_deleted")
        .eq("is_deleted", false)
        .order("created_at", { ascending: false }),
      supabase
        .from("audit_shares")
        .select("id, audit_id, share_token, view_count, is_active, first_viewed_at, last_viewed_at"),
    ]).then(([auditRes, shareRes]) => {
      setAudits((auditRes.data as AuditRow[]) || []);
      const shareMap: Record<string, ShareInfo> = {};
      (shareRes.data || []).forEach((s: ShareInfo) => {
        if (!shareMap[s.audit_id] || s.is_active) {
          shareMap[s.audit_id] = s;
        }
      });
      setShares(shareMap);
      setLoading(false);
    });
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = audits.filter((a) =>
    !search || (a.company_name || "").toLowerCase().includes(search.toLowerCase())
  );

  const copyShareLink = (token: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/shared/audit/${token}`);
    toast.success("Link copied");
  };

  const handleDelete = async (auditId: string) => {
    // Get share IDs to delete views first
    const { data: shareRows } = await supabase
      .from("audit_shares")
      .select("id")
      .eq("audit_id", auditId);
    const shareIds = (shareRows || []).map((s) => s.id);
    // Delete views, then shares, then audit (respecting FK order)
    if (shareIds.length > 0) {
      await supabase.from("audit_share_views").delete().in("share_id", shareIds);
      await supabase.from("audit_shares").delete().eq("audit_id", auditId);
    }
    const { error, count } = await supabase.from("audit").delete().eq("id", auditId).select("id");
    if (error) {
      toast.error("Failed to delete audit");
      return;
    }
    setAudits((prev) => prev.filter((a) => a.id !== auditId));
    toast.success("Audit deleted");
  };

  const loadViews = async (shareId: string) => {
    const { data } = await supabase
      .from("audit_share_views")
      .select("id, viewed_at, user_agent, referrer")
      .eq("share_id", shareId)
      .order("viewed_at", { ascending: false })
      .limit(10);
    setViews(data || []);
  };

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-foreground">Audit Dashboard</h1>
        <Link to="/create-audit">
          <Button className="gap-2">
            <Plus className="h-4 w-4" /> Create New Audit
          </Button>
        </Link>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by company name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {audits.length === 0 ? "No audits yet. Create your first one!" : "No matching audits."}
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-3 text-left font-medium text-muted-foreground">Date</th>
                <th className="px-3 py-3 text-left font-medium text-muted-foreground">Company</th>
                <th className="px-3 py-3 text-center font-medium text-muted-foreground">Grade</th>
                <th className="px-3 py-3 text-center font-medium text-muted-foreground">Score</th>
                <th className="px-3 py-3 text-center font-medium text-muted-foreground">Status</th>
                <th className="px-3 py-3 text-center font-medium text-muted-foreground">Views</th>
                <th className="px-3 py-3 text-left font-medium text-muted-foreground">First Opened</th>
                <th className="px-3 py-3 text-left font-medium text-muted-foreground">Last Opened</th>
                <th className="px-3 py-3 text-center font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => {
                const share = shares[a.id];
                return (
                  <tr
                    key={a.id}
                    className="border-b border-border last:border-0 hover:bg-muted/30 cursor-pointer"
                    onClick={() => navigate(`/audit/${a.id}`)}
                  >
                    <td className="px-3 py-3 whitespace-nowrap text-xs">
                      {a.prepared_date
                        ? new Date(a.prepared_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                        : "—"}
                    </td>
                    <td className="px-3 py-3">
                      <span className="font-medium text-primary">
                        {a.company_name || "Untitled"}
                      </span>
                    </td>
                    <td className={`px-3 py-3 text-center text-lg font-bold ${gradeColor(a.overall_grade)}`}>
                      {a.overall_grade || "—"}
                    </td>
                    <td className="px-3 py-3 text-center">{a.overall_score ?? "—"}</td>
                    <td className="px-3 py-3 text-center">
                      {share?.is_active ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-600">
                          <CheckCircle size={12} /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <XCircle size={12} /> Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <Eye size={14} />
                        {share?.view_count ?? 0}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs whitespace-nowrap">
                      {share?.first_viewed_at ? fmt(share.first_viewed_at) : "Not opened yet"}
                    </td>
                    <td className="px-3 py-3 text-xs whitespace-nowrap">
                      {fmt(share?.last_viewed_at ?? null)}
                    </td>
                    <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex items-center gap-1">
                        {share?.is_active && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => copyShareLink(share.share_token)}
                            title="Copy share link"
                          >
                            <Copy size={13} />
                          </Button>
                        )}
                        {share && (
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={() => loadViews(share.id)}
                                title="View activity"
                              >
                                <Activity size={13} />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-lg">
                              <DialogHeader>
                                <DialogTitle>Recent View Activity — {a.company_name || "Audit"}</DialogTitle>
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
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" title="Delete audit">
                              <Trash2 size={13} />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete "{a.company_name || "Untitled"}"?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will archive the audit and deactivate its share link. This action can be undone later.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(a.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Index;
