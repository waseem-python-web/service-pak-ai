import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { runAgent } from "@/lib/agent.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Send,
  Mic,
  MicOff,
  Sparkles,
  Loader2,
  MapPin,
  Star,
  Phone,
  CalendarPlus,
  Navigation,
  Plus,
  History,
  Trash2,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

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

type ChatMsg =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string;
      providers?: Provider[];
      serviceCategory?: string;
      userIntent?: string;
    };

type Conversation = {
  id: string;
  title: string;
  updated_at: string;
};

const WELCOME: ChatMsg = {
  role: "assistant",
  content:
    "Salaam! 👋 Mujhe bataiye aapko kya service chahiye. Likhein Urdu, Roman Urdu ya English mein — voice bhi use kar sakte hain.",
};

const searchSchema = z.object({ q: z.string().optional() });

export const Route = createFileRoute("/_authenticated/chat")({
  component: ChatPage,
  validateSearch: searchSchema,
});

function ChatPage() {
  const { q } = useSearch({ from: "/_authenticated/chat" });
  const navigate = useNavigate();
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMsg[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const runAgentFn = useServerFn(runAgent);

  // History / conversations state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loadingConv, setLoadingConv] = useState(false);

  // Geolocation
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setCoords({ lat: 33.6844, lng: 73.0479 }),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, []);

  // Autoscroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  // Load conversation list
  const loadConversations = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("conversations")
      .select("id,title,updated_at")
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) {
      console.error(error);
      return;
    }
    setConversations(data ?? []);
  }, [user]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const startNewChat = () => {
    setConversationId(null);
    setMessages([WELCOME]);
    setInput("");
    setHistoryOpen(false);
  };

  const openConversation = async (id: string) => {
    setLoadingConv(true);
    setHistoryOpen(false);
    try {
      const { data, error } = await supabase
        .from("conversation_messages")
        .select("role,content,providers,service_category")
        .eq("conversation_id", id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const loaded: ChatMsg[] = (data ?? []).map((m: any) =>
        m.role === "user"
          ? { role: "user", content: m.content }
          : {
              role: "assistant",
              content: m.content,
              providers: m.providers ?? undefined,
              serviceCategory: m.service_category ?? undefined,
            },
      );
      setMessages(loaded.length ? loaded : [WELCOME]);
      setConversationId(id);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not load chat");
    } finally {
      setLoadingConv(false);
    }
  };

  const deleteConversation = async (id: string) => {
    const { error } = await supabase.from("conversations").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setConversations((c) => c.filter((x) => x.id !== id));
    if (conversationId === id) startNewChat();
  };

  const ensureConversation = async (firstUserText: string): Promise<string | null> => {
    if (conversationId) return conversationId;
    if (!user) return null;
    const title = firstUserText.slice(0, 60) || "New chat";
    const { data, error } = await supabase
      .from("conversations")
      .insert({ user_id: user.id, title })
      .select("id,title,updated_at")
      .single();
    if (error) {
      console.error(error);
      return null;
    }
    setConversationId(data.id);
    setConversations((c) => [data as Conversation, ...c]);
    return data.id;
  };

  const persistMessage = async (
    convId: string,
    msg: ChatMsg,
  ) => {
    if (!user) return;
    await supabase.from("conversation_messages").insert({
      conversation_id: convId,
      user_id: user.id,
      role: msg.role,
      content: msg.content,
      providers: msg.role === "assistant" ? (msg.providers ?? null) : null,
      service_category: msg.role === "assistant" ? (msg.serviceCategory ?? null) : null,
    });
  };

  const send = async (text: string) => {
    if (!text.trim() || busy) return;
    if (!coords) {
      toast.error("Please allow location to find nearby providers.");
      return;
    }
    const userMsg: ChatMsg = { role: "user", content: text };
    const next: ChatMsg[] = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setBusy(true);

    const convId = await ensureConversation(text);
    if (convId) persistMessage(convId, userMsg);

    try {
      const result = await runAgentFn({
        data: {
          messages: next.map((m) => ({ role: m.role, content: m.content })),
          lat: coords.lat,
          lng: coords.lng,
        },
      });
      const assistant: ChatMsg = {
        role: "assistant",
        content: result.reply || "(no response)",
        providers: result.providers,
        serviceCategory: inferCategory(text),
        userIntent: text,
      };
      setMessages((m) => [...m, assistant]);
      if (convId) persistMessage(convId, assistant);
    } catch (e: any) {
      toast.error(e?.message ?? "AI error");
    } finally {
      setBusy(false);
    }
  };

  // Pre-filled query from home
  const sentInitial = useRef(false);
  useEffect(() => {
    if (q && coords && !sentInitial.current) {
      sentInitial.current = true;
      send(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, coords]);

  const toggleVoice = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.error("Voice not supported in this browser");
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = new SR();
    rec.lang = "ur-PK";
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      const text = e.results[0][0].transcript;
      setInput(text);
      setListening(false);
      send(text);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.start();
    recognitionRef.current = rec;
    setListening(true);
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-5rem)] max-w-md flex-col">
      <header
        className="flex items-center gap-3 px-4 py-3 text-white"
        style={{ background: "var(--gradient-brand)" }}
      >
        <Sparkles className="h-5 w-5 shrink-0" />
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold truncate">ServicePak AI</h1>
          <p className="text-xs text-white/80 truncate">
            {coords ? "Online · location ready" : "Locating you…"}
          </p>
        </div>
        <button
          onClick={startNewChat}
          aria-label="New chat"
          className="rounded-full bg-white/15 p-2 text-white hover:bg-white/25"
        >
          <Plus className="h-4 w-4" />
        </button>
        <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
          <SheetTrigger asChild>
            <button
              aria-label="Chat history"
              className="rounded-full bg-white/15 p-2 text-white hover:bg-white/25"
              onClick={() => loadConversations()}
            >
              <History className="h-4 w-4" />
            </button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[85%] sm:max-w-sm p-0 flex flex-col">
            <SheetHeader className="border-b px-4 py-3">
              <SheetTitle className="text-base">Chat history</SheetTitle>
            </SheetHeader>
            <div className="p-3">
              <Button onClick={startNewChat} className="w-full justify-start gap-2" variant="outline">
                <Plus className="h-4 w-4" /> New chat
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-4">
              {conversations.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No previous chats yet.
                </p>
              ) : (
                <ul className="space-y-1">
                  {conversations.map((c) => (
                    <li key={c.id}>
                      <div
                        className={cn(
                          "group flex items-center gap-2 rounded-md px-2 py-2 hover:bg-accent",
                          conversationId === c.id && "bg-accent",
                        )}
                      >
                        <button
                          onClick={() => openConversation(c.id)}
                          className="flex flex-1 items-center gap-2 text-left min-w-0"
                        >
                          <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0">
                            <p className="truncate text-sm">{c.title}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {new Date(c.updated_at).toLocaleString()}
                            </p>
                          </div>
                        </button>
                        <button
                          onClick={() => deleteConversation(c.id)}
                          aria-label="Delete chat"
                          className="rounded p-1 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {loadingConv && (
          <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading chat…
          </div>
        )}
        {!loadingConv &&
          messages.map((m, i) => (
            <Message
              key={i}
              msg={m}
              onSchedule={(p, category) => {
                try {
                  sessionStorage.setItem(
                    `provider:${p.id}`,
                    JSON.stringify({ ...p, service_category: category }),
                  );
                } catch {}
                navigate({ to: "/schedule", search: { id: p.id } });
              }}
              onLocate={(p) => {
                try {
                  sessionStorage.setItem(`provider:${p.id}`, JSON.stringify(p));
                } catch {}
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
                });
              }}
            />
          ))}
        {busy && (
          <div className="flex items-center gap-2 px-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            AI is thinking…
          </div>
        )}
      </div>

      <form
        className="flex items-center gap-2 border-t bg-background p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <Button
          type="button"
          variant={listening ? "destructive" : "outline"}
          size="icon"
          onClick={toggleVoice}
          aria-label="Voice"
        >
          {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </Button>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Mujhe AC technician chahiye…"
          disabled={busy}
        />
        <Button type="submit" size="icon" disabled={busy || !input.trim()} aria-label="Send">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}

function inferCategory(text: string): string {
  const t = text.toLowerCase();
  if (/(ac|air ?cond|cooling|اے ?سی|एसी)/.test(t)) return "AC Repair";
  if (/(fridge|refriger|freezer|فرج|फ्रिज)/.test(t)) return "Fridge Repair";
  if (/(washing ?machine|washer|واشنگ|वॉशिंग)/.test(t)) return "Washing Machine Repair";
  if (/(geyser|water ?heater|گیزر|गीजर)/.test(t)) return "Geyser Repair";
  if (/(bike|motor ?cycle|motorcycle|بائیک|موٹر|बाइक)/.test(t)) return "Motorcycle Mechanic";
  if (/(car|gari|gaari|گاڑی|कार|गाड़ी)/.test(t)) return "Car Mechanic";
  if (/(laptop|computer|pc|لیپ ?ٹاپ|कंप्यूटर)/.test(t)) return "Computer Repair";
  if (/(mobile|phone|موبائل|मोबाइल)/.test(t)) return "Mobile Repair";
  if (/(plumb|nalk|pipe|پلمبر|نل|प्लंबर|पानी)/.test(t)) return "Plumber";
  if (/(electric|bijli|wire|light|mistri|الیکٹریشن|بجلی|इलेक्ट्रीशियन|बिजली)/.test(t)) return "Electrician";
  if (/(carpent|barhai|lakri|بڑھئی|बढ़ई)/.test(t)) return "Carpenter";
  if (/(paint|rang|پینٹر|पेंटर)/.test(t)) return "Painter";
  if (/(clean|safai|صفائی|सफाई)/.test(t)) return "Cleaning Services";
  if (/(beautic|salon|parlor|parlour|پارلر|पार्लर)/.test(t)) return "Beautician";
  if (/(tutor|teacher|ustad|ٹیوٹر|ट्यूटर)/.test(t)) return "Tutor";
  if (/(tailor|darzi|درزی|दर्जी)/.test(t)) return "Tailor";
  if (/(mali|gardener|مالی|माली)/.test(t)) return "Gardener";
  if (/(pest|deemak|دیمک|दीमक)/.test(t)) return "Pest Control";
  return "Service";
}

function Message({
  msg,
  onSchedule,
  onLocate,
}: {
  msg: ChatMsg;
  onSchedule: (p: Provider, category: string) => void;
  onLocate: (p: Provider) => void;
}) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground shadow-sm">
          {msg.content}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-secondary px-3.5 py-2 text-sm text-secondary-foreground">
        {msg.content}
      </div>
      {msg.providers && msg.providers.length > 0 && (
        <div className="space-y-2">
          {msg.providers.map((p) => (
            <div key={p.id} className="rounded-xl border bg-card p-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">{p.name}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    {p.distanceKm.toFixed(1)} km · {p.address}
                  </p>
                </div>
                {p.rating != null && (
                  <span className="flex shrink-0 items-center gap-1 rounded-md bg-yellow-100 px-1.5 py-0.5 text-xs font-medium text-yellow-900">
                    <Star className="h-3 w-3 fill-current" />
                    {p.rating.toFixed(1)}
                  </span>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {p.phone && (
                  <a
                    href={`tel:${p.phone}`}
                    className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20"
                  >
                    <Phone className="h-3 w-3" /> Call
                  </a>
                )}
                <button
                  onClick={() => onLocate(p)}
                  className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                >
                  <Navigation className="h-3 w-3" /> Location
                </button>
                <WhatsAppButton
                  phone={p.phone}
                  providerName={p.name}
                  category={msg.serviceCategory ?? "Service"}
                  problem={msg.userIntent}
                />
                <button
                  onClick={() => onSchedule(p, msg.serviceCategory ?? "Service")}
                  className="ml-auto inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:opacity-90"
                >
                  <CalendarPlus className="h-3 w-3" /> Book
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
