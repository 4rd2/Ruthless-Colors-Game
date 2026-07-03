// ============================================================
// Game Board
// ============================================================

import { useState, useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { C2S } from '@shared/events';
import { Card, CardColor, ClientGameState, OpponentView } from '@shared/types';
import { AppState } from '../App';
import { CardComponent, CardBack } from './Card';
import { VALUE_DISPLAY, SMALL_TEXT_VALUES, clientCanPlay } from '../utils';

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

// ── Opponent area ────────────────────────────────────────────

const POSITION_CLASSES: Record<string, string> = {
    top:   'absolute top-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2',
    left:  'absolute top-1/2 left-4 -translate-y-1/2 flex flex-col items-center gap-2',
    right: 'absolute top-1/2 right-4 -translate-y-1/2 flex flex-col items-center gap-2',
};

function OpponentArea({ opponent, isCurrent, position }: {
    opponent: OpponentView;
    isCurrent: boolean;
    position: 'top' | 'left' | 'right';
}) {
    const isDanger   = opponent.cardCount >= 20;
    const miniCards  = Array.from({ length: Math.min(opponent.cardCount, 15) });

    return (
        <div>
            {/* Name badge */}
            <div>
                <span>{opponent.name}</span>
                <span>
                    {opponent.cardCount} cards
                </span>
            </div>
            {/* Mini card stack */}
            <div>
                {miniCards.map((_, i) => (
                    <div
                        key={i}
                        style={{ width: 36, height: 52, fontSize: '0.5rem', marginLeft: i > 0 ? -12 : 0, borderWidth: 1 }}
                    >
                        <div style={{ inset: 4 }} />
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Table center ─────────────────────────────────────────────

function TableCenter({ game, isMyTurn, onDraw }: {
    game: ClientGameState;
    isMyTurn: boolean;
    onDraw: () => void;
}) {
    const topCard  = game.topCard;
    const display  = VALUE_DISPLAY[topCard.value] ?? topCard.value;
    const isSmall  = SMALL_TEXT_VALUES.includes(topCard.value);
    const canDraw  = isMyTurn && game.phase === 'playing';
    const dotColor = game.chosenColor && game.chosenColor !== 'wild' ? (COLOR_HEX[game.chosenColor] ?? null) : null;

    return (
        <div>
            {/* Discard pile */}
            <div>
                {game.drawStack > 0 && (
                    <div>
                        +{game.drawStack} STACKED!
                    </div>
                )}
                <div
                >
                    <div />
                    <span>{display}</span>
                    <span>{display}</span>
                    <span>{display}</span>
                </div>
                {dotColor && (
                    <div
                        style={{ background: dotColor, boxShadow: `0 0 12px ${dotColor}` }}
                    />
                )}
            </div>

            {/* Draw pile */}
            <div>
                <CardBack
                    onClick={canDraw ? onDraw : undefined}
                    disabled={!canDraw}
                    style={{ position: 'absolute', inset: 0, width: 100, height: 150 }}
                />
                <span>
                    {game.drawPileCount} cards
                </span>
            </div>
        </div>
    );
}

// ── Player hand ──────────────────────────────────────────────

const CARDS_PER_ROW = 6;
const CARD_H        = 120;
const ROW_STEP      = 60;

function PlayerHand({ game, isMyTurn, selectedId, onSelect, onPlay }: {
    game: ClientGameState;
    isMyTurn: boolean;
    selectedId: string | null;
    onSelect: (id: string | null) => void;
    onPlay: (card: Card) => void;
}) {
    const you      = game.you;
    const isCurrent = game.currentPlayerId === you.id;
    const isDanger  = you.hand.length >= 20;

    const [windowWidth, setWindowWidth] = useState(window.innerWidth);
    const [dragOffset, setDragOffset]   = useState(0);
    const touchStartY      = useRef(0);
    const touchStartOffset = useRef(0);
    const touchMoved       = useRef(false);

    useEffect(() => {
        const handler = () => setWindowWidth(window.innerWidth);
        window.addEventListener('resize', handler);
        return () => window.removeEventListener('resize', handler);
    }, []);

    // Reset offset when the hand size changes significantly (new game state)
    const prevHandLen = useRef(you.hand.length);
    useEffect(() => {
        if (Math.abs(you.hand.length - prevHandLen.current) > 2) setDragOffset(0);
        prevHandLen.current = you.hand.length;
    }, [you.hand.length]);

    const isMobile   = windowWidth <= 768;
    const numRows    = Math.ceil(you.hand.length / CARDS_PER_ROW);
    const useStack   = isMobile && numRows > 1;
    const maxOffset  = (numRows - 1) * ROW_STEP;
    const activeRow  = Math.round(dragOffset / ROW_STEP);

    const isPlayable = (card: Card) =>
        isMyTurn && game.phase === 'playing' && clientCanPlay(card, game.topCard, game.chosenColor, game.drawStack);

    const handleAction = (card: Card) => {
        if (selectedId === card.id) {
            onPlay(card);
        } else {
            onSelect(card.id);
        }
    };

    const onTouchStart = (e: React.TouchEvent) => {
        touchStartY.current      = e.touches[0].clientY;
        touchStartOffset.current = dragOffset;
        touchMoved.current       = false;
    };
    const onTouchMove = (e: React.TouchEvent) => {
        const dy = touchStartY.current - e.touches[0].clientY;
        if (Math.abs(dy) > 4) touchMoved.current = true;
        setDragOffset(Math.max(0, Math.min(maxOffset, touchStartOffset.current + dy)));
    };
    const onTouchEnd = () => {
        if (!touchMoved.current) return;
        setDragOffset(Math.round(dragOffset / ROW_STEP) * ROW_STEP);
    };

    return (
        <div>
            {/* Player badge */}
            <div>
                <span>{you.name} (You)</span>
                <span>
                    {you.hand.length} cards
                </span>
            </div>

            {/* ── Flat fan (desktop / single-row mobile) ── */}
            {!useStack && (
                <div style={{ minHeight: 160 }}>
                    {you.hand.map((card, idx) => {
                        const playable = isPlayable(card);
                        return (
                            <CardComponent
                                key={card.id}
                                card={card}
                                playable={playable}
                                selected={selectedId === card.id}
                                onAction={playable ? () => handleAction(card) : undefined}
                                dealing
                                dealDelay={idx * 40}
                                style={{ marginLeft: idx > 0 ? -20 : 0 }}
                            />
                        );
                    })}
                </div>
            )}

            {/* ── Stacked rows (mobile multi-row) ── */}
            {useStack && (
                <div
                    style={{ position: 'relative', width: '100%', height: 160, overflow: 'hidden', touchAction: 'none' }}
                    onTouchStart={onTouchStart}
                    onTouchMove={onTouchMove}
                    onTouchEnd={onTouchEnd}
                >
                    <div
                        style={{
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            width: '100%',
                            height: (numRows - 1) * ROW_STEP + CARD_H,
                            transform: `translateY(-${dragOffset}px)`,
                            willChange: 'transform',
                        }}
                    >
                        {Array.from({ length: numRows }, (_, rowIdx) => {
                            const rowCards   = you.hand.slice(rowIdx * CARDS_PER_ROW, (rowIdx + 1) * CARDS_PER_ROW);
                            const isActiveRow = rowIdx === activeRow;
                            return (
                                <div
                                    key={rowIdx}
                                    style={{
                                        position: 'absolute',
                                        bottom: rowIdx * ROW_STEP,
                                        left: 0,
                                        width: '100%',
                                        height: CARD_H,
                                        display: 'flex',
                                        justifyContent: 'center',
                                        alignItems: 'center',
                                        padding: '0 10px',
                                        zIndex: numRows - rowIdx,
                                        pointerEvents: isActiveRow ? 'auto' : 'none',
                                        opacity: isActiveRow ? 1 : 0.65,
                                    }}
                                >
                                    {rowCards.map((card, i) => {
                                        const playable = isPlayable(card);
                                        return (
                                            <CardComponent
                                                key={card.id}
                                                card={card}
                                                playable={playable}
                                                selected={selectedId === card.id}
                                                onAction={playable ? () => handleAction(card) : undefined}
                                                dealing
                                                dealDelay={(rowIdx * CARDS_PER_ROW + i) * 40}
                                                style={{ marginLeft: i > 0 ? -20 : 0, flexShrink: 0 }}
                                            />
                                        );
                                    })}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Color chooser modal ──────────────────────────────────────

function ColorChooserModal({ title, subtitle, onChoose }: {
    title: string;
    subtitle?: string;
    onChoose: (color: CardColor) => void;
}) {
    return (
        <div>
            <div
            >
                <h3>{title}</h3>
                {subtitle && <p>{subtitle}</p>}
                {!subtitle && <div />}
                <div>
                    {COLOR_OPTIONS.map(({ color, label, hex }) => (
                        <button
                            key={color}
                            onClick={() => onChoose(color)}
                            style={{ background: hex, color: color === 'yellow' ? '#333' : 'white' }}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ── Swap selector modal ──────────────────────────────────────

function SwapSelectorModal({ opponents, onSelect }: {
    opponents: OpponentView[];
    onSelect: (targetId: string) => void;
}) {
    return (
        <div>
            <div>
                <h3>Choose a player to swap hands with</h3>
                <div>
                    {opponents.map(opp => (
                        <div
                            key={opp.id}
                            onClick={() => onSelect(opp.id)}
                        >
                            <span>{opp.name}</span>
                            <span>
                                {opp.cardCount} cards
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ── Game over overlay ────────────────────────────────────────

function GameOverOverlay({ game }: { game: ClientGameState }) {
    const isWinner   = game.winnerId === game.you.id;
    const winnerName = isWinner
        ? 'You'
        : (game.opponents.find(o => o.id === game.winnerId)?.name ?? 'Someone');

    return (
        <div>
            <div>
                <h2>
                    {isWinner ? '🎉 YOU WIN!' : '💀 GAME OVER'}
                </h2>
                <p>
                    {winnerName} {isWinner ? '' : 'wins!'}
                </p>
                <button
                    onClick={() => location.reload()}
                >
                    Play Again
                </button>
            </div>
        </div>
    );
}

// ── Main GameBoard ───────────────────────────────────────────

interface Props {
    socket: Socket;
    state: AppState;
}

const OPPONENT_POSITIONS: Array<'top' | 'left' | 'right'> = ['top', 'left', 'right'];

export default function GameBoard({ socket, state }: Props) {
    const { game, playerId, roomCode } = state;
    if (!game) return null;

    const isMyTurn = game.currentPlayerId === playerId;
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const handlePlay = (card: Card) => {
        socket.emit(C2S.PLAY_CARD, { roomCode: game.roomCode, playerId, cardId: card.id });
        setSelectedId(null);
    };

    const handleDraw = () => {
        socket.emit(C2S.DRAW_CARD, { roomCode: game.roomCode, playerId });
    };

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
        <div
            onClick={() => setSelectedId(null)}
        >
            {/* Opponents */}
            {game.opponents.map((opp, i) => (
                <OpponentArea
                    key={opp.id}
                    opponent={opp}
                    isCurrent={opp.id === game.currentPlayerId}
                    position={OPPONENT_POSITIONS[i] ?? 'top'}
                />
            ))}

            {/* Table center */}
            <TableCenter game={game} isMyTurn={isMyTurn} onDraw={handleDraw} />

            {/* Player hand */}
            <PlayerHand
                game={game}
                isMyTurn={isMyTurn}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onPlay={handlePlay}
            />

            {/* Color chooser */}
            {game.phase === 'choosing_color' && isMyTurn && (
                <ColorChooserModal title="Choose a Color" onChoose={handleChooseColor} />
            )}

            {/* Color roulette */}
            {game.phase === 'color_roulette' && isMyTurn && (
                <ColorChooserModal
                    title="🎰 Color Roulette!"
                    subtitle="Choose a color — you'll draw cards until you find one!"
                    onChoose={handleRouletteColor}
                />
            )}

            {/* Swap selector */}
            {game.phase === 'choosing_swap_target' && isMyTurn && (
                <SwapSelectorModal
                    opponents={game.opponents.filter(o => !o.isEliminated)}
                    onSelect={handleSwapTarget}
                />
            )}

            {/* Game over */}
            {game.phase === 'game_over' && game.winnerId && (
                <GameOverOverlay game={game} />
            )}
        </div>
    );
}
