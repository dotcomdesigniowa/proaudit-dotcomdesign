import { Link, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, ChevronDown, Settings } from "lucide-react";
import logo from "@/assets/logo.png";
import { useAdmin } from "@/hooks/useAdmin";

interface AppLayoutProps {
  children: React.ReactNode;
  navActions?: React.ReactNode;
}

const AppLayout = ({ children, navActions }: AppLayoutProps) => {
  const { user, signOut } = useAuth();
  const { isAdmin } = useAdmin();
  const navigate = useNavigate();
  const location = useLocation();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("avatar_url")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data?.avatar_url) setAvatarUrl(data.avatar_url);
      });
  }, [user]);

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <img src={logo} alt="ProAudit" className="h-7 w-7 object-contain" />
              ProAudit
            </Link>
            <nav className="hidden sm:flex items-center gap-1">
              <Link
                to="/"
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive("/")
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                Dashboard
              </Link>
              <Link
                to="/create-audit"
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive("/create-audit")
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                Create Audit
              </Link>
              {isAdmin && (
                <>
                  <Link
                    to="/scoring"
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      isActive("/scoring")
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    }`}
                  >
                    Scoring
                  </Link>
                  <Link
                    to="/error-logs"
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      isActive("/error-logs")
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    }`}
                  >
                    Error Logs
                  </Link>
                </>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            {navActions}
            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
                    ) : (
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                        {user.email?.[0]?.toUpperCase() || "?"}
                      </span>
                    )}
                    <span className="hidden sm:inline">{user.email}</span>
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => navigate("/profile")}>
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
};

export default AppLayout;
