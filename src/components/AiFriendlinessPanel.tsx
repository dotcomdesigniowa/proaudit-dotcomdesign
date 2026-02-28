import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Bot, ChevronDown, ChevronUp, RefreshCw, Shield, FileText, Search, Sparkles } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Audit = Tables<"audit">;

interface AiFriendlinessPanelProps {
  audit: Audit;
  onUpdate: (updates: Partial<Audit>) => void;
  isOwner?: boolean;
}

const gradeColor = (grade: string | null) => {
  switch (grade) {
    case "A": return "#16a34a";
    case "B": return "#22c55e";
    case "C": return "#eab308";
    case "D": return "#f97316";
    default: return "#dc2626";
  }
};

const severityBadge = (sev: string) => {
  const colors: Record<string, string> = { high: "#dc2626", med: "#f97316", low: "#eab308" };
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 800,
      textTransform: "uppercase",
      letterSpacing: ".06em",
      color: "#fff",
      background: colors[sev] || "#94a3b8",
    }}>
      {sev}
    </span>
  );
};

const categoryIcons: Record<string, React.ReactNode> = {
  access_permission: <Shield size={16} />,
  extractability: <FileText size={16} />,
  entity_clarity: <Search size={16} />,
  ai_affordances: <Sparkles size={16} />,
};

const categoryLabels: Record<string, string> = {
  access_permission: "Access & Permission",
  extractability: "Extractability",
  entity_clarity: "Entity Clarity",
  ai_affordances: "AI Affordances",
};

export default function AiFriendlinessPanel({ audit, onUpdate, isOwner }: AiFriendlinessPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const aiStatus = (audit as any).ai_status as string;
  const aiScore = (audit as any).ai_score as number | null;
  const aiGrade = (audit as any).ai_grade as string | null;
  const aiDetails = (audit as any).ai_details as any;
  const aiLastError = (audit as any).ai_last_error as string | null;
  const aiFetchedAt = (audit as any).ai_fetched_at as string | null;

  const isFetching = aiStatus === "fetching";
  const isError = aiStatus === "error";
  const isSuccess = aiStatus === "success";

  const handleRetry = async () => {
    if (!audit.website_url) return;
    toast.success("Retrying AI Friendliness audit…");
    onUpdate({ ai_status: "fetching" } as any);
    try {
      await supabase.functions.invoke("run-ai-friendly", {
        body: { audit_id: audit.id, website_url: audit.website_url },
      });
    } catch {
      toast.error("AI audit retry failed");
    }
  };

  return (
    <div className="metricRow">
      {/* Score */}
      {isSuccess && aiScore != null ? (
        <div className="metricNumWrap">
          <p className="metricNum"><span>{aiScore}</span></p>
          <p className="metricSuffix">out of 100</p>
        </div>
      ) : isFetching ? (
        <div className="metricNumWrap">
          <p className="metricNum" style={{ fontSize: "1rem", opacity: 0.6 }}>Fetching…</p>
        </div>
      ) : isError ? (
        <div className="metricNumWrap">
          <p className="metricNum" style={{ fontSize: "1rem", opacity: 0.7, color: "#ef4444" }}>Failed</p>
        </div>
      ) : (
        <div className="metricNumWrap">
          <p className="metricNum" style={{ fontSize: "1rem", opacity: 0.6 }}>—</p>
        </div>
      )}

      {/* Details */}
      <div>
        <div className="metricLabel" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Bot size={18} /> AI Friendliness Score
        </div>
        <p className="metricText">
          This measures whether modern AI systems — like ChatGPT, Google AI Overviews, and voice assistants — can access, read, and extract your website's content and business facts. It is <strong>not</strong> an SEO audit.
        </p>

        {aiFetchedAt && isSuccess && (
          <p style={{ fontSize: "0.7rem", opacity: 0.5, marginBottom: 6 }}>
            Snapshot (auto-fetched {new Date(aiFetchedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })})
          </p>
        )}

        {isError && aiLastError && (
          <p style={{ fontSize: "0.75rem", color: "#ef4444", marginBottom: 8, wordBreak: "break-word" }}>
            {aiLastError}
          </p>
        )}

        {/* Subscores */}
        {isSuccess && aiDetails?.subscores && (
          <div style={{ margin: "12px 0", display: "flex", flexDirection: "column", gap: 6 }}>
            {Object.entries(aiDetails.subscores).map(([key, sub]: [string, any]) => (
              <div key={key} style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 12px",
                borderRadius: 10,
                background: "rgba(15,18,32,.03)",
                border: "1px solid rgba(15,18,32,.08)",
              }}>
                <span style={{ opacity: 0.7 }}>{categoryIcons[key]}</span>
                <span style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>{categoryLabels[key] || key}</span>
                <span style={{ fontWeight: 900, fontSize: 14, fontVariantNumeric: "tabular-nums" }}>
                  {sub.score}/{sub.max}
                </span>
                <div style={{ width: 60, height: 6, borderRadius: 3, background: "rgba(15,18,32,.08)", overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    width: `${(sub.score / sub.max) * 100}%`,
                    borderRadius: 3,
                    background: gradeColor(aiGrade),
                    transition: "width .5s ease",
                  }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Findings */}
        {isSuccess && aiDetails?.findings?.length > 0 && (
          <>
            <button
              type="button"
              className="pillBtn"
              style={{ marginBottom: 8 }}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              <span style={{ marginLeft: 6 }}>
                {expanded ? "Hide" : "Show"} {aiDetails.findings.length} Finding{aiDetails.findings.length > 1 ? "s" : ""}
              </span>
            </button>
            {expanded && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                {aiDetails.findings.map((f: any, i: number) => (
                  <div key={i} style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid rgba(15,18,32,.10)",
                    background: "#fff",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      {severityBadge(f.severity)}
                      <strong style={{ fontSize: 14 }}>{f.title}</strong>
                    </div>
                    <p style={{ fontSize: 13, color: "#374151", margin: "4px 0" }}>{f.description}</p>
                    <p style={{ fontSize: 12, color: "#6b7280", margin: 0, fontStyle: "italic" }}>💡 {f.recommendation}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Retry */}
        {((isError) || (!isFetching && aiScore == null)) && isOwner && (
          <button className="pillBtn" style={{ opacity: 0.8 }} onClick={handleRetry}>
            <RefreshCw size={13} style={{ marginRight: 4 }} /> Retry AI Audit
          </button>
        )}
      </div>

      {/* Grade box */}
      <div className="gradeBox">
        <div className={`bgGlow ${aiGrade ? (aiGrade === "A" ? "a" : aiGrade === "B" ? "b" : aiGrade === "C" ? "c" : aiGrade === "D" ? "d" : "f") : ""}`} />
        <p className="letter" data-grade={isFetching || aiGrade == null ? undefined : aiGrade}>
          {isFetching ? "…" : aiGrade || "—"}
        </p>
      </div>
    </div>
  );
}
