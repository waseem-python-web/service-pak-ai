import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { updateBookingStatus, rescheduleBooking } from "@/lib/bookings.functions";
import {
  Loader2,
  MapPin,
  Calendar as CalendarIcon,
  Star,
  CheckCircle2,
  Circle,
  Clock,
  Wrench,
  XCircle,
  CalendarClock,
} from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/bookings")({ component: BookingsPage });

type StatusEntry = { status: string; at: string };

type Booking = {
  id: string;
  service_category: string;
  provider_name: string;
  provider_address: string | null;
  provider_rating: number | null;
  distance_km: number | null;
  scheduled_for: string | null;
  status: string;
  ai_reasoning: string | null;
  notes: string | null;
  user_address: string | null;
  photo_urls: string[] | null;
  status_history: StatusEntry[] | null;
  created_at: string;
};

const TIMELINE: { key: string; label: string; icon: typeof Circle }[] = [
  { key: "pending", label: "Pending", icon: Clock },
  { key: "accepted", label: "Accepted", icon: CheckCircle2 },
  { key: "in_progress", label: "In progress", icon: Wrench },
  { key: "completed", label: "Completed", icon: CheckCircle2 },
];

function StatusTimeline({ status, history }: { status: string; history: StatusEntry[] }) {
  if (status === "cancelled") {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-lg bg-destructive/10 p-2 text-xs text-destructive">
        <XCircle className="h-4 w-4" /> Cancelled
      </div>
    );
  }
  const currentIdx = Math.max(0, TIMELINE.findIndex((t) => t.key === status));
  const timeFor = (key: string) => history?.find((h) => h.status === key)?.at;

  return (
    <ol className="mt-3 space-y-2">
      {TIMELINE.map((step, i) => {
        const Icon = step.icon;
        const done = i <= currentIdx;
        const current = i === currentIdx;
        const at = timeFor(step.key);
        return (
          <li key={step.key} className="flex items-center gap-2 text-xs">
            <span
              className={
                "flex h-6 w-6 items-center justify-center rounded-full " +
                (done
                  ? current
                    ? "bg-primary text-primary-foreground"
                    : "bg-green-600 text-white"
                  : "bg-muted text-muted-foreground")
              }
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            <span className={done ? "font-medium" : "text-muted-foreground"}>{step.label}</span>
            {at && (
              <span className="ml-auto text-muted-foreground">
                {format(new Date(at), "d MMM, h:mm a")}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function CancelDialog({
  booking,
  open,
  onOpenChange,
  onConfirm,
}: {
  booking: Booking | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) setReason("");
  }, [open]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
          <AlertDialogDescription>
            {booking
              ? `Your appointment with ${booking.provider_name} will be cancelled. This can't be undone.`
              : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor="cancel-reason" className="text-sm">
            Reason (optional)
          </Label>
          <Textarea
            id="cancel-reason"
            placeholder="Why are you cancelling?"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Keep booking</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await onConfirm(reason.trim());
              } finally {
                setBusy(false);
              }
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cancel booking"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RescheduleDialog({
  booking,
  open,
  onOpenChange,
  onConfirm,
}: {
  booking: Booking | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: (iso: string) => Promise<void>;
}) {
  const [date, setDate] = useState<Date | undefined>();
  const [time, setTime] = useState("10:00");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && booking?.scheduled_for) {
      const d = new Date(booking.scheduled_for);
      setDate(d);
      setTime(format(d, "HH:mm"));
    } else if (!open) {
      setDate(undefined);
      setTime("10:00");
    }
  }, [open, booking]);

  const submit = async () => {
    if (!date) {
      toast.error("Pick a date");
      return;
    }
    const [hh, mm] = time.split(":").map((n) => parseInt(n, 10));
    const target = new Date(date);
    target.setHours(hh || 0, mm || 0, 0, 0);
    if (target.getTime() < Date.now()) {
      toast.error("Pick a future time");
      return;
    }
    setBusy(true);
    try {
      await onConfirm(target.toISOString());
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reschedule appointment</DialogTitle>
          <DialogDescription>
            {booking
              ? `Pick a new time for ${booking.provider_name}. The booking will return to pending.`
              : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-sm">New date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !date && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="resched-time" className="text-sm">
              New time
            </Label>
            <Input
              id="resched-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm new time"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BookingsPage() {
  const [items, setItems] = useState<Booking[] | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);
  const [reschedTarget, setReschedTarget] = useState<Booking | null>(null);
  const updateStatus = useServerFn(updateBookingStatus);
  const reschedule = useServerFn(rescheduleBooking);

  const load = () =>
    supabase
      .from("bookings")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }: { data: unknown }) =>
        setItems((data as Booking[] | null) ?? []),
      );

  useEffect(() => {
    load();
  }, []);

  const handleCancel = async (reason: string) => {
    if (!cancelTarget) return;
    try {
      await updateStatus({
        data: { booking_id: cancelTarget.id, status: "cancelled", reason: reason || null },
      });
      toast.success("Booking cancelled");
      setCancelTarget(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not cancel");
    }
  };

  const handleReschedule = async (iso: string) => {
    if (!reschedTarget) return;
    try {
      await reschedule({ data: { booking_id: reschedTarget.id, scheduled_for: iso } });
      toast.success("Booking rescheduled");
      setReschedTarget(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reschedule");
    }
  };

  return (
    <div className="mx-auto max-w-md px-5 pb-10 pt-8">
      <h1 className="text-2xl font-bold">Your bookings</h1>
      <p className="mt-1 text-sm text-muted-foreground">Track every appointment</p>

      <div className="mt-5 space-y-3">
        {items === null && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
        {items?.length === 0 && (
          <div className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">
            No bookings yet. Ask the AI assistant to book a service.
          </div>
        )}
        {items?.map((b) => {
          const active = b.status !== "completed" && b.status !== "cancelled";
          return (
            <article key={b.id} className="rounded-2xl border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {b.service_category}
                  </p>
                  <h3 className="font-semibold">{b.provider_name}</h3>
                </div>
                <span
                  className={
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium " +
                    (b.status === "cancelled"
                      ? "bg-destructive/10 text-destructive"
                      : b.status === "completed"
                        ? "bg-green-100 text-green-800"
                        : "bg-primary/10 text-primary")
                  }
                >
                  {b.status.replace("_", " ")}
                </span>
              </div>

              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                {b.provider_address && (
                  <p className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {b.distance_km?.toFixed(1)} km · {b.provider_address}
                  </p>
                )}
                <p className="flex items-center gap-1">
                  <CalendarIcon className="h-3 w-3" />
                  {b.scheduled_for ? format(new Date(b.scheduled_for), "PPp") : "ASAP"}
                </p>
                {b.provider_rating != null && (
                  <p className="flex items-center gap-1">
                    <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />{" "}
                    {b.provider_rating.toFixed(1)}
                  </p>
                )}
              </div>

              {b.user_address && (
                <p className="mt-2 text-xs">
                  <span className="font-medium">At:</span> {b.user_address}
                </p>
              )}
              {b.notes && (
                <p className="mt-1 text-xs">
                  <span className="font-medium">Problem:</span> {b.notes}
                </p>
              )}

              {b.photo_urls && b.photo_urls.length > 0 && (
                <div className="mt-2 flex gap-1.5 overflow-x-auto">
                  {b.photo_urls.map((url) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="block h-16 w-16 shrink-0 overflow-hidden rounded-lg border"
                    >
                      <img src={url} alt="" className="h-full w-full object-cover" />
                    </a>
                  ))}
                </div>
              )}

              <StatusTimeline
                status={b.status}
                history={(b.status_history as StatusEntry[]) ?? []}
              />

              {active && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setReschedTarget(b)}
                  >
                    <CalendarClock className="mr-1 h-4 w-4" />
                    Reschedule
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setCancelTarget(b)}
                  >
                    <XCircle className="mr-1 h-4 w-4" />
                    Cancel
                  </Button>
                </div>
              )}
            </article>
          );
        })}
      </div>

      <CancelDialog
        booking={cancelTarget}
        open={!!cancelTarget}
        onOpenChange={(o) => !o && setCancelTarget(null)}
        onConfirm={handleCancel}
      />
      <RescheduleDialog
        booking={reschedTarget}
        open={!!reschedTarget}
        onOpenChange={(o) => !o && setReschedTarget(null)}
        onConfirm={handleReschedule}
      />
    </div>
  );
}
