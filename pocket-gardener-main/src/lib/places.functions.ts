import { createServerFn } from "@tanstack/react-start";

export const getMapsKey = createServerFn({ method: "GET" }).handler(async () => {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error("GOOGLE_MAPS_API_KEY not configured");
  return { key };
});

type SearchInput = {
  query: string;
  lat: number;
  lng: number;
};

type Place = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  phone?: string;
  rating?: number;
  userRatingCount?: number;
  types?: string[];
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

async function translateToEnglish(text: string): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return text;
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "You translate any service-search query (Urdu, Punjabi, Hindi, English, Roman Urdu, etc.) into a short English search phrase suitable for Google Places search in Pakistan. Output ONLY the translated/normalized search phrase, nothing else. Example: 'AC theek karne wala' -> 'AC repair'. 'پلمبر' -> 'plumber'. 'گاڑی مکینک' -> 'car mechanic'.",
          },
          { role: "user", content: text },
        ],
      }),
    });
    if (!res.ok) return text;
    const data = await res.json();
    const out = data?.choices?.[0]?.message?.content?.trim();
    return out || text;
  } catch {
    return text;
  }
}

async function placesSearch(
  textQuery: string,
  lat: number,
  lng: number,
  radiusMeters: number,
  apiKey: string,
): Promise<Place[]> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location,places.nationalPhoneNumber,places.internationalPhoneNumber,places.rating,places.userRatingCount,places.types",
    },
    body: JSON.stringify({
      textQuery,
      locationBias: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: radiusMeters,
        },
      },
      maxResultCount: 20,
      regionCode: "PK",
      languageCode: "en",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Places API error ${res.status}: ${body}`);
  }
  const data = await res.json();
  const places = (data.places ?? []) as Array<{
    id: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    location?: { latitude: number; longitude: number };
    nationalPhoneNumber?: string;
    internationalPhoneNumber?: string;
    rating?: number;
    userRatingCount?: number;
    types?: string[];
  }>;
  return places
    .filter((p) => p.location)
    .map((p) => {
      const dist = haversine(lat, lng, p.location!.latitude, p.location!.longitude);
      return {
        id: p.id,
        name: p.displayName?.text ?? "Unknown",
        address: p.formattedAddress ?? "",
        lat: p.location!.latitude,
        lng: p.location!.longitude,
        phone: p.nationalPhoneNumber ?? p.internationalPhoneNumber,
        rating: p.rating,
        userRatingCount: p.userRatingCount,
        types: p.types,
        distanceKm: dist,
      } satisfies Place;
    })
    .filter((p) => p.distanceKm <= radiusMeters / 1000 + 0.5)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

export const searchPlaces = createServerFn({ method: "POST" })
  .inputValidator((input: SearchInput) => {
    if (!input || typeof input.query !== "string" || !input.query.trim()) {
      throw new Error("query required");
    }
    if (typeof input.lat !== "number" || typeof input.lng !== "number") {
      throw new Error("lat/lng required");
    }
    return input;
  })
  .handler(async ({ data }) => {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) throw new Error("GOOGLE_MAPS_API_KEY not configured");

    const englishQuery = await translateToEnglish(data.query);

    const radii = [2000, 4000, 6000, 10000];
    let results: Place[] = [];
    let usedRadiusKm = 10;
    for (const r of radii) {
      results = await placesSearch(englishQuery, data.lat, data.lng, r, apiKey);
      if (results.length > 0) {
        usedRadiusKm = r / 1000;
        break;
      }
    }

    return {
      query: data.query,
      translatedQuery: englishQuery,
      radiusKm: usedRadiusKm,
      results,
    };
  });