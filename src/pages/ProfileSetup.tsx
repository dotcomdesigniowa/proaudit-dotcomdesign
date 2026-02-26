import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Camera } from "lucide-react";
import { formatPhone } from "@/lib/formatPhone";
import logo from "@/assets/logo.png";

const ProfileSetup = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("full_name, phone, avatar_url")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setFullName(data.full_name || "");
          setPhone(data.phone || "");
          setAvatarUrl(data.avatar_url || null);
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
      toast({ title: "File too large", description: "Max 5MB.", variant: "destructive" });
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop() || "jpg";
    const filePath = `${user.id}/avatar.${ext}`;
    const { error: uploadError } = await supabase.storage.from("avatars").upload(filePath, file, { upsert: true });
    if (uploadError) {
      toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" });
      setUploading(false);
      return;
    }
    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(filePath);
    const publicUrl = urlData.publicUrl + `?t=${Date.now()}`;
    await supabase.from("profiles").update({ avatar_url: publicUrl } as any).eq("id", user.id);
    setAvatarUrl(publicUrl);
    setUploading(false);
    toast({ title: "Photo uploaded" });
  };

  const isValid = fullName.trim() && phone.trim() && avatarUrl;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !isValid) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName.trim(), phone: phone.trim() })
      .eq("id", user.id);
    setSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Profile complete!" });
      navigate("/", { replace: true });
    }
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <img src={logo} alt="ProAudit" className="h-10 w-10 object-contain" />
          </div>
          <CardTitle className="text-xl">Complete Your Profile</CardTitle>
          <CardDescription>Please fill in the required fields before using ProAudit.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-2 mb-6">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="relative group w-24 h-24 rounded-full overflow-hidden border-2 border-border bg-muted flex items-center justify-center cursor-pointer hover:border-primary transition-colors"
              disabled={uploading}
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="Your headshot" className="w-full h-full object-cover" />
              ) : (
                <Camera className="w-8 h-8 text-muted-foreground" />
              )}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Camera className="w-6 h-6 text-white" />
              </div>
            </button>
            <p className="text-xs text-muted-foreground">
              {uploading ? "Uploading…" : avatarUrl ? "Click to change photo" : "Upload your headshot *"}
            </p>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="setup_name">Full Name *</Label>
              <Input id="setup_name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="setup_phone">Phone *</Label>
              <Input id="setup_phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={() => setPhone(formatPhone(phone))} placeholder="(555) 123-4567" required />
            </div>
            <Button type="submit" className="w-full" disabled={saving || !isValid}>
              {saving ? "Saving…" : "Continue to ProAudit"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProfileSetup;
