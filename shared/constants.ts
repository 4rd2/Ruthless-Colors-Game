// ============================================================
// Ruthless Colors — Constants & Deck Configuration
// ============================================================

import { CardColor, CardValue } from './types';

/** Maximum cards before a player is eliminated */
export const MERCY_LIMIT = 25;

/** Cards dealt to each player at game start */
export const INITIAL_HAND_SIZE = 7;

/** Maximum players per room */
export const MAX_PLAYERS = 4;

/** Minimum players to start a game */
export const MIN_PLAYERS = 2;

/** Room code length */
export const ROOM_CODE_LENGTH = 6;

/** Reconnection grace period in ms */
export const RECONNECT_GRACE_MS = 30_000;

/** 
 * Deck composition for Ruthless Colors.
 * Each entry: [color, value, count]
 */
export const DECK_COMPOSITION: Array<[CardColor, CardValue, number]> = [
    // --- Number cards (colored) ---
    // 0 cards: one per color
    [CardColor.Red, CardValue.Zero, 1],
    [CardColor.Blue, CardValue.Zero, 1],
    [CardColor.Green, CardValue.Zero, 1],
    [CardColor.Yellow, CardValue.Zero, 1],
    // 1-9: two per color
    ...((['red', 'blue', 'green', 'yellow'] as CardColor[]).flatMap((color) =>
        ([CardValue.One, CardValue.Two, CardValue.Three, CardValue.Four,
        CardValue.Five, CardValue.Six, CardValue.Seven, CardValue.Eight,
        CardValue.Nine] as CardValue[]).map((value): [CardColor, CardValue, number] => [color, value, 2])
    )),

    // --- Colored action cards: two per color ---
    ...((['red', 'blue', 'green', 'yellow'] as CardColor[]).flatMap((color) =>
        ([CardValue.Skip, CardValue.Reverse, CardValue.DrawTwo,
        CardValue.DiscardAll, CardValue.SkipEveryone] as CardValue[])
            .map((value): [CardColor, CardValue, number] => [color, value, 2])
    )),

    // --- Wild cards ---
    [CardColor.Wild, CardValue.WildDrawFour, 4],
    [CardColor.Wild, CardValue.WildDrawSix, 4],
    [CardColor.Wild, CardValue.WildDrawTen, 4],
    [CardColor.Wild, CardValue.WildColorRoulette, 4],
    [CardColor.Wild, CardValue.WildReverseDrawFour, 4],
    [CardColor.Wild, CardValue.WildParry, 4],
];

/** Draw penalty values for stackable draw cards */
export const DRAW_VALUES: Partial<Record<CardValue, number>> = {
    [CardValue.DrawTwo]: 2,
    [CardValue.WildDrawFour]: 4,
    [CardValue.WildReverseDrawFour]: 4,
    [CardValue.WildDrawSix]: 6,
    [CardValue.WildDrawTen]: 10,
};

/** Check if a card value is a draw card (stackable) or a Parry */
export function isDrawCard(value: CardValue): boolean {
    return value in DRAW_VALUES || value === CardValue.WildParry;
}

/** Get the draw penalty for a card value */
export function getDrawValue(value: CardValue): number {
    return DRAW_VALUES[value] ?? 0;
}
