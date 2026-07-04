// ============================================================
// Ruthless Colors — Constants & Deck Configuration for Deno
// ============================================================

import { CardColor, CardValue } from './types.ts';

export const MERCY_LIMIT = 25;
export const INITIAL_HAND_SIZE = 7;
export const MAX_PLAYERS = 4;
export const MIN_PLAYERS = 2;
export const ROOM_CODE_LENGTH = 6;
export const RECONNECT_GRACE_MS = 30_000;

export const DECK_COMPOSITION: Array<[CardColor, CardValue, number]> = [
    [CardColor.Red, CardValue.Zero, 1],
    [CardColor.Blue, CardValue.Zero, 1],
    [CardColor.Green, CardValue.Zero, 1],
    [CardColor.Yellow, CardValue.Zero, 1],
    ...((['red', 'blue', 'green', 'yellow'] as CardColor[]).flatMap((color) =>
        ([CardValue.One, CardValue.Two, CardValue.Three, CardValue.Four,
        CardValue.Five, CardValue.Six, CardValue.Seven, CardValue.Eight,
        CardValue.Nine] as CardValue[]).map((value): [CardColor, CardValue, number] => [color, value, 2])
    )),
    ...((['red', 'blue', 'green', 'yellow'] as CardColor[]).flatMap((color) =>
        ([CardValue.Skip, CardValue.Reverse, CardValue.DrawTwo,
        CardValue.DiscardAll, CardValue.SkipEveryone] as CardValue[])
            .map((value): [CardColor, CardValue, number] => [color, value, 2])
    )),
    [CardColor.Wild, CardValue.WildDrawFour, 4],
    [CardColor.Wild, CardValue.WildDrawSix, 4],
    [CardColor.Wild, CardValue.WildDrawTen, 4],
    [CardColor.Wild, CardValue.WildColorRoulette, 4],
    [CardColor.Wild, CardValue.WildReverseDrawFour, 4],
    [CardColor.Wild, CardValue.WildParry, 4],
];

export const DRAW_VALUES: Partial<Record<CardValue, number>> = {
    [CardValue.DrawTwo]: 2,
    [CardValue.WildDrawFour]: 4,
    [CardValue.WildReverseDrawFour]: 4,
    [CardValue.WildDrawSix]: 6,
    [CardValue.WildDrawTen]: 10,
};

export function isDrawCard(value: CardValue): boolean {
    return value in DRAW_VALUES || value === CardValue.WildParry;
}

export function getDrawValue(value: CardValue): number {
    return DRAW_VALUES[value] ?? 0;
}
