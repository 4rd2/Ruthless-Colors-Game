// ============================================================
// Card Component
// ============================================================

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Card } from '@shared/types';
import { VALUE_DISPLAY, CARD_DESCRIPTIONS } from '../utils';
import './cards.css';

interface CardProps {
    card: Card;
    /** undefined = neutral (no highlight), true = playable, false = dimmed */
    playable?: boolean;
    selected?: boolean;
    /** First click selects, second click plays */
    onAction?: () => void;
    dealing?: boolean;
    dealDelay?: number;
    style?: React.CSSProperties;
}

export function CardComponent({ card, playable, selected, onAction, dealing, dealDelay, style }: CardProps) {
    const cardRef  = useRef<HTMLDivElement>(null);
    const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

    const display     = VALUE_DISPLAY[card.value] ?? card.value;
const description = CARD_DESCRIPTIONS[card.value] ?? 'Click to select, click again to play.';
    const colorClass  = `color-${card.color}`;

    const classes = [
        'rc-card',
        colorClass,
        playable === true  && 'playable',
        playable === false && 'not-playable',
        selected           && 'selected',
        dealing            && 'dealing',
    ].filter(Boolean).join(' ');

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (onAction) onAction();
    };

    const showTooltip = () => {
        if (!cardRef.current) return;
        const rect = cardRef.current.getBoundingClientRect();
        setTooltipPos({ x: rect.left + rect.width / 2, y: rect.top - 8 });
    };

    const startHold = (e: React.MouseEvent | React.TouchEvent) => {
        if ('button' in e && e.button !== 0) return;
        holdTimer.current = setTimeout(showTooltip, 400);
    };

    const endHold = () => {
        if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
        setTooltipPos(null);
    };

    const animDelay = dealing && dealDelay ? { animationDelay: `${dealDelay}ms` } : {};

    return (
        <>
            <div
                ref={cardRef}
                className={classes}
                style={{ ...style, ...animDelay }}
                onClick={handleClick}
                onMouseDown={startHold}
                onMouseUp={endHold}
                onMouseLeave={endHold}
                onTouchStart={startHold}
                onTouchEnd={endHold}
                onTouchCancel={endHold}
                data-card-id={card.id}
            >
                <span>{display}</span>
                <span>{display}</span>
                <span>{display}</span>
            </div>

            {tooltipPos && createPortal(
                <div style={{ left: tooltipPos.x, top: tooltipPos.y }}>
                    {description}
                </div>,
                document.body,
            )}
        </>
    );
}

// ── Card back (draw pile / opponent cards) ──────────────────

interface CardBackProps {
    onClick?: () => void;
    disabled?: boolean;
    style?: React.CSSProperties;
}

export function CardBack({ onClick, disabled, style }: CardBackProps) {
    const classes = [
        'rc-card card-back',
        onClick && !disabled && 'draw-pile-card',
        disabled && 'opacity-50 !cursor-default',
    ].filter(Boolean).join(' ');

    return (
        <div
            className={classes}
            style={style}
            onClick={!disabled ? onClick : undefined}
        >
            <div />
            <span>RC</span>
        </div>
    );
}
