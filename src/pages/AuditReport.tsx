import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import "./AuditReport.css";

type Audit = Tables<"audit">;

const DEFAULT_UTH_IMAGE = "/images/under-the-hood.png";
const DEFAULT_SCAN_IMAGE = "/images/presence-scan.png";

const DESIGN_BULLETS = [
  "Does not reflect the quality of the actual work you do.",
  "Looks generic. Feels generic.",
  "Makes the company look small and below average.",
  "Weak first impression.",
  "Current site uses same template as restaurants, daycares, and funeral homes.",
  "Does not build immediate trust.",
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

function useCountUp(ref: React.RefObject<HTMLElement | null>, target: number, duration = 1200) {
  const done = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || done.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || done.current) return;
        done.current = true;
        io.disconnect();
        if (prefersReduced) { el.textContent = String(target); return; }
        const start = performance.now();
        const tick = (t: number) => {
          const p = Math.min((t - start) / duration, 1);
          el.textContent = String(Math.round(p * target));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.5 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [target, duration]);
}

function useMatrixGrade(ref: React.RefObject<HTMLElement | null>, finalChar: string, duration = 900) {
  const done = useRef(false);
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
const PreparedByTooltip = ({ audit }: { audit: Audit }) => (
  <span className="tipHost tipTopRight">
    {audit.prepared_by_name || "—"}
    <span className="tip tooltipBox">
      <div className="repLine"><span className="repLabel">Name</span><span className="repVal">{audit.prepared_by_name || "—"}</span></div>
      <div className="repLine"><span className="repLabel">Email</span><span className="repVal">{audit.prepared_by_email || "—"}</span></div>
      <div className="repLine"><span className="repLabel">Phone</span><span className="repVal">{audit.prepared_by_phone || "—"}</span></div>
    </span>
  </span>
);

const MetricGradeBox = ({ grade }: { grade: string }) => {
  const ref = useRef<HTMLParagraphElement>(null);
  useMatrixGrade(ref, grade);
  return (
    <div className="gradeBox">
      <div className={`bgGlow ${glowClass(grade)}`} />
      <p className="letter" data-grade={grade} ref={ref}>&nbsp;</p>
    </div>
  );
};

const MetricNumber = ({ value, suffix }: { value: number; suffix: string }) => {
  const ref = useRef<HTMLParagraphElement>(null);
  useCountUp(ref, value);
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
  const { id } = useParams<{ id: string }>();
  const [audit, setAudit] = useState<Audit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [logoError, setLogoError] = useState(false);

  const summaryListRef = useRef<HTMLUListElement>(null);
  const heroHeadingRef = useRef<HTMLSpanElement>(null);
  const overallGradeRef = useRef<HTMLParagraphElement>(null);

  useBulletAnimation(summaryListRef);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data, error } = await supabase.from("audit").select("*").eq("id", id).single();
      if (error) setError(error.message);
      else setAudit(data as Audit);
      setLoading(false);
    })();
  }, [id]);

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
  useMatrixGrade(overallGradeRef, audit?.overall_grade || "F");

  if (loading)
    return (
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", color: "#666" }}>
        Loading…
      </div>
    );
  if (error || !audit)
    return (
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", color: "#dc2626" }}>
        {error || "Audit not found"}
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
                Prepared By:{" "}
                <PreparedByTooltip audit={audit} />
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

      {/* ===== OVERALL SCORE BREAKDOWN ===== */}
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
                  <span className="tipHost tipTopRight">
                    The Bad Website Tax
                    <span className="tip tooltipBox">
                      When a website isn't properly constructed, it drags down everything connected to it.
                      Small businesses end up spending 30–50% more just to get the same results. You pay more
                      to market it. Rankings are harder to earn. Leads cost more. Growth feels slower than it
                      should. That's the tax — higher costs, lower performance, constant uphill battle. Every
                      dollar has to work harder just to overcome what's broken underneath.
                    </span>
                  </span>
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
              <MetricNumber value={audit.psi_mobile_score ?? 0} suffix="out of 100" />
              <div>
                <div className="metricLabel">Mobile Performance Score (Google)</div>
                <p className="metricText">
                  Your mobile performance score directly impacts how your business shows up in search results.
                  When your site is slow or underperforms on mobile, users leave… and Google notices.
                  Over time, this drastically weakens your visibility.
                </p>
                {audit.psi_audit_url && (
                  <a href={audit.psi_audit_url} target="_blank" rel="noopener noreferrer" className="pillBtn">
                    View Audit <span>→</span>
                  </a>
                )}
              </div>
              <MetricGradeBox grade={audit.psi_grade || "F"} />
            </div>

            {/* Accessibility */}
            <div className="metricRow">
              <MetricNumber value={audit.accessibility_score ?? 0} suffix="percent" />
              <div>
                <div className="metricLabel">Accessibility Score</div>
                <p className="metricText">
                  Modern standards require websites to be usable by everyone. When your site doesn't meet those standards,
                  it limits access, increases legal exposure, and weakens overall performance.
                </p>
                {audit.legal_risk_flag && (
                  <div className="alertLine">
                    🚩 Scored under 90 are NOT compliant under{" "}
                    <span className="tipHost tipTopRight lawTip">
                      United States Law
                      <span className="tip tooltipBox">
                        Every website that operates in the United States must comply with the ADA &amp; Section 508
                        accessibility legislations, or else is subject to fines and accessibility-related lawsuits.
                      </span>
                    </span>
                  </div>
                )}
                {audit.accessibility_audit_url && (
                  <a href={audit.accessibility_audit_url} target="_blank" rel="noopener noreferrer" className="pillBtn">
                    View Audit <span>→</span>
                  </a>
                )}
              </div>
              <MetricGradeBox grade={audit.accessibility_grade || "F"} />
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
                <button type="button" className="pillBtn" style={{ marginTop: 12 }}>Summary ↓</button>
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
          <SectionHeading text="UNDER THE HOOD" />
          <div className="overviewGrid">
            <div className="story">
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
            <div className="card">
              <img src={DEFAULT_UTH_IMAGE} alt="Under the hood graphic" />
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
            {audit.scheduler_url ? (
              <a href={audit.scheduler_url} target="_blank" rel="noopener noreferrer" className="btn">
                Schedule a Call <span>→</span>
              </a>
            ) : (
              <span className="btn" style={{ animation: "none", cursor: "default" }}>
                Schedule a Call <span>→</span>
              </span>
            )}
            <p className="ctaAlt">
              You can also Call / Text / Email{" "}
              <PreparedByTooltip audit={audit} />.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default AuditReport;
