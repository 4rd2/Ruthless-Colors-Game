// ============================================================
// Card Rendering Component
// ============================================================

import { Card, CardColor, CardValue } from '../../shared/types';

const VALUE_DISPLAY: Record<string, string> = {
    [CardValue.Zero]: '0',
    [CardValue.One]: '1',
    [CardValue.Two]: '2',
    [CardValue.Three]: '3',
    [CardValue.Four]: '4',
    [CardValue.Five]: '5',
    [CardValue.Six]: '6',
    [CardValue.Seven]: '7',
    [CardValue.Eight]: '8',
    [CardValue.Nine]: '9',
    [CardValue.Skip]: '⊘',
    [CardValue.Reverse]: '⇄',
    [CardValue.DrawTwo]: '+2',
    [CardValue.DiscardAll]: '✕ALL',
    [CardValue.SkipEveryone]: '⊘ALL',
    [CardValue.WildDrawFour]: '+4',
    [CardValue.WildDrawSix]: '+6',
    [CardValue.WildDrawTen]: '+10',
    [CardValue.WildColorRoulette]: '🎰',
    [CardValue.WildReverseDrawFour]: '⇄+4',
    [CardValue.WildParry]: '🛡️',
};

const COLOR_CLASS: Record<string, string> = {
    [CardColor.Red]: 'color-red',
    [CardColor.Blue]: 'color-blue',
    [CardColor.Green]: 'color-green',
    [CardColor.Yellow]: 'color-yellow',
    [CardColor.Wild]: 'color-wild',
};

function isSmallText(value: CardValue): boolean {
    return [
        CardValue.DiscardAll,
        CardValue.SkipEveryone,
        CardValue.WildColorRoulette,
        CardValue.WildReverseDrawFour,
        CardValue.WildParry,
    ].includes(value);
}

/** Create a card DOM element */
export function createCardElement(
    card: Card,
    options: {
        playable?: boolean;
        onClick?: (card: Card) => void;
        dealing?: boolean;
        dealDelay?: number;
    } = {},
): HTMLElement {
    const el = document.createElement('div');
    el.className = `rc-card ${COLOR_CLASS[card.color] || 'color-wild'}`;
    el.dataset.cardId = card.id;

    if (options.playable === true) {
        el.classList.add('playable');
    } else if (options.playable === false) {
        el.classList.add('not-playable');
    }

    if (options.dealing) {
        el.classList.add('dealing');
        if (options.dealDelay) {
            el.style.animationDelay = `${options.dealDelay}ms`;
        }
    }

    const display = VALUE_DISPLAY[card.value] || card.value;
    const smallClass = isSmallText(card.value) ? ' small-text' : '';

    el.innerHTML = `
    <div class="card-inner"></div>
    <span class="card-corner top-left">${display}</span>
    <span class="card-value${smallClass}">${display}</span>
    <span class="card-corner bottom-right">${display}</span>
  `;

    if (options.onClick) {
        el.addEventListener('click', () => options.onClick!(card));
    }

    return el;
}

/** Create a card back element */
export function createCardBackElement(
    options: { small?: boolean; onClick?: () => void; count?: number } = {},
): HTMLElement {
    const el = document.createElement('div');
    el.className = 'rc-card card-back';
    if (options.small) {
        // Opponent mini card
    }

    el.innerHTML = `
    <div class="card-inner"></div>
    <span class="card-value">RC</span>
  `;

    if (options.onClick) {
        el.classList.add('draw-pile-card');
        el.addEventListener('click', options.onClick);
    }

    return el;
}
