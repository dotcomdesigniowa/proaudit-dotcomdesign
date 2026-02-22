import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import "./AuditReport.css";

type Audit = Tables<"audit"> & { scheduler_url?: string | null };

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
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 4);
};

const PreparedByTooltip = ({ audit }: { audit: Audit }) => (
  <span className="tipHost tipTopRight">
    {audit.prepared_by_name || "—"}
    <span className="tip">
      <div className="repLine">
        <span className="repLabel">Name</span>
        <span className="repVal">{audit.prepared_by_name || "—"}</span>
      </div>
      <div className="repLine">
        <span className="repLabel">Email</span>
        <span className="repVal">{audit.prepared_by_email || "—"}</span>
      </div>
      <div className="repLine">
        <span className="repLabel">Phone</span>
        <span className="repVal">{audit.prepared_by_phone || "—"}</span>
      </div>
    </span>
  </span>
);

const AuditReport = () => {
  const { id } = useParams<{ id: string }>();
  const [audit, setAudit] = useState<Audit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data, error } = await supabase.from("audit").select("*").eq("id", id).single();
      if (error) setError(error.message);
      else setAudit(data as Audit);
      setLoading(false);
    })();
  }, [id]);

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
  const schedulerUrl = (audit as any).scheduler_url as string | null;

  return (
    <div className="audit-page">
      {/* ===== HERO ===== */}
      <section className="hero">
        <div className="wrap">
          {/* Top row */}
          <div className="heroTop">
            <h1 className="heroTitle caps">
              <span className="heroTitleSub">{audit.company_name || "—"}</span>
              <span className="heroHeading">WEBSITE &amp; ONLINE PRESENCE AUDIT</span>
            </h1>
            <div className="heroBadges">
              <span className="heroBadge caps">Prepared: {audit.prepared_date || "—"}</span>
              <span className="heroBadge caps">
                Prepared By:{" "}
                <PreparedByTooltip audit={audit} />
              </span>
            </div>
          </div>

          {/* Grade + meta */}
          <div className="gradeMetaRow">
            {/* Grade */}
            <div>
              <div className="scoreLabel">Overall Score</div>
              <div className="gradeStack">
                <p className="gradeLetter" data-grade={og}>
                  <span className={`gradeGlow ${glowClass(og)}`} />
                  {og}
                </p>
              </div>
            </div>

            {/* Meta card */}
            <div className="metaCard">
              <div className="metaInner">
                <div className="metaRow">
                  <div className="metaGrid">
                    <div>
                      <div className="metaLabel">Prepared For</div>
                      <div>{audit.company_name || "—"}</div>
                    </div>
                    <div>
                      <div className="metaLabel">Provider</div>
                      <div>{audit.provider || "—"}</div>
                    </div>
                    <div>
                      <div className="metaLabel">Website</div>
                      <div>{audit.website_url || "—"}</div>
                    </div>
                    <div>
                      <div className="metaLabel">Location</div>
                      <div>
                        {audit.location_city || "—"}, {audit.location_state || "—"}
                      </div>
                    </div>
                  </div>
                  <div className="logoBox">{companyInitials(audit.company_name)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== METRICS ===== */}
      <section>
        <div className="wrap">
          <h2 className="sectionTitle caps">Under the Hood</h2>
          <p className="subtle">
            These metrics represent objective scores and signals that directly influence visibility, trust, reach and more.
            Scores were generated using neutral, reputable auditing platforms like W3C, Google PageSpeed Insights &amp; Accessibility Checker.
          </p>

          <div className="metrics">
            {/* W3C */}
            <div className="metricRow">
              <div className="metricNumWrap">
                <p className="metricNum">{audit.w3c_issue_count ?? 0}</p>
                <p className="metricSuffix">Total #</p>
              </div>
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
                    <span className="tip">
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
              <div className="gradeBox">
                <div className={`bgGlow ${glowClass(audit.w3c_grade)}`} />
                <p className="letter" data-grade={audit.w3c_grade || "F"}>
                  {audit.w3c_grade || "F"}
                </p>
              </div>
            </div>

            {/* PSI */}
            <div className="metricRow">
              <div className="metricNumWrap">
                <p className="metricNum">{audit.psi_mobile_score ?? 0}</p>
                <p className="metricSuffix">out of 100</p>
              </div>
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
              <div className="gradeBox">
                <div className={`bgGlow ${glowClass(audit.psi_grade)}`} />
                <p className="letter" data-grade={audit.psi_grade || "F"}>
                  {audit.psi_grade || "F"}
                </p>
              </div>
            </div>

            {/* Accessibility */}
            <div className="metricRow">
              <div className="metricNumWrap">
                <p className="metricNum">{audit.accessibility_score ?? 0}</p>
                <p className="metricSuffix">percent</p>
              </div>
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
                      <span className="tip">
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
              <div className="gradeBox">
                <div className={`bgGlow ${glowClass(audit.accessibility_grade)}`} />
                <p className="letter" data-grade={audit.accessibility_grade || "F"}>
                  {audit.accessibility_grade || "F"}
                </p>
              </div>
            </div>

            {/* Design */}
            <div className="metricRow">
              <div className="metricNumWrap">
                <p className="metricNum">{audit.design_score ?? 0}</p>
                <p className="metricSuffix">out of 100</p>
              </div>
              <div>
                <div className="metricLabel">Design &amp; Visual Score</div>
                <p className="metricText">
                  Your website design shapes first impressions instantly. When it feels generic or outdated,
                  it lowers perceived quality and weakens trust. And when trust is weak, visitors hesitate —
                  reducing engagement and conversions.
                </p>
                <div className="metricLabel" style={{ marginTop: 12 }}>Summary ↓</div>
                <ul className="xList" id="summaryList">
                  {DESIGN_BULLETS.map((b, i) => (
                    <li key={i} data-text={b}>
                      <span className="xIcon">❌</span>
                      <span className="liText">{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="gradeBox">
                <div className={`bgGlow ${glowClass(audit.design_grade)}`} />
                <p className="letter" data-grade={audit.design_grade || "F"}>
                  {audit.design_grade || "F"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== OVERVIEW ===== */}
      {audit.under_the_hood_graphic_url && (
        <section className="overview">
          <div className="wrap">
            <h2 className="sectionTitle caps">Overview</h2>
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
                <img src={audit.under_the_hood_graphic_url} alt="Under the hood graphic" />
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ===== PRESENCE SCAN ===== */}
      {audit.presence_scan_image_url && (
        <section>
          <div className="wrap">
            <h2 className="sectionTitle caps">Presence Scan</h2>
            <p className="subtle">
              We also ran a comprehensive scan of your business across the internet and found a large list of issues
              across multiple platforms. To build trust, rank and get found, your entire digital presence must be
              structured, aligned, and optimized.
            </p>
            <div className="scanBox">
              <img src={audit.presence_scan_image_url} alt="Presence scan" />
            </div>
          </div>
        </section>
      )}

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
