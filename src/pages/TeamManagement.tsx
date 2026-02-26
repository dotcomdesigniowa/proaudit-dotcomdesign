import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";

interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  created_at: string;
}

const TeamManagement = () => {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  const fetchProfiles = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, avatar_url, is_admin, created_at")
      .order("created_at", { ascending: true });

    if (error) {
      toast({ title: "Error loading team", description: error.message, variant: "destructive" });
    } else {
      setProfiles(data ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  const toggleAdmin = async (profileId: string, currentValue: boolean) => {
    if (profileId === user?.id) {
      toast({ title: "Cannot modify yourself", description: "You can't remove your own admin access.", variant: "destructive" });
      return;
    }
    setToggling(profileId);
    const { error } = await supabase
      .from("profiles")
      .update({ is_admin: !currentValue })
      .eq("id", profileId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setProfiles((prev) =>
        prev.map((p) => (p.id === profileId ? { ...p, is_admin: !currentValue } : p))
      );
      toast({ title: !currentValue ? "Admin access granted" : "Admin access removed" });
    }
    setToggling(null);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-bold text-foreground mb-1">Team Management</h1>
      <p className="text-sm text-muted-foreground mb-6">Manage admin access for your team members.</p>

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-left">
                <th className="px-4 py-3 font-medium text-muted-foreground">Member</th>
                <th className="px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Email</th>
                <th className="px-4 py-3 font-medium text-muted-foreground text-center">Admin</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {p.avatar_url ? (
                        <img src={p.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                      ) : (
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                          {(p.full_name?.[0] || p.email?.[0] || "?").toUpperCase()}
                        </span>
                      )}
                      <div>
                        <p className="font-medium text-foreground">{p.full_name || "No name"}</p>
                        <p className="text-xs text-muted-foreground sm:hidden">{p.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{p.email}</td>
                  <td className="px-4 py-3 text-center">
                    <Switch
                      checked={p.is_admin}
                      disabled={toggling === p.id || p.id === user?.id}
                      onCheckedChange={() => toggleAdmin(p.id, p.is_admin)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default TeamManagement;
