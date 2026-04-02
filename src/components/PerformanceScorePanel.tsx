import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Audit = Tables<"audit">;

interface PerformanceScorePanelProps {
  audit: Audit;
  onUpdate: (updates: Partial<Audit>) => void;
  isOwner: boolean;
}

// Grade glow class reuse
const glowClass = (grade: string | null) => {
  switch (grade) {
    case "A": return "a";
    case "B": return "b";
    case "C": return "c";
    case "D": return "d";
    default: return "f";
  }
};

const PerformanceScorePanel = ({ audit, onUpdate, isOwner }: PerformanceScorePanelProps) => {
  const a = audit as any;
  const status = a.gtmetrix_status || a.psi_status;
  const isFetching = status === "fetching";
  const isError = status === "error";
  const isSuccess = status === "success";
  const lastError = a.gtmetrix_last_error || a.psi_last_error;

  const grade = a.gtmetrix_grade || audit.psi_grade || null;
  const performance = a.gtmetrix_performance ?? audit.psi_mobile_score;
  const structure = a.gtmetrix_structure ?? null;
  const lcp = a.gtmetrix_lcp ?? null;
  const tbt = a.gtmetrix_tbt ?? null;
  const cls = a.gtmetrix_cls ?? null;
  const reportUrl = a.gtmetrix_report_url || audit.psi_audit_url;
  const fetchedAt = a.gtmetrix_fetched_at || a.psi_fetched_at;

  const hasGtmetrix = a.gtmetrix_performance != null;

  // Bar color logic: green=good, yellow=needs work, red=poor
  const lcpColor = lcp != null ? (lcp <= 1200 ? "#16a34a" : lcp <= 2500 ? "#b45309" : "#dc2626") : "#333";
  const tbtColor = tbt != null ? (tbt <= 150 ? "#16a34a" : tbt <= 300 ? "#b45309" : "#dc2626") : "#333";
  const clsColor = cls != null ? (cls <= 0.1 ? "#16a34a" : cls <= 0.25 ? "#b45309" : "#dc2626") : "#333";

  // Percentages for bars
  const lcpPct = lcp != null ? Math.max(5, Math.min(100, (1 - lcp / 5000) * 100)) : 0;
  const tbtPct = tbt != null ? Math.max(5, Math.min(100, (1 - tbt / 600) * 100)) : 0;
  const clsPct = cls != null ? Math.max(5, Math.min(100, (1 - cls / 0.5) * 100)) : 0;

  const perfColor = performance != null ? (performance >= 90 ? "#16a34a" : performance >= 50 ? "#b45309" : "#dc2626") : "#333";
  const structColor = structure != null ? (structure >= 90 ? "#16a34a" : structure >= 50 ? "#b45309" : "#dc2626") : "#333";

  // Polling for gtmetrix status
  useEffect(() => {
    if (!audit.id || a.gtmetrix_status !== "fetching") return;

    const startTime = Date.now();
    const TIMEOUT = 210_000; // 3.5 min
    const INTERVAL = 5_000;

    const timer = setInterval(async () => {
      if (Date.now() - startTime > TIMEOUT) {
        clearInterval(timer);
        onUpdate({ gtmetrix_status: "error", gtmetrix_last_error: "Timed out waiting for GTmetrix results." } as any);
        return;
      }
      const { data } = await supabase
        .from("audit")
        .select("gtmetrix_grade, gtmetrix_performance, gtmetrix_structure, gtmetrix_lcp, gtmetrix_tbt, gtmetrix_cls, gtmetrix_report_url, gtmetrix_status, gtmetrix_last_error, gtmetrix_fetched_at, psi_mobile_score, psi_grade, psi_status, psi_fetched_at, psi_audit_url, overall_score, overall_grade")
        .eq("id", audit.id)
        .maybeSingle();
      if (data && ((data as any).gtmetrix_status === "success" || (data as any).gtmetrix_status === "error")) {
        clearInterval(timer);
        onUpdate(data as any);
      }
    }, INTERVAL);

    return () => clearInterval(timer);
  }, [a.gtmetrix_status, audit.id]);

  if (isFetching) {
    return (
      <div className="metricRow">
        <div className="metricNumWrap">
          <p className="metricNum" style={{ fontSize: "1rem", opacity: 0.6 }}>Fetching…</p>
          <p className="metricSuffix">Performance test running (up to 3 min)</p>
        </div>
        <div>
          <div className="metricLabel">Performance Score</div>
          <p className="metricText">
            Running GTmetrix performance analysis. This test takes 30–90 seconds to complete.
          </p>
        </div>
        <div className="gradeBox">
          <div className="bgGlow" />
          <p className="letter" style={{ opacity: 0.4 }}>—</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="metricRow">
        <div className="metricNumWrap">
          <p className="metricNum" style={{ fontSize: "1rem", opacity: 0.7, color: "#ef4444" }}>Failed</p>
        </div>
        <div>
          <div className="metricLabel">Performance Score</div>
          {lastError && (
            <p style={{ fontSize: "0.75rem", color: "#ef4444", marginBottom: 8, wordBreak: "break-word" }}>
              {lastError}
            </p>
          )}
          {isOwner && (
            <button
              className="pillBtn retryBtn"
              onClick={async () => {
                if (!audit.website_url) return;
                onUpdate({ gtmetrix_status: "fetching" } as any);
                try {
                  await supabase.functions.invoke("run-gtmetrix", {
                    body: { audit_id: audit.id, website_url: audit.website_url },
                  });
                } catch { /* polling will handle */ }
              }}
            >
              Retry Performance
            </button>
          )}
        </div>
        <div className="gradeBox">
          <div className="bgGlow" />
          <p className="letter" style={{ opacity: 0.4 }}>—</p>
        </div>
      </div>
    );
  }

  // Show score with performance/structure bars and web vitals
  return (
    <div className="metricRow" style={{ flexDirection: "column", alignItems: "stretch" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
        {performance != null ? (
          <div className="metricNumWrap">
            <p className="metricNum">{performance}</p>
            <p className="metricSuffix">out of 100</p>
          </div>
        ) : (
          <div className="metricNumWrap">
            <p className="metricNum" style={{ fontSize: "1rem", opacity: 0.6 }}>—</p>
          </div>
        )}
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="metricLabel">Performance Score</div>
          <p className="metricText">
            Your website's performance directly impacts how users experience it and how search engines rank it. Slow load times, unresponsive interactions, and layout shifts all hurt visibility and conversions.
          </p>
          {fetchedAt && (
            <p style={{ fontSize: "0.7rem", opacity: 0.5, marginBottom: 6 }}>
              Snapshot (auto-fetched {new Date(fetchedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })})
            </p>
          )}
        </div>
        <div className="gradeBox">
          <div className={`bgGlow ${grade ? glowClass(grade) : ""}`} />
          <p className="letter" data-grade={grade}>{grade || "—"}</p>
        </div>
        {reportUrl && (
          <div className="metricBtn">
            <a href={reportUrl} target="_blank" rel="noopener noreferrer" className="pillBtn">
              View Report <span>→</span>
            </a>
          </div>
        )}
      </div>

      {hasGtmetrix && (
        <div style={{ marginTop: 20 }}>
          {/* Performance & Structure Scores */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: "0.8rem", fontWeight: 600, opacity: 0.8 }}>Performance</span>
                <span style={{ fontSize: "0.8rem", fontWeight: 700, color: perfColor }}>{performance ?? "—"}%</span>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${performance ?? 0}%`, borderRadius: 4, background: perfColor, transition: "width 0.8s ease" }} />
              </div>
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: "0.8rem", fontWeight: 600, opacity: 0.8 }}>Structure</span>
                <span style={{ fontSize: "0.8rem", fontWeight: 700, color: structColor }}>{structure ?? "—"}%</span>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${structure ?? 0}%`, borderRadius: 4, background: structColor, transition: "width 0.8s ease" }} />
              </div>
            </div>
          </div>

          {/* Web Vitals */}
          <div style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, opacity: 0.5, marginBottom: 10 }}>
            Core Web Vitals
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: "0.78rem", opacity: 0.8 }}>LCP (Largest Contentful Paint)</span>
                <span style={{ fontSize: "0.78rem", fontWeight: 700, color: lcpColor }}>
                  {lcp != null ? `${(lcp / 1000).toFixed(2)}s` : "—"}
                </span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${lcpPct}%`, borderRadius: 3, background: lcpColor, transition: "width 0.8s ease" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.65rem", opacity: 0.4, marginTop: 2 }}>
                <span>Good: ≤ 2.5s</span><span>Poor: &gt; 4s</span>
              </div>
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: "0.78rem", opacity: 0.8 }}>TBT (Total Blocking Time)</span>
                <span style={{ fontSize: "0.78rem", fontWeight: 700, color: tbtColor }}>
                  {tbt != null ? `${Math.round(tbt)}ms` : "—"}
                </span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${tbtPct}%`, borderRadius: 3, background: tbtColor, transition: "width 0.8s ease" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.65rem", opacity: 0.4, marginTop: 2 }}>
                <span>Good: ≤ 200ms</span><span>Poor: &gt; 600ms</span>
              </div>
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: "0.78rem", opacity: 0.8 }}>CLS (Cumulative Layout Shift)</span>
                <span style={{ fontSize: "0.78rem", fontWeight: 700, color: clsColor }}>
                  {cls != null ? cls.toFixed(3) : "—"}
                </span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${clsPct}%`, borderRadius: 3, background: clsColor, transition: "width 0.8s ease" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.65rem", opacity: 0.4, marginTop: 2 }}>
                <span>Good: ≤ 0.1</span><span>Poor: &gt; 0.25</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PerformanceScorePanel;
