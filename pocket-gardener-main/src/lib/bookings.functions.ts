import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const createBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      service_category: z.string().min(1).max(80),
      provider_id: z.string().min(1).max(200),
      provider_name: z.string().min(1).max(200),
      provider_phone: z.string().max(40).optional().nullable(),
      provider_address: z.string().max(500).optional().nullable(),
      provider_lat: z.number(),
      provider_lng: z.number(),
      provider_rating: z.number().nullable().optional(),
      distance_km: z.number().nullable().optional(),
      scheduled_for: z.string().datetime(),
      user_address: z.string().min(3).max(500),
      notes: z.string().min(3).max(1000),
      photo_urls: z.array(z.string().url()).max(6).optional().default([]),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const reasoning = `User booked ${data.provider_name} for ${data.scheduled_for} at ${data.user_address}.`;
    const { data: booking, error } = await supabase
      .from("bookings")
      .insert({
        user_id: userId,
        service_category: data.service_category,
        provider_name: data.provider_name,
        provider_phone: data.provider_phone ?? null,
        provider_address: data.provider_address ?? null,
        provider_lat: data.provider_lat,
        provider_lng: data.provider_lng,
        provider_rating: data.provider_rating ?? null,
        distance_km: data.distance_km ?? null,
        scheduled_for: data.scheduled_for,
        user_address: data.user_address,
        notes: data.notes,
        photo_urls: data.photo_urls ?? [],
        status: "pending",
        ai_reasoning: reasoning,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("agent_logs").insert([
      {
        user_id: userId,
        booking_id: booking.id,
        agent: "Scheduling Agent",
        action: `Booking created for ${data.provider_name} at ${data.scheduled_for}`,
        reasoning,
      },
    ]);

    return { booking_id: booking.id };
  });

export const updateBookingStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      booking_id: z.string().uuid(),
      status: z.enum(["pending", "accepted", "in_progress", "completed", "cancelled"]),
      reason: z.string().max(500).optional().nullable(),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verify ownership and that booking is mutable
    const { data: existing, error: fetchErr } = await supabase
      .from("bookings")
      .select("id,status,provider_name")
      .eq("id", data.booking_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!existing) throw new Error("Booking not found");
    if (existing.status === "completed" || existing.status === "cancelled") {
      throw new Error(`Booking is already ${existing.status}`);
    }

    const { error } = await supabase
      .from("bookings")
      .update({ status: data.status })
      .eq("id", data.booking_id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);

    await supabase.from("agent_logs").insert([
      {
        user_id: userId,
        booking_id: data.booking_id,
        agent: "Scheduling Agent",
        action: `Status changed to ${data.status} for ${existing.provider_name}`,
        reasoning: data.reason ?? `User updated status to ${data.status}.`,
      },
    ]);

    return { ok: true };
  });

export const rescheduleBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      booking_id: z.string().uuid(),
      scheduled_for: z.string().datetime(),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const when = new Date(data.scheduled_for);
    if (Number.isNaN(when.getTime())) throw new Error("Invalid date");
    if (when.getTime() < Date.now() - 60_000) {
      throw new Error("New time must be in the future");
    }

    const { data: existing, error: fetchErr } = await supabase
      .from("bookings")
      .select("id,status,provider_name,scheduled_for")
      .eq("id", data.booking_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!existing) throw new Error("Booking not found");
    if (existing.status === "completed" || existing.status === "cancelled") {
      throw new Error(`Cannot reschedule a ${existing.status} booking`);
    }

    const { error } = await supabase
      .from("bookings")
      .update({ scheduled_for: data.scheduled_for, status: "pending" })
      .eq("id", data.booking_id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);

    await supabase.from("agent_logs").insert([
      {
        user_id: userId,
        booking_id: data.booking_id,
        agent: "Scheduling Agent",
        action: `Rescheduled ${existing.provider_name} from ${existing.scheduled_for ?? "ASAP"} to ${data.scheduled_for}`,
        reasoning: "User requested a new appointment time.",
      },
    ]);

    return { ok: true };
  });
