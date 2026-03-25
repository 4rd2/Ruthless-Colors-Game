// ============================================================
// Game Board UI
// ============================================================

import './styles/game.css';
import { Socket } from 'socket.io-client';
import { C2S, S2C } from '../../shared/events';
import {
    CardColor,
    ClientGameState,
    GamePhase,
    Direction,
    Card,
} from '../../shared/types';
import { getState, setState } from './state';
import { createCardElement, createCardBackElement } from './card';
import { showToast } from './lobby';

// We need a client-side validation helper
function clientCanPlay(card: Card, topCard: Card, chosenColor: CardColor | null, drawStack: number): boolean {
    // Inline simplified validation matching server rules
    const DRAW_VALUES: Record<string, number> = {
        draw2: 2,
        wild_draw4: 4,
        wild_reverse_draw4: 4,
        wild_draw6: 6,
        wild_draw10: 10,
    };

    if (drawStack > 0) {
        // Parry can always be played when there's an active draw stack
        if (card.value === 'wild_parry') return true;
        if (!(card.value in DRAW_VALUES)) return false;
        return (DRAW_VALUES[card.value] ?? 0) >= (DRAW_VALUES[topCard.value] ?? 0);
    }
    if (card.color === 'wild') return true;
    const activeColor = chosenColor ?? topCard.color;
    if (card.color === activeColor) return true;
    if (card.value === topCard.value && topCard.color !== 'wild') return true;
    return false;
}

export function renderGame(container: HTMLElement, socket: Socket): void {
    const state = getState();
    const game = state.game;
    if (!game) return;

    const isMyTurn = game.currentPlayerId === state.playerId;

    container.innerHTML = `
    <div class="game-screen">
      ${renderOpponents(game)}
      ${renderTableCenter(game, isMyTurn)}
      ${renderPlayerHand(game, isMyTurn)}
      ${renderModals(game, isMyTurn)}
      ${renderGameOver(game)}
    </div>
  `;

    // Attach event listeners
    attachHandListeners(container, socket, game, isMyTurn);
    attachDrawPileListener(container, socket, game, isMyTurn);
    attachModalListeners(container, socket, game);
}

function renderOpponents(game: ClientGameState): string {
    const positions = ['top', 'left', 'right'];
    return game.opponents.map((opp, i) => {
        const pos = positions[i] || 'top';
        const isCurrent = opp.id === game.currentPlayerId;
        const cardCountClass = opp.cardCount >= 20 ? 'danger' : '';

        const miniCards = Array.from(
            { length: Math.min(opp.cardCount, 15) },
            () => `<div class="rc-card card-back" style="width:36px;height:52px;font-size:0.5rem;margin-left:-12px;border-width:1px;"><div class="card-inner" style="inset:4px;border-radius:8px;transform:none;background:repeating-linear-gradient(45deg,rgba(124,77,255,0.08),rgba(124,77,255,0.08) 4px,transparent 4px,transparent 8px);"></div></div>`,
        ).join('');

        return `
      <div class="player-area ${pos}">
        <div class="player-info ${isCurrent ? 'current-turn' : ''} ${opp.isEliminated ? 'eliminated' : ''}">
          <span class="player-name">${opp.name}</span>
          <span class="card-count ${cardCountClass}">${opp.cardCount} cards</span>
        </div>
        <div class="opponent-hand">${miniCards}</div>
      </div>
    `;
    }).join('');
}

function renderTableCenter(game: ClientGameState, isMyTurn: boolean): string {
    const topCard = game.topCard;
    const colorClass = `color-${topCard.color}`;

    const VALUE_DISPLAY: Record<string, string> = {
        '0': '0', '1': '1', '2': '2', '3': '3', '4': '4',
        '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
        skip: '⊘', reverse: '⇄', draw2: '+2', discard_all: '✕ALL',
        skip_everyone: '⊘ALL', wild_draw4: '+4', wild_draw6: '+6',
        wild_draw10: '+10', wild_color_roulette: '🎰', wild_reverse_draw4: '⇄+4',
        wild_parry: '🛡️',
    };
    const display = VALUE_DISPLAY[topCard.value] || topCard.value;
    const isSmall = ['discard_all', 'skip_everyone', 'wild_color_roulette', 'wild_reverse_draw4', 'wild_parry'].includes(topCard.value);

    let drawStackHtml = '';
    if (game.drawStack > 0) {
        drawStackHtml = `<div class="draw-stack-indicator">+${game.drawStack} STACKED!</div>`;
    }

    let colorIndicator = '';
    if (game.chosenColor && game.chosenColor !== 'wild') {
        colorIndicator = `<div class="color-indicator ci-${game.chosenColor}"></div>`;
    }

    return `
    <div class="table-center">
      <div class="discard-pile">
        ${drawStackHtml}
        <div class="rc-card ${colorClass}" style="cursor:default;">
          <div class="card-inner"></div>
          <span class="card-corner top-left">${display}</span>
          <span class="card-value${isSmall ? ' small-text' : ''}">${display}</span>
          <span class="card-corner bottom-right">${display}</span>
        </div>
        ${colorIndicator}
      </div>
      <div class="draw-pile">
        <div class="rc-card card-back draw-pile-card ${!isMyTurn || game.phase !== 'playing' ? 'disabled' : ''}" id="draw-pile" style="cursor:${isMyTurn && game.phase === 'playing' ? 'pointer' : 'default'};">
          <div class="card-inner" style="inset:8px;border-radius:8px;transform:none;background:repeating-linear-gradient(45deg,rgba(124,77,255,0.08),rgba(124,77,255,0.08) 4px,transparent 4px,transparent 8px);"></div>
          <span class="card-value" style="font-size:1.1rem;font-weight:900;background:linear-gradient(135deg,#e53935,#fdd835,#43a047,#1e88e5);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">RC</span>
        </div>
        <span class="draw-pile-count">${game.drawPileCount} cards</span>
      </div>
    </div>
  `;
}

function renderPlayerHand(game: ClientGameState, isMyTurn: boolean): string {
    const you = game.you;
    const isCurrent = game.currentPlayerId === you.id;
    const cardCountClass = you.hand.length >= 20 ? 'danger' : '';

    return `
    <div class="player-area bottom">
      <div class="player-info ${isCurrent ? 'current-turn' : ''} ${you.isEliminated ? 'eliminated' : ''}">
        <span class="player-name">${you.name} (You)</span>
        <span class="card-count ${cardCountClass}">${you.hand.length} cards</span>
      </div>
      <div class="player-hand" id="player-hand"></div>
    </div>
  `;
}

function renderModals(game: ClientGameState, isMyTurn: boolean): string {
    // Color chooser
    if (game.phase === 'choosing_color' && isMyTurn) {
        return `
      <div class="modal-overlay" id="color-modal">
        <div class="color-chooser glass-panel">
          <h3>Choose a Color</h3>
          <div class="color-options">
            <button class="color-option co-red" data-color="red">Red</button>
            <button class="color-option co-blue" data-color="blue">Blue</button>
            <button class="color-option co-green" data-color="green">Green</button>
            <button class="color-option co-yellow" data-color="yellow">Yellow</button>
          </div>
        </div>
      </div>
    `;
    }

    // Color roulette — affected player chooses which color they're hunting for
    if (game.phase === 'color_roulette' && isMyTurn) {
        return `
      <div class="modal-overlay" id="roulette-modal">
        <div class="color-chooser glass-panel">
          <h3>🎰 Color Roulette!</h3>
          <p style="color: var(--text-secondary); margin-bottom: 16px;">Choose a color — you'll draw cards until you find one!</p>
          <div class="color-options">
            <button class="color-option co-red" data-roulette-color="red">Red</button>
            <button class="color-option co-blue" data-roulette-color="blue">Blue</button>
            <button class="color-option co-green" data-roulette-color="green">Green</button>
            <button class="color-option co-yellow" data-roulette-color="yellow">Yellow</button>
          </div>
        </div>
      </div>
    `;
    }

    // Swap target selector (7 card)
    if (game.phase === 'choosing_swap_target' && isMyTurn) {
        const targets = game.opponents.filter((o) => !o.isEliminated);
        return `
      <div class="modal-overlay" id="swap-modal">
        <div class="swap-selector glass-panel">
          <h3>Choose a player to swap hands with</h3>
          <div class="swap-options">
            ${targets.map((t) => `
              <div class="swap-option glass-panel" data-swap-target="${t.id}" style="cursor:pointer;">
                <span>${t.name}</span>
                <span class="card-count">${t.cardCount} cards</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
    }

    return '';
}

function renderGameOver(game: ClientGameState): string {
    if (game.phase !== 'game_over' || !game.winnerId) return '';

    const isWinner = game.winnerId === game.you.id;
    const winnerName = isWinner
        ? 'You'
        : game.opponents.find((o) => o.id === game.winnerId)?.name ?? 'Someone';

    return `
    <div class="game-over-overlay">
      <div class="game-over-panel glass-panel">
        <h2>${isWinner ? '🎉 YOU WIN!' : '💀 GAME OVER'}</h2>
        <p class="winner-name">${winnerName} ${isWinner ? '' : 'wins!'}</p>
        <button class="btn btn-primary" onclick="location.reload()">Play Again</button>
      </div>
    </div>
  `;
}

// ─── Event Listeners ────────────────────────────────────────

function attachHandListeners(container: HTMLElement, socket: Socket, game: ClientGameState, isMyTurn: boolean): void {
    const handEl = container.querySelector('#player-hand');
    if (!handEl) return;

    game.you.hand.forEach((card, idx) => {
        const playable = isMyTurn
            && game.phase === 'playing'
            && clientCanPlay(card, game.topCard, game.chosenColor, game.drawStack);

        const el = createCardElement(card, {
            playable,
            onClick: playable
                ? (c) => {
                    // For wild cards, don't send color yet — server will ask
                    socket.emit(C2S.PLAY_CARD, {
                        roomCode: game.roomCode,
                        playerId: getState().playerId,
                        cardId: c.id,
                    });
                }
                : undefined,
            dealing: true,
            dealDelay: idx * 40,
        });
        handEl.appendChild(el);
    });
}

function attachDrawPileListener(container: HTMLElement, socket: Socket, game: ClientGameState, isMyTurn: boolean): void {
    const drawPile = container.querySelector('#draw-pile');
    if (!drawPile || !isMyTurn || game.phase !== 'playing') return;

    drawPile.addEventListener('click', () => {
        socket.emit(C2S.DRAW_CARD, {
            roomCode: game.roomCode,
            playerId: getState().playerId,
        });
    });
}

function attachModalListeners(container: HTMLElement, socket: Socket, game: ClientGameState): void {
    const state = getState();

    // Color chooser
    container.querySelectorAll('[data-color]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const color = (btn as HTMLElement).dataset.color as CardColor;
            socket.emit(C2S.CHOOSE_COLOR, {
                roomCode: game.roomCode,
                playerId: state.playerId,
                color,
            });
        });
    });

    // Roulette color choice
    container.querySelectorAll('[data-roulette-color]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const color = (btn as HTMLElement).dataset.rouletteColor as CardColor;
            socket.emit(C2S.COLOR_ROULETTE_CHOICE, {
                roomCode: game.roomCode,
                playerId: state.playerId,
                color,
            });
        });
    });

    // Swap target
    container.querySelectorAll('[data-swap-target]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const targetId = (btn as HTMLElement).dataset.swapTarget!;
            socket.emit(C2S.CHOOSE_SWAP_TARGET, {
                roomCode: game.roomCode,
                playerId: state.playerId,
                targetPlayerId: targetId,
            });
        });
    });
}

// ─── Game Socket Listeners ─────────────────────────────────

export function setupGameListeners(socket: Socket): void {
    socket.on(S2C.GAME_STATE, (gameState: ClientGameState) => {
        setState({ game: gameState });
    });

    socket.on(S2C.PLAYER_ELIMINATED, (data: { playerId: string; playerName: string }) => {
        const state = getState();
        if (data.playerId === state.playerId) {
            showToast('💀 You have been eliminated! (25+ cards)', 'error');
        } else {
            showToast(`💀 ${data.playerName} has been eliminated!`, 'warning');
        }
    });

    socket.on(S2C.HANDS_PASSED, () => {
        showToast('🔄 All hands have been passed!', 'info');
    });

    socket.on(S2C.HANDS_SWAPPED, (data: { player1: string; player2: string }) => {
        showToast('🔀 Hands have been swapped!', 'info');
    });

    socket.on(S2C.COLOR_ROULETTE_REVEAL, (data: { cards: any[]; playerId: string }) => {
        const state = getState();
        const name = data.playerId === state.playerId ? 'You' : 'A player';
        showToast(`🎰 ${name} drew ${data.cards.length} cards from Color Roulette!`, 'warning');
    });

    socket.on(S2C.PLAYER_DISCONNECTED, (data: { playerId: string; playerName: string }) => {
        showToast(`⚡ ${data.playerName} disconnected`, 'warning');
    });

    socket.on(S2C.PLAYER_RECONNECTED, (data: { playerId: string }) => {
        showToast('✅ Player reconnected', 'success');
    });

    socket.on(S2C.ERROR, (data: { message: string }) => {
        showToast(data.message, 'error');
    });
}
