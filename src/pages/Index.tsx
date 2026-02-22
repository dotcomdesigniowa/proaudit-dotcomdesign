import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Search } from "lucide-react";

interface AuditRow {
  id: string;
  company_name: string | null;
  overall_grade: string | null;
  overall_score: number | null;
  prepared_date: string | null;
  prepared_by_name: string | null;
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

const Index = () => {
  const [audits, setAudits] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    supabase
      .from("audit")
      .select("id, company_name, overall_grade, overall_score, prepared_date, prepared_by_name")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setAudits((data as AuditRow[]) || []);
        setLoading(false);
      });
  }, []);

  const filtered = audits.filter((a) =>
    !search || (a.company_name || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="mx-auto max-w-5xl p-6">
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
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Company</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Grade</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Score</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Prepared By</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 whitespace-nowrap">
                    {a.prepared_date
                      ? new Date(a.prepared_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Link to={`/audit/${a.id}`} className="font-medium text-primary underline-offset-2 hover:underline">
                      {a.company_name || "Untitled"}
                    </Link>
                  </td>
                  <td className={`px-4 py-3 text-center text-lg font-bold ${gradeColor(a.overall_grade)}`}>
                    {a.overall_grade || "—"}
                  </td>
                  <td className="px-4 py-3 text-center">{a.overall_score ?? "—"}</td>
                  <td className="px-4 py-3">{a.prepared_by_name || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Index;
