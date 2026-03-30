import { Card, CardColor, CardValue } from '@shared/types';

// ── Card display helpers ────────────────────────────────────

export const VALUE_DISPLAY: Record<string, string> = {
    [CardValue.Zero]:              '0',
    [CardValue.One]:               '1',
    [CardValue.Two]:               '2',
    [CardValue.Three]:             '3',
    [CardValue.Four]:              '4',
    [CardValue.Five]:              '5',
    [CardValue.Six]:               '6',
    [CardValue.Seven]:             '7',
    [CardValue.Eight]:             '8',
    [CardValue.Nine]:              '9',
    [CardValue.Skip]:              '⊘',
    [CardValue.Reverse]:           '⇄',
    [CardValue.DrawTwo]:           '+2',
    [CardValue.DiscardAll]:        '✕ALL',
    [CardValue.SkipEveryone]:      '⊘ALL',
    [CardValue.WildDrawFour]:      '+4',
    [CardValue.WildDrawSix]:       '+6',
    [CardValue.WildDrawTen]:       '+10',
    [CardValue.WildColorRoulette]: '🎰',
    [CardValue.WildReverseDrawFour]: '⇄+4',
    [CardValue.WildParry]:         '🛡️',
};

export const CARD_DESCRIPTIONS: Record<string, string> = {
    [CardValue.Zero]:              'Pass all hands in the current direction.',
    [CardValue.One]:               'Number card — match by color or value.',
    [CardValue.Two]:               'Number card — match by color or value.',
    [CardValue.Three]:             'Number card — match by color or value.',
    [CardValue.Four]:              'Number card — match by color or value.',
    [CardValue.Five]:              'Number card — match by color or value.',
    [CardValue.Six]:               'Number card — match by color or value.',
    [CardValue.Seven]:             'Swap your hand with any other player.',
    [CardValue.Eight]:             'Number card — match by color or value.',
    [CardValue.Nine]:              'Number card — match by color or value.',
    [CardValue.Skip]:              "Skip the next player's turn.",
    [CardValue.Reverse]:           'Reverse play direction. Acts as Skip in 2-player.',
    [CardValue.DrawTwo]:           'Next player draws 2 cards. Can be stacked!',
    [CardValue.DiscardAll]:        'Discard all cards of this color from your hand.',
    [CardValue.SkipEveryone]:      'Skip all players — you go again!',
    [CardValue.WildDrawFour]:      'Choose a color. Next player draws 4. Stackable!',
    [CardValue.WildDrawSix]:       'Choose a color. Next player draws 6. Stackable!',
    [CardValue.WildDrawTen]:       'Choose a color. Next player draws 10. Stackable!',
    [CardValue.WildColorRoulette]: 'Choose a color. Next player draws until they hit it!',
    [CardValue.WildReverseDrawFour]: 'Reverse direction, choose color, +4 to next. Stackable!',
    [CardValue.WildParry]:         'Reflect the draw stack back to the attacker! Choose a color.',
};

export const SMALL_TEXT_VALUES: string[] = [
    CardValue.DiscardAll,
    CardValue.SkipEveryone,
    CardValue.WildColorRoulette,
    CardValue.WildReverseDrawFour,
    CardValue.WildParry,
];

// ── Client-side play validation ─────────────────────────────

const DRAW_VALUES: Record<string, number> = {
    draw2:              2,
    wild_draw4:         4,
    wild_reverse_draw4: 4,
    wild_draw6:         6,
    wild_draw10:        10,
};

export function clientCanPlay(
    card: Card,
    topCard: Card,
    chosenColor: CardColor | null,
    drawStack: number,
): boolean {
    if (drawStack > 0) {
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
