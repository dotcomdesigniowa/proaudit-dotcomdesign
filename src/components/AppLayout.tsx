import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { User, LogOut, ChevronDown } from "lucide-react";
import logo from "@/assets/logo.png";

interface AppLayoutProps {
  children: React.ReactNode;
  navActions?: React.ReactNode;
}

const AppLayout = ({ children, navActions }: AppLayoutProps) => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

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
            </nav>
          </div>
          <div className="flex items-center gap-2">
            {navActions}
            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2">
                    <User className="h-4 w-4" />
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
