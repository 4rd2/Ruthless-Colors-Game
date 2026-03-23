// ============================================================
// Game — state machine, turn logic, state sanitization
// ============================================================

import { v4 as uuid } from 'uuid';
import {
    Card,
    CardColor,
    CardValue,
    Player,
    GameState,
    GamePhase,
    Direction,
    ClientGameState,
    OpponentView,
} from '../../shared/types';
import { INITIAL_HAND_SIZE } from '../../shared/constants';
import { buildDeck, shuffle, drawCards } from './deck';
import {
    canPlayCard,
    resolveCardEffect,
    passAllHands,
    swapHands,
    checkMercyRule,
    checkWinCondition,
    getPlayableCards,
    getNextPlayerIndex,
    performColorRoulette,
} from './rules';

// ─── Game Instances ─────────────────────────────────────────

const games = new Map<string, GameState>();

export function getGame(roomCode: string): GameState | undefined {
    return games.get(roomCode);
}

export function deleteGame(roomCode: string): void {
    games.delete(roomCode);
}

// ─── Initialization ─────────────────────────────────────────

export function createGame(roomCode: string, players: Array<{ id: string; socketId: string; name: string }>): GameState {
    const deck = shuffle(buildDeck());

    const gamePlayers: Player[] = players.map((p) => ({
        id: p.id,
        socketId: p.socketId,
        name: p.name,
        hand: [],
        isEliminated: false,
    }));

    // Deal initial hands
    for (const player of gamePlayers) {
        player.hand = deck.splice(0, INITIAL_HAND_SIZE);
    }

    // Find a valid starting card (must be a normal number card)
    let startCardIndex = deck.findIndex(
        (c) => c.color !== CardColor.Wild && !isActionCard(c.value)
    );
    if (startCardIndex === -1) startCardIndex = 0;
    const [startCard] = deck.splice(startCardIndex, 1);

    const state: GameState = {
        roomCode,
        players: gamePlayers,
        currentPlayerIndex: 0,
        direction: Direction.Clockwise,
        discardPile: [startCard],
        drawPile: deck,
        phase: GamePhase.Playing,
        chosenColor: null,
        drawStack: 0,
        winnerId: null,
        turnTimer: null,
    };

    games.set(roomCode, state);
    return state;
}

function isActionCard(value: CardValue): boolean {
    return ![
        CardValue.Zero, CardValue.One, CardValue.Two, CardValue.Three,
        CardValue.Four, CardValue.Five, CardValue.Six, CardValue.Seven,
        CardValue.Eight, CardValue.Nine,
    ].includes(value);
}

// ─── Game Actions ───────────────────────────────────────────

export interface ActionResult {
    success: boolean;
    error?: string;
    eliminatedPlayers?: Player[];
    /** Cards revealed during color roulette */
    rouletteCards?: Card[];
    /** If hands were passed (0 card) */
    handsPassed?: boolean;
    /** If hands were swapped (need to follow up with target) */
    needsSwapTarget?: boolean;
    /** If color needs to be chosen */
    needsColorChoice?: boolean;
    /** The game state after the action */
    state: GameState;
}

/** Play a card from the current player's hand */
export function playCard(
    state: GameState,
    playerId: string,
    cardId: string,
    chosenColor?: CardColor,
): ActionResult {
    const player = state.players[state.currentPlayerIndex];
    if (player.id !== playerId) {
        return { success: false, error: 'Not your turn', state };
    }
    if (player.isEliminated) {
        return { success: false, error: 'You are eliminated', state };
    }
    if (state.phase !== GamePhase.Playing) {
        return { success: false, error: `Cannot play card in phase: ${state.phase}`, state };
    }

    const cardIndex = player.hand.findIndex((c) => c.id === cardId);
    if (cardIndex === -1) {
        return { success: false, error: 'Card not in your hand', state };
    }

    const card = player.hand[cardIndex];
    const topCard = state.discardPile[state.discardPile.length - 1];

    if (!canPlayCard(card, topCard, state.chosenColor, state.drawStack)) {
        return { success: false, error: 'Cannot play that card', state };
    }

    // Remove card from hand
    player.hand.splice(cardIndex, 1);

    // Place on discard pile
    state.discardPile.push(card);

    // Resolve effects
    const effect = resolveCardEffect(card, state);
    state.direction = effect.direction;

    // Handle Discard All — remove matching cards from hand
    if (effect.discardedCards.length > 0) {
        player.hand = player.hand.filter(
            (c) => !effect.discardedCards.some((d) => d.id === c.id)
        );
        state.discardPile.push(...effect.discardedCards);
    }

    // Handle hand passing (0 card)
    if (effect.passHands) {
        passAllHands(state);
    }

    // Set draw stack
    state.drawStack = effect.drawStack;

    // Update current player
    state.currentPlayerIndex = effect.nextPlayerIndex;

    // If this is a wild card and needs color choice
    if (card.color === CardColor.Wild && effect.phase === GamePhase.ChoosingColor) {
        if (chosenColor && chosenColor !== CardColor.Wild) {
            state.chosenColor = chosenColor;
            // If color roulette, transition to roulette phase
            if (effect.colorRoulette) {
                state.phase = GamePhase.ColorRoulette;
            } else {
                state.phase = GamePhase.Playing;
            }
        } else {
            // Need color choice from the player who played the card
            state.phase = GamePhase.ChoosingColor;
            // Keep current player as the one who played the card
            state.currentPlayerIndex = state.players.indexOf(player);
            return {
                success: true,
                needsColorChoice: true,
                state,
            };
        }
    } else {
        state.chosenColor = null;
        state.phase = effect.phase;
    }

    // Handle swap (7 card)
    if (effect.swapHands) {
        state.currentPlayerIndex = state.players.indexOf(player);
        return {
            success: true,
            needsSwapTarget: true,
            state,
        };
    }

    // Check win/elimination
    const eliminatedPlayers = checkMercyRule(state);
    const winnerId = checkWinCondition(state);
    if (winnerId) {
        state.winnerId = winnerId;
        state.phase = GamePhase.GameOver;
    }

    // If next player has an active draw stack and can't stack further, force them to draw
    if (state.drawStack > 0 && state.phase === GamePhase.Playing) {
        const nextPlayer = state.players[state.currentPlayerIndex];
        const playable = getPlayableCards(
            nextPlayer.hand,
            state.discardPile[state.discardPile.length - 1],
            state.chosenColor,
            state.drawStack,
        );
        // Don't auto-resolve; let the player try to stack or choose to draw
    }

    return {
        success: true,
        eliminatedPlayers: eliminatedPlayers.length > 0 ? eliminatedPlayers : undefined,
        handsPassed: effect.passHands || undefined,
        state,
    };
}

/** Current player draws a card (or takes the draw stack penalty) */
export function drawCard(state: GameState, playerId: string): ActionResult {
    const player = state.players[state.currentPlayerIndex];
    if (player.id !== playerId) {
        return { success: false, error: 'Not your turn', state };
    }
    if (state.phase !== GamePhase.Playing) {
        return { success: false, error: `Cannot draw in phase: ${state.phase}`, state };
    }

    let count = 1;
    if (state.drawStack > 0) {
        count = state.drawStack;
        state.drawStack = 0;
    }

    const cards = drawCards(state.drawPile, state.discardPile, count);
    player.hand.push(...cards);

    // Check mercy rule
    const eliminatedPlayers = checkMercyRule(state);

    // Move to next player
    state.currentPlayerIndex = getNextPlayerIndex(state);

    // Check win condition
    const winnerId = checkWinCondition(state);
    if (winnerId) {
        state.winnerId = winnerId;
        state.phase = GamePhase.GameOver;
    }

    return {
        success: true,
        eliminatedPlayers: eliminatedPlayers.length > 0 ? eliminatedPlayers : undefined,
        state,
    };
}

/** Choose color after playing a wild card */
export function chooseColor(state: GameState, playerId: string, color: CardColor): ActionResult {
    const player = state.players[state.currentPlayerIndex];
    if (player.id !== playerId) {
        return { success: false, error: 'Not your turn', state };
    }
    if (state.phase !== GamePhase.ChoosingColor) {
        return { success: false, error: 'Not choosing color', state };
    }
    if (color === CardColor.Wild) {
        return { success: false, error: 'Cannot choose wild as color', state };
    }

    state.chosenColor = color;

    // Check if the top card is a Color Roulette
    const topCard = state.discardPile[state.discardPile.length - 1];
    if (topCard.value === CardValue.WildColorRoulette) {
        state.phase = GamePhase.ColorRoulette;
        // Move to next player who will do the roulette
        state.currentPlayerIndex = getNextPlayerIndex(state);
        return { success: true, state };
    }

    state.phase = GamePhase.Playing;
    // Move to next player
    state.currentPlayerIndex = getNextPlayerIndex(state);

    return { success: true, state };
}

/** Choose swap target after playing a 7 card */
export function chooseSwapTarget(state: GameState, playerId: string, targetId: string): ActionResult {
    const player = state.players.find((p) => p.id === playerId);
    if (!player) {
        return { success: false, error: 'Player not found', state };
    }
    if (state.phase !== GamePhase.ChoosingSwapTarget) {
        return { success: false, error: 'Not choosing swap target', state };
    }

    const target = state.players.find((p) => p.id === targetId && !p.isEliminated);
    if (!target) {
        return { success: false, error: 'Invalid swap target', state };
    }
    if (target.id === player.id) {
        return { success: false, error: 'Cannot swap with yourself', state };
    }

    swapHands(player, target);

    state.phase = GamePhase.Playing;
    state.currentPlayerIndex = getNextPlayerIndex(state);

    // Check mercy/win
    const eliminatedPlayers = checkMercyRule(state);
    const winnerId = checkWinCondition(state);
    if (winnerId) {
        state.winnerId = winnerId;
        state.phase = GamePhase.GameOver;
    }

    return {
        success: true,
        eliminatedPlayers: eliminatedPlayers.length > 0 ? eliminatedPlayers : undefined,
        state,
    };
}

/** Perform the color roulette for the affected player */
export function resolveColorRoulette(state: GameState, playerId: string, color: CardColor): ActionResult {
    const player = state.players[state.currentPlayerIndex];
    if (player.id !== playerId) {
        return { success: false, error: 'Not your turn', state };
    }
    if (state.phase !== GamePhase.ColorRoulette) {
        return { success: false, error: 'Not in color roulette phase', state };
    }

    const revealed = performColorRoulette(color, state.drawPile, state.discardPile);
    player.hand.push(...revealed);

    state.phase = GamePhase.Playing;
    state.currentPlayerIndex = getNextPlayerIndex(state);

    const eliminatedPlayers = checkMercyRule(state);
    const winnerId = checkWinCondition(state);
    if (winnerId) {
        state.winnerId = winnerId;
        state.phase = GamePhase.GameOver;
    }

    return {
        success: true,
        rouletteCards: revealed,
        eliminatedPlayers: eliminatedPlayers.length > 0 ? eliminatedPlayers : undefined,
        state,
    };
}

// ─── State Sanitization ────────────────────────────────────

/** Create a client-safe view of the game state for a specific player */
export function sanitizeGameState(state: GameState, forPlayerId: string): ClientGameState {
    const you = state.players.find((p) => p.id === forPlayerId)!;
    const opponents: OpponentView[] = state.players
        .filter((p) => p.id !== forPlayerId)
        .map((p) => ({
            id: p.id,
            name: p.name,
            cardCount: p.hand.length,
            isEliminated: p.isEliminated,
        }));

    return {
        roomCode: state.roomCode,
        you: {
            id: you.id,
            name: you.name,
            hand: you.hand,
            isEliminated: you.isEliminated,
        },
        opponents,
        currentPlayerId: state.players[state.currentPlayerIndex]?.id ?? '',
        direction: state.direction,
        topCard: state.discardPile[state.discardPile.length - 1],
        drawPileCount: state.drawPile.length,
        phase: state.phase,
        chosenColor: state.chosenColor,
        drawStack: state.drawStack,
        winnerId: state.winnerId,
        lastAction: null,
    };
}
