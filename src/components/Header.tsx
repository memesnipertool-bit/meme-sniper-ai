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
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <div className="relative">
              <Zap className="w-8 h-8 text-primary animate-pulse-glow" />
              <div className="absolute inset-0 blur-lg bg-primary/30" />
            </div>
            <span className="text-xl md:text-2xl font-bold">
              <span className="text-gradient">Meme</span>
              <span className="text-foreground">Sniper</span>
              <span className="text-gradient-accent ml-1">AI</span>
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
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
          <div className="hidden md:flex items-center gap-3">
            <Button
              variant={isConnected ? "glass" : "glow"}
              onClick={handleConnect}
              className="min-w-[140px]"
            >
              <Wallet className="w-4 h-4" />
              {isConnected ? "0x1a2b...3c4d" : "Connect Wallet"}
            </Button>

            {user && (
              <Button variant="ghost" size="icon" onClick={handleSignOut}>
                <LogOut className="w-5 h-5" />
              </Button>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 text-foreground"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="md:hidden py-4 border-t border-border animate-fade-in">
            <nav className="flex flex-col gap-2">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsMenuOpen(false)}
                  className={`px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                    location.pathname === item.path
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="mt-4 pt-4 border-t border-border space-y-3">
              <Button
                variant={isConnected ? "glass" : "glow"}
                onClick={handleConnect}
                className="w-full"
              >
                <Wallet className="w-4 h-4" />
                {isConnected ? "0x1a2b...3c4d" : "Connect Wallet"}
              </Button>
              {user && (
                <Button variant="outline" onClick={handleSignOut} className="w-full">
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
