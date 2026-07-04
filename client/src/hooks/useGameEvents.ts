// ============================================================
// useGameEvents — bridges Socket.IO + state snapshots onto the
// game event bus. Mounted once in App.
// ============================================================

import { useEffect, useRef } from 'react';
import type { Socket } from '../lib/supabase';
import { S2C } from '@shared/events';
import { Card, ClientGameState, GamePhase } from '@shared/types';
import { gameEvents } from '../lib/gameEvents';

export function useGameEvents(
    socket: Socket,
    game: ClientGameState | null,
    playerId: string | null,
): void {
    const playerIdRef = useRef(playerId);
    playerIdRef.current = playerId;

    // game_over can arrive twice (server event + snapshot diff fallback);
    // dedupe per room+winner so subscribers fire once.
    const gameOverKeyRef = useRef<string | null>(null);

    // ── Forward discrete server events ──────────────────────
    useEffect(() => {
        const self = (id: string) => id === playerIdRef.current;

        const onCardPlayed = (d: { playerId: string; card: Card }) =>
            gameEvents.emit('card_played', { byId: d.playerId, card: d.card, isSelf: self(d.playerId) });

        const onCardsDrawn = (d: { playerId: string; count: number }) =>
            gameEvents.emit('cards_drawn', { byId: d.playerId, count: d.count, isSelf: self(d.playerId) });

        const onEliminated = (d: { playerId: string; playerName: string }) =>
            gameEvents.emit('player_eliminated', { ...d, isSelf: self(d.playerId) });

        const onSwapped = (d: { player1: string; player2: string }) =>
            gameEvents.emit('hands_swapped', d);

        const onPassed = () => gameEvents.emit('hands_passed', {});

        const onRoulette = (d: { cards: Card[]; playerId: string }) =>
            gameEvents.emit('roulette_reveal', { ...d, isSelf: self(d.playerId) });

        const onGameOver = (d: { winnerId: string; winnerName: string }) => {
            const key = `${d.winnerId}`;
            if (gameOverKeyRef.current === key) return;
            gameOverKeyRef.current = key;
            gameEvents.emit('game_over', { ...d, isSelf: self(d.winnerId) });
        };

        const onError = (d: { message: string }) =>
            gameEvents.emit('play_rejected', { message: d.message });

        socket.on(S2C.CARD_PLAYED, onCardPlayed);
        socket.on(S2C.CARDS_DRAWN, onCardsDrawn);
        socket.on(S2C.PLAYER_ELIMINATED, onEliminated);
        socket.on(S2C.HANDS_SWAPPED, onSwapped);
        socket.on(S2C.HANDS_PASSED, onPassed);
        socket.on(S2C.COLOR_ROULETTE_REVEAL, onRoulette);
        socket.on(S2C.GAME_OVER, onGameOver);
        socket.on(S2C.ERROR, onError);

        return () => {
            socket.off(S2C.CARD_PLAYED, onCardPlayed);
            socket.off(S2C.CARDS_DRAWN, onCardsDrawn);
            socket.off(S2C.PLAYER_ELIMINATED, onEliminated);
            socket.off(S2C.HANDS_SWAPPED, onSwapped);
            socket.off(S2C.HANDS_PASSED, onPassed);
            socket.off(S2C.COLOR_ROULETTE_REVEAL, onRoulette);
            socket.off(S2C.GAME_OVER, onGameOver);
            socket.off(S2C.ERROR, onError);
        };
    }, [socket]);

    // ── Derive events the server doesn't send by diffing snapshots ──
    const prevGameRef = useRef<ClientGameState | null>(null);

    useEffect(() => {
        const prev = prevGameRef.current;
        if (game === prev) return; // StrictMode double-invoke guard
        prevGameRef.current = game;
        if (!prev || !game) return;
        if (prev.roomCode !== game.roomCode) return; // new game, nothing to diff

        if (prev.currentPlayerId !== game.currentPlayerId && game.currentPlayerId) {
            gameEvents.emit('turn_changed', {
                playerId: game.currentPlayerId,
                isSelf: game.currentPlayerId === playerIdRef.current,
            });
        }
        if (prev.drawStack !== game.drawStack) {
            gameEvents.emit('stack_changed', { from: prev.drawStack, to: game.drawStack });
        }
        if (prev.direction !== game.direction) {
            gameEvents.emit('direction_changed', { direction: game.direction });
        }
        // Fallback for game over (covers reconnects / missed events)
        if (prev.phase !== GamePhase.GameOver && game.phase === GamePhase.GameOver && game.winnerId) {
            const key = `${game.winnerId}`;
            if (gameOverKeyRef.current !== key) {
                gameOverKeyRef.current = key;
                const winner = game.winnerId === game.you.id
                    ? game.you.name
                    : game.opponents.find(o => o.id === game.winnerId)?.name ?? 'Someone';
                gameEvents.emit('game_over', {
                    winnerId: game.winnerId,
                    winnerName: winner,
                    isSelf: game.winnerId === playerIdRef.current,
                });
            }
        }
    }, [game]);
}
