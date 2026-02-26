import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface ProfileCompleteness {
  complete: boolean;
  loading: boolean;
}

export const useProfileComplete = (): ProfileCompleteness => {
  const { user, loading: authLoading } = useAuth();
  const [complete, setComplete] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setComplete(false);
      setLoading(false);
      return;
    }

    supabase
      .from("profiles")
      .select("full_name, phone, avatar_url")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        const ok = !!(data?.full_name?.trim() && data?.phone?.trim() && data?.avatar_url?.trim());
        setComplete(ok);
        setLoading(false);
      });
  }, [user, authLoading]);

  return { complete, loading };
};
