// ============================================================
// Rules — card play validation & effect resolution
// ============================================================

import {
    Card,
    CardColor,
    CardValue,
    GameState,
    GamePhase,
    Direction,
    Player,
} from '../../shared/types';
import { isDrawCard, getDrawValue, MERCY_LIMIT } from '../../shared/constants';
import { drawCards } from './deck';

// ─── Validation ──────────────────────────────────────────────

/** Check if a card can be played on the current discard */
export function canPlayCard(card: Card, topCard: Card, chosenColor: CardColor | null, drawStack: number): boolean {
    // If there's an active draw stack, only draw cards of equal or higher value can be played
    if (drawStack > 0) {
        // Parry can always be played when there's an active draw stack
        if (card.value === CardValue.WildParry) return true;
        if (!isDrawCard(card.value)) return false;
        return getDrawValue(card.value) >= getDrawValue(topCard.value);
    }

    // Wild cards can always be played
    if (card.color === CardColor.Wild) return true;

    // Match color (or chosen color for wilds on discard)
    const activeColor = chosenColor ?? topCard.color;
    if (card.color === activeColor) return true;

    // Match value (number or action)
    if (card.value === topCard.value && topCard.color !== CardColor.Wild) return true;

    return false;
}

/** Get all playable cards from a hand */
export function getPlayableCards(hand: Card[], topCard: Card, chosenColor: CardColor | null, drawStack: number): Card[] {
    return hand.filter((c) => canPlayCard(c, topCard, chosenColor, drawStack));
}

// ─── Turn Management ────────────────────────────────────────

/** Get the next active (non-eliminated) player index */
export function getNextPlayerIndex(state: GameState, skip: number = 1): number {
    const activePlayers = state.players.filter((p) => !p.isEliminated);
    if (activePlayers.length <= 1) return state.currentPlayerIndex;

    let idx = state.currentPlayerIndex;
    let skipped = 0;
    while (skipped < skip) {
        idx = (idx + state.direction + state.players.length) % state.players.length;
        if (!state.players[idx].isEliminated) {
            skipped++;
        }
    }
    return idx;
}

/** Count active (non-eliminated) players */
export function activePlayerCount(state: GameState): number {
    return state.players.filter((p) => !p.isEliminated).length;
}

// ─── Effect Resolution ──────────────────────────────────────

export interface CardEffect {
    /** New current player index after this card */
    nextPlayerIndex: number;
    /** Number of cards the next player must draw */
    drawPenalty: number;
    /** New draw stack value */
    drawStack: number;
    /** New game phase */
    phase: GamePhase;
    /** New direction */
    direction: Direction;
    /** Cards discarded by Discard All */
    discardedCards: Card[];
    /** If a hand-pass (0 card) should happen */
    passHands: boolean;
    /** If a hand-swap (7 card) should happen — requires target selection */
    swapHands: boolean;
    /** If Color Roulette should trigger */
    colorRoulette: boolean;
    /** Player gets another turn */
    playAgain: boolean;
    /** Parry: reflect the draw stack back to the attacker */
    parryReflect: boolean;
}

/** Resolve the effect of playing a card */
export function resolveCardEffect(card: Card, state: GameState): CardEffect {
    const effect: CardEffect = {
        nextPlayerIndex: getNextPlayerIndex(state),
        drawPenalty: 0,
        drawStack: 0,
        phase: GamePhase.Playing,
        direction: state.direction,
        discardedCards: [],
        passHands: false,
        swapHands: false,
        colorRoulette: false,
        playAgain: false,
        parryReflect: false,
    };

    switch (card.value) {
        case CardValue.Zero:
            // Pass all hands in the current direction
            effect.passHands = true;
            break;

        case CardValue.Seven:
            // Swap hand with chosen player — need to enter swap target selection
            effect.swapHands = true;
            effect.phase = GamePhase.ChoosingSwapTarget;
            break;

        case CardValue.Skip:
            // Skip next player
            effect.nextPlayerIndex = getNextPlayerIndex(state, 2);
            break;

        case CardValue.Reverse:
            effect.direction = state.direction === Direction.Clockwise
                ? Direction.CounterClockwise
                : Direction.Clockwise;
            // In 2-player game, reverse acts as skip
            if (activePlayerCount(state) === 2) {
                // Current player goes again
                effect.playAgain = true;
            } else {
                // Recalculate next with new direction
                const tempState = { ...state, direction: effect.direction };
                effect.nextPlayerIndex = getNextPlayerIndex(tempState);
            }
            break;

        case CardValue.DrawTwo:
            // Stackable draw
            effect.drawStack = state.drawStack + 2;
            effect.nextPlayerIndex = getNextPlayerIndex(state);
            break;

        case CardValue.DiscardAll: {
            // Discard all cards of this card's color from hand
            const player = state.players[state.currentPlayerIndex];
            const matching = player.hand.filter(
                (c) => c.color === card.color && c.id !== card.id
            );
            effect.discardedCards = matching;
            break;
        }

        case CardValue.SkipEveryone:
            // Skip everyone, current player goes again
            effect.playAgain = true;
            break;

        case CardValue.WildDrawFour:
            effect.drawStack = state.drawStack + 4;
            effect.phase = GamePhase.ChoosingColor;
            break;

        case CardValue.WildDrawSix:
            effect.drawStack = state.drawStack + 6;
            effect.phase = GamePhase.ChoosingColor;
            break;

        case CardValue.WildDrawTen:
            effect.drawStack = state.drawStack + 10;
            effect.phase = GamePhase.ChoosingColor;
            break;

        case CardValue.WildColorRoulette:
            effect.colorRoulette = true;
            effect.phase = GamePhase.ChoosingColor; // first choose color for play, then roulette triggers on next player
            break;

        case CardValue.WildReverseDrawFour:
            effect.direction = state.direction === Direction.Clockwise
                ? Direction.CounterClockwise
                : Direction.Clockwise;
            effect.drawStack = state.drawStack + 4;
            effect.phase = GamePhase.ChoosingColor;
            // Recalculate next with new direction
            const tempState2 = { ...state, direction: effect.direction };
            effect.nextPlayerIndex = getNextPlayerIndex(tempState2);
            break;

        case CardValue.WildParry:
            // Reflect the entire draw stack back to the attacker
            effect.parryReflect = true;
            effect.drawStack = state.drawStack; // keep the accumulated stack
            effect.phase = GamePhase.ChoosingColor; // player must choose a color
            break;

        default:
            // Regular number card — no special effect
            break;
    }

    // If play again, the current player keeps their turn
    if (effect.playAgain) {
        effect.nextPlayerIndex = state.currentPlayerIndex;
    }

    return effect;
}

// ─── Hand Operations ────────────────────────────────────────

/** Pass all hands in the current direction (0 card) */
export function passAllHands(state: GameState): void {
    const activePlayers = state.players.filter((p) => !p.isEliminated);
    if (activePlayers.length < 2) return;

    const hands = activePlayers.map((p) => [...p.hand]);

    if (state.direction === Direction.Clockwise) {
        // Each player gets the hand of the player before them
        const last = hands[hands.length - 1];
        for (let i = hands.length - 1; i > 0; i--) {
            activePlayers[i].hand = hands[i - 1];
        }
        activePlayers[0].hand = last;
    } else {
        // Counter-clockwise
        const first = hands[0];
        for (let i = 0; i < hands.length - 1; i++) {
            activePlayers[i].hand = hands[i + 1];
        }
        activePlayers[activePlayers.length - 1].hand = first;
    }
}

/** Swap hands between two players (7 card) */
export function swapHands(player1: Player, player2: Player): void {
    const temp = player1.hand;
    player1.hand = player2.hand;
    player2.hand = temp;
}

// ─── Mercy Rule ─────────────────────────────────────────────

/** Check and eliminate players who have >= MERCY_LIMIT cards */
export function checkMercyRule(state: GameState): Player[] {
    const eliminated: Player[] = [];
    for (const player of state.players) {
        if (!player.isEliminated && player.hand.length >= MERCY_LIMIT) {
            player.isEliminated = true;
            // Return their cards to the draw pile
            state.drawPile.push(...player.hand);
            player.hand = [];
            eliminated.push(player);
        }
    }
    return eliminated;
}

/** Check if the game is over (one player wins or only one player left) */
export function checkWinCondition(state: GameState): string | null {
    // A player wins by emptying their hand
    const winner = state.players.find((p) => !p.isEliminated && p.hand.length === 0);
    if (winner) return winner.id;

    // Last player standing wins via elimination
    const activePlayers = state.players.filter((p) => !p.isEliminated);
    if (activePlayers.length === 1) return activePlayers[0].id;

    return null;
}

// ─── Color Roulette ─────────────────────────────────────────

/** Perform color roulette: reveal cards from draw pile until chosen color is found */
export function performColorRoulette(
    chosenColor: CardColor,
    drawPile: Card[],
    discardPile: Card[],
): Card[] {
    const revealed: Card[] = [];
    while (drawPile.length > 0 || discardPile.length > 1) {
        const cards = drawCards(drawPile, discardPile, 1);
        if (cards.length === 0) break;
        revealed.push(cards[0]);
        if (cards[0].color === chosenColor) break;
    }
    return revealed;
}
