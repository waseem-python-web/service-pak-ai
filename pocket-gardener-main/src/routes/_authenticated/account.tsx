import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  User as UserIcon,
  Mail,
  Phone,
  Moon,
  Sun,
  LogOut,
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
  Wrench,
  Calendar,
  Save,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/account")({ component: AccountPage });

type Profile = { full_name: string | null; phone: string | null; language: string | null };
type HistoryItem = {
  id: string;
  service_category: string;
  provider_name: string;
  status: string;
  scheduled_for: string | null;
  created_at: string;
};

function statusIcon(s: string) {
  if (s === "cancelled") return <XCircle className="h-4 w-4 text-destructive" />;
  if (s === "completed") return <CheckCircle2 className="h-4 w-4 text-green-600" />;
  if (s === "in_progress") return <Wrench className="h-4 w-4 text-primary" />;
  return <Clock className="h-4 w-4 text-muted-foreground" />;
}

function AccountPage() {
  const { user, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name,phone,language")
        .eq("id", user.id)
        .maybeSingle();
      const p = (prof as Profile | null) ?? { full_name: null, phone: null, language: "en" };
      setProfile(p);
      setFullName(p.full_name ?? "");
      setPhone(p.phone ?? "");

      const { data: rows } = await supabase
        .from("bookings")
        .select("id,service_category,provider_name,status,scheduled_for,created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      setHistory((rows as HistoryItem[] | null) ?? []);
    })();
  }, [user]);

  const saveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    const { error } = await supabase
      .from("profiles")
      .upsert(
        { id: user.id, full_name: fullName.trim() || null, phone: phone.trim() || null },
        { onConflict: "id" },
      );
    setSavingProfile(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Profile saved");
    setProfile((p) => ({ ...(p ?? { language: "en" }), full_name: fullName, phone }));
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut();
    navigate({ to: "/login" });
  };

  if (!user) return null;

  return (
    <div className="mx-auto max-w-md px-5 pb-10 pt-8">
      <header className="flex items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <UserIcon className="h-7 w-7" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold">
            {fullName || user.email?.split("@")[0] || "Account"}
          </h1>
          <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
            <Mail className="h-3 w-3" /> {user.email}
          </p>
        </div>
      </header>

      {/* Appearance */}
      <section className="mt-6 rounded-2xl border bg-card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
              {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </span>
            <div>
              <p className="text-sm font-medium">Dark mode</p>
              <p className="text-xs text-muted-foreground">
                {theme === "dark" ? "Currently dark" : "Currently light"}
              </p>
            </div>
          </div>
          <Switch checked={theme === "dark"} onCheckedChange={toggle} aria-label="Toggle dark mode" />
        </div>
      </section>

      {/* Profile editor */}
      <section className="mt-4 rounded-2xl border bg-card p-4">
        <h2 className="text-sm font-semibold">Your details</h2>
        <p className="text-xs text-muted-foreground">Update your name and contact number.</p>

        <div className="mt-3 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="acc-name" className="text-xs">
              Full name
            </Label>
            <Input
              id="acc-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your name"
              maxLength={120}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="acc-email" className="text-xs">
              Email
            </Label>
            <Input id="acc-email" value={user.email ?? ""} readOnly disabled />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="acc-phone" className="text-xs">
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3 w-3" /> Phone number
              </span>
            </Label>
            <Input
              id="acc-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+92 300 1234567"
              maxLength={40}
            />
          </div>

          <Button
            className="w-full"
            onClick={saveProfile}
            disabled={
              savingProfile ||
              (fullName === (profile?.full_name ?? "") && phone === (profile?.phone ?? ""))
            }
          >
            {savingProfile ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1 h-4 w-4" />
            )}
            Save changes
          </Button>
        </div>
      </section>

      {/* History */}
      <section className="mt-4 rounded-2xl border bg-card p-4">
        <h2 className="text-sm font-semibold">Booking history</h2>
        <p className="text-xs text-muted-foreground">All your past and current appointments.</p>

        <div className="mt-3 space-y-2">
          {history === null && (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
          {history?.length === 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground">
              No bookings yet.
            </p>
          )}
          {history?.map((h, i) => (
            <div key={h.id}>
              {i > 0 && <Separator className="my-2" />}
              <div className="flex items-start gap-2">
                <span className="mt-0.5">{statusIcon(h.status)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{h.provider_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {h.service_category} · {h.status.replace("_", " ")}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {h.scheduled_for
                      ? format(new Date(h.scheduled_for), "PPp")
                      : format(new Date(h.created_at), "PPp")}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <Button
        variant="outline"
        className="mt-6 w-full border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={handleSignOut}
        disabled={signingOut}
      >
        {signingOut ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <LogOut className="mr-1 h-4 w-4" />}
        Sign out
      </Button>
    </div>
  );
}
