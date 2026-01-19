import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const useDisclaimerAcknowledgment = () => {
  const { user } = useAuth();
  const [hasAcknowledged, setHasAcknowledged] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAcknowledgment = async () => {
      if (!user) {
        setHasAcknowledged(null);
        setIsLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("disclaimer_acknowledgments")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (error) {
          console.error("Error checking disclaimer acknowledgment:", error);
          setHasAcknowledged(false);
        } else {
          setHasAcknowledged(!!data);
        }
      } catch (err) {
        console.error("Error checking disclaimer:", err);
        setHasAcknowledged(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkAcknowledgment();
  }, [user]);

  const acknowledgeDisclaimer = async () => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from("disclaimer_acknowledgments")
        .insert({
          user_id: user.id,
          user_agent: navigator.userAgent,
        });

      if (error) {
        console.error("Error saving acknowledgment:", error);
        return false;
      }

      setHasAcknowledged(true);
      return true;
    } catch (err) {
      console.error("Error acknowledging disclaimer:", err);
      return false;
    }
  };

  return {
    hasAcknowledged,
    isLoading,
    acknowledgeDisclaimer,
  };
};
