import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, ShieldX } from "lucide-react";
import { useDisclaimerAcknowledgment } from "@/hooks/useDisclaimerAcknowledgment";
import DisclaimerDialog from "@/components/DisclaimerDialog";
import { Button } from "@/components/ui/button";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

const ProtectedRoute = ({ children, requireAdmin = false }: ProtectedRouteProps) => {
  const { user, loading, isAdmin, isSuspended, suspensionReason, signOut } = useAuth();
  const location = useLocation();
  const { hasAcknowledged, isLoading: disclaimerLoading, acknowledgeDisclaimer } = useDisclaimerAcknowledgment();

  if (loading || disclaimerLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // Block suspended users
  if (isSuspended) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="mx-auto w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center">
            <ShieldX className="w-10 h-10 text-destructive" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">Account Suspended</h1>
            <p className="text-muted-foreground">
              Your account has been suspended and you cannot access the platform.
            </p>
          </div>
          {suspensionReason && (
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-left">
              <p className="text-sm font-medium text-destructive mb-1">Reason:</p>
              <p className="text-sm text-foreground">{suspensionReason}</p>
            </div>
          )}
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              If you believe this is a mistake, please contact support.
            </p>
            <Button variant="outline" onClick={signOut} className="w-full">
              Sign Out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (requireAdmin && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  // Show disclaimer dialog if user hasn't acknowledged yet
  if (hasAcknowledged === false) {
    return (
      <>
        <DisclaimerDialog open={true} onAcknowledge={acknowledgeDisclaimer} />
        <div className="min-h-screen bg-background" />
      </>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
