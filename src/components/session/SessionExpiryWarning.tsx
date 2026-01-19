import { useAuth } from "@/contexts/AuthContext";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Clock, RefreshCw } from "lucide-react";

export function SessionExpiryWarning() {
  const { sessionExpiring, sessionExpiresIn, extendSession } = useAuth();

  if (!sessionExpiring) return null;

  const minutes = Math.floor(sessionExpiresIn / 60);
  const seconds = sessionExpiresIn % 60;

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-fade-in">
      <Alert className="w-80 bg-warning/10 border-warning/30 shadow-lg">
        <Clock className="h-4 w-4 text-warning" />
        <AlertTitle className="text-warning">Session Expiring</AlertTitle>
        <AlertDescription className="space-y-3">
          <p className="text-sm text-warning/80">
            Your session will expire in{" "}
            <span className="font-mono font-bold">
              {minutes > 0 ? `${minutes}m ` : ""}{seconds}s
            </span>
          </p>
          <Button
            size="sm"
            variant="outline"
            className="w-full border-warning/30 text-warning hover:bg-warning/20"
            onClick={extendSession}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Extend Session
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  );
}
