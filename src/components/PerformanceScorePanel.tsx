import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Audit = Tables<"audit">;

interface PerformanceScorePanelProps {
  audit: Audit;
  onUpdate: (updates: Partial<Audit>) => void;
  isOwner: boolean;
}

const glowClass = (grade: string | null) => {
  switch (grade) {
    case "A": return "a";
    case "B": return "b";
    case "C": return "c";
    case "D": return "d";
    default: return "f";
  }
};

const statusColor = (pct: number) =>
  pct >= 100 ? "#16a34a" : pct >= 50 ? "#eab308" : "#dc2626";

const vitalColor = (status: "good" | "warn" | "poor") =>
  status === "good" ? "#16a34a" : status === "warn" ? "#eab308" : "#dc2626";

const PerformanceScorePanel = ({ audit, onUpdate, isOwner }: PerformanceScorePanelProps) => {
  const a = audit as any;
  const status = a.gtmetrix_status;
  const isFetching = status === "fetching";
  const isError = status === "error";
  const lastError = a.gtmetrix_last_error;

  const grade = a.gtmetrix_grade || null;
  const performance = a.gtmetrix_performance ?? null;
  const structure = a.gtmetrix_structure ?? null;
  const lcp = a.gtmetrix_lcp ?? null;
  const tbt = a.gtmetrix_tbt ?? null;
  const cls = a.gtmetrix_cls ?? null;
  const reportUrl = a.gtmetrix_report_url || null;
  const fetchedAt = a.gtmetrix_fetched_at || null;
  const hasData = performance != null;

  const lcpColor = lcp != null ? vitalColor(lcp <= 2500 ? "good" : lcp <= 4000 ? "warn" : "poor") : "#999";
  const tbtColor = tbt != null ? vitalColor(tbt <= 200 ? "good" : tbt <= 600 ? "warn" : "poor") : "#999";
  const clsColor = cls != null ? vitalColor(cls <= 0.1 ? "good" : cls <= 0.25 ? "warn" : "poor") : "#999";

  // Bar widths (inverted scale — lower is better)
  const lcpPct = lcp != null ? Math.max(5, Math.min(100, (1 - lcp / 5000) * 100)) : 0;
  const tbtPct = tbt != null ? Math.max(5, Math.min(100, (1 - tbt / 600) * 100)) : 0;
  const clsPct = cls != null ? Math.max(5, Math.min(100, (1 - cls / 0.5) * 100)) : 0;

  // Polling
  useEffect(() => {
    if (!audit.id || status !== "fetching") return;
    const startTime = Date.now();
    const timer = setInterval(async () => {
      if (Date.now() - startTime > 210_000) {
        clearInterval(timer);
        onUpdate({ gtmetrix_status: "error", gtmetrix_last_error: "Timed out waiting for GTmetrix results." } as any);
        return;
      }
      const { data } = await supabase
        .from("audit")
        .select("gtmetrix_grade, gtmetrix_performance, gtmetrix_structure, gtmetrix_lcp, gtmetrix_tbt, gtmetrix_cls, gtmetrix_report_url, gtmetrix_status, gtmetrix_last_error, gtmetrix_fetched_at, overall_score, overall_grade")
        .eq("id", audit.id)
        .maybeSingle();
      if (data && ((data as any).gtmetrix_status === "success" || (data as any).gtmetrix_status === "error")) {
        clearInterval(timer);
        onUpdate(data as any);
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [status, audit.id]);

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
                } catch { /* polling handles */ }
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

  return (
    <>
      {/* Main metric row — uses standard grid */}
      <div className="metricRow">
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
        <div>
          <div className="metricLabel">Performance Score</div>
          <p className="metricText">
            Your website's performance directly impacts how users experience it and how search engines rank it. Slow load times, unresponsive interactions, and layout shifts all hurt visibility and conversions.
          </p>
          {fetchedAt && (
            <p style={{ fontSize: "0.7rem", opacity: 0.5, marginBottom: 6 }}>
              Snapshot (auto-fetched {new Date(fetchedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })})
            </p>
          )}

          {/* Performance & Structure bars */}
          {hasData && (
            <div style={{ margin: "12px 0", display: "flex", flexDirection: "column", gap: 6 }}>
              <MetricRow label="Performance" value={performance} max={100} suffix="%" color={statusColor(performance ?? 0)} />
              <MetricRow label="Structure" value={structure} max={100} suffix="%" color={statusColor(structure ?? 0)} />
            </div>
          )}

          {/* Web Vitals */}
          {hasData && (
            <div style={{ marginTop: 4 }}>
              <div style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, opacity: 0.5, marginBottom: 10 }}>
                Core Web Vitals
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <MetricRow
                  label="Load Speed (LCP)"
                  value={lcp != null ? Math.round((1 - Math.min(lcp, 5000) / 5000) * 100) : null}
                  max={100}
                  displayValue={lcp != null ? `${(lcp / 1000).toFixed(2)}s` : "—"}
                  color={lcpColor}
                />
                <MetricRow
                  label="Responsiveness (TBT)"
                  value={tbt != null ? Math.round((1 - Math.min(tbt, 600) / 600) * 100) : null}
                  max={100}
                  displayValue={tbt != null ? `${Math.round(tbt)}ms` : "—"}
                  color={tbtColor}
                />
                <MetricRow
                  label="Visual Stability (CLS)"
                  value={cls != null ? Math.round((1 - Math.min(cls, 0.5) / 0.5) * 100) : null}
                  max={100}
                  displayValue={cls != null ? cls.toFixed(3) : "—"}
                  color={clsColor}
                />
              </div>
            </div>
          )}

          {reportUrl && (
            <div className="metricBtn" style={{ marginTop: 16 }}>
              <a href={reportUrl} target="_blank" rel="noopener noreferrer" className="pillBtn">
                View Audit <span>→</span>
              </a>
            </div>
          )}
        </div>
        <div className="gradeBox">
          <div className={`bgGlow ${grade ? glowClass(grade) : ""}`} />
          <p className="letter" data-grade={grade}>{grade || "—"}</p>
        </div>
      </div>
    </>
  );
};

function MetricRow({ label, value, max, suffix, displayValue, color }: { label: string; value: number | null; max: number; suffix?: string; displayValue?: string; color: string }) {
  const pct = value != null ? Math.max(5, Math.min(100, (value / max) * 100)) : 0;
  const display = displayValue ?? (value != null ? `${value}${suffix ?? ""}` : "—");
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "8px 12px",
      borderRadius: 10,
      background: "rgba(15,18,32,.03)",
      border: "1px solid rgba(15,18,32,.08)",
    }}>
      <span style={{ flex: 1, fontWeight: 700, fontSize: 14, textAlign: "left" }}>{label}</span>
      <span style={{ fontWeight: 900, fontSize: 14, fontVariantNumeric: "tabular-nums" }}>
        {display}
      </span>
      <div style={{ width: 60, height: 6, borderRadius: 3, background: "rgba(0,0,0,0.06)", overflow: "hidden" }}>
        <div style={{
          height: "100%",
          width: `${pct}%`,
          borderRadius: 3,
          background: color,
          transition: "width .5s ease",
        }} />
      </div>
    </div>
  );
}

export default PerformanceScorePanel;