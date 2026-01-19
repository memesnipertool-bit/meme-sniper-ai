import React, { forwardRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Wallet, 
  User, 
  LogOut,
  ChevronDown,
  Menu,
  X,
  Zap,
  LayoutDashboard,
  Briefcase,
  Shield,
  Settings,
  Crown,
  BarChart3,
  Bell,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import NotificationBell from "@/components/notifications/NotificationBell";
import WalletConnectionModal from "@/components/wallet/WalletConnectionModal";
import ModeSwitcher from "@/components/mode/ModeSwitcher";

interface TradingHeaderProps {
  walletConnected?: boolean;
  walletAddress?: string;
  network?: string;
  onConnectWallet?: () => void;
}

interface NavItem {
  label: string;
  path: string;
  icon: typeof LayoutDashboard;
}

const TradingHeader = forwardRef<HTMLElement, TradingHeaderProps>(function TradingHeader({
  walletConnected = false,
  walletAddress,
  network = "Solana",
  onConnectWallet,
}, ref) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const displayAddress = walletAddress 
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
    : null;

  // Navigation items with icons
  const getNavItems = (): NavItem[] => {
    const baseItems: NavItem[] = [
      { label: "Dashboard", path: "/", icon: LayoutDashboard },
      { label: "Token Scanner", path: "/scanner", icon: Zap },
      { label: "Portfolio", path: "/portfolio", icon: Briefcase },
      { label: "Risk", path: "/risk", icon: Shield },
      { label: "Settings", path: "/sniper-settings", icon: Settings },
    ];

    if (isAdmin) {
      baseItems.push({ label: "Admin", path: "/admin", icon: Crown });
      baseItems.push({ label: "Analytics", path: "/admin/analytics", icon: BarChart3 });
    }

    return baseItems;
  };

  const navItems = getNavItems();

  return (
    <header ref={ref} className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-xl border-b border-border/50">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 shrink-0 group">
            <div className="relative p-1.5 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
              <Zap className="w-6 h-6 text-primary" />
            </div>
            <span className="text-lg font-bold hidden sm:block">
              <span className="text-primary">Meme</span>
              <span className="text-foreground">Sniper</span>
              <span className="text-xs text-muted-foreground ml-1.5 font-normal">AI</span>
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-1 mx-6">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          
          {/* Right Side Actions */}
          <div className="flex items-center gap-2">
            {/* Mode Switcher */}
            <ModeSwitcher />
            
            {/* Notifications */}
            <Link to="/notifications" className="hidden sm:flex">
              <NotificationBell />
            </Link>
            
            {/* Network Badge */}
            <Badge variant="outline" className="hidden md:flex items-center gap-1.5 px-2.5 py-1 bg-secondary/50">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="text-xs font-medium">{network}</span>
            </Badge>
            
            {/* Connect Wallet Button */}
            <WalletConnectionModal />
            
            {/* User Menu */}
            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="hidden sm:flex items-center gap-2 px-2 hover:bg-secondary/60">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center border border-primary/20">
                      <User className="w-4 h-4 text-primary" />
                    </div>
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52 bg-card border-border">
                  <div className="px-3 py-2 border-b border-border">
                    <p className="text-xs text-muted-foreground">Signed in as</p>
                    <p className="text-sm font-medium text-foreground truncate">{user.email}</p>
                  </div>
                  <DropdownMenuItem asChild className="cursor-pointer">
                    <Link to="/portfolio" className="flex items-center gap-2">
                      <Briefcase className="w-4 h-4" />
                      Portfolio
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="cursor-pointer">
                    <Link to="/sniper-settings" className="flex items-center gap-2">
                      <Settings className="w-4 h-4" />
                      Bot Settings
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
                      <DropdownMenuSeparator />
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
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut} className="text-destructive cursor-pointer">
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            
            {/* Mobile Menu Toggle */}
            <Button 
              variant="ghost" 
              size="icon" 
              className="lg:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>
        
        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden py-4 border-t border-border/50 animate-fade-in">
            <nav className="flex flex-col gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                      isActive
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            {user && (
              <div className="mt-4 pt-4 border-t border-border/50">
                <Button 
                  variant="ghost" 
                  className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    handleSignOut();
                    setMobileMenuOpen(false);
                  }}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
});

TradingHeader.displayName = 'TradingHeader';

export default TradingHeader;
