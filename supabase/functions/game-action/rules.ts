// ============================================================
// Rules — card play validation & effect resolution for Deno
// ============================================================

import {
    Card,
    CardColor,
    CardValue,
    GameState,
    GamePhase,
    Direction,
    Player,
} from './types.ts';
import { isDrawCard, getDrawValue, MERCY_LIMIT } from './constants.ts';
import { drawCards } from './deck.ts';

export function canPlayCard(card: Card, topCard: Card, chosenColor: CardColor | null, drawStack: number): boolean {
    if (drawStack > 0) {
        if (card.value === CardValue.WildParry) return true;
        if (!isDrawCard(card.value)) return false;
        return getDrawValue(card.value) >= getDrawValue(topCard.value);
    }

    if (card.color === CardColor.Wild) return true;

    const activeColor = chosenColor ?? topCard.color;
    if (card.color === activeColor) return true;

    if (card.value === topCard.value && topCard.color !== CardColor.Wild) return true;

    return false;
}

export function getPlayableCards(hand: Card[], topCard: Card, chosenColor: CardColor | null, drawStack: number): Card[] {
    return hand.filter((c) => canPlayCard(c, topCard, chosenColor, drawStack));
}

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

export function activePlayerCount(state: GameState): number {
    return state.players.filter((p) => !p.isEliminated).length;
}

export interface CardEffect {
    nextPlayerIndex: number;
    drawPenalty: number;
    drawStack: number;
    phase: GamePhase;
    direction: Direction;
    discardedCards: Card[];
    passHands: boolean;
    swapHands: boolean;
    colorRoulette: boolean;
    playAgain: boolean;
    parryReflect: boolean;
}

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
            effect.passHands = true;
            break;

        case CardValue.Seven:
            effect.swapHands = true;
            effect.phase = GamePhase.ChoosingSwapTarget;
            break;

        case CardValue.Skip:
            effect.nextPlayerIndex = getNextPlayerIndex(state, 2);
            break;

        case CardValue.Reverse:
            effect.direction = state.direction === Direction.Clockwise
                ? Direction.CounterClockwise
                : Direction.Clockwise;
            if (activePlayerCount(state) === 2) {
                effect.playAgain = true;
            } else {
                const tempState = { ...state, direction: effect.direction };
                effect.nextPlayerIndex = getNextPlayerIndex(tempState);
            }
            break;

        case CardValue.DrawTwo:
            effect.drawStack = state.drawStack + 2;
            effect.nextPlayerIndex = getNextPlayerIndex(state);
            break;

        case CardValue.DiscardAll: {
            const player = state.players[state.currentPlayerIndex];
            const matching = player.hand.filter(
                (c) => c.color === card.color && c.id !== card.id
            );
            effect.discardedCards = matching;
            break;
        }

        case CardValue.SkipEveryone:
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
            effect.phase = GamePhase.ChoosingColor;
            break;

        case CardValue.WildReverseDrawFour:
            effect.direction = state.direction === Direction.Clockwise
                ? Direction.CounterClockwise
                : Direction.Clockwise;
            effect.drawStack = state.drawStack + 4;
            effect.phase = GamePhase.ChoosingColor;
            const tempState2 = { ...state, direction: effect.direction };
            effect.nextPlayerIndex = getNextPlayerIndex(tempState2);
            break;

        case CardValue.WildParry:
            effect.parryReflect = true;
            effect.drawStack = state.drawStack;
            effect.phase = GamePhase.ChoosingColor;
            break;

        default:
            break;
    }

    if (effect.playAgain) {
        effect.nextPlayerIndex = state.currentPlayerIndex;
    }

    return effect;
}

export function passAllHands(state: GameState): void {
    const activePlayers = state.players.filter((p) => !p.isEliminated);
    if (activePlayers.length < 2) return;

    const hands = activePlayers.map((p) => [...p.hand]);

    if (state.direction === Direction.Clockwise) {
        const last = hands[hands.length - 1];
        for (let i = hands.length - 1; i > 0; i--) {
            activePlayers[i].hand = hands[i - 1];
        }
        activePlayers[0].hand = last;
    } else {
        const first = hands[0];
        for (let i = 0; i < hands.length - 1; i++) {
            activePlayers[i].hand = hands[i + 1];
        }
        activePlayers[activePlayers.length - 1].hand = first;
    }
}

export function swapHands(player1: Player, player2: Player): void {
    const temp = player1.hand;
    player1.hand = player2.hand;
    player2.hand = temp;
}

export function checkMercyRule(state: GameState): Player[] {
    const eliminated: Player[] = [];
    for (const player of state.players) {
        if (!player.isEliminated && player.hand.length >= MERCY_LIMIT) {
            player.isEliminated = true;
            state.drawPile.push(...player.hand);
            player.hand = [];
            eliminated.push(player);
        }
    }
    return eliminated;
}

export function checkWinCondition(state: GameState): string | null {
    const winner = state.players.find((p) => !p.isEliminated && p.hand.length === 0);
    if (winner) return winner.id;

    const activePlayers = state.players.filter((p) => !p.isEliminated);
    if (activePlayers.length === 1) return activePlayers[0].id;

    return null;
}

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
