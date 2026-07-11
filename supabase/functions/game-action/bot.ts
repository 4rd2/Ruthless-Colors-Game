// ============================================================
// Bot AI — pure decision logic for computer players
//
// Bots are ordinary player rows flagged is_bot; the action loop
// in index.ts asks chooseBotAction what to do and applies it via
// the same pure game functions humans use. Wilds are ALWAYS
// played colorless (two-step: play_card → choose_color) because
// the inline-chosenColor path mishandles WildParry reflection.
// ============================================================

import { Card, CardColor, CardValue, GamePhase, GameState } from './types.ts';
import { getPlayableCards } from './rules.ts';

export type BotDecision =
    | { type: 'play_card'; cardId: string }
    | { type: 'draw_card' }
    | { type: 'choose_color'; color: CardColor }
    | { type: 'choose_swap_target'; targetPlayerId: string }
    | { type: 'color_roulette_choice'; color: CardColor };

// ── Names ────────────────────────────────────────────────────
// Robot-flavored so they never collide with the client's
// Adjective+Animal random names (matters for rejoin_by_name).

export const BOT_NAMES = [
    'Botrick', 'Servo', 'Gizmo', 'Circuitina', 'Chip', 'Robobo',
    'Sparky', 'Cogsworth', 'Bleep', 'Volt', 'Pixel', 'Ratchet',
];

export function pickBotNames(count: number, takenNames: string[]): string[] {
    const taken = new Set(takenNames.map((n) => n.toLowerCase()));
    const pool = BOT_NAMES.filter((n) => !taken.has(n.toLowerCase()));
    // Shuffle the pool so games feel varied
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const picked: string[] = [];
    for (let i = 0; i < count; i++) {
        picked.push(pool[i] ?? `Bot${10 + Math.floor(Math.random() * 90)}`);
    }
    return picked;
}

// ── Helpers ──────────────────────────────────────────────────

const DRAW_VALUES: Partial<Record<CardValue, number>> = {
    [CardValue.DrawTwo]: 2,
    [CardValue.WildDrawFour]: 4,
    [CardValue.WildReverseDrawFour]: 4,
    [CardValue.WildDrawSix]: 6,
    [CardValue.WildDrawTen]: 10,
};

const NUMBER_VALUES = new Set<string>(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);

/** Most common non-wild color in a hand (fallback: random real color) */
function dominantColor(hand: Card[]): CardColor {
    const counts = new Map<CardColor, number>();
    for (const c of hand) {
        if (c.color !== CardColor.Wild) {
            counts.set(c.color, (counts.get(c.color) ?? 0) + 1);
        }
    }
    let best: CardColor | null = null;
    let bestCount = -1;
    for (const [color, n] of counts) {
        if (n > bestCount) { best = color; bestCount = n; }
    }
    if (best) return best;
    const colors = [CardColor.Red, CardColor.Blue, CardColor.Green, CardColor.Yellow];
    return colors[Math.floor(Math.random() * colors.length)];
}

// ── Decision ─────────────────────────────────────────────────

export function chooseBotAction(state: GameState): BotDecision {
    const bot = state.players[state.currentPlayerIndex];

    if (state.phase === GamePhase.ChoosingColor) {
        return { type: 'choose_color', color: dominantColor(bot.hand) };
    }

    if (state.phase === GamePhase.ColorRoulette) {
        // Drawing until this color appears — pick what we hold most of
        return { type: 'color_roulette_choice', color: dominantColor(bot.hand) };
    }

    if (state.phase === GamePhase.ChoosingSwapTarget) {
        // Take the smallest hand at the table
        const targets = state.players.filter((p) => p.id !== bot.id && !p.isEliminated);
        targets.sort((a, b) => a.hand.length - b.hand.length);
        return { type: 'choose_swap_target', targetPlayerId: targets[0].id };
    }

    // ── Phase: playing ──
    const topCard = state.discardPile[state.discardPile.length - 1];
    const playable = getPlayableCards(bot.hand, topCard, state.chosenColor, state.drawStack);
    if (playable.length === 0) {
        return { type: 'draw_card' };
    }

    if (state.drawStack > 0) {
        // Under attack: parry reflects the whole stack; otherwise the
        // smallest sufficient draw card (save the big stackers).
        const parry = playable.find((c) => c.value === CardValue.WildParry);
        if (parry) return { type: 'play_card', cardId: parry.id };
        const drawCards = playable
            .filter((c) => DRAW_VALUES[c.value] !== undefined)
            .sort((a, b) => (DRAW_VALUES[a.value] ?? 0) - (DRAW_VALUES[b.value] ?? 0));
        if (drawCards.length > 0) return { type: 'play_card', cardId: drawCards[0].id };
        return { type: 'draw_card' };
    }

    const dominant = dominantColor(bot.hand);

    // 1. Discard All that dumps at least 3 cards total
    const bigDump = playable.find((c) =>
        c.value === CardValue.DiscardAll &&
        bot.hand.filter((h) => h.color === c.color).length >= 3,
    );
    if (bigDump) return { type: 'play_card', cardId: bigDump.id };

    // 2. Number cards first (shed plain cards, keep ammunition);
    //    prefer our dominant color to keep future options open
    const numbers = playable.filter((c) => NUMBER_VALUES.has(c.value));
    if (numbers.length > 0) {
        const preferred = numbers.find((c) => c.color === dominant) ?? numbers[0];
        return { type: 'play_card', cardId: preferred.id };
    }

    // 3. Colored action cards
    const coloredActions = playable.filter((c) => c.color !== CardColor.Wild);
    if (coloredActions.length > 0) {
        const preferred = coloredActions.find((c) => c.color === dominant) ?? coloredActions[0];
        return { type: 'play_card', cardId: preferred.id };
    }

    // 4. Wilds last — played colorless; choose_color follows next loop tick
    return { type: 'play_card', cardId: playable[0].id };
}
