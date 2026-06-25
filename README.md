# Get Place Go

> **Agentic AI Travel Agent for Pune, India**

Discover places based on *vibe*, not just ratings. AI-powered recommendations for Baner & Koregaon Park.

---

## 🚀 Quick Start

```bash
# Clone and install
git clone <YOUR_GIT_URL>
cd get_place_go
npm install

# Start development server
npm run dev

# Open http://localhost:8080
```

Create a `.env` file in the project root with your own Supabase project's `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_SUPABASE_PROJECT_ID` (Settings → API in your Supabase dashboard).

---

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| [Project Documentation](docs/PROJECT_DOCUMENTATION.md) | Full technical documentation |
| [Local Development Guide](docs/LOCAL_DEVELOPMENT_GUIDE.md) | Setup, debugging, workflows |
| [AI Code Reference](docs/AI_CODE_REFERENCE.md) | AI/ML code locations & modification guide |

---

## 🛠️ Tech Stack

### Frontend
- **React 18** + **TypeScript** + **Vite**
- **Tailwind CSS** + **Shadcn/UI**
- **TanStack Query** for data fetching
- **React Router v6** for navigation

### Backend (self-hosted Supabase)
- **PostgreSQL** with **pgvector** for embeddings
- **Supabase Auth** + **Storage**
- **Supabase Edge Functions** (Deno runtime)
- **Row Level Security (RLS)**

### AI/ML
- LLM-powered itinerary generation and place-image generation (provider migration to OpenRouter in progress — see `CLAUDE.md` for current status)
- **Semantic search** with vector embeddings (vibe-search currently uses keyword/attribute scoring; embedding-based ranking is a planned optimization)

---

## 📁 Key Directories

```
src/
├── components/      # React components
├── pages/          # Route pages
├── hooks/          # Custom hooks (auth, etc.)
└── lib/            # Utilities

supabase/
└── functions/      # 🤖 AI EDGE FUNCTIONS
    ├── vibe-search/         # Semantic search
    └── generate-itinerary/  # Trip planning

docs/              # Documentation
```

---

## 🤖 AI Code Locations

All AI logic is in `supabase/functions/`:

| Function | File | Purpose |
|----------|------|---------|
| Vibe Search | `vibe-search/index.ts` | Natural language place search |
| Itinerary AI | `generate-itinerary/index.ts` | Day trip suggestions |

See [AI Code Reference](docs/AI_CODE_REFERENCE.md) for details.

---

## 🔧 Common Commands

```bash
npm run dev        # Start dev server
npm run build      # Production build
npm run test       # Run tests
npm run lint       # Lint code
```

---

## How can I edit this code?

Clone the repo and work locally in your own IDE. The only requirement is having Node.js & npm installed — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```bash
git clone <YOUR_GIT_URL>
cd get_place_go
npm install
npm run dev
```

---

## How can I deploy this project?

The frontend is a static Vite build, deployable to any static host that supports SPA routing (e.g. Vercel, Netlify). Build it with:

```bash
npm run build
```

Edge functions (`supabase/functions/`) are deployed independently via the Supabase CLI (`supabase functions deploy <name>`) or the Supabase dashboard.

## Can I connect a custom domain?

Yes — through whichever hosting provider you deploy the frontend to (e.g. Vercel/Netlify project settings).
