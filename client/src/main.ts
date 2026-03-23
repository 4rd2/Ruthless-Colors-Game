// ============================================================
// Main Entry Point
// ============================================================

import './styles/index.css';
import './styles/lobby.css';
import { io, Socket } from 'socket.io-client';
import { C2S } from '../../shared/events';
import { getState, subscribe } from './state';
import { renderLobby, renderWaitingRoom, setupLobbyListeners } from './lobby';
import { renderGame, setupGameListeners } from './game';

// ─── Socket Connection ──────────────────────────────────────

const socket: Socket = io({
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
});

// ─── App Mount ──────────────────────────────────────────────

const app = document.getElementById('app')!;

function render(): void {
    const state = getState();
    switch (state.screen) {
        case 'lobby':
            renderLobby(app, socket);
            break;
        case 'waiting':
            renderWaitingRoom(app, socket);
            break;
        case 'game':
            renderGame(app, socket);
            break;
    }
}

// ─── Setup ──────────────────────────────────────────────────

setupLobbyListeners(socket);
setupGameListeners(socket);

// Re-render on state change
subscribe(() => render());

// Initial render
render();

// ─── Connection status ─────────────────────────────────────

socket.on('connect', () => {
    console.log('Connected to server');

    // If we were in a game, try to reconnect
    const state = getState();
    if (state.roomCode && state.playerId && state.screen === 'game') {
        socket.emit(C2S.RECONNECT, {
            roomCode: state.roomCode,
            playerId: state.playerId,
        }, (res: any) => {
            if (res.error) {
                console.warn('Reconnect failed:', res.error);
            }
        });
    }
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
});
