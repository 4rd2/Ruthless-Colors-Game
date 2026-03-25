// ============================================================
// Lobby UI
// ============================================================

import './styles/lobby.css';
import { Socket } from 'socket.io-client';
import { C2S, S2C } from '../../shared/events';
import { LobbyState } from '../../shared/types';
import { getState, setState } from './state';

export function renderLobby(container: HTMLElement, socket: Socket): void {
    const urlParams = new URLSearchParams(window.location.search);
    const roomFromUrl = urlParams.get('room');
    
    container.innerHTML = `
    <div class="lobby-screen">
      <div class="lobby-container glass-panel">
        <div class="lobby-title">
          <h1>RUTHLESS COLORS</h1>
          <p>Brutal. Stackable. No mercy given.</p>
        </div>

        <div class="lobby-form" id="lobby-join-form">
          <input class="input" id="player-name" type="text" placeholder="Your name" maxlength="16" autocomplete="off" />
          <button class="btn btn-primary" id="create-room-btn">Create Game</button>
          <div class="lobby-divider"><span>or join a game</span></div>
          <input class="input" id="room-code-input" type="text" placeholder="Enter room code" maxlength="6" autocomplete="off" style="text-transform: uppercase; letter-spacing: 4px; text-align: center;" value="${roomFromUrl || ''}" />
          <button class="btn btn-secondary" id="join-room-btn">Join Game</button>
          <div class="lobby-divider"><span>or rejoin a game</span></div>
          <button class="btn btn-secondary" id="rejoin-btn" style="border-color: var(--success); color: var(--success);">🔄 Rejoin Game</button>
          <div id="lobby-error" class="lobby-error" style="display:none;"></div>
        </div>
      </div>
    </div>
  `;

    const nameInput = container.querySelector('#player-name') as HTMLInputElement;
    const codeInput = container.querySelector('#room-code-input') as HTMLInputElement;
    const createBtn = container.querySelector('#create-room-btn') as HTMLButtonElement;
    const joinBtn = container.querySelector('#join-room-btn') as HTMLButtonElement;
    const rejoinBtn = container.querySelector('#rejoin-btn') as HTMLButtonElement;
    const errorDiv = container.querySelector('#lobby-error') as HTMLElement;

    // Focus name input automatically
    setTimeout(() => nameInput.focus(), 100);

    function showError(msg: string): void {
        errorDiv.textContent = msg;
        errorDiv.style.display = 'block';
        setTimeout(() => { errorDiv.style.display = 'none'; }, 4000);
    }

    createBtn.addEventListener('click', () => {
        const name = nameInput.value.trim();
        if (!name) { showError('Please enter your name'); return; }

        socket.emit(C2S.CREATE_ROOM, { playerName: name }, (res: any) => {
            if (res.error) { showError(res.error); return; }
            // Update URL to include the room code without reloading
            const url = new URL(window.location.href);
            url.searchParams.set('room', res.roomCode);
            window.history.pushState({}, '', url.toString());

            setState({
                playerId: res.playerId,
                playerName: name,
                roomCode: res.roomCode,
                lobby: res.lobby,
                screen: 'waiting',
            });
        });
    });

    joinBtn.addEventListener('click', () => {
        const name = nameInput.value.trim();
        const code = codeInput.value.trim().toUpperCase();
        if (!name) { showError('Please enter your name'); return; }
        if (!code) { showError('Please enter a room code'); return; }

        socket.emit(C2S.JOIN_ROOM, { roomCode: code, playerName: name }, (res: any) => {
            if (res.error) { showError(res.error); return; }
            // Update URL to include the room code without reloading
            const url = new URL(window.location.href);
            url.searchParams.set('room', res.roomCode);
            window.history.pushState({}, '', url.toString());

            setState({
                playerId: res.playerId,
                playerName: name,
                roomCode: res.roomCode,
                lobby: res.lobby,
                screen: 'waiting',
            });
        });
    });

    rejoinBtn.addEventListener('click', () => {
        const name = nameInput.value.trim();
        const code = codeInput.value.trim().toUpperCase();
        if (!name) { showError('Please enter your name to rejoin'); return; }
        if (!code) { showError('Please enter the room code to rejoin'); return; }

        socket.emit(C2S.REJOIN_BY_NAME, { roomCode: code, playerName: name }, (res: any) => {
            if (res.error) { showError(res.error); return; }
            // Update URL to include the room code without reloading
            const url = new URL(window.location.href);
            url.searchParams.set('room', res.roomCode);
            window.history.pushState({}, '', url.toString());

            setState({
                playerId: res.playerId,
                playerName: name,
                roomCode: res.roomCode,
                lobby: res.lobby,
                screen: res.gameInProgress ? 'game' : 'waiting',
            });
        });
    });

    // Allow Enter key on inputs
    nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            if (roomFromUrl) joinBtn.click();
            else createBtn.click();
        }
    });
    codeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') joinBtn.click();
    });
}

export function renderWaitingRoom(container: HTMLElement, socket: Socket): void {
    const state = getState();
    const lobby = state.lobby!;
    const isHost = lobby.players.find((p) => p.id === state.playerId)?.isHost ?? false;

    container.innerHTML = `
    <div class="lobby-screen">
      <div class="waiting-room glass-panel">
        <h2>🃏 Waiting for Players</h2>
        <p style="color: var(--text-secondary);">Share this code with your friends:</p>

        <div class="room-code-display" style="display: flex; gap: 8px; justify-content: center; align-items: stretch; margin-top: 10px;">
          <span class="code" id="room-code-text" style="flex: 1; text-align: center;">${lobby.roomCode}</span>
          <div style="display: flex; flex-direction: column; gap: 4px;">
              <button class="btn btn-secondary" id="copy-code-btn" title="Copy code" style="padding: 0 12px; height: 100%; border-radius: var(--radius-sm); font-size: 0.8rem;">Copy Code</button>
              <button class="btn btn-primary" id="copy-link-btn" title="Copy invite link" style="padding: 0 12px; height: 100%; border-radius: var(--radius-sm); font-size: 0.8rem; background: var(--success); border-color: var(--success);">Copy Link</button>
          </div>
        </div>

        <ul class="player-list" id="player-list" style="margin-top: 24px;">
          ${lobby.players.map((p) => `
            <li>
              <span class="player-dot"></span>
              <span>${p.name}</span>
              ${p.isHost ? '<span class="host-badge">Host</span>' : ''}
            </li>
          `).join('')}
        </ul>

        <p style="color: var(--text-muted); font-size: 0.85rem; text-align: center;">
          ${lobby.players.length} / ${lobby.maxPlayers} players
        </p>

        <div class="waiting-actions">
          ${isHost ? `<button class="btn btn-primary" id="start-game-btn" ${lobby.players.length < 2 ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>Start Game</button>` : '<p style="color: var(--text-secondary); text-align: center;">Waiting for host to start...</p>'}
        </div>
      </div>
    </div>
  `;

    // Copy room code
    const copyCodeBtn = container.querySelector('#copy-code-btn');
    copyCodeBtn?.addEventListener('click', () => {
        navigator.clipboard.writeText(lobby.roomCode);
        (copyCodeBtn as HTMLElement).textContent = 'Copied!';
        setTimeout(() => { (copyCodeBtn as HTMLElement).textContent = 'Copy Code'; }, 2000);
    });

    // Copy invite link
    const copyLinkBtn = container.querySelector('#copy-link-btn');
    copyLinkBtn?.addEventListener('click', () => {
        const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${lobby.roomCode}`;
        navigator.clipboard.writeText(inviteUrl);
        (copyLinkBtn as HTMLElement).textContent = 'Copied Link!';
        setTimeout(() => { (copyLinkBtn as HTMLElement).textContent = 'Copy Link'; }, 2000);
    });

    // Start game
    const startBtn = container.querySelector('#start-game-btn');
    startBtn?.addEventListener('click', () => {
        socket.emit(C2S.START_GAME, {
            roomCode: state.roomCode,
            playerId: state.playerId,
        }, (res: any) => {
            if (res.error) {
                showToast(res.error, 'error');
            }
        });
    });
}

// --- Lobby Socket Listeners ---

export function setupLobbyListeners(socket: Socket): void {
    socket.on(S2C.LOBBY_UPDATE, (lobby: LobbyState) => {
        setState({ lobby });
    });

    socket.on(S2C.GAME_STARTED, () => {
        setState({ screen: 'game' });
    });
}

// --- Toast helper ---

export function showToast(message: string, type: 'info' | 'warning' | 'error' | 'success' = 'info'): void {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => toast.remove(), 3000);
}
