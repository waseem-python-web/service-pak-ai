# service-pak-ai
AI-powered service marketplace for Pakistan — a multilingual (Urdu/Roman Urdu/English) chat assistant that finds, ranks, and books real local service providers (plumbers, electricians, AC technicians, tutors, and more) via Google Places, with live agent-trace logging and WhatsApp handoff.
# ServicePak — AI-Powered Smart Service Booking

ServicePak is a mobile-first web app that connects people in Pakistan with real, nearby local service providers — plumbers, electricians, AC technicians, tutors, beauticians, and dozens more — through a multilingual AI chat assistant. Users simply describe what they need in **English, Urdu, Roman Urdu, Hindi, Punjabi, Sindhi, or Marathi**, and the assistant finds, ranks, and books the closest real provider for them, pulled live from Google Places.

> Built with TanStack Start, React 19, Supabase, and the Google Places API.

---

## ✨ Key Features

### 🤖 Multilingual AI Service Assistant
- Chat-based assistant that understands natural, informal, mixed-language requests (e.g. *"AC theek karwana hai"*, *"مجھے پلمبر چاہیے"*, *"need a bike mechanic near me"*).
- Automatically detects the service category from a large multilingual alias dictionary covering English, Urdu script, Roman Urdu, Hindi, and Punjabi terms.
- Always replies in the same language/script the user typed in.

### 🔍 Real, Nearby Providers — Not a Static Directory
- Live-searches Google Places (Text Search API) for real businesses, not a pre-seeded list.
- **Strict nearest-first radius ladder:** tries 1 km → 2 km → 5 km → 10 km → 20 km → 50 km, hard-filtering every result by exact Haversine distance so results never "leak" in from a distant city.
- **Distance-first ranking:** providers are grouped into 0.5 km bands; rating and past completed-job count only break ties *within* the same band — a farther provider can never outrank a nearer one.

### 🧠 Transparent Multi-Agent Pipeline
Every request flows through a visible chain of specialized agents, each logged in real time:
1. **Intent Agent** — extracts the service category from the user's message.
2. **Provider Discovery Agent** — queries Google Places with the correct radius.
3. **Ranking Agent** — sorts results by distance, then rating, then trust (completed jobs).
4. **Booking Agent** — creates the booking once the user confirms.
5. **Reminder Agent** — schedules a follow-up reminder to reduce no-shows.

A dedicated **Agent Trace / Logs screen** shows every agent's action and reasoning live, pulled from the `agent_logs` table — full transparency into how each recommendation was made.

### 📅 Bookings & Scheduling
- Book a provider directly from chat or by browsing/searching manually.
- Track booking status through its full lifecycle: `pending → accepted → in_progress → completed` (or `cancelled`), with a complete, timestamped **status history** stored automatically via a database trigger.
- Reschedule bookings, attach notes, and upload job photos (stored in a private-per-user Supabase Storage bucket).

### 🗺️ Map & Manual Browse Mode
- Interactive Google Maps view (`@vis.gl/react-google-maps`) showing nearby providers as markers, with an info window for each (name, rating, address, phone, distance).
- Toggle between **list view** and **map view** when browsing providers by category.
- One-tap **"Locate me"** to re-center search on the user's current GPS position.

### 💬 WhatsApp Handoff
- One-tap **"Contact on WhatsApp"** button that opens a pre-filled `wa.me` chat with the provider.
- Automatically normalizes local Pakistani numbers (adds the `+92` country code) and generates a natural, Roman-Urdu message summarizing the request, category, time, and address.

### 🔐 Authentication & Profiles
- Email/password authentication via Supabase Auth.
- A `profiles` row is auto-created for every new user (name, phone, preferred language) via a database trigger on signup.
- All data is protected with Postgres **Row-Level Security** — every user can only ever see their own bookings, logs, conversations, and photos.

### 🗂️ Persistent Chat History
- Conversations and individual messages are saved to the database (`conversations` / `conversation_messages`), including which providers were shown in each AI reply — so users can revisit past requests.

### 🧭 Browse by Category
The home screen organizes 40+ services into four groups:
| Category | Examples |
|---|---|
| **Home Services** | Plumber, Electrician, AC Technician, Carpenter, Painter, Cleaning, Pest Control, Water Tank Cleaning, Movers, Locksmith, Gardening, Interior Design |
| **Food & Delivery** | Food Delivery, Grocery, Medicine, Bakery, Online Shopping, Courier, Bike/Car Ride, Petrol Delivery, Laundry |
| **Health & Personal Care** | Beautician, Salon at Home, Doctor on Call, Lab Sample Collection, Physiotherapist, Nurse at Home, Fitness Trainer, Babysitter, Pet Care/Vet |
| **Learning & Pro Services** | Tutor, Quran Tutor, Computer/Mobile/TV Repair, Wifi Setup, Car Wash, Photographer, Event Planner |

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| Framework | [TanStack Start](https://tanstack.com/start) (full-stack React, server functions, file-based routing via TanStack Router) |
| UI | React 19, TypeScript, Tailwind CSS v4, shadcn/ui (Radix UI primitives, "new-york" style), Lucide icons |
| Forms & Validation | React Hook Form + Zod |
| Data Fetching | TanStack Query |
| Backend / Database | [Supabase](https://supabase.com) (Postgres, Auth, Row-Level Security, Storage) |
| Maps & Places | Google Maps Platform — Places API (Text Search) + `@vis.gl/react-google-maps` |
| AI | Lovable AI Gateway (Google Gemini 2.5 Flash) with function/tool calling |
| Messaging | WhatsApp deep links (`wa.me`) |
| Deployment | Cloudflare Workers (`wrangler`) |
| Tooling | Vite, ESLint, Prettier, Bun |

---

## 🗄️ Database Schema (Supabase / Postgres)

| Table | Purpose |
|---|---|
| `profiles` | One row per user — full name, phone, preferred language. Auto-created on signup. |
| `bookings` | Every service request: category, provider details, distance, scheduled time, status, AI reasoning, photo URLs, and a full JSONB status-history log. |
| `agent_logs` | Step-by-step trace of every AI agent action and its reasoning, linked to bookings. |
| `conversations` | Chat sessions between a user and the AI assistant. |
| `conversation_messages` | Individual chat messages, including which providers were shown in each AI response. |

All tables have Row-Level Security enabled — users can only read/write their own rows. Storage bucket `booking-photos` is similarly scoped per-user by folder prefix.

---

## 🚀 Getting Started

### Prerequisites
- [Bun](https://bun.sh) (or Node.js + npm)
- A [Supabase](https://supabase.com) project
- A Google Cloud project with the **Places API** and **Maps JavaScript API** enabled
- A Lovable AI Gateway API key (or equivalent LLM provider key with function-calling support)

### 1. Clone and install
```bash
git clone https://github.com/<your-username>/servicepak.git
cd servicepak
bun install   # or: npm install
```

### 2. Configure environment variables
Create a `.env` file in the project root:
```env
VITE_SUPABASE_URL="your-supabase-project-url"
VITE_SUPABASE_PUBLISHABLE_KEY="your-supabase-anon-key"
VITE_SUPABASE_PROJECT_ID="your-project-id"
SUPABASE_URL="your-supabase-project-url"
SUPABASE_PUBLISHABLE_KEY="your-supabase-anon-key"

GOOGLE_MAPS_API_KEY="your-google-places-api-key"
LOVABLE_API_KEY="your-ai-gateway-key"
```

### 3. Run the database migrations
Apply the SQL files in `supabase/migrations/` to your Supabase project (via the Supabase CLI or the SQL editor in your dashboard) to create the tables, RLS policies, triggers, and storage bucket.

### 4. Start the dev server
```bash
bun run dev   # or: npm run dev
```
The app will be available at `http://localhost:3000` (or the port Vite reports).

### 5. Build & deploy
```bash
bun run build
```
The project is configured for one-click deployment to **Cloudflare Workers** via `wrangler.jsonc`, and includes a GitHub Actions workflow for static deployment to GitHub Pages as an alternative.

---

## 📁 Project Structure
```
src/
├── routes/
│   ├── index.tsx                # Splash screen → redirects to /home or /login
│   ├── login.tsx / signup.tsx   # Auth screens
│   └── _authenticated/
│       ├── home.tsx             # Category grid + AI assistant entry point
│       ├── chat.tsx             # AI chat interface
│       ├── providers.tsx        # Manual browse — list/map toggle
│       ├── map.tsx              # Full map view with markers
│       ├── schedule.tsx         # Booking confirmation & scheduling
│       ├── bookings.tsx         # Booking history, status tracking, reschedule
│       ├── logs.tsx             # Live AI agent trace viewer
│       └── account.tsx          # User profile
├── lib/
│   ├── agent.functions.ts       # Core AI agent pipeline (intent → search → rank → book)
│   ├── places.functions.ts      # Google Places search server functions
│   ├── bookings.functions.ts    # Booking CRUD + status transitions
│   ├── whatsapp.ts              # wa.me link builder + message templating
│   └── auth.tsx / theme.tsx     # Auth & theme providers
├── integrations/supabase/       # Supabase client, auth middleware
└── components/ui/               # shadcn/ui component library

supabase/
└── migrations/                  # Database schema, RLS policies, triggers
```

---

## 🛣️ Roadmap Ideas
- [ ] Provider-side app/portal (accept/reject bookings, update job status)
- [ ] In-app ratings & reviews after job completion
- [ ] Push notifications for booking reminders
- [ ] Payment integration (JazzCash / EasyPaisa)
- [ ] Voice input for the AI assistant

---

## 📄 License
Add your preferred license here (e.g. MIT).

---

## 🙏 Acknowledgements
Built with [TanStack Start](https://tanstack.com/start), [Supabase](https://supabase.com), [shadcn/ui](https://ui.shadcn.com), and the [Google Maps Platform](https://developers.google.com/maps).
