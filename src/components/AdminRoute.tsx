import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAdmin } from "@/hooks/useAdmin";
import { toast } from "@/hooks/use-toast";
import { useEffect, useRef } from "react";

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const toasted = useRef(false);

  const loading = authLoading || adminLoading;

  useEffect(() => {
    if (!loading && user && !isAdmin && !toasted.current) {
      toasted.current = true;
      toast({ title: "Not authorized", description: "You don't have permission to access this page.", variant: "destructive" });
    }
  }, [loading, user, isAdmin]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  return <>{children}</>;
};

export default AdminRoute;
