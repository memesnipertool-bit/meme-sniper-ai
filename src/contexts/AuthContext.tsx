// Authentication context with session management
import { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type AppRole = "admin" | "user";

// Session timeout after 30 minutes of inactivity
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
// Warn user 5 minutes before timeout
const SESSION_WARNING_MS = 5 * 60 * 1000;
// Refresh session every 10 minutes
const SESSION_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  loading: boolean;
  isAdmin: boolean;
  isSuspended: boolean;
  suspensionReason: string | null;
  sessionExpiring: boolean;
  sessionExpiresIn: number;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
  extendSession: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSuspended, setIsSuspended] = useState(false);
  const [suspensionReason, setSuspensionReason] = useState<string | null>(null);
  const [sessionExpiring, setSessionExpiring] = useState(false);
  const [sessionExpiresIn, setSessionExpiresIn] = useState(0);
  
  const { toast } = useToast();
  const lastActivityRef = useRef<number>(Date.now());
  const sessionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const sessionWarningRef = useRef<NodeJS.Timeout | null>(null);
  const sessionRefreshRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  // Reset activity timestamp
  const updateLastActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    setSessionExpiring(false);
  }, []);

  // Extend session (reset timers)
  const extendSession = useCallback(() => {
    updateLastActivity();
    setupSessionTimers();
  }, [updateLastActivity]);

  // Refresh the session
  const refreshSession = useCallback(async () => {
    try {
      const { data: { session: newSession }, error } = await supabase.auth.refreshSession();
      
      if (error) {
        console.error("Session refresh error:", error);
        // If refresh fails, sign out
        if (error.message.includes("refresh_token_not_found")) {
          await supabase.auth.signOut();
        }
        return;
      }

      if (newSession) {
        setSession(newSession);
        setUser(newSession.user);
        updateLastActivity();
      }
    } catch (err) {
      console.error("Session refresh failed:", err);
    }
  }, [updateLastActivity]);

  // Clear all session timers
  const clearSessionTimers = useCallback(() => {
    if (sessionTimeoutRef.current) {
      clearTimeout(sessionTimeoutRef.current);
      sessionTimeoutRef.current = null;
    }
    if (sessionWarningRef.current) {
      clearTimeout(sessionWarningRef.current);
      sessionWarningRef.current = null;
    }
    if (sessionRefreshRef.current) {
      clearInterval(sessionRefreshRef.current);
      sessionRefreshRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  // Setup session timeout timers
  const setupSessionTimers = useCallback(() => {
    if (!session) return;
    
    clearSessionTimers();

    // Warning timer - show warning before timeout
    sessionWarningRef.current = setTimeout(() => {
      setSessionExpiring(true);
      
      // Start countdown
      let remaining = SESSION_WARNING_MS / 1000;
      setSessionExpiresIn(remaining);
      
      countdownRef.current = setInterval(() => {
        remaining -= 1;
        setSessionExpiresIn(remaining);
        
        if (remaining <= 0) {
          clearInterval(countdownRef.current!);
        }
      }, 1000);
      
      toast({
        title: "Session Expiring Soon",
        description: "Your session will expire in 5 minutes. Click to extend.",
        variant: "destructive",
      });
    }, SESSION_TIMEOUT_MS - SESSION_WARNING_MS);

    // Timeout timer - sign out after timeout
    sessionTimeoutRef.current = setTimeout(async () => {
      toast({
        title: "Session Expired",
        description: "You have been logged out due to inactivity.",
        variant: "destructive",
      });
      await supabase.auth.signOut();
    }, SESSION_TIMEOUT_MS);

    // Refresh timer - refresh token periodically
    sessionRefreshRef.current = setInterval(() => {
      refreshSession();
    }, SESSION_REFRESH_INTERVAL_MS);
  }, [session, clearSessionTimers, refreshSession, toast]);

  // Listen for user activity to reset session timers
  useEffect(() => {
    if (!session) return;

    const handleActivity = () => {
      updateLastActivity();
      // Only reset timers if session was expiring
      if (sessionExpiring) {
        setSessionExpiring(false);
        setupSessionTimers();
      }
    };

    // Track user activity
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach(event => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [session, sessionExpiring, updateLastActivity, setupSessionTimers]);

  // Setup timers when session changes
  useEffect(() => {
    if (session) {
      setupSessionTimers();
    } else {
      clearSessionTimers();
    }

    return () => {
      clearSessionTimers();
    };
  }, [session, setupSessionTimers, clearSessionTimers]);

  const fetchUserRole = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .single();

      if (error) {
        console.error("Error fetching role:", error);
        return null;
      }

      return data?.role as AppRole;
    } catch (err) {
      console.error("Error fetching role:", err);
      return null;
    }
  };

  const fetchSuspensionStatus = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("is_suspended, suspension_reason")
        .eq("user_id", userId)
        .single();

      if (error) {
        console.error("Error fetching suspension status:", error);
        return { isSuspended: false, reason: null };
      }

      return {
        isSuspended: data?.is_suspended || false,
        reason: data?.suspension_reason || null,
      };
    } catch (err) {
      console.error("Error fetching suspension status:", err);
      return { isSuspended: false, reason: null };
    }
  };

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        // Defer role and suspension fetching to avoid deadlock
        if (session?.user) {
          setTimeout(() => {
            fetchUserRole(session.user.id).then(setRole);
            fetchSuspensionStatus(session.user.id).then(({ isSuspended: suspended, reason }) => {
              setIsSuspended(suspended);
              setSuspensionReason(reason);
            });
          }, 0);
        } else {
          setRole(null);
          setIsSuspended(false);
          setSuspensionReason(null);
        }

        // Handle specific auth events
        if (event === 'TOKEN_REFRESHED') {
          updateLastActivity();
        } else if (event === 'SIGNED_OUT') {
          clearSessionTimers();
          setSessionExpiring(false);
          setIsSuspended(false);
          setSuspensionReason(null);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        Promise.all([
          fetchUserRole(session.user.id),
          fetchSuspensionStatus(session.user.id),
        ]).then(([r, { isSuspended: suspended, reason }]) => {
          setRole(r);
          setIsSuspended(suspended);
          setSuspensionReason(reason);
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
      },
    });

    return { error: error as Error | null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (!error) {
      updateLastActivity();
    }

    return { error: error as Error | null };
  };

  const signOut = async () => {
    // CRITICAL: Clear local state FIRST before server signout
    // This prevents auto-login from persisted session if server call fails
    clearSessionTimers();
    setUser(null);
    setSession(null);
    setRole(null);
    setSessionExpiring(false);
    setIsSuspended(false);
    setSuspensionReason(null);
    
    try {
      // Attempt server signout - may fail if session already expired
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) {
        console.warn('Server signout warning (session may have expired):', error.message);
      }
    } catch (err) {
      // Server signout failed, but local state is already cleared
      console.warn('Signout error (local state already cleared):', err);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        role,
        loading,
        isAdmin: role === "admin",
        isSuspended,
        suspensionReason,
        sessionExpiring,
        sessionExpiresIn,
        signUp,
        signIn,
        signOut,
        refreshSession,
        extendSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
