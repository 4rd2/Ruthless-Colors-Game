// ============================================================
// Game Board
// ============================================================

import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { RotateCw } from 'lucide-react';
import type { Socket } from '../lib/supabase';
import { C2S } from '@shared/events';
import { Card, CardColor, CardValue, ClientGameState, Direction, GamePhase, OpponentView } from '@shared/types';
import { AppState } from '../App';
import { CardComponent, CardBack } from './Card';
import { HandCarousel } from './HandCarousel';
import { VALUE_DISPLAY, clientCanPlay } from '../utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { EffectsLayer } from './effects/EffectsLayer';
import { play } from '../sound';

// ── Color helpers ────────────────────────────────────────────

const COLOR_HEX: Record<string, string> = {
    red:    '#e53935',
    blue:   '#1e88e5',
    green:  '#43a047',
    yellow: '#fdd835',
};

const COLOR_OPTIONS: { color: CardColor; label: string; hex: string }[] = [
    { color: 'red'    as CardColor, label: 'Red',    hex: '#e53935' },
    { color: 'blue'   as CardColor, label: 'Blue',   hex: '#1e88e5' },
    { color: 'green'  as CardColor, label: 'Green',  hex: '#43a047' },
    { color: 'yellow' as CardColor, label: 'Yellow', hex: '#fdd835' },
];

/** Deterministic per-card jitter for the discard pile stack */
function cardJitter(id: string): { rot: number; dx: number; dy: number } {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
    return {
        rot: (Math.abs(h) % 13) - 6,
        dx: (Math.abs(h >> 3) % 5) - 2,
        dy: (Math.abs(h >> 5) % 5) - 2,
    };
}

/** Shared ring that travels between seats on turn change */
function TurnRing() {
    return (
        <motion.div
            layoutId="turn-ring"
            className="pointer-events-none absolute -inset-1 rounded-2xl border-2 border-blue-400"
            style={{ boxShadow: '0 0 20px rgba(59,130,246,0.55)' }}
            transition={{ type: 'spring', stiffness: 350, damping: 30 }}
        />
    );
}

// ── Opponent area ────────────────────────────────────────────

function OpponentArea({ opponent, isActive }: {
    opponent: OpponentView;
    isActive: boolean;
}) {
    return (
        <div
            data-player-id={opponent.id}
            className={`relative flex items-center gap-2 rounded-xl px-2 py-1.5 transition-colors duration-300 sm:flex-col sm:gap-1 sm:px-4 sm:py-2 ${
                opponent.isEliminated
                    ? 'bg-zinc-900/80 border-2 border-zinc-800 opacity-40'
                    : isActive
                        ? 'bg-blue-900/60 border-2 border-blue-400'
                        : 'bg-zinc-800/80 border-2 border-zinc-700 opacity-60'
            }`}
        >
            {isActive && !opponent.isEliminated && <TurnRing />}
            <span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-black uppercase sm:hidden ${
                isActive ? 'bg-blue-500 text-white' : 'bg-zinc-700 text-zinc-300'
            }`}>
                {opponent.isEliminated ? '💀' : opponent.name.charAt(0)}
            </span>
            <span className={`hidden text-sm font-bold tracking-wide sm:block ${isActive ? 'text-white' : 'text-zinc-300'}`}>
                {opponent.isEliminated ? '💀 ' : ''}{opponent.name} {isActive && !opponent.isEliminated && '🔥'}
            </span>
            <span className={`text-xs ${isActive ? 'text-blue-200 font-bold' : 'text-zinc-500 font-semibold'}`}>
                {opponent.isEliminated ? 'out' : `${opponent.cardCount} cards`}
            </span>
        </div>
    );
}

// ── Table center ─────────────────────────────────────────────

function TableCenter({ game, isMyTurn, onDraw, optimisticPlayedCard, discardHistory }: {
    game: ClientGameState;
    isMyTurn: boolean;
    onDraw: () => void;
    optimisticPlayedCard: Card | null;
    discardHistory: Card[];
}) {
    const topCard  = optimisticPlayedCard || game.topCard;
    const display  = VALUE_DISPLAY[topCard.value] ?? topCard.value;
    const canDraw  = isMyTurn && game.phase === GamePhase.Playing;
    const dotColor = game.chosenColor && game.chosenColor !== 'wild' ? (COLOR_HEX[game.chosenColor] ?? null) : null;

    // Older discards peeking out beneath the top card
    const underCards = discardHistory.filter(c => c.id !== topCard.id).slice(-3);

    return (
        <div className="flex items-center justify-center gap-4 sm:gap-10">
            {/* Discard pile */}
            <div id="discard-pile" className="flex flex-col items-center gap-2">
                <AnimatePresence>
                    {game.drawStack > 0 && (
                        <motion.span
                            key={game.drawStack}
                            className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white"
                            style={{ boxShadow: `0 0 ${Math.min(6 + game.drawStack * 2, 30)}px rgba(220,38,38,0.8)` }}
                            initial={{ scale: 0.6, opacity: 0 }}
                            animate={{ scale: [1.35, 1], opacity: 1 }}
                            exit={{ scale: 0.6, opacity: 0 }}
                            transition={{ duration: 0.35 }}
                        >
                            +{game.drawStack} STACKED!
                        </motion.span>
                    )}
                </AnimatePresence>
                <div className="relative">
                    {underCards.map((card) => {
                        const j = cardJitter(card.id);
                        const d = VALUE_DISPLAY[card.value] ?? card.value;
                        return (
                            <div
                                key={card.id}
                                className={`rc-card color-${card.color}`}
                                // Inline position: cards.css is unlayered and its
                                // `position: relative` outranks Tailwind's `absolute`
                                style={{
                                    position: 'absolute',
                                    inset: 0,
                                    transform: `translate(${j.dx}px, ${j.dy}px) rotate(${j.rot}deg)`,
                                }}
                                aria-hidden
                            >
                                <span>{d}</span>
                                <span>{d}</span>
                                <span>{d}</span>
                            </div>
                        );
                    })}
                    <motion.div
                        layoutId={topCard.id}
                        className={`rc-card color-${topCard.color} relative`}
                        style={{ rotate: cardJitter(topCard.id).rot / 2 }}
                    >
                        <span>{display}</span>
                        <span>{display}</span>
                        <span>{display}</span>
                    </motion.div>
                </div>
                {dotColor && (
                    <div
                        className="size-4 rounded-full"
                        style={{ background: dotColor, boxShadow: `0 0 10px ${dotColor}` }}
                    />
                )}
                <span className="text-xs text-zinc-500">Discard</span>
            </div>

            {/* Direction indicator */}
            <motion.div
                className="flex flex-col items-center text-zinc-600"
                animate={{ scaleX: game.direction === Direction.Clockwise ? 1 : -1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            >
                <RotateCw className="size-5 sm:size-6" />
            </motion.div>

            {/* Draw pile */}
            <div id="draw-pile" className="flex flex-col items-center gap-2">
                <CardBack
                    onClick={canDraw ? onDraw : undefined}
                    disabled={!canDraw}
                />
                <span className="text-xs text-zinc-500">Draw Pile</span>
            </div>
        </div>
    );
}

// ── Player hand ──────────────────────────────────────────────

function PlayerHand({ game, isMyTurn, onPlay, optimisticPlayedCard }: {
    game: ClientGameState;
    isMyTurn: boolean;
    onPlay: (card: Card) => void;
    optimisticPlayedCard: Card | null;
}) {
    const you = game.you;
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerW, setContainerW] = useState(0);
    const [cardW, setCardW] = useState(72);
    // Wrappers are transformed (own stacking contexts), so the dragged
    // card's wrapper must be raised above its siblings explicitly.
    const [draggingCardId, setDraggingCardId] = useState<string | null>(null);

    // Touch devices get the scrollable carousel; desktop keeps the hover fan.
    // `?touch` forces carousel mode for desktop testing/emulation.
    const coarsePointer = useMemo(
        () => window.matchMedia('(pointer: coarse)').matches
            || new URLSearchParams(window.location.search).has('touch'),
        [],
    );

    // Stagger the deal only on the first render of the hand
    const isInitialDeal = useRef(true);
    useEffect(() => { isInitialDeal.current = false; }, []);

    useLayoutEffect(() => {
        if (coarsePointer) return; // carousel measures itself
        const el = containerRef.current;
        if (!el) return;
        const measure = () => {
            setContainerW(el.clientWidth);
            const c = el.querySelector('.rc-card');
            if (c instanceof HTMLElement && c.offsetWidth > 0) setCardW(c.offsetWidth);
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, [coarsePointer]);

    const cards = you.hand.filter(c => c.id !== optimisticPlayedCard?.id);
    const n = cards.length;
    const mid = (n - 1) / 2;
    const cardH = cardW * 1.5;

    // Fan geometry: overlap adapts to the container so 25 cards still fit
    const step = n > 1
        ? Math.min(cardW * 0.72, Math.max(10, (containerW - cardW - 16) / (n - 1)))
        : 0;
    const anglePer = Math.min(7, Math.max(2.5, 44 / Math.max(n, 1)));
    // Half-circle wheel: radius such that arc spacing ≈ card spacing, so
    // y drops follow the circle (only the top of the arc shows)
    const anglePerRad = (anglePer * Math.PI) / 180;
    const fanRadius = step > 0 ? step / Math.sin(anglePerRad) : 0;

    const isPlayable = (card: Card) =>
        isMyTurn && game.phase === GamePhase.Playing && clientCanPlay(card, game.topCard, game.chosenColor, game.drawStack);

    const handlePlayCard = (card: Card) => {
        onPlay(card);
    };

    // The card whose layoutId is about to reappear on the discard pile
    // must not run an exit animation, or it ghosts in the hand.
    const playedId = optimisticPlayedCard?.id ?? game.topCard.id;

    return (
        <div className="flex w-full max-w-full flex-col items-center gap-2 pb-2">
            {/* Player badge */}
            <div className={`relative flex items-center gap-3 rounded-xl px-4 py-1.5 transition-colors duration-300 sm:px-6 sm:py-2 ${
                isMyTurn
                    ? 'bg-blue-900 border-2 border-blue-400'
                    : 'bg-zinc-800 border-2 border-zinc-700 opacity-80'
            }`}>
                {isMyTurn && <TurnRing />}
                <span className={`text-base font-black uppercase tracking-wider sm:text-lg ${isMyTurn ? 'text-white' : 'text-zinc-300'}`}>
                    {you.name} <span className="hidden sm:inline">(You)</span>
                </span>
                <span className={`text-xs font-bold sm:text-sm ${isMyTurn ? 'text-blue-200' : 'text-zinc-400'}`}>
                    {you.hand.length} cards
                </span>
                {isMyTurn && (
                    <span className="ml-1 animate-pulse rounded bg-blue-950 px-2 py-1 text-[10px] font-black uppercase text-blue-300 sm:ml-2 sm:text-xs">
                        🔥 YOUR TURN
                    </span>
                )}
            </div>

            {/* Touch: scrollable fan carousel — center card is highlighted */}
            {coarsePointer ? (
                <HandCarousel
                    cards={cards}
                    isPlayable={isPlayable}
                    onPlay={handlePlayCard}
                    isMyTurn={isMyTurn}
                />
            ) : (
                /* Desktop: hover fan */
                <div
                    id="player-hand"
                    ref={containerRef}
                    className="relative w-full overflow-visible"
                    style={{ height: cardH + 64 }}
                >
                    <AnimatePresence custom={playedId}>
                        {cards.map((card, i) => {
                            const playable = isPlayable(card);
                            const x = (i - mid) * step - cardW / 2;
                            const y = fanRadius * (1 - Math.cos((i - mid) * anglePerRad)) + 20;
                            const rotate = (i - mid) * anglePer;
                            return (
                                <motion.div
                                    key={card.id}
                                    className="absolute left-1/2 top-0"
                                    style={{ zIndex: draggingCardId === card.id ? 40 : i }}
                                    animate={{ x, y, rotate }}
                                    variants={{
                                        exit: (topId: string) => (
                                            card.id === topId
                                                ? { opacity: 0, transition: { duration: 0 } }
                                                : { opacity: 0, scale: 0.8, y: y + 20, transition: { duration: 0.18 } }
                                        ),
                                    }}
                                    exit="exit"
                                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                                >
                                    <CardComponent
                                        card={card}
                                        playable={playable}
                                        onAction={playable ? () => handlePlayCard(card) : undefined}
                                        dealing
                                        dealDelay={isInitialDeal.current ? i * 40 : 0}
                                        dragMode="free"
                                        onDragStart={() => setDraggingCardId(card.id)}
                                        onDragEnd={() => setDraggingCardId(null)}
                                        onPlayDrop={playable ? () => handlePlayCard(card) : undefined}
                                    />
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
}

// ── Modal shell (bottom sheet on phones) ─────────────────────

const SHEET_CLASSES = [
    'bg-zinc-800 border-zinc-700',
    'max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:translate-x-0 max-sm:translate-y-0',
    'max-sm:w-full max-sm:max-w-full max-sm:rounded-b-none max-sm:rounded-t-2xl',
    'max-sm:pb-[calc(1.25rem+env(safe-area-inset-bottom))]',
].join(' ');

// ── Color chooser panel ──────────────────────────────────────
// Deliberately NOT a modal dialog: no backdrop and no focus trap,
// so the hand stays visible and scrollable while choosing.

function ColorChooserModal({ title, subtitle, onChoose }: {
    title: string;
    subtitle?: string;
    onChoose: (color: CardColor) => void;
}) {
    return (
        <div className="pointer-events-none fixed inset-x-0 top-1/2 z-40 flex -translate-y-1/2 justify-center px-4">
            <motion.div
                className="pointer-events-auto w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-800/95 p-4 shadow-2xl backdrop-blur-sm"
                initial={{ opacity: 0, scale: 0.9, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            >
                <h3 className="text-base font-semibold text-white">{title}</h3>
                {subtitle && <p className="mt-1 text-sm text-zinc-400">{subtitle}</p>}
                <div className="mt-3 grid grid-cols-2 gap-2">
                    {COLOR_OPTIONS.map(({ color, label, hex }) => (
                        <button
                            key={color}
                            onClick={() => onChoose(color)}
                            className="min-h-16 rounded-lg px-4 py-3 text-base font-semibold transition-opacity hover:opacity-80 sm:min-h-0 sm:text-sm"
                            style={{ background: hex, color: color === 'yellow' ? '#333' : 'white' }}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                <p className="mt-3 text-center text-[11px] text-zinc-500">
                    Your cards stay scrollable below.
                </p>
            </motion.div>
        </div>
    );
}

// ── Swap selector modal ──────────────────────────────────────

function SwapSelectorModal({ opponents, onSelect }: {
    opponents: OpponentView[];
    onSelect: (targetId: string) => void;
}) {
    return (
        <Dialog open>
            <DialogContent showCloseButton={false} className={SHEET_CLASSES}>
                <DialogHeader>
                    <DialogTitle className="text-white">Choose a player to swap hands with</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-2">
                    {opponents.map(opp => (
                        <button
                            key={opp.id}
                            onClick={() => onSelect(opp.id)}
                            className="flex min-h-14 items-center justify-between rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-200 transition-colors hover:bg-zinc-700 hover:text-white"
                        >
                            <span>{opp.name}</span>
                            <Badge className="bg-blue-600 text-white border-transparent">{opp.cardCount} cards</Badge>
                        </button>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    );
}

// ── Game over overlay ────────────────────────────────────────

function GameOverOverlay({ game }: { game: ClientGameState }) {
    const isWinner   = game.winnerId === game.you.id;
    const winnerName = isWinner
        ? 'You'
        : (game.opponents.find(o => o.id === game.winnerId)?.name ?? 'Someone');

    return (
        <motion.div
            className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-6 bg-black/75 px-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
        >
            <motion.span
                className="text-center text-4xl font-black tracking-tight text-white sm:text-5xl"
                initial={{ scale: 0.4, y: 40, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.15 }}
            >
                {isWinner ? '🎉 YOU WIN!' : '💀 GAME OVER'}
            </motion.span>
            <motion.span
                className="text-lg text-zinc-300"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.45 }}
            >
                {winnerName} win{winnerName === 'You' ? '' : 's'}!
            </motion.span>
            <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.65 }}
            >
                <Button
                    className="min-h-12 bg-blue-600 px-8 text-white border-transparent hover:bg-blue-500"
                    onClick={() => location.reload()}
                >
                    Play Again
                </Button>
            </motion.div>
        </motion.div>
    );
}

// ── Main GameBoard ───────────────────────────────────────────

interface Props {
    socket: Socket;
    state: AppState;
}

export default function GameBoard({ socket, state }: Props) {
    const { game, playerId } = state;
    if (!game) return null;

    const isMyTurn = game.currentPlayerId === playerId;
    const [optimisticPlayedCard, setOptimisticPlayedCard] = useState<Card | null>(null);

    useEffect(() => {
        setOptimisticPlayedCard(null);
    }, [game.topCard.id, game.you.hand.length]);

    // Client-side memory of recent discards for the pile stack.
    // Guarded by id so StrictMode double-renders stay idempotent.
    const discardHistoryRef = useRef<Card[]>([]);
    {
        const h = discardHistoryRef.current;
        if (h[h.length - 1]?.id !== game.topCard.id) {
            h.push(game.topCard);
            if (h.length > 5) h.shift();
        }
    }

    const handlePlay = (card: Card) => {
        socket.emit(C2S.PLAY_CARD, { roomCode: game.roomCode, playerId, cardId: card.id });
        setOptimisticPlayedCard(card);
        // Voice own plays instantly — the bus copy (isSelf) is suppressed
        play(card.value === CardValue.WildParry ? 'parry' : 'cardPlay');
    };

    const handleDraw = () => {
        socket.emit(C2S.DRAW_CARD, { roomCode: game.roomCode, playerId });
        play('cardDraw');
    };

    // ── Auto-draw when there is no legal move ────────────────
    // A stable key describes the exact "stuck" situation; the effect
    // schedules one draw per key (the delay lets the player see why).
    const autoDrawKey =
        isMyTurn &&
        game.phase === GamePhase.Playing &&
        !optimisticPlayedCard &&
        game.you.hand.length > 0 &&
        !game.you.hand.some(c => clientCanPlay(c, game.topCard, game.chosenColor, game.drawStack))
            ? `${game.currentPlayerId}:${game.topCard.id}:${game.you.hand.length}:${game.drawStack}:${game.chosenColor ?? ''}`
            : null;

    useEffect(() => {
        if (!autoDrawKey) return;
        const t = setTimeout(handleDraw, 1200);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoDrawKey]);

    const handleChooseColor = (color: CardColor) => {
        socket.emit(C2S.CHOOSE_COLOR, { roomCode: game.roomCode, playerId, color });
    };

    const handleRouletteColor = (color: CardColor) => {
        socket.emit(C2S.COLOR_ROULETTE_CHOICE, { roomCode: game.roomCode, playerId, color });
    };

    const handleSwapTarget = (targetPlayerId: string) => {
        socket.emit(C2S.CHOOSE_SWAP_TARGET, { roomCode: game.roomCode, playerId, targetPlayerId });
    };

    return (
        <LayoutGroup>
            <div className="game-root flex min-h-svh flex-col bg-zinc-900 landscape-short:grid landscape-short:grid-cols-[auto_1fr] landscape-short:grid-rows-[1fr_auto]">
                {/* Opponents */}
                <div className="flex flex-wrap justify-center gap-2 p-3 sm:gap-6 sm:p-4 landscape-short:col-start-1 landscape-short:row-start-1 landscape-short:flex-col landscape-short:items-start landscape-short:justify-start">
                    {game.opponents.map((opp) => (
                        <OpponentArea
                            key={opp.id}
                            opponent={opp}
                            isActive={game.currentPlayerId === opp.id}
                        />
                    ))}
                </div>

                {/* Table center */}
                <div className="flex flex-1 items-center justify-center landscape-short:col-start-2 landscape-short:row-start-1">
                    <TableCenter
                        game={game}
                        isMyTurn={isMyTurn}
                        onDraw={handleDraw}
                        optimisticPlayedCard={optimisticPlayedCard}
                        discardHistory={discardHistoryRef.current}
                    />
                </div>

                {/* Auto-draw notice */}
                {autoDrawKey && (
                    <div className="pointer-events-none fixed inset-x-0 top-[30%] z-30 flex justify-center px-4">
                        <motion.span
                            className="animate-pulse rounded-full border border-zinc-600 bg-zinc-800/95 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-zinc-200 shadow-lg"
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                        >
                            {game.drawStack > 0
                                ? `Can't counter — drawing ${game.drawStack}…`
                                : 'No playable cards — drawing…'}
                        </motion.span>
                    </div>
                )}

                {/* Player hand */}
                <div className="landscape-short:col-span-2 landscape-short:row-start-2">
                    <PlayerHand
                        game={game}
                        isMyTurn={isMyTurn}
                        onPlay={handlePlay}
                        optimisticPlayedCard={optimisticPlayedCard}
                    />
                </div>

                {/* Color chooser */}
                {game.phase === GamePhase.ChoosingColor && isMyTurn && (
                    <ColorChooserModal title="Choose a Color" onChoose={handleChooseColor} />
                )}

                {/* Color roulette */}
                {game.phase === GamePhase.ColorRoulette && isMyTurn && (
                    <ColorChooserModal
                        title="🎰 Color Roulette!"
                        subtitle="Choose a color — you'll draw cards until you find one!"
                        onChoose={handleRouletteColor}
                    />
                )}

                {/* Swap selector */}
                {game.phase === GamePhase.ChoosingSwapTarget && isMyTurn && (
                    <SwapSelectorModal
                        opponents={game.opponents.filter(o => !o.isEliminated)}
                        onSelect={handleSwapTarget}
                    />
                )}

                {/* Game over */}
                {game.phase === GamePhase.GameOver && game.winnerId && (
                    <GameOverOverlay game={game} />
                )}

                {/* Transient overlay animations */}
                <EffectsLayer game={game} playerId={playerId} />
            </div>
        </LayoutGroup>
    );
}
