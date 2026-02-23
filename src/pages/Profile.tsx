import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";

const Profile = () => {
  const { user } = useAuth();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [notifyOnOpen, setNotifyOnOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("full_name, phone, notify_on_open")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setFullName(data.full_name || "");
          setPhone(data.phone || "");
          setNotifyOnOpen(data.notify_on_open ?? true);
        }
        setLoading(false);
      });
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName, phone, notify_on_open: notifyOnOpen })
      .eq("id", user.id);
    setSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Profile updated" });
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">Loading…</div>
    );
  }

  return (
    <div className="mx-auto max-w-lg p-6">
      <Card>
        <CardHeader>
          <CardTitle>Your Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={user?.email || ""} disabled />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="full_name">Full Name</Label>
              <Input id="full_name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="555-123-4567" />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="notify_on_open" className="text-sm font-medium">Prospect open notifications</Label>
                <p className="text-xs text-muted-foreground">
                  Notify me when a prospect opens my shared audit link
                </p>
              </div>
              <Switch
                id="notify_on_open"
                checked={notifyOnOpen}
                onCheckedChange={setNotifyOnOpen}
              />
            </div>

            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? "Saving…" : "Save Profile"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Profile;
