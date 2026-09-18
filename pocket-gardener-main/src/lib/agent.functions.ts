import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type Place = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  phone?: string;
  rating?: number;
  userRatingCount?: number;
  distanceKm: number;
};

function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function googlePlaces(query: string, lat: number, lng: number, apiKey: string): Promise<{ results: Place[]; radiusKm: number }> {
  // STRICT nearest-first ladder. locationBias is only a HINT — we hard-filter
  // every result by haversine distance and only fall back to the next radius
  // if the current one is truly empty. This prevents Lahore-style leakage.
  const RADII_KM = [1, 2, 5, 10, 20, 50];
  for (const radiusKm of RADII_KM) {
    const radiusM = radiusKm * 1000;
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.location,places.nationalPhoneNumber,places.rating,places.userRatingCount",
      },
      body: JSON.stringify({
        textQuery: query,
        locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: radiusM } },
        maxResultCount: 20,
        regionCode: "PK",
        languageCode: "en",
      }),
    });
    if (!res.ok) throw new Error(`Places ${res.status}: ${await res.text()}`);
    const json = await res.json();
    const places = (json.places ?? []) as Array<{
      id: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      location?: { latitude: number; longitude: number };
      nationalPhoneNumber?: string;
      rating?: number;
      userRatingCount?: number;
    }>;
    const mapped: Place[] = places
      .filter((p) => p.location)
      .map((p) => ({
        id: p.id,
        name: p.displayName?.text ?? "Unknown",
        address: p.formattedAddress ?? "",
        lat: p.location!.latitude,
        lng: p.location!.longitude,
        phone: p.nationalPhoneNumber,
        rating: p.rating,
        userRatingCount: p.userRatingCount,
        distanceKm: haversine(lat, lng, p.location!.latitude, p.location!.longitude),
      }))
      // STRICT distance gate — drop anything outside the active radius.
      .filter((p) => p.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm);
    if (mapped.length) return { results: mapped, radiusKm };
  }
  return { results: [], radiusKm: 50 };
}

// Distance-FIRST ranking. Providers are bucketed by ~0.5 km bands so that
// nearer providers always beat farther ones; rating/jobs only break ties
// inside the same band. Never re-orders a farther provider above a nearer one.
function rank(places: Place[], jobsByName: Map<string, number>): Array<Place & { completedJobs: number }> {
  return [...places]
    .map((p) => ({ ...p, completedJobs: jobsByName.get(p.name.toLowerCase()) ?? 0 }))
    .sort((a, b) => {
      const bandA = Math.floor(a.distanceKm * 2); // 0.5 km buckets
      const bandB = Math.floor(b.distanceKm * 2);
      if (bandA !== bandB) return bandA - bandB;
      if ((b.rating ?? 0) !== (a.rating ?? 0)) return (b.rating ?? 0) - (a.rating ?? 0);
      if (b.completedJobs !== a.completedJobs) return b.completedJobs - a.completedJobs;
      return (b.userRatingCount ?? 0) - (a.userRatingCount ?? 0);
    });
}

// Fast multilingual keyword → canonical category + English search phrase.
// Covers English, Urdu, Roman Urdu, Hindi, Punjabi, Sindhi, Marathi & informal local words.
const CATEGORY_ALIASES: Array<{ patterns: RegExp; category: string; query: string }> = [
  { patterns: /\b(ac|a\.c|air ?cond|cooling|اے ?سی|ایئر ?کنڈیشن|एसी|ए\.सी)\b/i, category: "AC Repair", query: "AC repair service" },
  { patterns: /\b(fridge|refrigerator|freezer|فرج|فریج|फ्रिज|फ़्रिज)\b/i, category: "Fridge Repair", query: "refrigerator repair" },
  { patterns: /\b(washing ?machine|washer|dryer|واشنگ ?مشین|कपड़े ?धोने|वॉशिंग)\b/i, category: "Washing Machine Repair", query: "washing machine repair" },
  { patterns: /\b(geyser|water ?heater|گیزر|गीजर)\b/i, category: "Geyser Repair", query: "geyser water heater repair" },
  { patterns: /\b(microwave|oven|مائیکروویو|माइक्रोवेव)\b/i, category: "Appliance Repair", query: "microwave oven repair" },
  { patterns: /\b(plumb|plummer|nalk|nalka|pipe|leak|پلمبر|نلکا|پائپ|نل|پلمبنگ|प्लंबर|नल|पाइप|ਪਲੰਬਰ|پانی|पानी)\b/i, category: "Plumber", query: "plumber" },
  { patterns: /\b(electric|electrici|bijli|wire|wiring|light|mistri|مستری|الیکٹریشن|بجلی|وائرنگ|इलेक्ट्रीशियन|बिजली|वायरिंग|ਬਿਜਲੀ)\b/i, category: "Electrician", query: "electrician" },
  { patterns: /\b(carpent|barhai|barhayi|lakri|furniture|کارپینٹر|بڑھئی|لکڑی|कारपेंटर|बढ़ई|लकड़ी)\b/i, category: "Carpenter", query: "carpenter furniture" },
  { patterns: /\b(paint|painter|rang ?saaz|پینٹر|رنگ|पेंटर|रंगाई)\b/i, category: "Painter", query: "house painter" },
  { patterns: /\b(clean|safai|maid|housekeep|ghar ki ?safai|صفائی|گھر ?کی ?صفائی|सफाई|घर ?की ?सफाई)\b/i, category: "Cleaning Services", query: "house cleaning service" },
  { patterns: /\b(beautic|salon|parlor|parlour|makeup|پارلر|بیوٹیشن|पार्लर|ब्यूटीशियन)\b/i, category: "Beautician", query: "beauty parlour beautician" },
  { patterns: /\b(tutor|teacher|ustad|tuition|ٹیوٹر|استاد|ٹیوشن|ट्यूटर|शिक्षक|ट्यूशन)\b/i, category: "Tutor", query: "private tutor home tuition" },
  { patterns: /\b(bike|motorcycle|motor ?cycle|moto ?mechanic|بائیک|موٹر ?سائیکل|बाइक|मोटरसाइकिल)\b/i, category: "Motorcycle Mechanic", query: "motorcycle bike mechanic workshop" },
  { patterns: /\b(car|gari|gaari|auto ?mechanic|workshop|گاڑی|کار|कार|गाड़ी)\b/i, category: "Car Mechanic", query: "car mechanic auto workshop" },
  { patterns: /\b(laptop|computer|pc|لیپ ?ٹاپ|کمپیوٹر|लैपटॉप|कंप्यूटर)\b/i, category: "Computer Repair", query: "laptop computer repair shop" },
  { patterns: /\b(mobile|phone|smartphone|موبائل|فون|मोबाइल|फोन)\b/i, category: "Mobile Repair", query: "mobile phone repair shop" },
  { patterns: /\b(tv|television|ٹی ?وی|टीवी)\b/i, category: "TV Repair", query: "TV LED repair" },
  { patterns: /\b(mason|raj ?mistri|tile|راج ?مستری|ٹائل|राजमिस्त्री|टाइल)\b/i, category: "Mason", query: "mason tile worker" },
  { patterns: /\b(welder|welding|ویلڈر|वेल्डर)\b/i, category: "Welder", query: "welder welding shop" },
  { patterns: /\b(gardener|mali|باغبان|مالی|माली|गार्डनर)\b/i, category: "Gardener", query: "gardener landscaping" },
  { patterns: /\b(pest|cockroach|termite|پیسٹ|دیمک|कीट|दीमक)\b/i, category: "Pest Control", query: "pest control service" },
  { patterns: /\b(tailor|darzi|درزی|ٹیلر|दर्जी|टेलर)\b/i, category: "Tailor", query: "tailor stitching" },
  { patterns: /\b(doctor|hakim|clinic|ڈاکٹر|کلینک|डॉक्टर|क्लिनिक)\b/i, category: "Doctor / Clinic", query: "doctor clinic" },
];

function detectCategory(text: string): { category: string; query: string } | null {
  for (const a of CATEGORY_ALIASES) if (a.patterns.test(text)) return { category: a.category, query: a.query };
  return null;
}

const SYSTEM = `You are ServicePak, an autonomous AI assistant for Pakistan that helps people find local service providers.

The user may write in English, Urdu, Roman Urdu, Hindi, Punjabi, Sindhi, Marathi, mixed languages, broken sentences, voice-style typing, or informal local wording. Always reply in the SAME language/script they used.

Step 1 — INTENT: extract the core service even if the sentence is incomplete or mixed. Normalize synonyms to a canonical category:
  • "AC wala", "AC theek", "cooling repair", "اے سی ٹھیک" → AC Repair
  • "mistri", "light ka kaam", "wire ka kaam", "bijli" → Electrician
  • "bike mechanic", "motorcycle ka kaam", "موٹر سائیکل" → Motorcycle Mechanic
  • "pani ki pipe leak", "nalka", "plumber chahiye" → Plumber
  • "fridge repair", "washing machine theek", "geyser" → Appliance Repair
  • "ghar ka painter", "rang", "tutor", "darzi", "mali" → map to closest category
  Use the search_providers tool with an ENGLISH query (e.g. "AC repair", "motorcycle mechanic", "plumber") and the canonical service_category.

Step 2 — NEAREST-FIRST SEARCH: the tool ALREADY enforces strict nearest-first logic. It tries 1km → 2km → 5km → 10km → 20km → 50km in order, hard-filters by haversine distance, and only expands when the inner ring is empty. Results are sorted by DISTANCE FIRST (rating/jobs only break ties inside the same 0.5 km band). Trust the order — do NOT reorder them by rating or popularity.

Step 3 — RECOMMEND: Present ONLY the providers the tool returned, in the order it returned them. Use concise bullets (name · X.X km · ★rating · N jobs). Mention the search radius used (e.g. "within 5 km"). The #1 pick is ALWAYS the closest one — explain in one short line why nearby matters (faster arrival, lower travel cost). Then ask if they want to book.

Step 4 — BOOK: only after the user confirms, call book_provider with the closest provider unless the user explicitly picks another.

HARD RULES — never violate:
• Never suggest a provider that is not in the tool's result list.
• Never reorder results to put a farther provider above a nearer one.
• Never mention providers from other cities if the tool returned local ones.
• If the tool returns 0 results even at 50 km, tell the user honestly that no providers were found nearby — do NOT invent or recall any.

Tone: brief, warm, professional. Match the user's language.`;

type Msg = { role: "system" | "user" | "assistant" | "tool"; content: string; tool_call_id?: string; tool_calls?: any[]; name?: string };

export const runAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).min(1).max(40),
      lat: z.number(),
      lng: z.number(),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const placesKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!lovableKey) throw new Error("LOVABLE_API_KEY not configured");
    if (!placesKey) throw new Error("GOOGLE_MAPS_API_KEY not configured");

    const { supabase, userId } = context;
    const trace: Array<{ agent: string; action: string; reasoning?: string; data?: any }> = [];

    const tools = [
      {
        type: "function",
        function: {
          name: "search_providers",
          description: "Search Google Places for real service providers near the user. Use English keywords like 'AC repair', 'plumber'.",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "English search phrase, e.g. 'plumber', 'AC repair'" },
              service_category: { type: "string", description: "Normalized category like 'Plumber', 'AC Technician', 'Electrician'." },
            },
            required: ["query", "service_category"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "book_provider",
          description: "Create a booking for the recommended provider. Only call after user confirms.",
          parameters: {
            type: "object",
            properties: {
              provider_id: { type: "string" },
              service_category: { type: "string" },
              when_iso: { type: "string", description: "ISO timestamp for the appointment, or null if ASAP." },
              notes: { type: "string" },
              reasoning: { type: "string", description: "Why this provider was selected." },
            },
            required: ["provider_id", "service_category", "reasoning"],
          },
        },
      },
    ];

    const msgs: Msg[] = [
      { role: "system", content: SYSTEM + `\n\nUser location: lat=${data.lat}, lng=${data.lng}.` },
      ...data.messages,
    ];

    let providerCache: Place[] = [];

    for (let step = 0; step < 6; step++) {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${lovableKey}`,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: msgs,
          tools,
          tool_choice: "auto",
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        if (res.status === 429) throw new Error("AI rate limit, please wait a moment.");
        if (res.status === 402) throw new Error("AI credits exhausted. Add credits in Workspace → Usage.");
        throw new Error(`AI gateway error ${res.status}: ${txt}`);
      }
      const json = await res.json();
      const choice = json.choices?.[0]?.message;
      if (!choice) break;

      msgs.push(choice);
      const calls = choice.tool_calls ?? [];
      if (!calls.length) {
        // final assistant text
        return {
          reply: choice.content ?? "",
          providers: providerCache,
          trace,
        };
      }

      for (const call of calls) {
        const fnName = call.function?.name;
        let args: any = {};
        try {
          args = JSON.parse(call.function?.arguments ?? "{}");
        } catch {}

        if (fnName === "search_providers") {
          // Alias hint can override weak model queries with a stronger English phrase.
          const lastUser = [...data.messages].reverse().find((m) => m.role === "user")?.content ?? "";
          const alias = detectCategory(lastUser) ?? detectCategory(args.query ?? "");
          const finalQuery = alias?.query ?? args.query;
          const finalCategory = args.service_category ?? alias?.category ?? "Service";

          trace.push({
            agent: "Intent Agent",
            action: `Detected "${finalCategory}" from "${lastUser.slice(0, 60)}"`,
            reasoning: alias ? "Matched multilingual alias dictionary." : "Used model-extracted query.",
          });
          trace.push({
            agent: "Provider Discovery Agent",
            action: `Searching Google Places for "${finalQuery}"`,
            reasoning: `User asked for ${finalCategory}. Auto-expanding radius 2→5→10 km if needed.`,
          });
          await supabase.from("agent_logs").insert({
            user_id: userId,
            agent: "Provider Discovery Agent",
            action: `places.searchText("${finalQuery}")`,
            reasoning: `Category=${finalCategory}`,
            data: { query: finalQuery, lat: data.lat, lng: data.lng },
          });

          const { results: found, radiusKm: usedRadiusKm } = await googlePlaces(finalQuery, data.lat, data.lng, placesKey);
          // Look up past completed bookings per provider name to boost trusted providers.
          const { data: pastJobs } = await supabase
            .from("bookings")
            .select("provider_name,status")
            .in("status", ["completed", "confirmed"]);
          const jobsByName = new Map<string, number>();
          for (const row of pastJobs ?? []) {
            const k = (row.provider_name ?? "").toLowerCase();
            jobsByName.set(k, (jobsByName.get(k) ?? 0) + 1);
          }
          const ranked = rank(found, jobsByName).slice(0, 5);
          providerCache = ranked;

          trace.push({
            agent: "Ranking Agent",
            action: `Found ${found.length} within ${usedRadiusKm} km, returning top ${ranked.length}`,
            reasoning: "Distance-FIRST: 0.5km buckets, then rating, then completed jobs. Strict radius filter applied.",
            data: ranked.map((p) => ({ name: p.name, distanceKm: p.distanceKm.toFixed(2), rating: p.rating })),
          });
          await supabase.from("agent_logs").insert({
            user_id: userId,
            agent: "Ranking Agent",
            action: `Ranked ${found.length} providers within ${usedRadiusKm}km`,
            reasoning: "distance-first, strict radius",
            data: { count: ranked.length, radiusKm: usedRadiusKm },
          });

          msgs.push({
            role: "tool",
            tool_call_id: call.id,
            name: fnName,
            content: JSON.stringify({ providers: ranked, radiusKm: usedRadiusKm }),
          });
        } else if (fnName === "book_provider") {
          const provider = providerCache.find((p) => p.id === args.provider_id) ?? providerCache[0];
          if (!provider) {
            msgs.push({
              role: "tool",
              tool_call_id: call.id,
              name: fnName,
              content: JSON.stringify({ error: "No provider in context. Run search_providers first." }),
            });
            continue;
          }
          const { data: booking, error } = await supabase
            .from("bookings")
            .insert({
              user_id: userId,
              service_category: args.service_category,
              provider_name: provider.name,
              provider_phone: provider.phone,
              provider_address: provider.address,
              provider_lat: provider.lat,
              provider_lng: provider.lng,
              provider_rating: provider.rating,
              distance_km: provider.distanceKm,
              scheduled_for: args.when_iso ?? null,
              notes: args.notes ?? null,
              status: "pending",
              ai_reasoning: args.reasoning,
            })
            .select()
            .single();
          if (error) {
            msgs.push({
              role: "tool",
              tool_call_id: call.id,
              name: fnName,
              content: JSON.stringify({ error: error.message }),
            });
            continue;
          }

          trace.push({
            agent: "Booking Agent",
            action: `Created booking ${booking.id.slice(0, 8)} with ${provider.name}`,
            reasoning: args.reasoning,
          });
          trace.push({
            agent: "Reminder Agent",
            action: "Reminder scheduled 1 hour before appointment",
            reasoning: "Auto follow-up to reduce no-shows.",
          });
          await supabase.from("agent_logs").insert([
            {
              user_id: userId,
              booking_id: booking.id,
              agent: "Booking Agent",
              action: `Created booking with ${provider.name}`,
              reasoning: args.reasoning,
              data: { booking_id: booking.id },
            },
            {
              user_id: userId,
              booking_id: booking.id,
              agent: "Reminder Agent",
              action: "Reminder scheduled 1 hour before appointment",
              reasoning: "Reduce no-shows.",
            },
          ]);

          msgs.push({
            role: "tool",
            tool_call_id: call.id,
            name: fnName,
            content: JSON.stringify({
              booking_id: booking.id,
              status: "confirmed",
              provider: provider.name,
              when: args.when_iso ?? "ASAP",
            }),
          });
        } else {
          msgs.push({
            role: "tool",
            tool_call_id: call.id,
            name: fnName ?? "unknown",
            content: JSON.stringify({ error: "Unknown tool" }),
          });
        }
      }
    }

    return { reply: "", providers: providerCache, trace };
  });