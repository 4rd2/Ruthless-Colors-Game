// ============================================================
// Game — state machine, turn logic, state sanitization for Deno
// ============================================================

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
} from './types.ts';
import { INITIAL_HAND_SIZE } from './constants.ts';
import { buildDeck, shuffle, drawCards } from './deck.ts';
import {
    canPlayCard,
    resolveCardEffect,
    passAllHands,
    swapHands,
    checkMercyRule,
    checkWinCondition,
    getPlayableCards,
    getNextPlayerIndex,
    resolveCardEffect as rulesResolveCardEffect,
} from './rules.ts';

function isActionCard(value: CardValue): boolean {
    return ![
        CardValue.Zero, CardValue.One, CardValue.Two, CardValue.Three,
        CardValue.Four, CardValue.Five, CardValue.Six, CardValue.Seven,
        CardValue.Eight, CardValue.Nine,
    ].includes(value);
}

export function initializeNewGame(roomCode: string, players: Array<{ id: string; name: string }>): GameState {
    const deck = shuffle(buildDeck());

    const gamePlayers: Player[] = players.map((p) => ({
        id: p.id,
        name: p.name,
        hand: [],
        isEliminated: false,
    }));

    for (const player of gamePlayers) {
        player.hand = deck.splice(0, INITIAL_HAND_SIZE);
    }

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
        drawStackOriginIndex: -1,
        winnerId: null,
    };

    return state;
}

export interface ActionResult {
    success: boolean;
    error?: string;
    eliminatedPlayers?: Player[];
    rouletteCards?: Card[];
    handsPassed?: boolean;
    needsSwapTarget?: boolean;
    needsColorChoice?: boolean;
    state: GameState;
}

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

    player.hand.splice(cardIndex, 1);
    state.discardPile.push(card);

    const effect = rulesResolveCardEffect(card, state);
    state.direction = effect.direction;

    if (effect.discardedCards.length > 0) {
        player.hand = player.hand.filter(
            (c) => !effect.discardedCards.some((d) => d.id === c.id)
        );
        state.discardPile.push(...effect.discardedCards);
    }

    if (effect.passHands) {
        passAllHands(state);
    }

    state.drawStack = effect.drawStack;

    if (effect.drawStack > 0 && state.drawStackOriginIndex === -1 && !effect.parryReflect) {
        state.drawStackOriginIndex = state.players.indexOf(player);
    }

    if (effect.parryReflect && state.drawStackOriginIndex >= 0 && effect.phase !== GamePhase.ChoosingColor) {
        state.currentPlayerIndex = state.drawStackOriginIndex;
        state.drawStackOriginIndex = -1;
    } else if (!effect.parryReflect) {
        state.currentPlayerIndex = effect.nextPlayerIndex;
    }

    if (card.color === CardColor.Wild && effect.phase === GamePhase.ChoosingColor) {
        if (chosenColor && chosenColor !== CardColor.Wild) {
            state.chosenColor = chosenColor;
            if (effect.colorRoulette) {
                state.phase = GamePhase.ColorRoulette;
            } else {
                state.phase = GamePhase.Playing;
            }
        } else {
            state.phase = GamePhase.ChoosingColor;
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

    if (effect.swapHands) {
        state.currentPlayerIndex = state.players.indexOf(player);
        return {
            success: true,
            needsSwapTarget: true,
            state,
        };
    }

    const eliminatedPlayers = checkMercyRule(state);
    const winnerId = checkWinCondition(state);
    if (winnerId) {
        state.winnerId = winnerId;
        state.phase = GamePhase.GameOver;
    }

    return {
        success: true,
        eliminatedPlayers: eliminatedPlayers.length > 0 ? eliminatedPlayers : undefined,
        handsPassed: effect.passHands || undefined,
        state,
    };
}

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
        state.drawStackOriginIndex = -1;
    }

    const cards = drawCards(state.drawPile, state.discardPile, count);
    player.hand.push(...cards);

    const eliminatedPlayers = checkMercyRule(state);
    state.currentPlayerIndex = getNextPlayerIndex(state);

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

    const topCard = state.discardPile[state.discardPile.length - 1];
    if (topCard.value === CardValue.WildColorRoulette) {
        state.phase = GamePhase.ColorRoulette;
        state.currentPlayerIndex = getNextPlayerIndex(state);
        return { success: true, state };
    }

    state.phase = GamePhase.Playing;

    if (topCard.value === CardValue.WildParry && state.drawStackOriginIndex >= 0) {
        state.currentPlayerIndex = state.drawStackOriginIndex;
        state.drawStackOriginIndex = -1;
    } else {
        state.currentPlayerIndex = getNextPlayerIndex(state);
    }

    return { success: true, state };
}

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
        drawStackOriginId: state.drawStackOriginIndex >= 0 ? state.players[state.drawStackOriginIndex]?.id ?? null : null,
        winnerId: state.winnerId,
        lastAction: null,
    };
}
