import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  component: Splash,
  head: () => ({
    meta: [
      { title: "ServicePak — AI Powered Smart Service Booking" },
      {
        name: "description",
        content:
          "Find plumbers, electricians, AC technicians and more near you with an AI assistant that understands Urdu, Roman Urdu and English.",
      },
    ],
  }),
});

function Splash() {
  const { loading, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => {
      navigate({ to: user ? "/home" : "/login" });
    }, 900);
    return () => clearTimeout(t);
  }, [loading, user, navigate]);

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center text-white"
      style={{ background: "var(--gradient-brand)" }}
    >
      <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-white/15 backdrop-blur-sm shadow-2xl">
        <Sparkles className="h-12 w-12" />
      </div>
      <div>
        <h1 className="text-4xl font-bold tracking-tight">ServicePak</h1>
        <p className="mt-2 text-base text-white/85">AI Powered Smart Service Booking</p>
      </div>
      <Loader2 className="mt-4 h-6 w-6 animate-spin text-white/80" />
    </main>
  );
}