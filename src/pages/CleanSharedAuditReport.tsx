import { useParams, useNavigate } from "react-router-dom";
import SharedAuditReport from "./SharedAuditReport";

/**
 * Handles clean URL format: /audit/:param (where param = slug-shortToken)
 * Extracts short_token (last segment after final hyphen, 6-8 chars)
 * and delegates to SharedAuditReport.
 */
const CleanSharedAuditReport = () => {
  const { param } = useParams<{ param: string }>();
  const navigate = useNavigate();

  if (!param) {
    return (
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", color: "#dc2626" }}>
        <p style={{ fontSize: 18, fontWeight: 700 }}>Invalid link.</p>
      </div>
    );
  }

  const lastHyphen = param.lastIndexOf("-");
  if (lastHyphen === -1 || param.length - lastHyphen - 1 < 6) {
    return (
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", color: "#dc2626" }}>
        <p style={{ fontSize: 18, fontWeight: 700 }}>Invalid link format.</p>
      </div>
    );
  }

  const shortToken = param.slice(lastHyphen + 1);
  const currentSlug = param.slice(0, lastHyphen);

  const handleSlugRedirect = (correctSlug: string) => {
    if (correctSlug && correctSlug !== currentSlug) {
      navigate(`/audit/${correctSlug}-${shortToken}`, { replace: true });
    }
  };

  return (
    <SharedAuditReport
      tokenOverride={shortToken}
      onSlugCheck={handleSlugRedirect}
    />
  );
};

export default CleanSharedAuditReport;
