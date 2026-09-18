import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Wrench,
  Zap,
  Snowflake,
  Scissors,
  GraduationCap,
  Hammer,
  PaintBucket,
  Sparkles as SparkIcon,
  Search,
  LogOut,
  MessageSquare,
  MapPin,
  Utensils,
  Bike,
  Car,
  Truck,
  Stethoscope,
  Pill,
  ShoppingBasket,
  ShoppingCart,
  Shirt,
  Droplets,
  Bug,
  Camera,
  Cake,
  Flower2,
  Dumbbell,
  Laptop,
  Smartphone,
  Tv,
  Wifi,
  Baby,
  Dog,
  HeartPulse,
  Home as HomeIcon,
  KeyRound,
  Briefcase,
  PackageCheck,
  Fuel,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/home")({ component: HomePage });

const HOME_SERVICES = [
  { key: "Plumber", label: "Plumber", icon: Wrench, color: "oklch(0.72 0.16 230)" },
  { key: "Electrician", label: "Electrician", icon: Zap, color: "oklch(0.78 0.18 80)" },
  { key: "AC Technician", label: "AC Tech", icon: Snowflake, color: "oklch(0.7 0.14 200)" },
  { key: "Carpenter", label: "Carpenter", icon: Hammer, color: "oklch(0.6 0.13 50)" },
  { key: "Painter", label: "Painter", icon: PaintBucket, color: "oklch(0.7 0.16 140)" },
  { key: "Cleaning Services", label: "Cleaning", icon: SparkIcon, color: "oklch(0.7 0.13 170)" },
  { key: "Pest Control", label: "Pest Ctrl", icon: Bug, color: "oklch(0.62 0.15 30)" },
  { key: "Water Tank Cleaning", label: "Tank Clean", icon: Droplets, color: "oklch(0.7 0.14 220)" },
  { key: "Home Shifting / Movers", label: "Movers", icon: Truck, color: "oklch(0.65 0.14 50)" },
  { key: "Locksmith", label: "Locksmith", icon: KeyRound, color: "oklch(0.6 0.12 80)" },
  { key: "Gardening", label: "Gardening", icon: Flower2, color: "oklch(0.7 0.16 145)" },
  { key: "Interior Designer", label: "Interior", icon: HomeIcon, color: "oklch(0.65 0.14 30)" },
];

const FOOD_DELIVERY = [
  { key: "Food Delivery", label: "Food", icon: Utensils, color: "oklch(0.7 0.18 30)" },
  { key: "Grocery Delivery", label: "Grocery", icon: ShoppingBasket, color: "oklch(0.7 0.16 140)" },
  { key: "Medicine Delivery", label: "Pharmacy", icon: Pill, color: "oklch(0.7 0.15 0)" },
  { key: "Bakery & Cake Delivery", label: "Bakery", icon: Cake, color: "oklch(0.78 0.13 60)" },
  { key: "Online Shopping", label: "Shopping", icon: ShoppingCart, color: "oklch(0.65 0.18 280)" },
  { key: "Courier / Parcel", label: "Courier", icon: PackageCheck, color: "oklch(0.65 0.14 200)" },
  { key: "Bike Ride", label: "Bike", icon: Bike, color: "oklch(0.7 0.18 30)" },
  { key: "Car Ride", label: "Car", icon: Car, color: "oklch(0.65 0.14 250)" },
  { key: "Petrol Delivery", label: "Petrol", icon: Fuel, color: "oklch(0.6 0.15 30)" },
  { key: "Laundry & Dry Clean", label: "Laundry", icon: Shirt, color: "oklch(0.7 0.14 220)" },
];

const PERSONAL_CARE = [
  { key: "Beautician", label: "Beauty", icon: Scissors, color: "oklch(0.72 0.16 0)" },
  { key: "Salon at Home", label: "Salon", icon: Scissors, color: "oklch(0.7 0.16 320)" },
  { key: "Doctor on Call", label: "Doctor", icon: Stethoscope, color: "oklch(0.65 0.16 0)" },
  { key: "Lab Sample Collection", label: "Lab Test", icon: HeartPulse, color: "oklch(0.65 0.18 10)" },
  { key: "Physiotherapist", label: "Physio", icon: HeartPulse, color: "oklch(0.6 0.14 320)" },
  { key: "Nurse at Home", label: "Nurse", icon: HeartPulse, color: "oklch(0.7 0.14 350)" },
  { key: "Fitness Trainer", label: "Trainer", icon: Dumbbell, color: "oklch(0.6 0.15 250)" },
  { key: "Baby Sitter", label: "Babysit", icon: Baby, color: "oklch(0.78 0.13 60)" },
  { key: "Pet Care / Vet", label: "Pet Care", icon: Dog, color: "oklch(0.65 0.14 50)" },
];

const LEARNING_PRO = [
  { key: "Tutor", label: "Tutor", icon: GraduationCap, color: "oklch(0.65 0.18 280)" },
  { key: "Quran Tutor", label: "Quran", icon: GraduationCap, color: "oklch(0.6 0.14 150)" },
  { key: "Computer Repair", label: "Laptop Fix", icon: Laptop, color: "oklch(0.6 0.13 250)" },
  { key: "Mobile Repair", label: "Mobile Fix", icon: Smartphone, color: "oklch(0.65 0.14 200)" },
  { key: "TV / LED Repair", label: "TV Repair", icon: Tv, color: "oklch(0.6 0.13 280)" },
  { key: "Internet / Wifi Setup", label: "Wifi", icon: Wifi, color: "oklch(0.7 0.14 220)" },
  { key: "Car Wash", label: "Car Wash", icon: Car, color: "oklch(0.7 0.14 200)" },
  { key: "Photographer", label: "Photo", icon: Camera, color: "oklch(0.55 0.1 280)" },
  { key: "Event Planner", label: "Events", icon: Briefcase, color: "oklch(0.65 0.16 30)" },
];

function ServiceGrid({ items }: { items: typeof HOME_SERVICES }) {
  return (
    <div className="grid grid-cols-4 gap-3">
      {items.map((c) => {
        const Icon = c.icon;
        return (
          <Link
            key={c.key}
            to="/chat"
            search={{ q: `I need a ${c.key} near me` }}
            className="flex flex-col items-center gap-1.5 rounded-2xl border bg-card p-3 text-center shadow-sm transition hover:shadow-md"
          >
            <span
              className="flex h-10 w-10 items-center justify-center rounded-xl text-white"
              style={{ background: c.color }}
            >
              <Icon className="h-5 w-5" />
            </span>
            <span className="text-[11px] leading-tight text-foreground">{c.label}</span>
          </Link>
        );
      })}
    </div>
  );
}


function HomePage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-md">
      <header
        className="rounded-b-3xl px-5 pt-10 pb-8 text-white"
        style={{ background: "var(--gradient-brand)" }}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-white/75">As-salaam-alaikum</p>
            <h1 className="text-xl font-semibold">{user?.user_metadata?.full_name ?? "Welcome"}</h1>
          </div>
          <button
            onClick={async () => {
              await signOut();
              navigate({ to: "/login" });
            }}
            className="rounded-full bg-white/15 p-2 hover:bg-white/25"
            aria-label="Log out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>

        <Link
          to="/chat"
          className="mt-6 flex items-center gap-3 rounded-2xl bg-white/15 px-4 py-3 backdrop-blur-sm hover:bg-white/25"
        >
          <Search className="h-5 w-5" />
          <span className="text-sm text-white/90">Tell our AI what you need…</span>
        </Link>
        <Link
          to="/providers"
          className="mt-2 flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-3 backdrop-blur-sm hover:bg-white/25"
        >
          <MapPin className="h-5 w-5" />
          <span className="text-sm text-white/90">Browse nearby providers</span>
        </Link>
      </header>

      <section className="px-5 pt-6">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Food & Delivery</h2>
        <ServiceGrid items={FOOD_DELIVERY} />
      </section>

      <section className="px-5 pt-6">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Home Services</h2>
        <ServiceGrid items={HOME_SERVICES} />
      </section>

      <section className="px-5 pt-6">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Health & Personal Care</h2>
        <ServiceGrid items={PERSONAL_CARE} />
      </section>

      <section className="px-5 pt-6">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Learning & Pro Services</h2>
        <ServiceGrid items={LEARNING_PRO} />
      </section>

      <section className="px-5 pt-6">
        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span
              className="flex h-12 w-12 items-center justify-center rounded-xl text-white"
              style={{ background: "var(--gradient-brand)" }}
            >
              <MessageSquare className="h-6 w-6" />
            </span>
            <div>
              <h3 className="font-semibold">AI Service Assistant</h3>
              <p className="text-xs text-muted-foreground">
                Urdu, Roman Urdu, English. Voice & text.
              </p>
            </div>
          </div>
          <Button asChild className="mt-4 w-full">
            <Link to="/chat">Start a request</Link>
          </Button>
        </div>
      </section>

      <section className="px-5 pt-6">
        <div className="rounded-2xl border bg-secondary/40 p-4 text-sm">
          <p className="font-medium">How it works</p>
          <ol className="mt-2 list-decimal pl-5 text-muted-foreground">
            <li>Tell the AI what you need</li>
            <li>It searches real nearby providers</li>
            <li>Ranks them by distance + rating</li>
            <li>Books the best match for you</li>
          </ol>
        </div>
      </section>
    </div>
  );
}
