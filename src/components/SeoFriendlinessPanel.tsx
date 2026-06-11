import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Search, RefreshCw, Compass, FileSearch, Cog, Share2, ChevronDown, ChevronRight, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Audit = Tables<"audit">;

interface SeoFriendlinessPanelProps {
  audit: Audit;
  onUpdate: (updates: Partial<Audit>) => void;
  isOwner?: boolean;
}

interface Factor {
  id: number;
  name: string;
  pillar: number;
  status: string;
  finding: string;
  fix: string;
}

const PILLAR_INFO = [
  { num: 1, label: "Crawlability & Indexing", max: 8, icon: <Compass size={16} /> },
  { num: 2, label: "On-Page SEO", max: 10, icon: <FileSearch size={16} /> },
  { num: 3, label: "Technical SEO", max: 7, icon: <Cog size={16} /> },
  { num: 4, label: "Social & Discoverability", max: 5, icon: <Share2 size={16} /> },
];

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

export default function SeoFriendlinessPanel({ audit, onUpdate, isOwner }: SeoFriendlinessPanelProps) {
  const a = audit as any;
  const seoStatus = a.seo_status as string | null;
  const seoScore = a.seo_score as number | null;
  const seoGrade = a.seo_grade as string | null;
  const factors: Factor[] = Array.isArray(a.seo_factors) ? a.seo_factors as Factor[] : [];

  const [showFactors, setShowFactors] = useState(false);
  const [expandedFactor, setExpandedFactor] = useState<number | null>(null);

  const isFetching = seoStatus === "fetching";
  const isError = seoStatus === "error";
  const isSuccess = seoStatus === "success";

  const handleRetry = async () => {
    if (!audit.website_url) return;
    toast.success("Retrying SEO Friendliness audit…");
    onUpdate({ seo_status: "fetching", seo_error: null } as any);
    try {
      await supabase.functions.invoke("run-seo-audit", {
        body: { audit_id: audit.id, website_url: audit.website_url },
      });
    } catch {
      toast.error("SEO audit retry failed");
    }
  };

  const pillarScores = [
    a.seo_pillar_crawlability ?? 0,
    a.seo_pillar_onpage ?? 0,
    a.seo_pillar_technical ?? 0,
    a.seo_pillar_social ?? 0,
  ];

  return (
    <div className="metricRow">
      {isSuccess && seoScore != null ? (
        <div className="metricNumWrap">
          <p className="metricNum"><span>{seoScore}</span></p>
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

      <div>
        <div className="metricLabel">SEO Friendliness Score</div>
        <p className="metricText">
          Search engines are still where most customers discover local businesses. The SEO Friendliness Score audits 30 on-page and technical factors that influence how easily Google, Bing, and other engines can crawl, understand, and rank your website.
        </p>

        {isError && a.seo_error && (
          <p style={{ fontSize: "0.75rem", color: "#ef4444", marginBottom: 8, wordBreak: "break-word" }}>{a.seo_error}</p>
        )}

        {isSuccess && (
          <div style={{ margin: "12px 0", display: "flex", flexDirection: "column", gap: 6 }}>
            {PILLAR_INFO.map((pillar, idx) => {
              const score = pillarScores[idx];
              const pct = pillar.max > 0 ? (score / pillar.max) * 100 : 0;
              const barColor = pct >= 100 ? "#16a34a" : pct >= 50 ? "#eab308" : "#dc2626";
              return (
                <div key={pillar.num} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 12px", borderRadius: 10,
                  background: "rgba(15,18,32,.03)", border: "1px solid rgba(15,18,32,.08)",
                }}>
                  <span style={{ opacity: 0.7 }}>{pillar.icon}</span>
                  <span style={{ flex: 1, fontWeight: 700, fontSize: 14, textAlign: "left" }}>{pillar.label}</span>
                  <span style={{ fontWeight: 900, fontSize: 14, fontVariantNumeric: "tabular-nums" }}>{score}/{pillar.max}</span>
                  <div style={{ width: 60, height: 6, borderRadius: 3, background: "rgba(0,0,0,0.06)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, borderRadius: 3, background: barColor, transition: "width .5s ease" }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

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
              View All 30 Factors
            </button>

            {showFactors && (
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 2 }}>
                {PILLAR_INFO.map(pillar => {
                  const pf = factors.filter(f => f.pillar === pillar.num).sort((a, b) => a.id - b.id);
                  if (pf.length === 0) return null;
                  return (
                    <div key={pillar.num} style={{ marginBottom: 8 }}>
                      <p style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, opacity: 0.5, marginBottom: 4, marginTop: 4 }}>
                        {pillar.label}
                      </p>
                      {pf.map(f => (
                        <div key={f.id}>
                          <button
                            onClick={() => setExpandedFactor(expandedFactor === f.id ? null : f.id)}
                            style={{
                              display: "flex", alignItems: "center", gap: 8, width: "100%",
                              background: expandedFactor === f.id ? "rgba(15,18,32,.04)" : "transparent",
                              border: "none", cursor: "pointer", padding: "6px 8px", borderRadius: 6,
                              textAlign: "left", fontSize: 13,
                            }}
                          >
                            <span style={{ opacity: 0.4, fontVariantNumeric: "tabular-nums", width: 20, textAlign: "right", fontSize: 11 }}>{f.id}</span>
                            <span style={{ flex: 1, fontWeight: 600 }}>{f.name}</span>
                            {statusBadge(f.status)}
                          </button>
                          {expandedFactor === f.id && (f.finding || f.fix) && (
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

        {(isError || (!isFetching && seoScore == null)) && isOwner && (
          <button className="pillBtn" style={{ opacity: 0.8 }} onClick={handleRetry}>
            <RefreshCw size={13} style={{ marginRight: 4 }} /> Retry SEO Audit
          </button>
        )}
      </div>

      <div className="gradeBox">
        <div className={`bgGlow ${seoGrade ? (seoGrade === "A" ? "a" : seoGrade === "B" ? "b" : seoGrade === "C" ? "c" : seoGrade === "D" ? "d" : "f") : ""}`} />
        <p className="letter" data-grade={isFetching || seoGrade == null ? undefined : seoGrade}>
          {isFetching ? "…" : seoGrade || "—"}
        </p>
      </div>
    </div>
  );
}
