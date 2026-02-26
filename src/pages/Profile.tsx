import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Camera } from "lucide-react";
import { formatPhone } from "@/lib/formatPhone";

const Profile = () => {
  const { user } = useAuth();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [notifyOnOpen, setNotifyOnOpen] = useState(true);
  const [schedulerUrl, setSchedulerUrl] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("full_name, phone, notify_on_open, scheduler_url, avatar_url")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setFullName(data.full_name || "");
          setPhone(data.phone || "");
          setNotifyOnOpen(data.notify_on_open ?? true);
          setSchedulerUrl(data.scheduler_url || "");
          setAvatarUrl((data as any).avatar_url || null);
        }
        setLoading(false);
      });
  }, [user]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please upload an image file.", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Please upload an image under 5MB.", variant: "destructive" });
      return;
    }

    setUploading(true);
    const ext = file.name.split(".").pop() || "jpg";
    const filePath = `${user.id}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" });
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(filePath);
    const publicUrl = urlData.publicUrl + `?t=${Date.now()}`;

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ avatar_url: publicUrl } as any)
      .eq("id", user.id);

    if (updateError) {
      toast({ title: "Error saving avatar", description: updateError.message, variant: "destructive" });
    } else {
      setAvatarUrl(publicUrl);
      toast({ title: "Photo updated" });
    }
    setUploading(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName, phone, notify_on_open: notifyOnOpen, scheduler_url: schedulerUrl || null })
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
          {/* Avatar upload */}
          <div className="flex flex-col items-center gap-3 mb-6">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="relative group w-24 h-24 rounded-full overflow-hidden border-2 border-border bg-muted flex items-center justify-center cursor-pointer hover:border-primary transition-colors"
              disabled={uploading}
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="Your headshot" className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl font-bold text-muted-foreground">
                  {fullName ? fullName.split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0, 2) : "?"}
                </span>
              )}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Camera className="w-6 h-6 text-white" />
              </div>
            </button>
            <p className="text-xs text-muted-foreground">
              {uploading ? "Uploading…" : "Click to upload your headshot"}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarUpload}
            />
          </div>

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
              <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={() => setPhone(formatPhone(phone))} placeholder="(555) 123-4567" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="scheduler_url">My Scheduling Link</Label>
              <Input id="scheduler_url" value={schedulerUrl} onChange={(e) => setSchedulerUrl(e.target.value)} placeholder="https://calendly.com/yourname" />
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
