import { createFileRoute, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { useServerFn } from "@tanstack/react-start";
import { createBooking } from "@/lib/bookings.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  ArrowLeft,
  Loader2,
  MapPin,
  Star,
  CalendarDays,
  Clock,
  Camera,
  X,
  Home,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { format, addDays, isBefore, startOfDay } from "date-fns";
import { Phone, MessageCircle, CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { waLink, normalizeWaPhone } from "@/lib/whatsapp";

const searchSchema = z.object({ id: z.string() });

export const Route = createFileRoute("/_authenticated/schedule")({
  component: SchedulePage,
  validateSearch: searchSchema,
});

type StashedProvider = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  phone?: string;
  rating?: number;
  distanceKm: number;
  service_category: string;
};

const SLOT_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const MAX_PHOTOS = 6;

function SchedulePage() {
  const { id } = useSearch({ from: "/_authenticated/schedule" });
  const navigate = useNavigate();
  const createBookingFn = useServerFn(createBooking);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [provider, setProvider] = useState<StashedProvider | null>(null);
  const [date, setDate] = useState<Date>(() => startOfDay(new Date()));
  const [slot, setSlot] = useState<number | null>(null);
  const [address, setAddress] = useState("");
  const [problem, setProblem] = useState("");
  const [photos, setPhotos] = useState<{ url: string; path: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(`provider:${id}`);
      if (raw) setProvider(JSON.parse(raw));
    } catch {}
  }, [id]);

  const now = new Date();
  const availableSlots = useMemo(() => {
    const sameDay = startOfDay(date).getTime() === startOfDay(now).getTime();
    return SLOT_HOURS.filter((h) => !sameDay || h > now.getHours());
  }, [date, now]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) {
      toast.error("Please sign in again.");
      return;
    }
    const remaining = MAX_PHOTOS - photos.length;
    const list = Array.from(files).slice(0, remaining);
    setUploading(true);
    try {
      for (const file of list) {
        if (file.size > 5 * 1024 * 1024) {
          toast.error(`${file.name} is over 5MB`);
          continue;
        }
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
        const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("booking-photos")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) {
          toast.error(upErr.message);
          continue;
        }
        const { data: pub } = supabase.storage.from("booking-photos").getPublicUrl(path);
        setPhotos((p) => [...p, { url: pub.publicUrl, path }]);
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removePhoto = async (idx: number) => {
    const p = photos[idx];
    setPhotos((arr) => arr.filter((_, i) => i !== idx));
    await supabase.storage.from("booking-photos").remove([p.path]).catch(() => {});
  };

  const [contactOpen, setContactOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [bookedAt, setBookedAt] = useState<Date | null>(null);

  const openReview = () => {
    if (!provider || slot == null) return;
    if (address.trim().length < 3) {
      toast.error("Please enter your address");
      return;
    }
    if (problem.trim().length < 3) {
      toast.error("Please describe the problem");
      return;
    }
    setReviewOpen(true);
  };

  const confirm = async () => {
    if (!provider || slot == null) return;
    if (address.trim().length < 3) {
      toast.error("Please enter your address");
      return;
    }
    if (problem.trim().length < 3) {
      toast.error("Please describe the problem");
      return;
    }
    setBusy(true);
    const when = new Date(date);
    when.setHours(slot, 0, 0, 0);
    try {
      await createBookingFn({
        data: {
          service_category: provider.service_category,
          provider_id: provider.id,
          provider_name: provider.name,
          provider_phone: provider.phone ?? null,
          provider_address: provider.address ?? null,
          provider_lat: provider.lat,
          provider_lng: provider.lng,
          provider_rating: provider.rating ?? null,
          distance_km: provider.distanceKm,
          scheduled_for: when.toISOString(),
          user_address: address.trim(),
          notes: problem.trim(),
          photo_urls: photos.map((p) => p.url),
        },
      });
      setBookedAt(when);
      toast.success("Booking saved!");
      setContactOpen(true);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not create booking");
    } finally {
      setBusy(false);
    }
  };

  const [userName, setUserName] = useState("");
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const m: any = data.user?.user_metadata || {};
      setUserName(m.full_name || m.name || "");
    });
  }, []);

  const waMessage = useMemo(() => {
    if (!provider || !bookedAt) return "";
    const lines = [
      `Assalam-o-alaikum${provider.name ? ` ${provider.name}` : ""}!`,
      `Maine app se aap ko service ke liye book kiya hai.`,
      ``,
      `Service: ${provider.service_category}`,
      `Issue: ${problem.trim()}`,
      `Date: ${format(bookedAt, "EEE d MMM yyyy")}`,
      `Time: ${format(bookedAt, "h:mm a")}`,
      `Location: ${address.trim()}`,
      userName ? `Customer: ${userName}` : "",
      photos.length ? `Photos:\n${photos.map((p) => p.url).join("\n")}` : "",
      ``,
      `Please availability confirm karein. Shukriya!`,
    ].filter(Boolean);
    return lines.join("\n");
  }, [provider, bookedAt, problem, address, photos, userName]);

  const normalizedPhone = provider?.phone ? normalizeWaPhone(provider.phone) : null;
  const telHref = normalizedPhone ? `tel:+${normalizedPhone}` : null;
  const waHref = provider?.phone ? waLink(provider.phone, waMessage) : null;

  if (!provider) {
    return (
      <div className="mx-auto max-w-md px-5 pt-8">
        <p className="text-sm text-muted-foreground">
          Provider details expired. Please pick again from the chat.
        </p>
        <Button asChild className="mt-4">
          <Link to="/chat">Back to chat</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-5 pb-44 pt-6">
      <button
        onClick={() => navigate({ to: "/chat" })}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <h1 className="text-2xl font-bold">Book your service</h1>
      <p className="mt-1 text-sm text-muted-foreground">Confirm details to schedule the visit.</p>

      <div className="mt-4 rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {provider.service_category}
            </p>
            <h2 className="font-semibold">{provider.name}</h2>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" />
              {provider.distanceKm.toFixed(1)} km · {provider.address}
            </p>
          </div>
          {provider.rating != null && (
            <span className="flex shrink-0 items-center gap-1 rounded-md bg-yellow-100 px-1.5 py-0.5 text-xs font-medium text-yellow-900">
              <Star className="h-3 w-3 fill-current" />
              {provider.rating.toFixed(1)}
            </span>
          )}
        </div>
      </div>

      <section className="mt-5">
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <CalendarDays className="h-4 w-4" /> Date
        </h3>
        <div className="rounded-2xl border bg-card p-1 shadow-sm">
          <Calendar
            mode="single"
            selected={date}
            onSelect={(d) => {
              if (d) {
                setDate(d);
                setSlot(null);
              }
            }}
            disabled={(d) =>
              isBefore(startOfDay(d), startOfDay(new Date())) ||
              isBefore(addDays(new Date(), 30), d)
            }
            initialFocus
            className="p-3 pointer-events-auto"
          />
        </div>
      </section>

      <section className="mt-5">
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <Clock className="h-4 w-4" /> Time slot
        </h3>
        {availableSlots.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No more slots today. Pick another date.
          </p>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {availableSlots.map((h) => {
              const active = slot === h;
              return (
                <button
                  key={h}
                  onClick={() => setSlot(h)}
                  className={
                    "rounded-xl border px-2 py-2 text-sm transition " +
                    (active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-card hover:border-primary/50")
                  }
                >
                  {format(new Date().setHours(h, 0, 0, 0), "h a")}
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-5">
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <Home className="h-4 w-4" /> Your address
        </h3>
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="House #, street, area, city"
          maxLength={500}
          className="w-full rounded-xl border bg-card p-3 text-sm shadow-sm outline-none focus:border-primary"
        />
      </section>

      <section className="mt-5">
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <FileText className="h-4 w-4" /> Describe the problem
        </h3>
        <textarea
          value={problem}
          onChange={(e) => setProblem(e.target.value)}
          placeholder="e.g. AC not cooling, makes loud noise — 2nd floor apartment"
          rows={4}
          maxLength={1000}
          className="w-full rounded-xl border bg-card p-3 text-sm shadow-sm outline-none focus:border-primary"
        />
        <p className="mt-1 text-right text-xs text-muted-foreground">
          {problem.length}/1000
        </p>
      </section>

      <section className="mt-3">
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <Camera className="h-4 w-4" /> Photos (optional)
        </h3>
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p, i) => (
            <div key={p.path} className="relative aspect-square overflow-hidden rounded-xl border bg-muted">
              <img src={p.url} alt="upload" className="h-full w-full object-cover" />
              <button
                onClick={() => removePhoto(i)}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
                aria-label="Remove photo"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex aspect-square items-center justify-center rounded-xl border border-dashed bg-card text-muted-foreground hover:border-primary"
            >
              {uploading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Camera className="h-5 w-5" />
              )}
            </button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Up to {MAX_PHOTOS} images, 5MB each.
        </p>
      </section>

      <div className="fixed inset-x-0 bottom-16 z-30 mx-auto max-w-md border-t bg-background p-3 shadow-lg">
        <Button
          className="w-full"
          size="lg"
          disabled={busy || slot == null}
          onClick={openReview}
        >
          {slot != null
            ? `Review — ${format(date, "EEE d MMM")} · ${format(new Date().setHours(slot, 0, 0, 0), "h a")}`
            : "Pick a time slot"}
        </Button>
      </div>

      <Dialog open={reviewOpen} onOpenChange={(o) => !busy && setReviewOpen(o)}>
        <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review your booking</DialogTitle>
            <DialogDescription>Confirm the details before submitting.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Service</p>
              <p className="font-medium">{provider.service_category}</p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Provider</p>
              <p className="font-medium">{provider.name}</p>
              <p className="text-xs text-muted-foreground">
                {provider.distanceKm.toFixed(1)} km · {provider.address}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border bg-card p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Date</p>
                <p className="font-medium">{format(date, "EEE d MMM")}</p>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Time</p>
                <p className="font-medium">
                  {slot != null ? format(new Date().setHours(slot, 0, 0, 0), "h:mm a") : "—"}
                </p>
              </div>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Address</p>
              <p className="font-medium">{address.trim()}</p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Issue</p>
              <p className="whitespace-pre-wrap">{problem.trim()}</p>
            </div>
            {photos.length > 0 && (
              <div className="rounded-lg border bg-card p-3">
                <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                  Photos ({photos.length})
                </p>
                <div className="grid grid-cols-4 gap-1.5">
                  {photos.map((p) => (
                    <img
                      key={p.path}
                      src={p.url}
                      alt="upload"
                      className="aspect-square w-full rounded-md object-cover"
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-2 flex gap-2">
            <Button variant="outline" className="flex-1" disabled={busy} onClick={() => setReviewOpen(false)}>
              Edit
            </Button>
            <Button
              className="flex-1"
              disabled={busy}
              onClick={async () => {
                await confirm();
                setReviewOpen(false);
              }}
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Submit booking
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={contactOpen} onOpenChange={(o) => {
        setContactOpen(o);
        if (!o) navigate({ to: "/bookings" });
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" /> Booking saved
            </DialogTitle>
            <DialogDescription>
              Contact {provider.name} now to confirm availability.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {waHref ? (
              <a
                href={waHref}
                target="_blank"
                rel="noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-md bg-[#25D366] px-4 py-3 text-sm font-medium text-white hover:opacity-90"
              >
                <MessageCircle className="h-4 w-4" /> WhatsApp Provider (auto message)
              </a>
            ) : null}
            {telHref ? (
              <a
                href={telHref}
                className="flex w-full items-center justify-center gap-2 rounded-md border bg-card px-4 py-3 text-sm font-medium hover:bg-accent"
              >
                <Phone className="h-4 w-4" /> Call Provider
              </a>
            ) : null}
            {!waHref && (
              <>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(waMessage)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-[#25D366] px-4 py-3 text-sm font-medium text-white hover:opacity-90"
                >
                  <MessageCircle className="h-4 w-4" /> Send via WhatsApp
                </a>
                <p className="text-xs text-muted-foreground text-center">
                  Provider ka number nahi mila — WhatsApp khulne par contact choose karein.
                </p>
              </>
            )}
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => {
                setContactOpen(false);
                navigate({ to: "/bookings" });
              }}
            >
              Skip — go to my bookings
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>

  );
}
