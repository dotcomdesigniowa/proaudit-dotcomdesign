import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import type { Tables } from "@/integrations/supabase/types";
import { Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import ComputerScreenshot from "@/components/ComputerScreenshot";
import InfoTip from "@/components/InfoTip";
import "./AuditReport.css";
import { formatPhone } from "@/lib/formatPhone";

type Audit = Tables<"audit"> & { business_phone?: string | null };

const DEFAULT_UTH_IMAGE = "/images/under-the-hood.png";
const DEFAULT_SCAN_IMAGE = "/images/presence-scan.png";

const DESIGN_BULLETS = [
  "Generic template-based design detected.",
  "Design closely resembles other mass-produced local business sites.",
  "Top-of-page section lacks strong trust signals.",
  "Stock imagery and generic content detected.",
  "Visual hierarchy and layout do not establish authority or credibility.",
  "Website presentation does not reflect the quality of the company's actual work.",
];

const glowClass = (grade: string | null) => {
  switch (grade) {
    case "A": return "a";
    case "B": return "b";
    case "C": return "c";
    case "D": return "d";
    default: return "f";
  }
};

const companyInitials = (name: string | null) => {
  if (!name) return "—";
  return name.split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 4);
};

const normalizeLogoUrl = (logoUrl: string | null, websiteUrl: string | null): string | null => {
  if (!logoUrl) return null;
  let url = logoUrl.trim();
  if (!url) return null;
  // Relative path like "/logo.png" → resolve against website origin
  if (url.startsWith("/") && !url.startsWith("//")) {
    if (websiteUrl) {
      try {
        const origin = new URL(websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`).origin;
        return `${origin}${url}`;
      } catch { return null; }
    }
    return null;
  }
  // Protocol-relative "//example.com/logo.png"
  if (url.startsWith("//")) return `https:${url}`;
  // Missing protocol entirely "example.com/logo.png"
  if (!url.startsWith("http")) return `https://${url}`;
  return url;
};

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

// ── Animation helpers ──
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MATRIX = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&";
const randChar = () => MATRIX[(Math.random() * MATRIX.length) | 0];
const prefersReduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function useCountUp(ref: React.RefObject<HTMLElement | null>, target: number, duration = 1200, decimals = 0) {
  const done = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || done.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || done.current) return;
        done.current = true;
        io.disconnect();
        if (prefersReduced) { el.textContent = target.toFixed(decimals); return; }
        const start = performance.now();
        const tick = (t: number) => {
          const p = Math.min((t - start) / duration, 1);
          el.textContent = (p * target).toFixed(decimals);
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.5 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [target, duration, decimals]);
}

function useMatrixGrade(ref: React.RefObject<HTMLElement | null>, finalChar: string, duration = 900) {
  const prevChar = useRef(finalChar);
  const done = useRef(false);

  // Reset when the target character changes so animation re-fires
  useEffect(() => {
    if (prevChar.current !== finalChar) {
      done.current = false;
      prevChar.current = finalChar;
    }
  }, [finalChar]);

  useEffect(() => {
    const el = ref.current;
    if (!el || done.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || done.current) return;
        done.current = true;
        io.disconnect();
        if (prefersReduced) { el.textContent = finalChar; return; }
        const start = performance.now();
        const tick = (t: number) => {
          if (t - start < duration) {
            el.textContent = randChar();
            requestAnimationFrame(tick);
          } else {
            el.textContent = finalChar;
          }
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.6 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [finalChar, duration]);
}

function useTypewriter(ref: React.RefObject<HTMLElement | null>, text: string, speed = 55) {
  const done = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || done.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || done.current) return;
        done.current = true;
        io.disconnect();
        if (prefersReduced) { el.innerHTML = text; return; }
        // Reserve full width with invisible text so layout never shifts
        el.innerHTML = `<span style="visibility:hidden">${text}</span>`;
        let i = 0;
        const interval = setInterval(() => {
          i++;
          const visible = text.slice(0, i);
          const hidden = text.slice(i);
          el.innerHTML = `${visible}<span style="visibility:hidden">${hidden}</span>`;
          if (i >= text.length) { el.textContent = text; clearInterval(interval); }
        }, speed);
      },
      { threshold: 0.3 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [text, speed]);
}

// ── Bullet list animation ──
function useBulletAnimation(listRef: React.RefObject<HTMLUListElement | null>) {
  const done = useRef(false);
  useEffect(() => {
    const el = listRef.current;
    if (!el || done.current) return;
    const items = Array.from(el.querySelectorAll("li"));
    const io = new IntersectionObserver(
      async (entries) => {
        if (!entries[0]?.isIntersecting || done.current) return;
        done.current = true;
        io.disconnect();
        for (const li of items) {
          (li as HTMLElement).style.opacity = "1";
          (li as HTMLElement).style.transform = "translateY(0)";
          const span = li.querySelector(".liText") as HTMLElement;
          const text = li.getAttribute("data-text") || "";
          if (span) {
            if (prefersReduced) { span.textContent = text; continue; }
            span.textContent = "";
            for (let i = 1; i <= text.length; i++) {
              span.textContent = text.slice(0, i);
              await sleep(40);
            }
          }
        }
      },
      { threshold: 0.25 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
}

// ── Sub-components ──
const PreparedByTooltip = ({ audit, avatarUrl }: { audit: Audit; avatarUrl?: string | null }) => (
  <InfoTip label={audit.prepared_by_name || "—"}>
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      {avatarUrl && (
        <img src={avatarUrl} alt={audit.prepared_by_name || "Headshot"} style={{ width: 70, height: 70, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: "2px solid rgba(255,255,255,.15)" }} />
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <span className="repVal" style={{ fontSize: 15 }}>{audit.prepared_by_name || "—"}</span>
        <span style={{ fontSize: 14, opacity: 0.85 }}>{audit.prepared_by_email || "—"}</span>
        <span style={{ fontSize: 14, opacity: 0.85 }}>{audit.prepared_by_phone ? formatPhone(audit.prepared_by_phone) : "—"}</span>
      </div>
    </div>
  </InfoTip>
);

const MetricGradeBox = ({ grade, pending }: { grade: string; pending?: boolean }) => {
  const ref = useRef<HTMLParagraphElement>(null);
  useMatrixGrade(ref, pending ? "—" : grade);
  return (
    <div className="gradeBox">
      <div className={`bgGlow ${pending ? "" : glowClass(grade)}`} />
      <p className="letter" data-grade={pending ? undefined : grade} ref={ref}>&nbsp;</p>
    </div>
  );
};

const MetricNumber = ({ value, suffix, decimals = 0 }: { value: number; suffix: string; decimals?: number }) => {
  const ref = useRef<HTMLParagraphElement>(null);
  useCountUp(ref, value, 1200, decimals);
  return (
    <div className="metricNumWrap">
      <p className="metricNum" ref={ref}>0</p>
      <p className="metricSuffix">{suffix}</p>
    </div>
  );
};

const SectionHeading = ({ text, className = "" }: { text: string; className?: string }) => {
  const ref = useRef<HTMLHeadingElement>(null);
  useTypewriter(ref, text, 45);
  return <h2 className={`sectionTitle caps ${className}`} ref={ref}>&nbsp;</h2>;
};

// ── Main ──
const AuditReport = () => {
  const { id, param } = useParams<{ id?: string; param?: string }>();
  const auditId = id || param;
  const [audit, setAudit] = useState<Audit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [logoError, setLogoError] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [schedulerUrl, setSchedulerUrl] = useState<string | null>(null);
  const [preparedByAvatarUrl, setPreparedByAvatarUrl] = useState<string | null>(null);

  const [refreshingScreenshot, setRefreshingScreenshot] = useState(false);

  const summaryListRef = useRef<HTMLUListElement>(null);
  const heroHeadingRef = useRef<HTMLSpanElement>(null);
  const overallGradeRef = useRef<HTMLParagraphElement>(null);

  useBulletAnimation(summaryListRef);

  const refreshScreenshot = useCallback(async () => {
    if (!auditId) return;
    setRefreshingScreenshot(true);
    try {
      const { data, error } = await supabase.functions.invoke("capture-website-screenshot", {
        body: { audit_id: auditId },
      });
      if (error) throw error;
      if (data?.website_screenshot_url && audit) {
        setAudit({ ...audit, website_screenshot_url: data.website_screenshot_url } as Audit);
        toast.success("Screenshot refreshed");
      }
    } catch {
      toast.error("Failed to refresh screenshot");
    }
    setRefreshingScreenshot(false);
  }, [auditId, audit]);

  const { user, loading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const isCalibrating = searchParams.get("calibrate") === "1" && !!user;

  useEffect(() => {
    if (!auditId || authLoading) return;
    (async () => {
      const { data, error } = await supabase.from("audit").select("*").eq("id", auditId).maybeSingle();
      if (error) setError(error.message);
      else {
        setAudit(data as Audit);
        // Load creator's scheduler URL
        const creatorId = (data as Audit)?.created_by;
        if (creatorId) {
          const { data: profileData } = await supabase
            .from("profiles")
            .select("scheduler_url, avatar_url")
            .eq("id", creatorId)
            .single();
          if (profileData?.scheduler_url) {
            setSchedulerUrl(profileData.scheduler_url);
          }
          if ((profileData as any)?.avatar_url) {
            setPreparedByAvatarUrl((profileData as any).avatar_url);
          }
        }
      }
      // Fetch share token
      const { data: shareData } = await supabase
        .from("audit_shares")
        .select("share_token, slug, short_token")
        .eq("audit_id", auditId)
        .eq("is_active", true)
        .limit(1);
      if (shareData?.[0]) setShareToken(shareData[0].share_token);
      if (shareData?.[0]) setShareToken(shareData[0].share_token);
      setLoading(false);
    })();
  }, [auditId, authLoading]);

  // ── PSI polling: auto-refresh when fetching ──
  useEffect(() => {
    if (!audit || !auditId) return;
    const status = (audit as any).psi_status;
    if (status !== 'fetching') return;

    const startTime = Date.now();
    const TIMEOUT = 45_000;
    const INTERVAL = 2_000;

    const timer = setInterval(async () => {
      if (Date.now() - startTime > TIMEOUT) {
        clearInterval(timer);
        setAudit(prev => prev ? { ...prev, psi_status: 'error', psi_last_error: 'Timed out waiting for PSI results. Try Retry PSI.' } as Audit : prev);
        return;
      }
      const { data } = await supabase.from("audit").select("psi_mobile_score, psi_status, psi_last_error, psi_grade, psi_fetched_at, overall_score, overall_grade").eq("id", auditId).maybeSingle();
      if (data && (data.psi_status === 'success' || data.psi_status === 'error')) {
        clearInterval(timer);
        setAudit(prev => prev ? { ...prev, ...data } as Audit : prev);
      }
    }, INTERVAL);

    return () => clearInterval(timer);
  }, [audit?.psi_mobile_score, (audit as any)?.psi_status, auditId]);

  // ── WAVE polling: auto-refresh when fetching ──
  useEffect(() => {
    if (!audit || !auditId) return;
    const status = (audit as any).wave_status;
    if (status !== 'fetching') return;

    const startTime = Date.now();
    const TIMEOUT = 45_000;
    const INTERVAL = 2_000;

    const timer = setInterval(async () => {
      if (Date.now() - startTime > TIMEOUT) {
        clearInterval(timer);
        setAudit(prev => prev ? { ...prev, wave_status: 'error', wave_last_error: 'Timed out waiting for WAVE results. Try Retry.' } as Audit : prev);
        return;
      }
      const { data } = await supabase.from("audit").select("accessibility_score, accessibility_grade, accessibility_audit_url, wave_status, wave_last_error, wave_fetched_at, legal_risk_flag, overall_score, overall_grade").eq("id", auditId).maybeSingle();
      if (data && ((data as any).wave_status === 'success' || (data as any).wave_status === 'error')) {
        clearInterval(timer);
        setAudit(prev => prev ? { ...prev, ...data } as Audit : prev);
      }
    }, INTERVAL);

    return () => clearInterval(timer);
  }, [audit?.accessibility_score, (audit as any)?.wave_status, auditId]);

  // Hero company name typewriter
  useEffect(() => {
    if (!audit || !heroHeadingRef.current) return;
    const el = heroHeadingRef.current;
    const text = (audit.company_name || "—").toUpperCase();
    if (prefersReduced) { el.textContent = text; return; }
    el.textContent = "";
    let i = 0;
    const interval = setInterval(() => {
      i++;
      el.textContent = text.slice(0, i);
      if (i >= text.length) clearInterval(interval);
    }, 50);
    return () => clearInterval(interval);
  }, [audit]);

  // Overall grade matrix
  const psiPendingEarly = !audit?.psi_mobile_score && (audit as any)?.psi_status !== 'success';
  const wavePendingEarly = audit?.accessibility_score == null && (audit as any)?.wave_status !== 'success';
  const overallGradeForMatrix = (psiPendingEarly || wavePendingEarly) ? "—" : (audit?.overall_grade || "F");
  useMatrixGrade(overallGradeRef, overallGradeForMatrix);

  const copyShareBtn = shareToken ? (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5"
      onClick={() => {
        navigator.clipboard.writeText(`${window.location.origin}/shared/audit/${shareToken}`);
        toast.success("Share link copied");
      }}
    >
      <Copy size={13} /> Copy Share Link
    </Button>
  ) : null;

  if (loading)
    return (
      <AppLayout>
        <div style={{ display: "flex", minHeight: "60vh", alignItems: "center", justifyContent: "center", color: "#666" }}>
          Loading…
        </div>
      </AppLayout>
    );
  if (error || !audit)
    return (
      <AppLayout>
        <div style={{ display: "flex", minHeight: "60vh", alignItems: "center", justifyContent: "center", color: "#dc2626" }}>
          {error || "Audit not found"}
        </div>
      </AppLayout>
    );

   const psiPending = !audit.psi_mobile_score && (audit as any).psi_status !== 'success';
   const wavePending = audit.accessibility_score == null && (audit as any).wave_status !== 'success';
   const overallPending = psiPending || wavePending;
   const og = overallPending ? "—" : (audit.overall_grade || "F");
  const normalizedLogo = normalizeLogoUrl(audit.company_logo_url, audit.website_url);

  return (
    <AppLayout navActions={copyShareBtn}>
    <div className="audit-page">
      {/* ===== HERO ===== */}
      <section className="hero">
        <div className="wrap">
          <div className="heroTop">
            <h1 className="heroTitle caps">
              <span className="heroTitleSub" ref={heroHeadingRef}>&nbsp;</span>
              <span className="heroHeading">WEBSITE &amp; ONLINE PRESENCE AUDIT</span>
            </h1>
            <div className="heroBadges">
              <span className="heroBadge" style={{ textTransform: "none", fontWeight: 400 }}>
                Prepared: {formatDate(audit.prepared_date)}
              </span>
              <span className="heroBadge" style={{ textTransform: "none", fontWeight: 400 }}>
                Prepared By:{" "}
                <PreparedByTooltip audit={audit} avatarUrl={preparedByAvatarUrl} />
              </span>
            </div>
          </div>

          <div className="gradeMetaRow">
            <div>
              <div className="scoreLabel">{overallPending ? "Calculating…" : "Overall Score"}</div>
              {overallPending ? (
                <div className="gradeStack">
                  <div className="gradeLetter" style={{ position: "relative", opacity: 0.4 }}>
                    <span style={{ position: "relative", zIndex: 2, fontSize: "1.2rem" }}>—</span>
                  </div>
                </div>
              ) : (
                <div className="gradeStack">
                  <div className="gradeLetter" data-grade={og} style={{ position: "relative" }}>
                    <span className={`gradeGlow ${glowClass(og)}`} />
                    <span ref={overallGradeRef} style={{ position: "relative", zIndex: 2 }}>{og}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="metaCard">
              <div className="metaInner">
                <div className="metaRow">
                  <div className="metaGrid">
                    <div><div className="metaLabel">Prepared For</div><div>{audit.company_name || "—"}</div></div>
                    <div><div className="metaLabel">Provider</div><div>{audit.provider || "—"}</div></div>
                    <div><div className="metaLabel">Website</div><div>{audit.website_url || "—"}</div></div>
                    <div><div className="metaLabel">Location</div><div>{audit.location_city || "—"}, {audit.location_state || "—"}</div></div>
                  </div>
                  <div className="logoBox">
                    {normalizedLogo && !logoError ? (
                      <img
                        src={normalizedLogo}
                        alt={`${audit.company_name} logo`}
                        loading="eager"
                        referrerPolicy="no-referrer"
                        onError={() => setLogoError(true)}
                      />
                    ) : (
                      companyInitials(audit.company_name)
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <SectionHeading text="OVERALL SCORE BREAKDOWN" />
          <p className="subtle">
            These metrics represent objective scores and signals that directly influence visibility, trust, reach and more.
            Scores were generated using neutral, reputable auditing platforms like W3C, Google PageSpeed Insights &amp; Accessibility Checker.
          </p>

          <div className="metrics">
            {/* W3C */}
            <div className="metricRow">
              <MetricNumber value={audit.w3c_issue_count ?? 0} suffix="Total #" />
              <div>
                <div className="metricLabel">Website Errors &amp; Warnings</div>
                <p className="metricText">
                  Google doesn't judge your website by how it looks but instead by the quality in which it's built.
                  So when your website is full of errors and warnings… trust declines. And when trust declines,
                  your ability to show up online declines with it.
                </p>
                <div className="alertLine">
                  🚩 Websites full of errors and warnings pay{" "}
                  <InfoTip label="The Bad Website Tax">
                    When a website isn't properly constructed, it drags down everything connected to it.
                    Small businesses end up spending 30–50% more just to get the same results. You pay more
                    to market it. Rankings are harder to earn. Leads cost more. Growth feels slower than it
                    should. That's the tax — higher costs, lower performance, constant uphill battle. Every
                    dollar has to work harder just to overcome what's broken underneath.
                  </InfoTip>
                </div>
                {audit.w3c_audit_url && (
                  <a href={audit.w3c_audit_url} target="_blank" rel="noopener noreferrer" className="pillBtn">
                    View Audit <span>→</span>
                  </a>
                )}
              </div>
              <MetricGradeBox grade={audit.w3c_grade || "F"} />
            </div>

            {/* PSI */}
            <div className="metricRow">
              {(audit as any).psi_status === 'success' && audit.psi_mobile_score != null ? (
                <MetricNumber value={audit.psi_mobile_score} suffix="out of 100" />
              ) : (audit as any).psi_status === 'error' ? (
                <div className="metricNumWrap">
                  <p className="metricNum" style={{ fontSize: "1rem", opacity: 0.7, color: "#ef4444" }}>Failed</p>
                </div>
              ) : (audit as any).psi_status === 'fetching' ? (
                <div className="metricNumWrap">
                  <p className="metricNum" style={{ fontSize: "1rem", opacity: 0.6 }}>Fetching…</p>
                </div>
              ) : audit.psi_mobile_score != null ? (
                <MetricNumber value={audit.psi_mobile_score} suffix="out of 100" />
              ) : (
                <div className="metricNumWrap">
                  <p className="metricNum" style={{ fontSize: "1rem", opacity: 0.6 }}>—</p>
                </div>
              )}
              <div>
                <div className="metricLabel">Mobile Performance Score (Google)</div>
                <p className="metricText">
                  Your mobile performance score directly impacts how your business shows up in search results.
                  When your site is slow or underperforms on mobile, users leave… and Google notices.
                  Over time, this drastically weakens your visibility.
                </p>
                {(audit as any).psi_status === 'success' && (audit as any).psi_fetched_at && (
                  <p style={{ fontSize: "0.7rem", opacity: 0.5, marginBottom: 6 }}>
                    Snapshot (auto-fetched {new Date((audit as any).psi_fetched_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })})
                    <br />
                    <span style={{ fontStyle: "italic" }}>Live PSI may differ slightly from the snapshot due to re-runs/caching.</span>
                  </p>
                )}
                {(audit as any).psi_status === 'error' && (audit as any).psi_last_error && (
                  <p style={{ fontSize: "0.75rem", color: "#ef4444", marginBottom: 8, wordBreak: "break-word" }}>
                    {(audit as any).psi_last_error}
                  </p>
                )}
                {(() => {
                  const psiUrl = audit.psi_audit_url || (audit.website_url ? `https://pagespeed.web.dev/report?url=${encodeURIComponent(audit.website_url)}` : null);
                  return psiUrl ? (
                    <a href={psiUrl} target="_blank" rel="noopener noreferrer" className="pillBtn">
                      View Audit <span>→</span>
                    </a>
                  ) : null;
                })()}
                {(((audit as any).psi_status === 'error') || ((audit as any).psi_status !== 'fetching' && audit.psi_mobile_score == null)) && user && (
                  <button
                    className="pillBtn"
                    style={{ marginLeft: 8, opacity: 0.8 }}
                    onClick={async () => {
                      if (!audit.website_url) return;
                      toast.success("Retrying PSI fetch…");
                      setAudit(prev => prev ? { ...prev, psi_status: 'fetching' } as Audit : prev);
                      try {
                        await supabase.functions.invoke("run-psi-and-update", {
                          body: { audit_id: audit.id, website_url: audit.website_url },
                        });
                      } catch {
                        toast.error("PSI retry failed");
                      }
                    }}
                  >
                    Retry PSI
                  </button>
                )}
              </div>
              <MetricGradeBox grade={audit.psi_grade || "F"} pending={psiPending} />
            </div>

            {/* Accessibility */}
            <div className="metricRow">
              {(audit as any).wave_status === 'success' && audit.accessibility_score != null ? (
                <MetricNumber value={audit.accessibility_score} suffix="out of 10" decimals={1} />
              ) : (audit as any).wave_status === 'error' ? (
                <div className="metricNumWrap">
                  <p className="metricNum" style={{ fontSize: "1rem", opacity: 0.7, color: "#ef4444" }}>Failed</p>
                </div>
              ) : (audit as any).wave_status === 'fetching' ? (
                <div className="metricNumWrap">
                  <p className="metricNum" style={{ fontSize: "1rem", opacity: 0.6 }}>Fetching…</p>
                </div>
              ) : audit.accessibility_score != null ? (
                <MetricNumber value={audit.accessibility_score} suffix="out of 10" decimals={1} />
              ) : (
                <div className="metricNumWrap">
                  <p className="metricNum" style={{ fontSize: "1rem", opacity: 0.6 }}>—</p>
                </div>
              )}
              <div>
                <div className="metricLabel">Accessibility Score</div>
                <p className="metricText">
                  Modern standards require websites to be usable by everyone. When your site doesn't meet those standards,
                  it limits access, increases legal exposure, and weakens overall performance.
                </p>
                {(audit as any).wave_status === 'success' && (audit as any).wave_fetched_at && (
                  <p style={{ fontSize: "0.7rem", opacity: 0.5, marginBottom: 6 }}>
                    Snapshot (auto-fetched {new Date((audit as any).wave_fetched_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })})
                    <br />
                    <span style={{ fontStyle: "italic" }}>Live results may differ slightly from the snapshot.</span>
                  </p>
                )}
                {(audit as any).wave_status === 'error' && (audit as any).wave_last_error && (
                  <p style={{ fontSize: "0.75rem", color: "#ef4444", marginBottom: 8, wordBreak: "break-word" }}>
                    {(audit as any).wave_last_error}
                  </p>
                )}
                <div className="alertLine">
                  🚩 Websites with a score under 9 are at high risk of accessibility lawsuits.
                </div>
                {(audit.accessibility_score != null && audit.accessibility_score < 9) && (
                  <div className="alertLine">
                    🚩 Website is NOT compliant under{" "}
                    <InfoTip label="United States Law" className="lawTip">
                      Every website that operates in the United States must comply with the ADA &amp; Section 508
                      accessibility legislations, or else is subject to fines and accessibility-related lawsuits.
                      A high score does not guarantee compliance; manual testing is required.
                    </InfoTip>
                  </div>
                )}
                {audit.accessibility_audit_url && (
                  <a href={audit.accessibility_audit_url} target="_blank" rel="noopener noreferrer" className="pillBtn">
                    View Audit <span>→</span>
                  </a>
                )}
                {(((audit as any).wave_status === 'error') || ((audit as any).wave_status !== 'fetching' && audit.accessibility_score == null)) && user && (
                  <button
                    className="pillBtn"
                    style={{ marginLeft: 8, opacity: 0.8 }}
                    onClick={async () => {
                      if (!audit.website_url) return;
                      toast.success("Retrying accessibility fetch…");
                      setAudit(prev => prev ? { ...prev, wave_status: 'fetching' } as Audit : prev);
                      try {
                        await supabase.functions.invoke("run-wave", {
                          body: { audit_id: audit.id, website_url: audit.website_url },
                        });
                      } catch {
                        toast.error("Accessibility retry failed");
                      }
                    }}
                  >
                    Retry Accessibility
                  </button>
                )}
              </div>
              <MetricGradeBox grade={audit.accessibility_grade || "F"} pending={wavePending} />
            </div>

            {/* Design */}
            <div className="metricRow">
              <MetricNumber value={audit.design_score ?? 0} suffix="out of 100" />
              <div>
                <div className="metricLabel">Design &amp; Visual Score</div>
                <p className="metricText">
                  Your website design shapes first impressions instantly. When it feels generic or outdated,
                  it lowers perceived quality and weakens trust. And when trust is weak, visitors hesitate —
                  reducing engagement and conversions.
                </p>
                <button type="button" className="pillBtn" style={{ marginTop: 12 }}>Key Findings ↓</button>
                <ul className="xList" ref={summaryListRef}>
                  {DESIGN_BULLETS.map((b, i) => (
                    <li key={i} data-text={b} style={{ transition: "opacity .3s, transform .3s" }}>
                      <span className="xIcon">❌</span>
                      <span className="liText">{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <MetricGradeBox grade={audit.design_grade || "F"} />
            </div>
          </div>
        </div>
      </section>

      {/* ===== UNDER THE HOOD ===== */}
      <section className="overview">
        <div className="wrap">
          <div className="overviewGrid">
            <div className="story">
              <SectionHeading text="UNDER THE HOOD" />
              <p>
                {audit.company_name || "This company"} appears to be a well-established, reputable and trustworthy
                business with real credibility in the marketplace. However, the website, online presence, and overall
                digital reputation do not reflect that same level of strength.
              </p>
              <p>
                The drag-and-drop builder ({audit.provider || "platform"}) currently powering the website introduces
                major structural deficiencies under the hood. While the site may look functional, the code of the
                website is creating major problems with visibility and performance.
              </p>
              <p>
                <strong>In Plain English:</strong> The website you are currently paying for is likely limiting your
                online reach, making it harder for potential customers, referrals, and word-of-mouth traffic to
                consistently find you.
              </p>
            </div>
            <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ComputerScreenshot screenshotUrl={(audit as any).website_screenshot_url} calibrate={isCalibrating} />
            </div>
          </div>
        </div>
      </section>

      {/* ===== ONLINE PRESENCE ISSUES ===== */}
      <section>
        <div className="wrap">
          <div className="presenceGrid">
            <div className="presenceImgCol">
              <img src={DEFAULT_SCAN_IMAGE} alt="Presence scan" />
            </div>
            <div className="presenceTextCol">
              <SectionHeading text="ONLINE PRESENCE ISSUES" />
              <p className="subtle" style={{ textAlign: "right", marginLeft: "auto" }}>
                We also ran a comprehensive scan of your business across the internet and found a large list of issues
                across multiple platforms. To build trust, rank and get found, your entire digital presence must be
                structured, aligned, and optimized.
              </p>
              <div className="scannedBusinessInfo">
                <div className="scanField">
                  <span className="scanLabel">Business Name</span>
                  <span className="scanValue">{audit.company_name ?? "—"}</span>
                </div>
                <div className="scanField">
                  <span className="scanLabel">City, State</span>
                  <span className="scanValue">{`${audit.location_city ?? "—"}, ${audit.location_state ?? "—"}`}</span>
                </div>
                <div className="scanField">
                  <span className="scanLabel">Phone Number</span>
                  <span className="scanValue">{audit.business_phone ? formatPhone(audit.business_phone) : "—"}</span>
                </div>
                <div className="scanField">
                  <span className="scanLabel">Website Address</span>
                  <span className="scanValue">
                    {audit.website_url
                      ? audit.website_url.replace(/^https?:\/\//, "").replace(/\/$/, "")
                      : "—"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="cta">
        <div className="wrap">
          <div className="ctaBox">
            <h2 className="ctaTitle caps">Want More Details?</h2>
            <p className="ctaText">
              A brief call will allow us to walk through these findings in greater detail, show you exactly what
              we're seeing, and answer any questions.
            </p>
            {schedulerUrl ? (
              <a href={schedulerUrl} target="_blank" rel="noopener noreferrer" className="btn">
                Schedule a Call <span>→</span>
              </a>
            ) : (
              <span className="btn" style={{ animation: "none", cursor: "default", opacity: 0.5 }} title="Scheduling link not set">
                Schedule a Call <span>→</span>
              </span>
            )}
            <p className="ctaAlt">
              You can also Call / Text / Email{" "}
              <PreparedByTooltip audit={audit} avatarUrl={preparedByAvatarUrl} />.
            </p>
          </div>
        </div>
      </section>
    </div>
    </AppLayout>
  );
};

export default AuditReport;
