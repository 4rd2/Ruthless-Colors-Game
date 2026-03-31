// ============================================================
// Card Component
// ============================================================

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, PanInfo } from 'framer-motion';
import { Card } from '@shared/types';
import { VALUE_DISPLAY, CARD_DESCRIPTIONS } from '../utils';
import './cards.css';

interface CardProps {
    card: Card;
    /** undefined = neutral (no highlight), true = playable, false = dimmed */
    playable?: boolean;
    /** First click plays */
    onAction?: () => void;
    dealing?: boolean;
    dealDelay?: number;
    style?: React.CSSProperties;
    draggable?: boolean;
    onPlayDrop?: () => void;
    onDragStart?: () => void;
    onDragEnd?: () => void;
}

export function CardComponent({ card, playable, onAction, dealing, dealDelay, style, draggable, onPlayDrop, onDragStart, onDragEnd }: CardProps) {
    const cardRef  = useRef<HTMLDivElement>(null);
    const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

    const display     = VALUE_DISPLAY[card.value] ?? card.value;
    const description = CARD_DESCRIPTIONS[card.value] ?? 'Click or drag to play.';
    const colorClass  = `color-${card.color}`;

    const classes = [
        'rc-card',
        colorClass,
        playable === true  && 'playable',
        playable === false && 'not-playable',
        dealing            && 'dealing',
    ].filter(Boolean).join(' ');

    const hasDragged = useRef(false);

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (hasDragged.current) return;
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

    const handleDragStart = () => {
        if (cardRef.current) {
            cardRef.current.style.zIndex = '9999';
            // CSS animations (fill-mode: both) have higher cascade priority than
            // inline styles, so the dealIn animation's held transform overrides
            // framer-motion's drag transform. Strip the class so drag is visible.
            cardRef.current.classList.remove('dealing');
        }
        hasDragged.current = true;
        if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
        setTooltipPos(null);
        if (onDragStart) onDragStart();
    };

    const handleDragEnd = (e: any, info: PanInfo) => {
        if (cardRef.current) {
            cardRef.current.style.zIndex = '';
        }
        setTimeout(() => { hasDragged.current = false; }, 100);
        if (onDragEnd) onDragEnd();
        if (!draggable || !onPlayDrop) return;
        const discardPile = document.getElementById('discard-pile');
        if (discardPile) {
            const rect = discardPile.getBoundingClientRect();
            const { x, y } = info.point;
            // Pad hit area slightly so it feels generous
            if (x >= rect.left - 40 && x <= rect.right + 40 && y >= rect.top - 40 && y <= rect.bottom + 40) {
                onPlayDrop();
            }
        }
    };

    const animDelay = dealing && dealDelay ? { animationDelay: `${dealDelay}ms` } : {};

    return (
        <>
            <motion.div
                layoutId={card.id}
                drag={draggable}
                dragSnapToOrigin={true}
                whileHover={playable ? { y: -12, scale: 1.04 } : undefined}
                whileDrag={{ scale: 1.15, rotate: card.id.charCodeAt(0) % 2 === 0 ? 4 : -4 }}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
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
            </motion.div>

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
