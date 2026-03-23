// ============================================================
// Deck — build, shuffle, draw
// ============================================================

import { v4 as uuid } from 'uuid';
import { Card, CardColor, CardValue } from '../../shared/types';
import { DECK_COMPOSITION } from '../../shared/constants';

/** Build the full UNO No Mercy deck */
export function buildDeck(): Card[] {
    const deck: Card[] = [];
    for (const [color, value, count] of DECK_COMPOSITION) {
        for (let i = 0; i < count; i++) {
            deck.push({ id: uuid(), color, value });
        }
    }
    return deck;
}

/** Fisher-Yates shuffle (in-place) */
export function shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

/** Draw N cards from the draw pile. Reshuffles discard pile if needed. */
export function drawCards(
    drawPile: Card[],
    discardPile: Card[],
    count: number,
): Card[] {
    const drawn: Card[] = [];
    for (let i = 0; i < count; i++) {
        if (drawPile.length === 0) {
            // Keep the top card of discard, reshuffle the rest into draw pile
            if (discardPile.length <= 1) break; // truly out of cards
            const topCard = discardPile.pop()!;
            drawPile.push(...shuffle(discardPile.splice(0)));
            discardPile.push(topCard);
        }
        const card = drawPile.pop();
        if (card) drawn.push(card);
    }
    return drawn;
}
