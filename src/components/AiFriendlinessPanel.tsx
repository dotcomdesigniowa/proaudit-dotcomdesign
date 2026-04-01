import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Bot, RefreshCw, Shield, FileText, Search, Sparkles, ChevronDown, ChevronRight, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Audit = Tables<"audit">;

interface AiFriendlinessPanelProps {
  audit: Audit;
  onUpdate: (updates: Partial<Audit>) => void;
  isOwner?: boolean;
}

interface AuditRun {
  id: string;
  score: number | null;
  letter_grade: string | null;
  score_pass: number | null;
  score_warn: number | null;
  score_fail: number | null;
  pillar1_score: number | null;
  pillar2_score: number | null;
  pillar3_score: number | null;
  pillar4_score: number | null;
  status: string;
  completed_at: string | null;
}

interface FactorResult {
  id: string;
  factor_id: number;
  factor_name: string;
  pillar: number;
  check_method: string;
  status: string;
  finding: string | null;
  fix: string | null;
}

const PILLAR_INFO = [
  { num: 1, label: "Technical Infrastructure", max: 7, icon: <Shield size={16} /> },
  { num: 2, label: "Content Structure", max: 12, icon: <FileText size={16} /> },
  { num: 3, label: "Entity & Authority", max: 8, icon: <Search size={16} /> },
  { num: 4, label: "Strategic AI Assets", max: 5, icon: <Sparkles size={16} /> },
];

const gradeColor = (grade: string | null) => {
  switch (grade) {
    case "A": return "#16a34a";
    case "B": return "#3b82f6";
    case "C": return "#eab308";
    case "D": return "#f97316";
    default: return "#dc2626";
  }
};

const statusBadge = (status: string) => {
  switch (status) {
    case "pass":
      return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: "rgba(22,163,74,0.12)", color: "#16a34a" }}><CheckCircle2 size={12} /> PASS</span>;
    case "fail":
      return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: "rgba(220,38,38,0.12)", color: "#dc2626" }}><XCircle size={12} /> FAIL</span>;
    default:
      return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: "rgba(234,179,8,0.12)", color: "#b45309" }}><AlertTriangle size={12} /> NEEDS WORK</span>;
  }
};

export default function AiFriendlinessPanel({ audit, onUpdate, isOwner }: AiFriendlinessPanelProps) {
  const aiStatus = audit.ai_status as string;
  const aiScore = audit.ai_score as number | null;
  const aiGrade = audit.ai_grade as string | null;

  const [run, setRun] = useState<AuditRun | null>(null);
  const [factors, setFactors] = useState<FactorResult[]>([]);
  const [showFactors, setShowFactors] = useState(false);
  const [expandedFactor, setExpandedFactor] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const isFetching = aiStatus === "fetching";
  const isError = aiStatus === "error";
  const isSuccess = aiStatus === "success";

  // Fetch detailed results from ai_audit_runs
  useEffect(() => {
    if (!audit.id) return;
    const fetchRun = async () => {
      setLoading(true);
      const { data: runs } = await supabase
        .from("ai_audit_runs")
        .select("*")
        .eq("audit_id", audit.id)
        .eq("status", "complete")
        .order("created_at", { ascending: false })
        .limit(1);

      if (runs && runs.length > 0) {
        const r = runs[0];
        setRun(r as AuditRun);
        const { data: fr } = await supabase
          .from("ai_audit_factor_results")
          .select("*")
          .eq("audit_run_id", r.id)
          .order("factor_id", { ascending: true });
        if (fr) setFactors(fr as FactorResult[]);
      }
      setLoading(false);
    };
    fetchRun();
  }, [audit.id, aiStatus]);

  const handleRetry = async () => {
    if (!audit.website_url) return;
    toast.success("Retrying Ai Friendliness audit…");
    onUpdate({ ai_status: "fetching" } as any);
    try {
      await supabase.functions.invoke("run-ai-audit", {
        body: { audit_id: audit.id, website_url: audit.website_url },
      });
    } catch {
      toast.error("AI audit retry failed");
    }
  };

  const pillarScores = run ? [
    run.pillar1_score ?? 0,
    run.pillar2_score ?? 0,
    run.pillar3_score ?? 0,
    run.pillar4_score ?? 0,
  ] : [0, 0, 0, 0];

  const displayScore = run?.score ?? aiScore;
  const displayGrade = run?.letter_grade ?? aiGrade;

  return (
    <div className="metricRow">
      {/* Score */}
      {isSuccess && displayScore != null ? (
        <div className="metricNumWrap">
          <p className="metricNum"><span>{displayScore}</span></p>
          <p className="metricSuffix">out of 100</p>
        </div>
      ) : isFetching ? (
        <div className="metricNumWrap">
          <p className="metricNum" style={{ fontSize: "1rem", opacity: 0.6 }}>Analyzing…</p>
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
          <Bot size={18} /> Ai Friendliness Score
        </div>
        <p className="metricText">
          This measures whether modern Ai systems (like ChatGPT, Gemini &amp; Voice Assistants) can access, read, and understand your website across 32 specific factors. It does not guarantee visibility in AI-generated results, but it shows whether your website is technically prepared for AI systems.
        </p>

        {run?.completed_at && isSuccess && (
          <p style={{ fontSize: "0.7rem", opacity: 0.5, marginBottom: 6 }}>
            Audited {new Date(run.completed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
            {run.score_pass != null && ` · ${run.score_pass} pass · ${run.score_warn ?? 0} warn · ${run.score_fail ?? 0} fail`}
          </p>
        )}

        {isError && (audit as any).ai_last_error && (
          <p style={{ fontSize: "0.75rem", color: "#ef4444", marginBottom: 8, wordBreak: "break-word" }}>
            {(audit as any).ai_last_error}
          </p>
        )}

        {/* Pillar Sub-scores */}
        {isSuccess && (run || aiScore != null) && (
          <div style={{ margin: "12px 0", display: "flex", flexDirection: "column", gap: 6 }}>
            {PILLAR_INFO.map((pillar, idx) => {
              const score = pillarScores[idx];
              const pct = pillar.max > 0 ? (score / pillar.max) * 100 : 0;
              const barColor = pct >= 80 ? "#16a34a" : pct >= 60 ? "#3b82f6" : pct >= 40 ? "#eab308" : pct >= 25 ? "#f97316" : "#dc2626";
              return (
                <div key={pillar.num} style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 12px",
                  borderRadius: 10,
                  background: "rgba(15,18,32,.03)",
                  border: "1px solid rgba(15,18,32,.08)",
                }}>
                  <span style={{ opacity: 0.7 }}>{pillar.icon}</span>
                  <span style={{ flex: 1, fontWeight: 700, fontSize: 14, textAlign: "left" }}>{pillar.label}</span>
                  <span style={{ fontWeight: 900, fontSize: 14, fontVariantNumeric: "tabular-nums" }}>
                    {score}/{pillar.max}
                  </span>
                  <div style={{ width: 60, height: 6, borderRadius: 3, background: "rgba(15,18,32,.08)", overflow: "hidden" }}>
                    <div style={{
                      height: "100%",
                      width: `${pct}%`,
                      borderRadius: 3,
                      background: barColor,
                      transition: "width .5s ease",
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Collapsible 32 Factors */}
        {isSuccess && factors.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <button
              onClick={() => setShowFactors(!showFactors)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                background: "none", border: "none", cursor: "pointer",
                fontSize: 13, fontWeight: 700, color: "inherit", opacity: 0.7,
                padding: "4px 0",
              }}
            >
              {showFactors ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              View All 32 Factors
            </button>

            {showFactors && (
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 2 }}>
                {PILLAR_INFO.map(pillar => {
                  const pillarFactors = factors.filter(f => f.pillar === pillar.num).sort((a, b) => a.factor_id - b.factor_id);
                  if (pillarFactors.length === 0) return null;
                  return (
                    <div key={pillar.num} style={{ marginBottom: 8 }}>
                      <p style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, opacity: 0.5, marginBottom: 4, marginTop: 4 }}>
                        {pillar.label}
                      </p>
                      {pillarFactors.map(f => (
                        <div key={f.factor_id}>
                          <button
                            onClick={() => setExpandedFactor(expandedFactor === f.factor_id ? null : f.factor_id)}
                            style={{
                              display: "flex", alignItems: "center", gap: 8, width: "100%",
                              background: expandedFactor === f.factor_id ? "rgba(15,18,32,.04)" : "transparent",
                              border: "none", cursor: "pointer", padding: "6px 8px", borderRadius: 6,
                              textAlign: "left", fontSize: 13,
                            }}
                          >
                            <span style={{ opacity: 0.4, fontVariantNumeric: "tabular-nums", width: 20, textAlign: "right", fontSize: 11 }}>
                              {f.factor_id}
                            </span>
                            <span style={{ flex: 1, fontWeight: 600 }}>{f.factor_name}</span>
                            {statusBadge(f.status)}
                          </button>
                          {expandedFactor === f.factor_id && (f.finding || f.fix) && (
                            <div style={{ marginLeft: 36, padding: "4px 8px 8px", fontSize: 12, opacity: 0.8, lineHeight: 1.5 }}>
                              {f.finding && <p style={{ marginBottom: 4 }}><strong>Finding:</strong> {f.finding}</p>}
                              {f.fix && f.status !== "pass" && <p style={{ color: "#2563eb" }}><strong>Fix:</strong> {f.fix}</p>}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Retry */}
        {((isError) || (!isFetching && displayScore == null)) && isOwner && (
          <button className="pillBtn" style={{ opacity: 0.8 }} onClick={handleRetry}>
            <RefreshCw size={13} style={{ marginRight: 4 }} /> Retry AI Audit
          </button>
        )}
      </div>

      {/* Grade box */}
      <div className="gradeBox">
        <div className={`bgGlow ${displayGrade ? (displayGrade === "A" ? "a" : displayGrade === "B" ? "b" : displayGrade === "C" ? "c" : displayGrade === "D" ? "d" : "f") : ""}`} />
        <p className="letter" data-grade={isFetching || displayGrade == null ? undefined : displayGrade}>
          {isFetching ? "…" : displayGrade || "—"}
        </p>
      </div>
    </div>
  );
}
