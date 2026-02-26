import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import ComputerScreenshot from "@/components/ComputerScreenshot";
import InfoTip from "@/components/InfoTip";
import "./AuditReport.css";
import { formatPhone } from "@/lib/formatPhone";
import { getUnderTheHoodCopy } from "@/lib/underTheHoodCopy";

type Audit = Tables<"audit"> & { business_phone?: string | null };

// Reuse helpers from AuditReport (duplicated to keep files independent)
const DEFAULT_UTH_IMAGE = "/images/under-the-hood.png";
const DEFAULT_SCAN_IMAGE = "/images/presence-scan.png";

const glowClass = (grade: string | null) => {
  switch (grade) { case "A": return "a"; case "B": return "b"; case "C": return "c"; case "D": return "d"; default: return "f"; }
};
const companyInitials = (name: string | null) => {
  if (!name) return "—";
  return name.split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 4);
};
const normalizeLogoUrl = (logoUrl: string | null, websiteUrl: string | null): string | null => {
  if (!logoUrl) return null;
  let url = logoUrl.trim();
  if (!url) return null;
  if (url.startsWith("/") && !url.startsWith("//")) {
    if (websiteUrl) {
      try { const origin = new URL(websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`).origin; return `${origin}${url}`; } catch { return null; }
    }
    return null;
  }
  if (url.startsWith("//")) return `https:${url}`;
  if (!url.startsWith("http")) return `https://${url}`;
  return url;
};
const formatDate = (dateStr: string | null) => {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const DESIGN_BULLETS = [
  "Generic template-based design detected.",
  "Design closely resembles other mass-produced local business sites.",
  "Top-of-page section lacks strong trust signals.",
  "Stock imagery and generic content detected.",
  "Visual hierarchy and layout do not establish authority or credibility.",
  "Website presentation does not reflect the quality of the company's actual work.",
];

const MATRIX = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&";
const randChar = () => MATRIX[(Math.random() * MATRIX.length) | 0];
const prefersReduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;


// Simple count-up animation (no hidden text issues)
function useCountUp(ref: React.RefObject<HTMLElement | null>, target: number, duration = 1200, decimals = 0) {
  const done = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || done.current) return;
    done.current = true;
    if (prefersReduced) { el.textContent = target.toFixed(decimals); return; }
    const start = performance.now();
    const tick = (t: number) => { const p = Math.min((t - start) / duration, 1); el.textContent = (p * target).toFixed(decimals); if (p < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }, [target, duration, decimals]);
}

function useMatrixGrade(ref: React.RefObject<HTMLElement | null>, finalChar: string, duration = 900) {
  const done = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || done.current) return;
    done.current = true;
    if (prefersReduced) { el.textContent = finalChar; return; }
    const start = performance.now();
    const tick = (t: number) => { if (t - start < duration) { el.textContent = randChar(); requestAnimationFrame(tick); } else { el.textContent = finalChar; } };
    requestAnimationFrame(tick);
  }, [finalChar, duration]);
}

// Sub-components
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
      <div className={`bgGlow ${glowClass(grade)}`} />
      <p className="letter" data-grade={grade} ref={ref}>&nbsp;</p>
    </div>
  );
};

const MetricNumber = ({ value, suffix, decimals = 0, showPlus = false }: { value: number; suffix: string; decimals?: number; showPlus?: boolean }) => {
  const ref = useRef<HTMLParagraphElement>(null);
  useCountUp(ref, value, 1200, decimals);
  return (
    <div className="metricNumWrap">
      <p className="metricNum"><span ref={ref}>0</span>{showPlus && '+'}</p>
      <p className="metricSuffix">{suffix}</p>
    </div>
  );
};

const SectionHeading = ({ text, className = "" }: { text: string; className?: string }) => {
  return <h2 className={`sectionTitle caps ${className}`}>{text}</h2>;
};

// Main shared component
interface SharedAuditReportProps {
  tokenOverride?: string;
  onSlugCheck?: (correctSlug: string) => void;
}

const SharedAuditReport = ({ tokenOverride, onSlugCheck }: SharedAuditReportProps = {}) => {
  const params = useParams<{ token: string }>();
  const resolvedToken = tokenOverride || params.token;
  const [audit, setAudit] = useState<Audit | null>(null);
  const [schedulerUrl, setSchedulerUrl] = useState<string | null>(null);
  const [preparedByAvatarUrl, setPreparedByAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [logoError, setLogoError] = useState(false);
  const tracked = useRef(false);

  
  const heroHeadingRef = useRef<HTMLSpanElement>(null);
  const overallGradeRef = useRef<HTMLParagraphElement>(null);

  

  useEffect(() => {
    if (!resolvedToken || tracked.current) return;
    tracked.current = true;

    (async () => {
      try {
        const res = await supabase.functions.invoke("track-share-view", {
          body: { token: resolvedToken },
        });

        if (res.error || res.data?.error) {
          setError("This link is no longer available.");
          setLoading(false);
          return;
        }

        const auditData = res.data.audit as Audit;
        setAudit(auditData);

        if (res.data.scheduler_url) {
          setSchedulerUrl(res.data.scheduler_url);
        }
        if (res.data.prepared_by_avatar_url) {
          setPreparedByAvatarUrl(res.data.prepared_by_avatar_url);
        }

        // Canonical slug redirect for clean URLs
        if (onSlugCheck && res.data.slug) {
          onSlugCheck(res.data.slug);
        }
      } catch {
        setError("This link is no longer available.");
      }
      setLoading(false);
    })();
  }, [resolvedToken]);

  // Set hero company name directly (no typewriter to avoid missing text)
  useEffect(() => {
    if (!audit || !heroHeadingRef.current) return;
    heroHeadingRef.current.textContent = (audit.company_name || "—").toUpperCase();
  }, [audit]);

  useMatrixGrade(overallGradeRef, audit?.overall_grade || "F");

  if (loading)
    return (
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", color: "#666" }}>
        Loading…
      </div>
    );
  if (error || !audit)
    return (
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", color: "#dc2626", flexDirection: "column", gap: 8 }}>
        <p style={{ fontSize: 18, fontWeight: 700 }}>{error || "This link is no longer available."}</p>
      </div>
    );

  const og = audit.overall_grade || "F";
  const normalizedLogo = normalizeLogoUrl(audit.company_logo_url, audit.website_url);

  return (
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
                Prepared By: <PreparedByTooltip audit={audit} avatarUrl={preparedByAvatarUrl} />
              </span>
            </div>
          </div>
          <div className="gradeMetaRow">
            <div>
              <div className="scoreLabel">Overall Score</div>
              <div className="gradeStack">
                <div className="gradeLetter" data-grade={og} style={{ position: "relative" }}>
                  <span className={`gradeGlow ${glowClass(og)}`} />
                  <span ref={overallGradeRef} style={{ position: "relative", zIndex: 2 }}>{og}</span>
                </div>
              </div>
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
                      <img src={normalizedLogo} alt={`${audit.company_name} logo`} loading="eager" referrerPolicy="no-referrer" onError={() => setLogoError(true)} />
                    ) : companyInitials(audit.company_name)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== OVERALL SCORE BREAKDOWN ===== */}
      <section>
        <div className="wrap">
          <SectionHeading text="OVERALL SCORE BREAKDOWN" />
          <p className="subtle">
            These metrics represent objective scores and signals that directly influence visibility, trust, reach and more.
            Scores were generated using neutral, reputable auditing platforms like <a href="https://www.w3.org/" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>W3C</a>, <a href="https://pagespeed.web.dev/" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>Google PageSpeed Insights</a> &amp; <a href="https://wave.webaim.org/" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>WebAIM</a>.
          </p>
          <div className="metrics">
            <div className="metricRow">
              {(audit as any).w3c_status === 'fetching' ? (
                <div className="metricNumWrap">
                  <p className="metricNum" style={{ fontSize: "1rem", opacity: 0.6 }}>Fetching…</p>
                </div>
              ) : audit.w3c_issue_count != null ? (
                <MetricNumber value={audit.w3c_issue_count} suffix="Total #" showPlus={(audit.w3c_issue_count ?? 0) >= 50} />
              ) : (
                <div className="metricNumWrap">
                  <p className="metricNum" style={{ fontSize: "1rem", opacity: 0.6 }}>—</p>
                </div>
              )}
              <div>
                <div className="metricLabel">Website Errors &amp; Warnings</div>
                <p className="metricText">
                  Google doesn't judge your website by how it looks but instead by the quality in which it's built.
                  So when your website is full of errors and warnings… trust declines. And when trust declines,
                  your ability to show up online declines with it.
                </p>
                {audit.w3c_issue_count != null && (
                  (audit.w3c_issue_count < 50) ? (
                    <div className="alertLine success">
                      🎉 Congratulations! Your website is extremely well coded!
                    </div>
                  ) : (
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
                  )
                )}
                {audit.w3c_audit_url && (
                  <a href={audit.w3c_audit_url} target="_blank" rel="noopener noreferrer" className="pillBtn">View Audit <span>→</span></a>
                )}
              </div>
              {(() => {
                const w3cPending = (audit as any).w3c_status === 'fetching' || (audit.w3c_issue_count == null && (audit as any).w3c_status !== 'success');
                return <MetricGradeBox grade={audit.w3c_grade || "F"} pending={w3cPending} />;
              })()}
            </div>
            <div className="metricRow">
              <MetricNumber value={audit.psi_mobile_score ?? 0} suffix="out of 100" />
              <div>
                <div className="metricLabel">Mobile Performance Score (Google)</div>
                <p className="metricText">
                  Your mobile performance score directly impacts how your business shows up in search results.
                  When your site is slow or underperforms on mobile, users leave… and Google notices.
                  Over time, this drastically weakens your visibility.
                </p>
                {audit.psi_audit_url && (
                  <a href={audit.psi_audit_url} target="_blank" rel="noopener noreferrer" className="pillBtn">View Audit <span>→</span></a>
                )}
              </div>
              <MetricGradeBox grade={audit.psi_grade || "F"} />
            </div>
            <div className="metricRow">
              <MetricNumber value={audit.accessibility_score ?? 0} suffix="out of 10" decimals={1} />
              <div>
                <div className="metricLabel">Accessibility Score</div>
                <p className="metricText">
                  Modern standards require websites to be usable by everyone. When your site doesn't meet those standards,
                  it limits access, increases legal exposure, and weakens overall performance.
                </p>
                {(audit.accessibility_score != null && audit.accessibility_score >= 9) ? (
                  <>
                    <div className="alertLine success">
                      🎉 Congratulations! Your website meets modern accessibility standards.
                    </div>
                    <p style={{ fontSize: "0.75rem", fontStyle: "italic", opacity: 0.7, marginTop: 6 }}>
                      Disclaimer: This score is based on automated testing. While it reflects strong accessibility alignment, full legal compliance requires additional manual review and testing.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="alertLine">
                      🚩 Websites with a score under 9 are at high risk of accessibility lawsuits.
                    </div>
                    {(audit.accessibility_score != null && audit.accessibility_score < 9) && (
                      <div className="alertLine">
                        🚩 Website is NOT compliant under{" "}
                        <InfoTip label="United States Law" className="lawTip">
                          Every website that operates in the United States must comply with the ADA &amp; Section 508
                          accessibility legislations, or else is subject to fines and accessibility-related lawsuits.
                        </InfoTip>
                      </div>
                    )}
                  </>
                )}
                {audit.accessibility_audit_url && (
                  <a href={audit.accessibility_audit_url} target="_blank" rel="noopener noreferrer" className="pillBtn">View Audit <span>→</span></a>
                )}
              </div>
              <MetricGradeBox grade={audit.accessibility_grade || "F"} />
            </div>
            {/* Design - hidden for "Other" provider */}
            {audit.provider !== "Other" && (
            <div className="metricRow">
              <MetricNumber value={audit.design_score ?? 0} suffix="out of 100" />
              <div>
                <div className="metricLabel">Design &amp; Visual Score</div>
                <p className="metricText">
                  Your website sets the first impression of your company. If it looks outdated, generic, or low quality, people assume your work is too. When trust drops, revenue follows.
                </p>
                <button type="button" className="pillBtn" style={{ marginTop: 12 }}>Key Findings ↓</button>
                <ul className="xList">
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
            )}
          </div>
        </div>
      </section>

      {/* ===== UNDER THE HOOD ===== */}
      <section className="overview">
        <div className="wrap">
          <div className="overviewGrid">
            <div className="story">
              <SectionHeading text="UNDER THE HOOD" />
              {(() => {
                const uth = getUnderTheHoodCopy(audit.company_name, audit.provider, audit.overall_grade);
                return (
                  <>
                    {uth.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
                    <p><strong>In Plain English:</strong> {uth.plainEnglish}</p>
                  </>
                );
              })()}
            </div>
            <div className="card">
              <ComputerScreenshot screenshotUrl={(audit as any).website_screenshot_url} />
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
                {audit.provider === "Other"
                  ? "Is your overall online presence congruent, cohesive & consistent? Let us run a comprehensive scan of your business across the internet and we can find out! To build trust, rank and get found, your entire digital presence must be structured, aligned, and optimized."
                  : "We also ran a comprehensive scan of your business across the internet and found a large list of issues across multiple platforms. To build trust, rank and get found, your entire digital presence must be structured, aligned, and optimized."}
              </p>
              <div className="scannedBusinessInfo">
                <div className="scanField"><span className="scanLabel">Business Name</span><span className="scanValue">{audit.company_name ?? "—"}</span></div>
                <div className="scanField"><span className="scanLabel">City, State</span><span className="scanValue">{`${audit.location_city ?? "—"}, ${audit.location_state ?? "—"}`}</span></div>
                <div className="scanField"><span className="scanLabel">Phone Number</span><span className="scanValue">{audit.business_phone ? formatPhone(audit.business_phone) : "—"}</span></div>
                <div className="scanField"><span className="scanLabel">Website Address</span><span className="scanValue">{audit.website_url ? audit.website_url.replace(/^https?:\/\//, "").replace(/\/$/, "") : "—"}</span></div>
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
              You can also Call / Text / Email <PreparedByTooltip audit={audit} avatarUrl={preparedByAvatarUrl} />.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default SharedAuditReport;
