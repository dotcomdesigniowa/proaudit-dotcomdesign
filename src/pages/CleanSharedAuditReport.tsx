import { useParams } from "react-router-dom";
import SharedAuditReport from "./SharedAuditReport";

/**
 * Handles clean URL format: /audit/:param (where param = domain slug, e.g. "truerooter.com")
 * Passes the slug directly to SharedAuditReport as the token for lookup.
 */
const CleanSharedAuditReport = () => {
  const { param } = useParams<{ param: string }>();

  if (!param) {
    return (
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", color: "#dc2626" }}>
        <p style={{ fontSize: 18, fontWeight: 700 }}>Invalid link.</p>
      </div>
    );
  }

  // The param is the slug (domain), pass it directly as tokenOverride
  // The record_share_view RPC will look it up by slug
  return <SharedAuditReport tokenOverride={param} />;
};

export default CleanSharedAuditReport;
