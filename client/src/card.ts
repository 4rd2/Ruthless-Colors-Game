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

const CARD_DESCRIPTIONS: Record<string, string> = {
    [CardValue.Zero]: 'Pass all hands in the current direction.',
    [CardValue.One]: 'Number card — match by color or value.',
    [CardValue.Two]: 'Number card — match by color or value.',
    [CardValue.Three]: 'Number card — match by color or value.',
    [CardValue.Four]: 'Number card — match by color or value.',
    [CardValue.Five]: 'Number card — match by color or value.',
    [CardValue.Six]: 'Number card — match by color or value.',
    [CardValue.Seven]: 'Swap your hand with any other player.',
    [CardValue.Eight]: 'Number card — match by color or value.',
    [CardValue.Nine]: 'Number card — match by color or value.',
    [CardValue.Skip]: 'Skip the next player\'s turn.',
    [CardValue.Reverse]: 'Reverse play direction. Acts as Skip in 2-player.',
    [CardValue.DrawTwo]: 'Next player draws 2 cards. Can be stacked!',
    [CardValue.DiscardAll]: 'Discard all cards of this color from your hand.',
    [CardValue.SkipEveryone]: 'Skip all players — you go again!',
    [CardValue.WildDrawFour]: 'Choose a color. Next player draws 4. Stackable!',
    [CardValue.WildDrawSix]: 'Choose a color. Next player draws 6. Stackable!',
    [CardValue.WildDrawTen]: 'Choose a color. Next player draws 10. Stackable!',
    [CardValue.WildColorRoulette]: 'Choose a color. Next player draws until they hit it!',
    [CardValue.WildReverseDrawFour]: 'Reverse direction, choose color, +4 to next. Stackable!',
    [CardValue.WildParry]: 'Reflect the draw stack back to the attacker! Choose a color.',
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

/** Attach hold-to-describe tooltip behavior to a card element */
function setupHoldToDescribe(el: HTMLElement, card: Card): void {
    const description = CARD_DESCRIPTIONS[card.value] || 'Play this card.';
    let holdTimer: ReturnType<typeof setTimeout> | null = null;
    let tooltip: HTMLElement | null = null;

    function showTooltip() {
        hideTooltip();

        tooltip = document.createElement('div');
        tooltip.className = 'card-tooltip';
        tooltip.textContent = description;

        document.body.appendChild(tooltip);

        // Position above the card
        const rect = el.getBoundingClientRect();
        tooltip.style.left = `${rect.left + rect.width / 2}px`;
        tooltip.style.top = `${rect.top - 8}px`;
    }

    function hideTooltip() {
        if (tooltip) {
            tooltip.remove();
            tooltip = null;
        }
    }

    function startHold(e: Event) {
        if (e instanceof MouseEvent && e.button !== 0) return;
        holdTimer = setTimeout(() => showTooltip(), 400);
    }

    function endHold() {
        if (holdTimer) {
            clearTimeout(holdTimer);
            holdTimer = null;
        }
        hideTooltip();
    }

    // Mouse events
    el.addEventListener('mousedown', startHold);
    el.addEventListener('mouseup', endHold);
    el.addEventListener('mouseleave', endHold);

    // Touch events (for mobile)
    el.addEventListener('touchstart', startHold, { passive: true });
    el.addEventListener('touchend', endHold);
    el.addEventListener('touchcancel', endHold);
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

    // Hold-to-describe tooltip
    setupHoldToDescribe(el, card);

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
