// ============================================================
// Game Board
// ============================================================

import { useState, useEffect, useRef } from 'react';
import { motion, LayoutGroup } from 'framer-motion';
import { Socket } from 'socket.io-client';
import { C2S } from '@shared/events';
import { Card, CardColor, ClientGameState, OpponentView } from '@shared/types';
import { AppState } from '../App';
import { CardComponent, CardBack } from './Card';
import { VALUE_DISPLAY, clientCanPlay } from '../utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

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

function OpponentArea({ opponent, isActive }: {
    opponent: OpponentView;
    isActive: boolean;
}) {
    return (
        <div className={`flex flex-col items-center gap-1 rounded-xl px-4 py-2 transition-all duration-300 ${
            isActive 
                ? 'bg-blue-900/60 border-2 border-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.5)] transform scale-110 z-10' 
                : 'bg-zinc-800/80 border-2 border-zinc-700 opacity-60'
        }`}>
            <span className={`text-sm font-bold tracking-wide ${isActive ? 'text-white' : 'text-zinc-300'}`}>
                {opponent.name} {isActive && '🔥'}
            </span>
            <span className={`text-xs ${isActive ? 'text-blue-200 font-bold' : 'text-zinc-500 font-semibold'}`}>
                {opponent.cardCount} cards
            </span>
            {isActive && (
                <span className="text-[10px] font-black uppercase tracking-widest text-blue-300 animate-pulse mt-1">
                    Their Turn
                </span>
            )}
        </div>
    );
}

// ── Table center ─────────────────────────────────────────────

function TableCenter({ game, isMyTurn, onDraw, optimisticPlayedCard }: {
    game: ClientGameState;
    isMyTurn: boolean;
    onDraw: () => void;
    optimisticPlayedCard: Card | null;
}) {
    const topCard  = optimisticPlayedCard || game.topCard;
    const display  = VALUE_DISPLAY[topCard.value] ?? topCard.value;
const canDraw  = isMyTurn && game.phase === 'playing';
    const dotColor = game.chosenColor && game.chosenColor !== 'wild' ? (COLOR_HEX[game.chosenColor] ?? null) : null;

    return (
        <div className="flex items-center justify-center gap-10">
            {/* Discard pile */}
            <div id="discard-pile" className="flex flex-col items-center gap-2">
                {game.drawStack > 0 && (
                    <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
                        +{game.drawStack} STACKED!
                    </span>
                )}
                <motion.div layoutId={topCard.id} className={`rc-card color-${topCard.color}`}>
                    <span>{display}</span>
                    <span>{display}</span>
                    <span>{display}</span>
                </motion.div>
                {dotColor && (
                    <div
                        className="size-4 rounded-full"
                        style={{ background: dotColor, boxShadow: `0 0 10px ${dotColor}` }}
                    />
                )}
                <span className="text-xs text-zinc-500">Discard</span>
            </div>

            {/* Draw pile */}
            <div className="flex flex-col items-center gap-2">
                <CardBack
                    onClick={canDraw ? onDraw : undefined}
                    disabled={!canDraw}
                    style={{ width: 70, height: 100 }}
                />
                <span className="text-xs text-zinc-500">{game.drawPileCount} cards</span>
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
    const handContainerRef = useRef<HTMLDivElement>(null);

    const isPlayable = (card: Card) =>
        isMyTurn && game.phase === 'playing' && clientCanPlay(card, game.topCard, game.chosenColor, game.drawStack);

    const handleAction = (card: Card) => {
        onPlay(card);
    };

    return (
        <div className="flex flex-col items-center gap-3 pb-4 w-full max-w-full">
            {/* Player badge */}
            <div className={`flex items-center gap-3 rounded-xl px-6 py-2 transition-all duration-300 mb-2 ${
                isMyTurn 
                    ? 'bg-blue-900 border-2 border-blue-400 shadow-[0_0_30px_rgba(59,130,246,0.6)] transform scale-110 z-10' 
                    : 'bg-zinc-800 border-2 border-zinc-700 opacity-80'
            }`}>
                <span className={`text-lg font-black tracking-wider uppercase ${isMyTurn ? 'text-white' : 'text-zinc-300'}`}>
                    {you.name} (You)
                </span>
                <span className={`text-sm font-bold ${isMyTurn ? 'text-blue-200' : 'text-zinc-400'}`}>
                    {you.hand.length} cards
                </span>
                {isMyTurn && (
                    <span className="ml-2 text-xs font-black uppercase text-blue-300 animate-pulse bg-blue-950 px-2 py-1 rounded">
                        🔥 YOUR TURN
                    </span>
                )}
            </div>

            {/* Card row */}
            <div 
                ref={handContainerRef}
                className="w-full pb-6 pt-4 overflow-x-auto transition-none"
                style={{ minHeight: 140 }}
            >
                <div className="flex flex-row shrink-0 min-w-full w-max justify-center px-4">
                    {you.hand
                        .filter(c => c.id !== optimisticPlayedCard?.id)
                        .map((card, idx) => {
                        const playable = isPlayable(card);
                        return (
                            <CardComponent
                                key={card.id}
                                card={card}
                                playable={playable}
                                onAction={playable ? () => handleAction(card) : undefined}
                                dealing
                                dealDelay={idx * 40}
                                style={{ marginLeft: idx > 0 ? -20 : 0 }}
                                draggable={true}
                                onDragStart={() => {
                                    if (handContainerRef.current) {
                                        handContainerRef.current.classList.remove('overflow-x-auto');
                                        handContainerRef.current.classList.add('overflow-visible');
                                    }
                                }}
                                onDragEnd={() => {
                                    if (handContainerRef.current) {
                                        handContainerRef.current.classList.remove('overflow-visible');
                                        handContainerRef.current.classList.add('overflow-x-auto');
                                    }
                                }}
                                onPlayDrop={playable ? () => onPlay(card) : undefined}
                            />
                        );
                    })}
                </div>
            </div>
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
        <Dialog open>
            <DialogContent showCloseButton={false} className="bg-zinc-800 border-zinc-700">
                <DialogHeader>
                    <DialogTitle className="text-white">{title}</DialogTitle>
                    {subtitle && <DialogDescription className="text-zinc-400">{subtitle}</DialogDescription>}
                </DialogHeader>
                <div className="grid grid-cols-2 gap-2">
                    {COLOR_OPTIONS.map(({ color, label, hex }) => (
                        <button
                            key={color}
                            onClick={() => onChoose(color)}
                            className="rounded-lg px-4 py-3 font-semibold transition-opacity hover:opacity-80"
                            style={{ background: hex, color: color === 'yellow' ? '#333' : 'white' }}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    );
}

// ── Swap selector modal ──────────────────────────────────────

function SwapSelectorModal({ opponents, onSelect }: {
    opponents: OpponentView[];
    onSelect: (targetId: string) => void;
}) {
    return (
        <Dialog open>
            <DialogContent showCloseButton={false} className="bg-zinc-800 border-zinc-700">
                <DialogHeader>
                    <DialogTitle className="text-white">Choose a player to swap hands with</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-2">
                    {opponents.map(opp => (
                        <button
                            key={opp.id}
                            onClick={() => onSelect(opp.id)}
                            className="flex items-center justify-between rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-200 hover:bg-zinc-700 hover:text-white transition-colors"
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
        <Dialog open>
            <DialogContent showCloseButton={false} className="bg-zinc-800 border-zinc-700">
                <DialogHeader>
                    <DialogTitle className="text-center text-xl text-white">
                        {isWinner ? '🎉 YOU WIN!' : '💀 GAME OVER'}
                    </DialogTitle>
                    <DialogDescription className="text-center text-zinc-400">
                        {winnerName} {isWinner ? 'wins!' : 'wins!'}
                    </DialogDescription>
                </DialogHeader>
                <Button className="w-full bg-blue-600 hover:bg-blue-500 text-white border-transparent" onClick={() => location.reload()}>
                    Play Again
                </Button>
            </DialogContent>
        </Dialog>
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

    const handlePlay = (card: Card) => {
        socket.emit(C2S.PLAY_CARD, { roomCode: game.roomCode, playerId, cardId: card.id });
        setOptimisticPlayedCard(card);
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
        <LayoutGroup>
            <div
                className="flex flex-col h-screen bg-zinc-900"
            >
                {/* Opponents */}
                <div className="flex justify-center gap-6 p-4">
                    {game.opponents.map((opp) => (
                        <OpponentArea
                            key={opp.id}
                            opponent={opp}
                            isActive={game.currentPlayerId === opp.id}
                        />
                    ))}
                </div>

                {/* Table center */}
                <div className="flex flex-1 items-center justify-center">
                    <TableCenter game={game} isMyTurn={isMyTurn} onDraw={handleDraw} optimisticPlayedCard={optimisticPlayedCard} />
                </div>

                {/* Player hand */}
                <PlayerHand
                    game={game}
                    isMyTurn={isMyTurn}
                    onPlay={handlePlay}
                    optimisticPlayedCard={optimisticPlayedCard}
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
        </LayoutGroup>
    );
}
