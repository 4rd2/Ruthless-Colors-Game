# 📋 Ruthless Colors — Feature Backlog & TO-DO List

This document tracks planned features, enhancements, and bug fixes for the Supabase-based **Ruthless Colors** online multiplayer card game.

---

## 🐛 Bug Fixes & Mobile Optimizations
- [ ] **Mobile Drag-and-Drop Bug**
  - *Issue:* Dragging animation gets stuck inside the card container on touch screens.
  - *Fix:* Ensure touch event listeners (touchstart, touchmove, touchend) properly calculate coordinates globally on the viewport instead of bounding containment, allowing fluid dragging and playing of cards.
- [ ] **Mobile Sound Effects**
  - *Issue:* Sound effects do not play or fail to initialize on mobile web browsers.
  - *Fix:* Resolve mobile audio restrictions by triggering HTML5 audio context unlocking on the first user interaction (e.g., clicking "Join" or "Create").

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
- [ ] **Better Card Designs**
  - Enhance CSS/SVG card designs to feel more premium, using richer gradients, border highlights, and tactile patterns.
- [ ] **Fluid Animations**
  - Add arc-based play animations (cards fanning out and flying from hand to discard pile).
  - Add micro-animations on hover, click, and state transitions (e.g., turn changes, drawing animations).
