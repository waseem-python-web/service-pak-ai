import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { APIProvider, Map, Marker, InfoWindow, useMap } from "@vis.gl/react-google-maps";
import { getMapsKey, searchPlaces } from "@/lib/places.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Search, MapPin, Star, Phone, Navigation, X } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { WhatsAppButton } from "@/components/WhatsAppButton";

type Place = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  phone?: string;
  rating?: number;
  distanceKm: number;
};

const mapSearchSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  address: z.string().optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  phone: z.string().optional(),
  rating: z.coerce.number().optional(),
});

export const Route = createFileRoute("/_authenticated/map")({
  component: MapPage,
  validateSearch: mapSearchSchema,
});

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function MapPage() {
  const sp = useSearch({ from: "/_authenticated/map" });
  const getKey = useServerFn(getMapsKey);
  const search = useServerFn(searchPlaces);
  const { data: keyData, isLoading } = useQuery({
    queryKey: ["maps-key"],
    queryFn: () => getKey(),
    staleTime: Infinity,
  });
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [active, setActive] = useState<Place | null>(null);

  // Focused provider passed via search params
  const focused: Place | null = useMemo(() => {
    if (sp.id && sp.lat != null && sp.lng != null && sp.name) {
      return {
        id: sp.id,
        name: sp.name,
        address: sp.address ?? "",
        lat: sp.lat,
        lng: sp.lng,
        phone: sp.phone,
        rating: sp.rating,
        distanceKm: 0,
      };
    }
    return null;
  }, [sp]);

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (p) => setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setCoords({ lat: 33.6844, lng: 73.0479 }),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, []);

  useEffect(() => {
    if (focused) setActive(focused);
  }, [focused]);

  const mut = useMutation({
    mutationFn: async (q: string) => {
      if (!coords) throw new Error("No location");
      return await search({ data: { query: q, lat: coords.lat, lng: coords.lng } });
    },
    onSuccess: (r) => {
      setResults(r.results);
      if (r.results.length === 0) toast.message("No providers found nearby");
    },
    onError: (e: any) => toast.error(e?.message ?? "Search failed"),
  });

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (!keyData) {
    return <div className="p-6 text-sm text-destructive">Maps key not configured.</div>;
  }

  const center = focused ? { lat: focused.lat, lng: focused.lng } : coords;
  const distanceToFocused = focused && coords ? haversineKm(coords, focused) : null;
  const directionsHref =
    focused && coords
      ? `https://www.google.com/maps/dir/?api=1&origin=${coords.lat},${coords.lng}&destination=${focused.lat},${focused.lng}&travelmode=driving`
      : focused
      ? `https://www.google.com/maps/search/?api=1&query=${focused.lat},${focused.lng}`
      : null;

  return (
    <APIProvider apiKey={keyData.key}>
      <div className="mx-auto flex h-[calc(100vh-5rem)] max-w-md flex-col">
        <header
          className="space-y-3 px-4 py-3 text-white"
          style={{ background: "var(--gradient-brand)" }}
        >
          <h1 className="text-base font-semibold">
            {focused ? `Navigate to ${focused.name}` : "Map search"}
          </h1>
          {!focused && (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (query.trim()) mut.mutate(query.trim());
              }}
            >
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="plumber, AC repair…"
                className="bg-white text-foreground"
              />
              <Button type="submit" size="icon" variant="secondary" disabled={mut.isPending}>
                {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </form>
          )}
        </header>

        <div className="relative flex-1">
          {center && (
            <Map
              defaultCenter={center}
              defaultZoom={focused ? 15 : 13}
              gestureHandling="greedy"
              disableDefaultUI
            >
              <Recenter target={center} zoom={focused ? 15 : 13} />
              {coords && (
                <Marker
                  position={coords}
                  icon={{
                    path: 0, // google.maps.SymbolPath.CIRCLE
                    scale: 8,
                    fillColor: "#2563eb",
                    fillOpacity: 1,
                    strokeColor: "#fff",
                    strokeWeight: 2,
                  } as any}
                  title="You"
                />
              )}
              {focused && (
                <Marker
                  position={{ lat: focused.lat, lng: focused.lng }}
                  onClick={() => setActive(focused)}
                />
              )}
              {results.map((p) => (
                <Marker
                  key={p.id}
                  position={{ lat: p.lat, lng: p.lng }}
                  onClick={() => setActive(p)}
                />
              ))}
              {active && (
                <InfoWindow
                  position={{ lat: active.lat, lng: active.lng }}
                  onCloseClick={() => setActive(null)}
                >
                  <div className="space-y-1.5 text-sm">
                    <p className="font-semibold">{active.name}</p>
                    {active.address && (
                      <p className="flex items-center gap-1 text-xs text-gray-600">
                        <MapPin className="h-3 w-3" /> {active.address}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {active.distanceKm != null && (
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-700">
                          {active.distanceKm.toFixed(1)} km
                        </span>
                      )}
                      {active.rating != null && (
                        <span className="flex items-center gap-1 rounded bg-yellow-100 px-1.5 py-0.5 text-yellow-900">
                          <Star className="h-3 w-3 fill-current" /> {active.rating.toFixed(1)}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {active.phone && (
                        <a
                          href={`tel:${active.phone}`}
                          className="inline-flex items-center gap-1 rounded-md border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700"
                        >
                          <Phone className="h-3 w-3" /> Call
                        </a>
                      )}
                      <WhatsAppButton
                        phone={active.phone}
                        providerName={active.name}
                        category={query || "Service"}
                        problem={query || undefined}
                      />
                      {coords && (
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&origin=${coords.lat},${coords.lng}&destination=${active.lat},${active.lng}&travelmode=driving`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground"
                        >
                          <Navigation className="h-3 w-3" /> Directions
                        </a>
                      )}
                    </div>
                  </div>
                </InfoWindow>
              )}
            </Map>
          )}

          {focused && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3">
              <div className="pointer-events-auto rounded-2xl border bg-card p-3 shadow-lg">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{focused.name}</p>
                    {focused.address && (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{focused.address}</span>
                      </p>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      {distanceToFocused != null && (
                        <span className="rounded bg-secondary px-1.5 py-0.5 text-secondary-foreground">
                          {distanceToFocused.toFixed(1)} km away
                        </span>
                      )}
                      {focused.rating != null && (
                        <span className="flex items-center gap-1 rounded bg-yellow-100 px-1.5 py-0.5 text-yellow-900">
                          <Star className="h-3 w-3 fill-current" /> {focused.rating.toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => window.history.back()}
                    className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {focused.phone && (
                    <a
                      href={`tel:${focused.phone}`}
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-2 text-xs font-medium text-primary"
                    >
                      <Phone className="h-3.5 w-3.5" /> Call
                    </a>
                  )}
                  <WhatsAppButton
                    phone={focused.phone}
                    providerName={focused.name}
                    category={query || "Service"}
                    problem={query || undefined}
                    variant="btn"
                  />
                  {directionsHref && (
                    <a
                      href={directionsHref}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-primary px-2 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
                    >
                      <Navigation className="h-3.5 w-3.5" /> Directions
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}
          {!focused && results.length > 0 && (
            <div className="absolute inset-x-0 bottom-0 max-h-[45%] overflow-y-auto bg-background/95 p-3 backdrop-blur">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                {results.length} nearby — tap a card to focus
              </p>
              <div className="space-y-2">
                {results.map((p) => (
                  <div key={p.id} className="rounded-xl border bg-card p-3 shadow-sm">
                    <button
                      onClick={() => setActive(p)}
                      className="block w-full text-left"
                    >
                      <p className="text-sm font-semibold">{p.name}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {p.distanceKm.toFixed(1)} km · {p.address}
                      </p>
                      {p.rating != null && (
                        <p className="mt-1 flex items-center gap-1 text-xs">
                          <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                          {p.rating.toFixed(1)}
                        </p>
                      )}
                    </button>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {p.phone && (
                        <a
                          href={`tel:${p.phone}`}
                          className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-medium text-primary"
                        >
                          <Phone className="h-3 w-3" /> Call
                        </a>
                      )}
                      <WhatsAppButton
                        phone={p.phone}
                        providerName={p.name}
                        category={query || "Service"}
                        problem={query || undefined}
                      />
                      {coords && (
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&origin=${coords.lat},${coords.lng}&destination=${p.lat},${p.lng}&travelmode=driving`}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-auto inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground"
                        >
                          <Navigation className="h-3 w-3" /> Directions
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </APIProvider>
  );
}

function Recenter({ target, zoom }: { target: { lat: number; lng: number }; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    map.panTo(target);
    map.setZoom(zoom);
  }, [map, target.lat, target.lng, zoom]);
  return null;
}
