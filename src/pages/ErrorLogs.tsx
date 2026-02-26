import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Search, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface ErrorLog {
  id: string;
  created_at: string;
  user_id: string | null;
  page: string | null;
  action: string | null;
  message: string;
  stack: string | null;
  metadata: Record<string, unknown> | null;
  severity: string;
}

const severityColor = (s: string) => {
  switch (s) {
    case "error": return "destructive";
    case "warn": return "secondary";
    default: return "outline";
  }
};

const fmt = (d: string) =>
  new Date(d).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", second: "2-digit",
  });

const ErrorLogs = () => {
  const [logs, setLogs] = useState<ErrorLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    const { data, error } = await (supabase
      .from("error_logs" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200) as any);
    if (error) {
      toast.error("Failed to load error logs");
    }
    setLogs((data as ErrorLog[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchLogs(); }, []);

  const clearAll = async () => {
    const { error } = await (supabase.from("error_logs" as any).delete().neq("id", "00000000-0000-0000-0000-000000000000") as any);
    if (error) {
      toast.error("Failed to clear logs");
      return;
    }
    setLogs([]);
    toast.success("All error logs cleared");
  };

  const filtered = logs.filter((l) => {
    if (severityFilter !== "all" && l.severity !== severityFilter) return false;
    if (search && !l.message.toLowerCase().includes(search.toLowerCase()) && !(l.page || "").toLowerCase().includes(search.toLowerCase()) && !(l.action || "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-foreground">Error Logs</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchLogs} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" className="gap-2" disabled={logs.length === 0}>
                <Trash2 className="h-4 w-4" /> Clear All
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear all error logs?</AlertDialogTitle>
                <AlertDialogDescription>This will permanently delete all error log entries. This cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={clearAll} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Clear All</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search by message, page, or action…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="error">Error</SelectItem>
            <SelectItem value="warn">Warning</SelectItem>
            <SelectItem value="info">Info</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <p className="mb-3 text-xs text-muted-foreground">{filtered.length} log{filtered.length !== 1 ? "s" : ""} found</p>

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {logs.length === 0 ? "No errors logged yet — that's a good thing!" : "No matching logs."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((log) => (
            <div
              key={log.id}
              className="rounded-lg border border-border p-3 text-sm hover:bg-muted/30 cursor-pointer"
              onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
            >
              <div className="flex items-start gap-3">
                <Badge variant={severityColor(log.severity) as any} className="mt-0.5 shrink-0 text-[10px] uppercase">
                  {log.severity}
                </Badge>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">{log.message}</p>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>{fmt(log.created_at)}</span>
                    {log.page && <span>Page: {log.page}</span>}
                    {log.action && <span>Action: {log.action}</span>}
                  </div>
                </div>
              </div>
              {expandedId === log.id && (
                <div className="mt-3 space-y-2 border-t border-border pt-3">
                  {log.stack && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Stack Trace</p>
                      <pre className="whitespace-pre-wrap text-xs bg-muted p-2 rounded max-h-40 overflow-y-auto">{log.stack}</pre>
                    </div>
                  )}
                  {log.metadata && Object.keys(log.metadata).length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Metadata</p>
                      <pre className="whitespace-pre-wrap text-xs bg-muted p-2 rounded">{JSON.stringify(log.metadata, null, 2)}</pre>
                    </div>
                  )}
                  {log.user_id && (
                    <p className="text-xs text-muted-foreground">User: {log.user_id}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ErrorLogs;
