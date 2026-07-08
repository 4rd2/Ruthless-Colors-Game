# 📋 Ruthless Colors — Feature Backlog & TO-DO List

This document tracks planned features, enhancements, and bug fixes for the Supabase-based **Ruthless Colors** online multiplayer card game.

---

## 🐛 Bug Fixes & Mobile Optimizations
- [x] **Mobile Drag-and-Drop Bug** *(fixed 2026-07-05)*
  - *Issue:* Dragging animation gets stuck inside the card container on touch screens.
  - *Fix:* The focused card now plays the moment the finger travels past the flick threshold **during** the drag (raw pointer delta, unaffected by container clipping or drag constraints), instead of waiting for release against the clip edge. Constraints loosened and carousel headroom increased.
- [x] **Mobile Sound Effects** *(fixed 2026-07-05)*
  - *Issue:* Sound effects do not play or fail to initialize on mobile web browsers.
  - *Fix:* Audio unlock now listens to `touchstart`/`click` as well as `pointerdown`, and performs the full iOS ritual inside the gesture: create AudioContext, `resume()`, and play a silent priming buffer. Listeners stay armed until the context is genuinely running.

---

## 🔒 Authentication & Player Profiles
- [ ] **Sign-In / Register System**
  - Integrate Supabase Auth (Email/Password, Google, etc.) to allow players to create persistent accounts.
  - Link current anonymous session profiles to registered accounts.
  - Add user profile management (avatar uploads, custom display name updates).

---

## 📊 Lobby, Social, & UI Redesign
- [ ] **Main Menu Reorganization**
  - Redesign the landing page to accommodate more features while maintaining a premium, clean aesthetic.
  - Integrate visual entry points for authentication, stats, and the leaderboard.
- [ ] **Leaderboard in Main Menu**
  - Fetch and display the top players globally (wins, games played, win rate).
  - Track stats in the database (create a new `profiles` / `stats` table).

---

## 🃏 Game Rules, Cards, & Game Modes
- [ ] **New Special Cards**
  - Introduce new cards from wild game sets (e.g., target draw cards, custom action cards).
- [ ] **Multiple Game Modes**
  - Standard mode (rules as implemented).
  - No Mercy mode (extreme card stacks).
  - Custom house rules (toggleable in lobby by the host).

---

## 🎨 Visuals & Animations
- [x] **Better Card Designs** *(done 2026-07-05 — neon arcade theme: black faces, suit-colored neon borders/glyph glows, scanline texture, neon-grid card back)*
  - Enhance CSS/SVG card designs to feel more premium, using richer gradients, border highlights, and tactile patterns.
- [x] **Fluid Animations** *(done 2026-07-02 — EffectsLayer flight animations hand↔discard↔seats, half-circle fan/carousel, turn-ring travel, draw/swap/elimination/victory effects, synthesized sound engine)*
  - Add arc-based play animations (cards fanning out and flying from hand to discard pile).
  - Add micro-animations on hover, click, and state transitions (e.g., turn changes, drawing animations).
