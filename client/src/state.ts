// ============================================================
// Client State Management
// ============================================================

import { ClientGameState, LobbyState } from '../../shared/types';

export type Screen = 'lobby' | 'waiting' | 'game';

export interface AppState {
    screen: Screen;
    playerId: string | null;
    playerName: string | null;
    roomCode: string | null;
    lobby: LobbyState | null;
    game: ClientGameState | null;
}

const state: AppState = {
    screen: 'lobby',
    playerId: null,
    playerName: null,
    roomCode: null,
    lobby: null,
    game: null,
};

type Listener = (state: AppState) => void;
const listeners: Listener[] = [];

export function getState(): AppState {
    return state;
}

export function setState(partial: Partial<AppState>): void {
    Object.assign(state, partial);
    listeners.forEach((fn) => fn(state));
}

export function subscribe(fn: Listener): () => void {
    listeners.push(fn);
    return () => {
        const idx = listeners.indexOf(fn);
        if (idx >= 0) listeners.splice(idx, 1);
    };
}
