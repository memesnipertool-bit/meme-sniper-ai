import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Wallet, Settings, Menu, X, Zap, LogOut, User } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAdmin, signOut } = useAuth();

  // Nav items based on role
  const getNavItems = () => {
    const baseItems = [
      { label: "Dashboard", path: "/" },
      { label: "Scanner", path: "/scanner" },
      { label: "Portfolio", path: "/portfolio" },
      { label: "Risk", path: "/risk" },
      { label: "Sniper Settings", path: "/sniper-settings" },
    ];

    if (isAdmin) {
      baseItems.push({ label: "Admin", path: "/admin" });
      baseItems.push({ label: "Analytics", path: "/admin/analytics" });
    }

    return baseItems;
  };

  const navItems = getNavItems();

  const handleConnect = () => {
    setIsConnected(!isConnected);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 glass-strong">
      <div className="container mx-auto px-3 md:px-4">
        <div className="flex items-center justify-between h-14 md:h-16 lg:h-20">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-1.5 md:gap-2 min-w-0">
            <div className="relative shrink-0">
              <Zap className="w-6 h-6 md:w-8 md:h-8 text-primary animate-pulse-glow" />
              <div className="absolute inset-0 blur-lg bg-primary/30" />
            </div>
            <span className="text-lg md:text-xl lg:text-2xl font-bold truncate">
              <span className="text-gradient">Meme</span>
              <span className="text-foreground">Sniper</span>
              <span className="text-gradient-accent ml-0.5 md:ml-1">AI</span>
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-0.5 md:gap-1">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`px-3 md:px-4 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                  location.pathname === item.path
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Desktop Actions */}
          <div className="hidden lg:flex items-center gap-2 md:gap-3">
            <Button
              variant={isConnected ? "glass" : "glow"}
              onClick={handleConnect}
              className="min-w-[120px] md:min-w-[140px] h-9 md:h-10 text-xs md:text-sm"
            >
              <Wallet className="w-3.5 h-3.5 md:w-4 md:h-4" />
              <span className="truncate">{isConnected ? "0x1a2b...3c4d" : "Connect Wallet"}</span>
            </Button>

            {user && (
              <Button variant="ghost" size="icon" onClick={handleSignOut} className="w-9 h-9 md:w-10 md:h-10">
                <LogOut className="w-4 h-4 md:w-5 md:h-5" />
              </Button>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            className="lg:hidden p-1.5 md:p-2 text-foreground"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? <X className="w-5 h-5 md:w-6 md:h-6" /> : <Menu className="w-5 h-5 md:w-6 md:h-6" />}
          </button>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="lg:hidden py-3 md:py-4 border-t border-border animate-fade-in">
            <nav className="flex flex-col gap-1.5 md:gap-2">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsMenuOpen(false)}
                  className={`px-3 md:px-4 py-2.5 md:py-3 rounded-lg text-sm font-medium transition-all ${
                    location.pathname === item.path
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="mt-3 md:mt-4 pt-3 md:pt-4 border-t border-border space-y-2 md:space-y-3">
              <Button
                variant={isConnected ? "glass" : "glow"}
                onClick={handleConnect}
                className="w-full h-10 text-sm"
              >
                <Wallet className="w-4 h-4" />
                {isConnected ? "0x1a2b...3c4d" : "Connect Wallet"}
              </Button>
              {user && (
                <Button variant="outline" onClick={handleSignOut} className="w-full h-10 text-sm">
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
