// ============================================================
// Card Component
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, PanInfo } from 'framer-motion';
import { Card } from '@shared/types';
import { VALUE_DISPLAY, CARD_DESCRIPTIONS } from '../utils';
import './cards.css';

interface CardProps {
    card: Card;
    /** undefined = neutral (no highlight), true = playable, false = dimmed */
    playable?: boolean;
    /** Plays the card (single click on desktop, confirm tap on touch) */
    onAction?: () => void;
    /** Animate in from below on mount */
    dealing?: boolean;
    dealDelay?: number;
    style?: React.CSSProperties;
    draggable?: boolean;
    onPlayDrop?: () => void;
    onDragStart?: () => void;
    onDragEnd?: () => void;
    /** Touch mode: first tap raises the card, second tap plays it */
    requireConfirm?: boolean;
    raised?: boolean;
    /** Toggle the raised state (touch mode) */
    onRaise?: () => void;
}

export function CardComponent({
    card, playable, onAction, dealing, dealDelay, style,
    draggable, onPlayDrop, onDragStart, onDragEnd,
    requireConfirm, raised, onRaise,
}: CardProps) {
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
    ].filter(Boolean).join(' ');

    const hasDragged = useRef(false);

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (hasDragged.current) return;
        if (requireConfirm) {
            if (raised && playable && onAction) {
                onAction();
            } else {
                onRaise?.();
            }
            return;
        }
        if (onAction) onAction();
    };

    const showTooltip = () => {
        if (!cardRef.current) return;
        const rect = cardRef.current.getBoundingClientRect();
        setTooltipPos({ x: rect.left + rect.width / 2, y: rect.top - 8 });
    };

    // Raised cards (touch mode) show their description automatically
    useEffect(() => {
        if (raised) {
            const t = setTimeout(showTooltip, 120); // after the lift settles a bit
            return () => clearTimeout(t);
        }
        setTooltipPos(null);
    }, [raised]);

    const startHold = (e: React.MouseEvent | React.TouchEvent) => {
        if ('button' in e && e.button !== 0) return;
        holdTimer.current = setTimeout(showTooltip, 400);
    };

    const endHold = () => {
        if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
        if (!raised) setTooltipPos(null);
    };

    const handleDragStart = () => {
        if (cardRef.current) {
            cardRef.current.style.zIndex = '9999';
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

    return (
        <>
            <motion.div
                layoutId={card.id}
                drag={draggable}
                dragSnapToOrigin={true}
                initial={dealing ? { opacity: 0, y: 30, scale: 0.85, rotate: -4 } : false}
                animate={{
                    opacity: 1,
                    y: raised ? -28 : 0,
                    scale: raised ? 1.12 : 1,
                    rotate: 0,
                }}
                transition={{
                    duration: 0.28,
                    delay: dealing && dealDelay ? dealDelay / 1000 : 0,
                    ease: [0.34, 1.4, 0.64, 1],
                }}
                whileHover={playable && !requireConfirm ? { y: -12, scale: 1.04 } : undefined}
                whileDrag={{ scale: 1.15, rotate: card.id.charCodeAt(0) % 2 === 0 ? 4 : -4 }}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                ref={cardRef}
                className={classes}
                style={style}
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
                <div
                    className="pointer-events-none fixed z-[80] max-w-52 -translate-x-1/2 -translate-y-full rounded-lg border border-zinc-700 bg-zinc-900/95 px-3 py-2 text-center text-xs text-zinc-200 shadow-xl"
                    style={{ left: tooltipPos.x, top: tooltipPos.y }}
                >
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
