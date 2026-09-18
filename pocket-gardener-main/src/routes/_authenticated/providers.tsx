import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { searchPlaces, getMapsKey } from "@/lib/places.functions";
import { APIProvider, Map, Marker, InfoWindow } from "@vis.gl/react-google-maps";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Loader2,
  Search,
  MapPin,
  Star,
  Phone,
  Navigation,
  CalendarPlus,
  List,
  Map as MapIcon,
  LocateFixed,
} from "lucide-react";
import { toast } from "sonner";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { z } from "zod";

type Provider = {
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

const searchSchema = z.object({ q: z.string().optional() });

export const Route = createFileRoute("/_authenticated/providers")({
  component: ProvidersPage,
  validateSearch: searchSchema,
});

function inferCategory(text: string): string {
  const t = text.toLowerCase();
  if (/(ac|air ?cond)/.test(t)) return "AC Technician";
  if (/(plumb|nalk|pipe)/.test(t)) return "Plumber";
  if (/(electric|bijli)/.test(t)) return "Electrician";
  if (/(carpent|barhai|lakri)/.test(t)) return "Carpenter";
  if (/(paint|rang)/.test(t)) return "Painter";
  if (/(clean|safai)/.test(t)) return "Cleaning Services";
  if (/(beautic|salon|parlor|parlour)/.test(t)) return "Beautician";
  if (/(tutor|teacher|ustad)/.test(t)) return "Tutor";
  if (/(car|gaari|gari|mechanic)/.test(t)) return "Car Mechanic";
  if (/(bike|motorcycle|motorbike)/.test(t)) return "Bike Mechanic";
  if (/(laptop|computer|pc)/.test(t)) return "Laptop Repair";
  if (/(fridge|refriger)/.test(t)) return "Fridge Repair";
  if (/(mobile|phone)/.test(t)) return "Mobile Repair";
  return "Service";
}

function ProvidersPage() {
  const { q: initialQ } = useSearch({ from: "/_authenticated/providers" });
  const navigate = useNavigate();
  const search = useServerFn(searchPlaces);
  const getKey = useServerFn(getMapsKey);

  const { data: keyData } = useQuery({
    queryKey: ["maps-key"],
    queryFn: () => getKey(),
    staleTime: Infinity,
  });

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [coordsErr, setCoordsErr] = useState<string | null>(null);
  const [query, setQuery] = useState(initialQ ?? "");
  const [results, setResults] = useState<Provider[]>([]);
  const [category, setCategory] = useState<string>("Service");
  const [view, setView] = useState<"list" | "map">("list");
  const [active, setActive] = useState<Provider | null>(null);

  const requestLocation = () => {
    setCoordsErr(null);
    if (!navigator.geolocation) {
      setCoordsErr("Geolocation not supported");
      setCoords({ lat: 33.6844, lng: 73.0479 });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => {
        setCoordsErr(e.message);
        setCoords({ lat: 33.6844, lng: 73.0479 });
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  useEffect(() => {
    requestLocation();
  }, []);

  const mut = useMutation({
    mutationFn: async (q: string) => {
      if (!coords) throw new Error("Location not ready yet");
      return await search({ data: { query: q, lat: coords.lat, lng: coords.lng } });
    },
    onSuccess: (r) => {
      setResults(r.results as Provider[]);
      setCategory(inferCategory(r.translatedQuery || r.query));
      if (r.results.length === 0) toast.message("No providers found nearby");
    },
    onError: (e: any) => toast.error(e?.message ?? "Search failed"),
  });

  useEffect(() => {
    if (initialQ && coords && results.length === 0 && !mut.isPending) {
      mut.mutate(initialQ);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords]);

  const handleBook = (p: Provider) => {
    try {
      sessionStorage.setItem(
        `provider:${p.id}`,
        JSON.stringify({ ...p, service_category: category }),
      );
    } catch {}
    navigate({ to: "/schedule", search: { id: p.id } });
  };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-1px)] max-w-md flex-col">
      <header
        className="space-y-3 rounded-b-3xl px-5 pb-5 pt-8 text-white"
        style={{ background: "var(--gradient-brand)" }}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate({ to: "/home" })}
            className="rounded-full bg-white/15 p-1.5 hover:bg-white/25"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="text-lg font-semibold">Nearby providers</h1>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!query.trim()) return;
            if (!coords) {
              toast.message("Getting your location…");
              requestLocation();
              return;
            }
            mut.mutate(query.trim());
          }}
        >
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. AC repair, plumber, car mechanic…"
            className="bg-white text-foreground"
          />
          <Button type="submit" size="icon" variant="secondary" disabled={mut.isPending}>
            {mut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </Button>
        </form>
        <div className="flex items-center justify-between text-xs text-white/85">
          <span className="inline-flex items-center gap-1">
            <LocateFixed className="h-3.5 w-3.5" />
            {coords
              ? `Using your location${coordsErr ? " (approx)" : ""}`
              : "Detecting location…"}
          </span>
          <button
            onClick={requestLocation}
            className="rounded-md bg-white/15 px-2 py-0.5 hover:bg-white/25"
          >
            Refresh
          </button>
        </div>
      </header>

      {results.length > 0 && (
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-background/95 px-5 py-2 backdrop-blur">
          <p className="text-xs text-muted-foreground">
            {results.length} provider{results.length === 1 ? "" : "s"} · sorted by distance
          </p>
          <div className="inline-flex overflow-hidden rounded-md border text-xs">
            <button
              onClick={() => setView("list")}
              className={
                "inline-flex items-center gap-1 px-2 py-1 " +
                (view === "list" ? "bg-primary text-primary-foreground" : "bg-card")
              }
            >
              <List className="h-3.5 w-3.5" /> List
            </button>
            <button
              onClick={() => setView("map")}
              className={
                "inline-flex items-center gap-1 px-2 py-1 " +
                (view === "map" ? "bg-primary text-primary-foreground" : "bg-card")
              }
            >
              <MapIcon className="h-3.5 w-3.5" /> Map
            </button>
          </div>
        </div>
      )}

      {view === "list" ? (
        <div className="space-y-3 px-5 py-4">
          {mut.isPending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching nearby providers…
            </div>
          )}
          {!mut.isPending && results.length === 0 && (
            <div className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">
              Type any service above (e.g. "fridge repair", "bike mechanic") and we'll
              find providers near you.
            </div>
          )}
          {results.map((p) => (
            <ProviderCard
              key={p.id}
              provider={p}
              category={category}
              intent={query}
              onBook={() => handleBook(p)}
              onOpenMap={() =>
                navigate({
                  to: "/map",
                  search: {
                    id: p.id,
                    name: p.name,
                    address: p.address,
                    lat: p.lat,
                    lng: p.lng,
                    phone: p.phone,
                    rating: p.rating,
                  },
                })
              }
              userCoords={coords}
            />
          ))}
        </div>
      ) : (
        <div className="relative flex-1 min-h-[60vh]">
          {keyData && coords && (
            <APIProvider apiKey={keyData.key}>
              <Map
                defaultCenter={coords}
                defaultZoom={13}
                gestureHandling="greedy"
                disableDefaultUI
              >
                <Marker
                  position={coords}
                  icon={
                    {
                      path: 0,
                      scale: 8,
                      fillColor: "#2563eb",
                      fillOpacity: 1,
                      strokeColor: "#fff",
                      strokeWeight: 2,
                    } as any
                  }
                  title="You"
                />
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
                    <div className="space-y-1 text-sm">
                      <p className="font-semibold">{active.name}</p>
                      <p className="text-xs text-gray-600">
                        {active.distanceKm.toFixed(1)} km · {active.address}
                      </p>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {active.phone && (
                          <a
                            href={`tel:${active.phone}`}
                            className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs"
                          >
                            <Phone className="h-3 w-3" /> Call
                          </a>
                        )}
                        <WhatsAppButton
                          phone={active.phone}
                          providerName={active.name}
                          category={category}
                          problem={query || undefined}
                        />
                        <button
                          onClick={() => handleBook(active)}
                          className="inline-flex items-center gap-1 rounded bg-primary px-1.5 py-0.5 text-xs text-primary-foreground"
                        >
                          <CalendarPlus className="h-3 w-3" /> Book
                        </button>
                      </div>
                    </div>
                  </InfoWindow>
                )}
              </Map>
            </APIProvider>
          )}
        </div>
      )}
    </div>
  );
}

function ProviderCard({
  provider: p,
  category,
  intent,
  onBook,
  onOpenMap,
  userCoords,
}: {
  provider: Provider;
  category: string;
  intent?: string;
  onBook: () => void;
  onOpenMap: () => void;
  userCoords: { lat: number; lng: number } | null;
}) {
  const directionsHref = userCoords
    ? `https://www.google.com/maps/dir/?api=1&origin=${userCoords.lat},${userCoords.lng}&destination=${p.lat},${p.lng}&travelmode=driving`
    : `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;

  return (
    <article className="rounded-2xl border bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {category}
          </p>
          <h3 className="truncate text-sm font-semibold">{p.name}</h3>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">
              {p.distanceKm.toFixed(1)} km · {p.address}
            </span>
          </p>
        </div>
        {p.rating != null && (
          <span className="flex shrink-0 items-center gap-1 rounded-md bg-yellow-100 px-1.5 py-0.5 text-xs font-medium text-yellow-900">
            <Star className="h-3 w-3 fill-current" /> {p.rating.toFixed(1)}
            {p.userRatingCount ? (
              <span className="text-[10px] text-yellow-700">({p.userRatingCount})</span>
            ) : null}
          </span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {p.phone ? (
          <a
            href={`tel:${p.phone}`}
            className="inline-flex items-center justify-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-2 text-xs font-medium text-primary hover:bg-primary/20"
          >
            <Phone className="h-3.5 w-3.5" /> Call
          </a>
        ) : (
          <span className="inline-flex items-center justify-center gap-1 rounded-md border bg-muted px-2 py-2 text-xs text-muted-foreground">
            <Phone className="h-3.5 w-3.5" /> No phone
          </span>
        )}
        <WhatsAppButton
          phone={p.phone}
          providerName={p.name}
          category={category}
          problem={intent}
          variant="btn"
        />
        <a
          href={directionsHref}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center gap-1 rounded-md border bg-card px-2 py-2 text-xs font-medium hover:bg-accent"
        >
          <Navigation className="h-3.5 w-3.5" /> Directions
        </a>
        <button
          onClick={onBook}
          className="inline-flex items-center justify-center gap-1 rounded-md bg-primary px-2 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
        >
          <CalendarPlus className="h-3.5 w-3.5" /> Book
        </button>
      </div>
      <button
        onClick={onOpenMap}
        className="mt-2 w-full text-center text-[11px] text-muted-foreground underline-offset-2 hover:underline"
      >
        Open on full map →
      </button>
    </article>
  );
}
