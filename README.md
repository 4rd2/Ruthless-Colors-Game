# 🃏 Ruthless Colors — Online Multiplayer Card Game

A serverless, real-time multiplayer card game for 2–6 players with rooms, stacking rules, and a Mercy rule. Powered by **Vite (React + TS)** on the frontend and **Supabase (Edge Functions, PostgreSQL, Realtime)** on the backend.

---

## 🚀 Key Features

* **Real-time Multiplayer** — Instant room creation and joining via 4-character codes using Supabase Realtime wildcard channels.
* **Server-Authoritative Game Engine** — All deck shuffling, card verification, turn handling, and stack math run in Deno Edge Functions on Supabase.
* **Special Cards** — Draw 2/4/6/10, Skip Everyone, Discard All, Color Roulette, Reverse Draw 4, Parry (reflect stack), 0 (pass hands), and 7 (swap hands).
* **Stacking Mechanics** — Accumulate draw stacks on matching or higher draw cards.
* **Mercy Rule** — Reach 25 cards in hand and you are automatically eliminated.
* **Rejoin & Disconnect Grace** — Players can reconnect to their active game if their tab closes or their connection drops.

---

## 🛠️ Architecture Stack

* **Frontend:** React, TypeScript, Tailwind CSS, Vite.
* **Backend:** Supabase Edge Functions (Deno / TypeScript).
* **Database:** PostgreSQL on Supabase (using relational schemas with `ON DELETE CASCADE` triggers).
* **Networking/Sync:** Supabase Realtime Broadcast REST APIs for serverless-to-client push updates.

---

## 💻 Local Development

### 1. Prerequisites
* [Node.js](https://nodejs.org/) v18+ and npm
* [Supabase CLI](https://supabase.com/docs/guides/cli) (installed via `npx supabase`)

### 2. Install Dependencies
```bash
# Install root, client, and shared module dependencies
npm run install:all
```

### 3. Setup Supabase Environment
Rename `.env.example` to `.env` in the `client/` folder and populate it with your Supabase credentials:
```env
VITE_SUPABASE_URL=your-supabase-project-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### 4. Deploy Database Schema & Deno Functions
To set up your local emulator or push schemas/functions to your cloud project:
```bash
# Link your supabase project
npx supabase link --project-ref your-project-ref

# Apply database schemas
npx supabase db push

# Deploy the Edge Function
npx supabase functions deploy game-action --no-verify-jwt
```

### 5. Run the Client
```bash
cd client
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 📁 Project Structure

```
├── client/                 # React UI (Vite + TS)
│   ├── src/
│   │   ├── components/     # Game boards, lobby screen, waiting room
│   │   ├── hooks/          # Real-time event hooks
│   │   ├── lib/            # Supabase socket-adapter interface
│   │   └── App.tsx         # Main entry and state machine
├── supabase/               # Supabase Configuration
│   ├── functions/          # Deno Edge Functions
│   │   └── game-action/    # Game Action Router engine
│   └── schema.sql          # DB tables, indexes, and RLS policies
└── md/                     # Project Backlogs
    └── TO-DO.md            # Planned features, animations, and bugs
```

---

## 📝 Roadmap & Future Ideas
We are planning new features, card designs, animations, and bug fixes. See the [Backlog & TO-DO List](file:///c:/Coding%20of%20All%20sorts/PersonalProjects/Uno-No-Mercy/Ruthless-Colors-Game/md/TO-DO.md) for details.
