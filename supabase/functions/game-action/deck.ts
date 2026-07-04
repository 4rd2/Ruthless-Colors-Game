// ============================================================
// Deck — build, shuffle, draw for Deno
// ============================================================

import { Card, CardColor, CardValue } from './types.ts';
import { DECK_COMPOSITION } from './constants.ts';

export function buildDeck(): Card[] {
    const deck: Card[] = [];
    for (const [color, value, count] of DECK_COMPOSITION) {
        for (let i = 0; i < count; i++) {
            deck.push({ id: crypto.randomUUID(), color, value });
        }
    }
    return deck;
}

export function shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

export function drawCards(
    drawPile: Card[],
    discardPile: Card[],
    count: number,
): Card[] {
    const drawn: Card[] = [];
    for (let i = 0; i < count; i++) {
        if (drawPile.length === 0) {
            if (discardPile.length <= 1) break;
            const topCard = discardPile.pop()!;
            drawPile.push(...shuffle(discardPile.splice(0)));
            discardPile.push(topCard);
        }
        const card = drawPile.pop();
        if (card) drawn.push(card);
    }
    return drawn;
}
