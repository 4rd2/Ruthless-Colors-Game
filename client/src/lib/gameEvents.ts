// ============================================================
// Game Event Bus — typed pub/sub for "what just happened"
//
// Socket.IO delivers full state snapshots; sound and animation
// need discrete events. useGameEvents forwards server events and
// diffs snapshots onto this bus; effects/sound hooks subscribe.
// ============================================================

import { Card, Direction } from '@shared/types';

export interface GameEventMap {
    card_played: { byId: string; card: Card; isSelf: boolean };
    cards_drawn: { byId: string; count: number; isSelf: boolean };
    turn_changed: { playerId: string; isSelf: boolean };
    stack_changed: { from: number; to: number };
    direction_changed: { direction: Direction };
    player_eliminated: { playerId: string; playerName: string; isSelf: boolean };
    hands_swapped: { player1: string; player2: string };
    hands_passed: Record<string, never>;
    roulette_reveal: { cards: Card[]; playerId: string; isSelf: boolean };
    game_over: { winnerId: string; winnerName: string; isSelf: boolean };
    play_rejected: { message: string };
}

export type GameEventName = keyof GameEventMap;

type Handler<K extends GameEventName> = (payload: GameEventMap[K]) => void;

// Internally untyped; the public API below enforces payload types.
type AnyHandler = (payload: unknown) => void;
const handlers = new Map<GameEventName, Set<AnyHandler>>();

export const gameEvents = {
    on<K extends GameEventName>(name: K, fn: Handler<K>): () => void {
        let set = handlers.get(name);
        if (!set) {
            set = new Set();
            handlers.set(name, set);
        }
        set.add(fn as AnyHandler);
        return () => set.delete(fn as AnyHandler);
    },

    off<K extends GameEventName>(name: K, fn: Handler<K>): void {
        handlers.get(name)?.delete(fn as AnyHandler);
    },

    emit<K extends GameEventName>(name: K, payload: GameEventMap[K]): void {
        const set = handlers.get(name);
        if (!set) return;
        for (const fn of [...set]) {
            try {
                fn(payload);
            } catch (err) {
                console.error(`[gameEvents] handler for "${name}" threw`, err);
            }
        }
    },
};
