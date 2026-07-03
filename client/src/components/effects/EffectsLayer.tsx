// ============================================================
// Effects Layer — transient overlay animations
//
// Full-screen, pointer-events-none layer that listens to the
// game event bus and renders animations for things that never
// exist in the DOM (opponent cards flying, draw flights, skull
// bursts, confetti, the roulette reveal).
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';
import { Card, ClientGameState } from '@shared/types';
import { gameEvents } from '../../lib/gameEvents';
import { VALUE_DISPLAY } from '../../utils';

// ── Geometry helpers ─────────────────────────────────────────

interface Point { x: number; y: number }

function centerOf(selector: string): Point | null {
    const el = document.querySelector(selector);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function cardSize(): { w: number; h: number } {
    const el = document.querySelector('.rc-card');
    if (el instanceof HTMLElement && el.offsetWidth > 0) {
        return { w: el.offsetWidth, h: el.offsetHeight };
    }
    return { w: 72, h: 108 };
}

// ── Flying card ──────────────────────────────────────────────

interface Flight {
    id: number;
    card: Card | null; // null = card back
    from: Point;
    to: Point;
    delay: number;
}

function FlyingCard({ flight, onDone }: { flight: Flight; onDone: (id: number) => void }) {
    const { w, h } = cardSize();
    const { from, to, card, delay } = flight;
    // Arc perpendicular to the travel direction
    const midX = (from.x + to.x) / 2 + (to.y - from.y) * 0.12;
    const midY = (from.y + to.y) / 2 - Math.abs(to.x - from.x) * 0.08 - 24;
    const spin = ((flight.id % 2 === 0 ? 1 : -1) * (8 + (flight.id % 3) * 4));

    const display = card ? (VALUE_DISPLAY[card.value] ?? card.value) : null;

    return (
        <motion.div
            className={card ? `rc-card color-${card.color}` : 'rc-card card-back'}
            style={{ position: 'fixed', left: -w / 2, top: -h / 2, zIndex: 60 }}
            initial={{ x: from.x, y: from.y, rotate: 0, scale: 0.65, opacity: 0.95 }}
            animate={{
                x: [from.x, midX, to.x],
                y: [from.y, midY, to.y],
                rotate: spin,
                scale: 0.95,
                opacity: 1,
            }}
            transition={{ duration: 0.45, delay, ease: 'easeInOut' }}
            onAnimationComplete={() => onDone(flight.id)}
        >
            {card ? (
                <>
                    <span>{display}</span>
                    <span>{display}</span>
                    <span>{display}</span>
                </>
            ) : (
                <>
                    <div />
                    <span>RC</span>
                </>
            )}
        </motion.div>
    );
}

// ── Confetti ─────────────────────────────────────────────────

const CONFETTI_COLORS = ['#e53935', '#1e88e5', '#43a047', '#fdd835'];

function ConfettiBurst() {
    const pieces = Array.from({ length: 14 }, (_, i) => ({
        id: i,
        x: (i / 14) * window.innerWidth + (Math.random() - 0.5) * 80,
        drift: (Math.random() - 0.5) * 160,
        rot: Math.random() * 720 - 360,
        delay: Math.random() * 0.4,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    }));

    return (
        <>
            {pieces.map(p => (
                <motion.div
                    key={p.id}
                    style={{
                        position: 'fixed',
                        left: p.x,
                        top: -30,
                        width: 14,
                        height: 21,
                        borderRadius: 3,
                        background: p.color,
                        zIndex: 70,
                    }}
                    initial={{ y: 0, rotate: 0, opacity: 1 }}
                    animate={{ y: window.innerHeight + 60, x: p.drift, rotate: p.rot, opacity: [1, 1, 0.8] }}
                    transition={{ duration: 2.4 + Math.random(), delay: p.delay, ease: 'easeIn' }}
                />
            ))}
        </>
    );
}

// ── Roulette reveal overlay ──────────────────────────────────

function RouletteReveal({ cards, name, onDone }: { cards: Card[]; name: string; onDone: () => void }) {
    const shown = cards.slice(0, 8);
    const extra = cards.length - shown.length;

    useEffect(() => {
        const t = setTimeout(onDone, 1800 + shown.length * 220);
        return () => clearTimeout(t);
    }, [onDone, shown.length]);

    return (
        <motion.div
            className="fixed inset-0 z-[65] flex flex-col items-center justify-center gap-4 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
        >
            <span className="text-lg font-black uppercase tracking-widest text-white">
                🎰 {name} drew {cards.length} card{cards.length === 1 ? '' : 's'}!
            </span>
            <div className="flex max-w-full flex-wrap items-center justify-center gap-2 px-4">
                {shown.map((card, i) => {
                    const display = VALUE_DISPLAY[card.value] ?? card.value;
                    const isLast = i === shown.length - 1 && extra <= 0;
                    return (
                        <motion.div
                            key={card.id}
                            className={`rc-card color-${card.color}`}
                            style={isLast ? { boxShadow: '0 0 24px 6px rgba(255,255,255,0.55)' } : undefined}
                            initial={{ rotateY: 90, opacity: 0, scale: 0.8 }}
                            animate={{ rotateY: 0, opacity: 1, scale: isLast ? 1.1 : 1 }}
                            transition={{ delay: i * 0.22, duration: 0.3 }}
                        >
                            <span>{display}</span>
                            <span>{display}</span>
                            <span>{display}</span>
                        </motion.div>
                    );
                })}
                {extra > 0 && (
                    <motion.span
                        className="text-xl font-black text-white"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: shown.length * 0.22 }}
                    >
                        +{extra} more
                    </motion.span>
                )}
            </div>
        </motion.div>
    );
}

// ── Effects layer ────────────────────────────────────────────

interface Props {
    game: ClientGameState;
    playerId: string | null;
}

let nextId = 1;

export function EffectsLayer({ game, playerId }: Props) {
    const reducedMotion = useReducedMotion();
    const [flights, setFlights] = useState<Flight[]>([]);
    const [skulls, setSkulls] = useState<{ id: number; at: Point }[]>([]);
    const [vignetteKey, setVignetteKey] = useState(0);
    const [confettiKey, setConfettiKey] = useState(0);
    const [roulette, setRoulette] = useState<{ cards: Card[]; name: string } | null>(null);

    // Latest game snapshot for name lookups inside subscriptions
    const gameRef = useRef(game);
    gameRef.current = game;
    const playerIdRef = useRef(playerId);
    playerIdRef.current = playerId;

    useEffect(() => {
        const seatCenter = (pid: string): Point | null =>
            pid === playerIdRef.current
                ? centerOf('#player-hand')
                : centerOf(`[data-player-id="${pid}"]`);

        const nameOf = (pid: string): string => {
            const g = gameRef.current;
            if (pid === playerIdRef.current) return 'You';
            return g.opponents.find(o => o.id === pid)?.name ?? 'A player';
        };

        const addFlights = (items: Omit<Flight, 'id'>[]) => {
            if (reducedMotion) return;
            setFlights(prev => [...prev, ...items.map(f => ({ ...f, id: nextId++ }))]);
        };

        const unsubs = [
            // Opponent plays: card face flies from their seat to the discard pile
            gameEvents.on('card_played', ({ byId, card, isSelf }) => {
                if (isSelf) return; // own plays use the layoutId flight in the hand
                const from = seatCenter(byId);
                const to = centerOf('#discard-pile .rc-card') ?? centerOf('#discard-pile');
                if (!from || !to) return;
                addFlights([{ card, from, to, delay: 0 }]);
            }),

            // Draws: card backs fly from the draw pile toward the drawer
            gameEvents.on('cards_drawn', ({ byId, count, isSelf }) => {
                const from = centerOf('#draw-pile');
                const to = seatCenter(byId);
                if (!from || !to) return;
                const n = Math.min(count, isSelf ? 5 : 3);
                addFlights(Array.from({ length: n }, (_, i) => ({
                    card: null, from, to, delay: i * 0.07,
                })));
            }),

            // Swap: backs fly both directions between the two seats
            gameEvents.on('hands_swapped', ({ player1, player2 }) => {
                const a = seatCenter(player1);
                const b = seatCenter(player2);
                if (!a || !b) return;
                addFlights([
                    ...Array.from({ length: 3 }, (_, i) => ({ card: null, from: a, to: b, delay: i * 0.08 })),
                    ...Array.from({ length: 3 }, (_, i) => ({ card: null, from: b, to: a, delay: i * 0.08 + 0.04 })),
                ]);
            }),

            // Pass: one back flows seat → next seat around the table
            gameEvents.on('hands_passed', () => {
                const g = gameRef.current;
                const seats = [...g.opponents.filter(o => !o.isEliminated).map(o => o.id), g.you.id];
                if (seats.length < 2) return;
                const ordered = g.direction === 1 ? seats : [...seats].reverse();
                const items: Omit<Flight, 'id'>[] = [];
                ordered.forEach((pid, i) => {
                    const from = seatCenter(pid);
                    const to = seatCenter(ordered[(i + 1) % ordered.length]);
                    if (from && to) items.push({ card: null, from, to, delay: i * 0.05 });
                });
                addFlights(items);
            }),

            // Elimination: red vignette for you, skull burst over their seat
            gameEvents.on('player_eliminated', ({ playerId: pid, isSelf }) => {
                if (reducedMotion) return;
                if (isSelf) {
                    setVignetteKey(k => k + 1);
                } else {
                    const at = seatCenter(pid);
                    if (!at) return;
                    const id = nextId++;
                    setSkulls(prev => [...prev, { id, at }]);
                    setTimeout(() => setSkulls(prev => prev.filter(s => s.id !== id)), 1400);
                }
            }),

            // Roulette: full reveal overlay (toast fallback for reduced motion)
            gameEvents.on('roulette_reveal', ({ cards, playerId: pid }) => {
                if (reducedMotion) {
                    toast.warning(`🎰 ${nameOf(pid)} drew ${cards.length} cards from Color Roulette!`);
                    return;
                }
                setRoulette({ cards, name: nameOf(pid) });
            }),

            // Victory confetti for the winner
            gameEvents.on('game_over', ({ isSelf }) => {
                if (isSelf && !reducedMotion) setConfettiKey(k => k + 1);
            }),
        ];
        return () => unsubs.forEach(off => off());
    }, [reducedMotion]);

    const removeFlight = (id: number) =>
        setFlights(prev => prev.filter(f => f.id !== id));

    return (
        <div className="pointer-events-none fixed inset-0 z-50" aria-hidden>
            {flights.map(f => (
                <FlyingCard key={f.id} flight={f} onDone={removeFlight} />
            ))}

            {skulls.map(s => (
                <motion.span
                    key={s.id}
                    style={{ position: 'fixed', left: s.at.x, top: s.at.y, zIndex: 70 }}
                    className="text-4xl"
                    initial={{ x: '-50%', y: '-50%', scale: 0.3, opacity: 0 }}
                    animate={{ x: '-50%', y: '-120%', scale: 1.6, opacity: [0, 1, 1, 0] }}
                    transition={{ duration: 1.3, ease: 'easeOut' }}
                >
                    💀
                </motion.span>
            ))}

            {vignetteKey > 0 && (
                <motion.div
                    key={vignetteKey}
                    className="fixed inset-0 z-[55]"
                    style={{ background: 'radial-gradient(ellipse at center, transparent 40%, rgba(220,38,38,0.55) 100%)' }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 1, 0.4, 1, 0] }}
                    transition={{ duration: 1.6 }}
                />
            )}

            {confettiKey > 0 && <ConfettiBurst key={confettiKey} />}

            <AnimatePresence>
                {roulette && (
                    <RouletteReveal
                        cards={roulette.cards}
                        name={roulette.name}
                        onDone={() => setRoulette(null)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
