import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useProfileComplete } from "@/hooks/useProfileComplete";

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const { complete, loading: profileLoading } = useProfileComplete();

  if (loading || profileLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!complete) {
    return <Navigate to="/profile-setup" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
