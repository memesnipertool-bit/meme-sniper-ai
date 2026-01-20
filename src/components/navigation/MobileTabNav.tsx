import { Link, useLocation } from "react-router-dom";
import { 
  LayoutDashboard, 
  Zap, 
  Briefcase, 
  Settings,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { Shield, Crown, BarChart3, Bell, User, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface TabItem {
  label: string;
  path: string;
  icon: typeof LayoutDashboard;
}

const mainTabs: TabItem[] = [
  { label: "Home", path: "/", icon: LayoutDashboard },
  { label: "Scanner", path: "/scanner", icon: Zap },
  { label: "Portfolio", path: "/portfolio", icon: Briefcase },
  { label: "Settings", path: "/sniper-settings", icon: Settings },
];

export default function MobileTabNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAdmin, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  const isMoreActive = ["/risk", "/notifications", "/settings", "/admin"].some(
    (p) => location.pathname.startsWith(p)
  );

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-background/95 backdrop-blur-xl border-t border-border/50 safe-area-bottom">
      <div className="flex items-center justify-around h-16 px-2">
        {mainTabs.map((tab) => {
          const Icon = tab.icon;
          const active = isActive(tab.path);
          return (
            <Link
              key={tab.path}
              to={tab.path}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className={cn("w-5 h-5", active && "text-primary")} />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </Link>
          );
        })}

        {/* More Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors",
                isMoreActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <MoreHorizontal className={cn("w-5 h-5", isMoreActive && "text-primary")} />
              <span className="text-[10px] font-medium">More</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent 
            align="end" 
            side="top" 
            className="w-48 bg-card border-border mb-2"
          >
            <DropdownMenuItem asChild className="cursor-pointer">
              <Link to="/risk" className="flex items-center gap-2">
                <Shield className="w-4 h-4" />
                Risk & Compliance
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="cursor-pointer">
              <Link to="/notifications" className="flex items-center gap-2">
                <Bell className="w-4 h-4" />
                Notifications
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="cursor-pointer">
              <Link to="/settings" className="flex items-center gap-2">
                <User className="w-4 h-4" />
                Account
              </Link>
            </DropdownMenuItem>
            {isAdmin && (
              <>
                <DropdownMenuItem asChild className="cursor-pointer">
                  <Link to="/admin" className="flex items-center gap-2">
                    <Crown className="w-4 h-4 text-warning" />
                    Admin Panel
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="cursor-pointer">
                  <Link to="/admin/analytics" className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" />
                    Analytics
                  </Link>
                </DropdownMenuItem>
              </>
            )}
            {user && (
              <DropdownMenuItem 
                onClick={handleSignOut} 
                className="text-destructive cursor-pointer"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}
