# 🃏 Ruthless Colors — Online Multiplayer

A browser-based card game for 2–4 players with real-time online play via room codes.

## Features

- **Special Cards** — Draw 2/4/6/10, Skip Everyone, Discard All, Color Roulette, Reverse Draw 4, Parry (reflects draw stack), 0 (pass all hands), 7 (swap hands)
- **Stacking** — Draw cards stack on equal-or-higher value; penalty accumulates
- **Mercy Rule** — 25+ cards in hand = eliminated
- **Online Multiplayer** — Create/join games via 6-character room codes
- **Rejoin Support** — Reconnect to an in-progress game by name + room code
- **Server-Authoritative** — All game logic runs on the server; no cheating

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18+ and npm

---

## Running Locally

### 1. Install Dependencies

```bash
# From the project root
npm install
cd server && npm install
cd ../client && npm install
cd ..
```

### 2. Start Development Servers

```bash
npm run dev
```

This starts both:
- **Client** → [http://localhost:5173](http://localhost:5173)
- **Server** → [http://localhost:3000](http://localhost:3000)

### 3. Play

1. Open [http://localhost:5173](http://localhost:5173) in your browser
2. Enter your name and click **Create Game**
3. Share the 6-character room code with friends
4. Friends open the same URL, enter their name + room code, and click **Join Game**
5. Host clicks **Start Game** when everyone is in (2–4 players)

> **Tip:** Open two browser tabs to test locally — create in one, join in the other.

---

## Deploying to Production

The app is designed so the server serves the built client as static files — only one process to deploy.

### Option A: Railway (Recommended)

1. Push your code to a GitHub repo
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub Repo**
3. Select your repo — Railway auto-detects the `Dockerfile`
4. Set environment variable: `PORT=3000`
5. Deploy — Railway gives you a public URL

### Option B: Render

1. Push your code to GitHub
2. Go to [render.com](https://render.com) → **New Web Service** → connect your repo
3. Set **Environment** to `Docker`
4. Set environment variable: `PORT=3000`
5. Deploy

### Option C: Manual / VPS

```bash
# 1. Build the client
cd client && npm run build && cd ..

# 2. Start the production server
cd server && npm start
```

The server serves `client/dist/` as static files and runs the WebSocket server on the same port.

### Option D: Docker

```bash
# Build the image
docker build -t ruthless-colors .

# Run it
docker run -p 3000:3000 ruthless-colors
```

Then open [http://localhost:3000](http://localhost:3000).

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `CLIENT_ORIGIN` | `http://localhost:5173` | CORS origin (only needed in dev) |

---

## Project Structure

```
├── shared/          # Shared types, constants, Socket.IO events
├── server/src/      # Game engine + Express + Socket.IO
│   ├── deck.ts      # Deck building, shuffle, draw
│   ├── rules.ts     # Card validation & effects
│   ├── game.ts      # Game state machine
│   ├── lobby.ts     # Room codes, join/leave
│   └── index.ts     # Server entry point
├── client/src/      # Browser UI (Vite + TypeScript)
│   ├── main.ts      # Entry + Socket.IO connection
│   ├── lobby.ts     # Create/Join/Rejoin screens
│   ├── game.ts      # Game board rendering
│   ├── card.ts      # Card component (CSS-rendered)
│   └── styles/      # Dark theme, cards, game board CSS
└── Dockerfile       # Production multi-stage build
```

---

## 🎯 Vibecoding Rating: 7.5 / 10

**What went well:**
- ✅ Got a full multiplayer game running from zero in one session
- ✅ Server-authoritative architecture — no shortcuts that would allow cheating
- ✅ Clean separation of concerns (shared types, server logic, client UI)
- ✅ All special cards implemented with proper stacking
- ✅ Rejoin support, disconnect grace period, room code system — solid multiplayer UX
- ✅ Dark theme with CSS-rendered cards (no image assets needed)

**Where it could improve:**

| Area | Current State | How to Level Up |
|------|--------------|-----------------|
| 🧪 **Testing** | No tests yet | Add unit tests for `rules.ts` and `game.ts` — the game logic is complex enough that bugs will hide in edge cases (e.g. stacking across eliminated players, roulette on empty deck) |
| 🎨 **UI Polish** | Functional but minimal | Add card play animations (arc from hand to discard), turn transition effects, and a "Call Last Card!" button when you're at 1 card |
| 🔊 **Sound** | Silent | Add card play, draw, stack, and elimination sounds — audio makes a *massive* difference in game feel |
| 📱 **Mobile** | Desktop-first | Hand is hard to use on small screens — add touch-friendly card fanning and swipe-to-play |
| 🔒 **Validation** | Basic | Add rate limiting on Socket.IO events, input sanitization on player names, and room cleanup for stale games |
| 📊 **Game Log** | No history | Add a sidebar showing recent plays ("Sarah played +4, Ford drew 8 cards") so players can follow the chaos |
| 🃏 **Last Card Call** | Not implemented | Players should have to click "Last Card!" when they're down to 1 card, or get penalized with +2 if someone catches them |
| ♻️ **State Management** | Full re-render on every state change | Diff-based rendering or switch to a lightweight framework (Preact/Lit) to avoid flickering |

**TL;DR:** Great vibes for a one-session build. The architecture is solid and the game is playable. The main gaps are polish (animations, sound) and robustness (tests, validation). Adding sound effects alone would bump this to an 8.5.
