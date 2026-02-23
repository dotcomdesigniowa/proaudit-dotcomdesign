import { useParams } from "react-router-dom";
import ProtectedRoute from "@/components/ProtectedRoute";
import AuditReport from "./AuditReport";
import CleanSharedAuditReport from "./CleanSharedAuditReport";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves /audit/:param to either:
 * - Internal audit report (if param is a UUID) — requires auth
 * - Clean shared audit report (if param is slug-shortToken) — public
 */
const AuditRouteResolver = () => {
  const { param } = useParams<{ param: string }>();

  if (param && UUID_RE.test(param)) {
    return (
      <ProtectedRoute>
        <AuditReport />
      </ProtectedRoute>
    );
  }

  return <CleanSharedAuditReport />;
};

export default AuditRouteResolver;
