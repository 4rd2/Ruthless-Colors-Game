// ============================================================
// Card Component
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, PanInfo } from 'framer-motion';
import { Card } from '@shared/types';
import { VALUE_DISPLAY, CARD_DESCRIPTIONS } from '../utils';
import './cards.css';

export type CardDragMode = 'free' | 'vertical' | 'none';

interface CardProps {
    card: Card;
    /** undefined = neutral (no highlight), true = playable, false = dimmed */
    playable?: boolean;
    /** Plays the card (or selects it — the parent decides) */
    onAction?: () => void;
    /** Animate in from below on mount */
    dealing?: boolean;
    dealDelay?: number;
    style?: React.CSSProperties;
    /**
     * 'free' = drag anywhere (desktop fan), 'vertical' = drag-y only so
     * horizontal swipes keep scrolling the carousel, 'none' = no drag.
     */
    dragMode?: CardDragMode;
    onPlayDrop?: () => void;
    onDragStart?: () => void;
    onDragEnd?: () => void;
    /** Show the description tooltip (carousel focused card) */
    showDescription?: boolean;
    /** Allow the desktop hover lift (default true) */
    hoverable?: boolean;
}

/** Flicking the focused card up at least this far plays it */
const FLICK_UP_THRESHOLD = -60;

export function CardComponent({
    card, playable, onAction, dealing, dealDelay, style,
    dragMode = 'none', onPlayDrop, onDragStart, onDragEnd,
    showDescription, hoverable = true,
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
        if (onAction) onAction();
    };

    const showTooltip = () => {
        if (!cardRef.current) return;
        const rect = cardRef.current.getBoundingClientRect();
        setTooltipPos({ x: rect.left + rect.width / 2, y: rect.top - 8 });
    };

    // The carousel's focused card shows its description once settled
    useEffect(() => {
        if (showDescription) {
            const t = setTimeout(showTooltip, 120); // let the lift settle a bit
            return () => clearTimeout(t);
        }
        setTooltipPos(null);
    }, [showDescription]);

    const startHold = (e: React.MouseEvent | React.TouchEvent) => {
        if ('button' in e && e.button !== 0) return;
        holdTimer.current = setTimeout(showTooltip, 400);
    };

    const endHold = () => {
        if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
        if (!showDescription) setTooltipPos(null);
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
        if (dragMode === 'none' || !onPlayDrop) return;

        // Vertical mode: an upward flick counts as a play
        if (dragMode === 'vertical' && info.offset.y < FLICK_UP_THRESHOLD) {
            onPlayDrop();
            return;
        }

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
                drag={dragMode === 'free' ? true : dragMode === 'vertical' ? 'y' : false}
                dragSnapToOrigin={true}
                dragConstraints={dragMode === 'vertical' ? { top: -48, bottom: 0 } : undefined}
                dragElastic={dragMode === 'vertical' ? 0.15 : undefined}
                initial={dealing ? { opacity: 0, y: 30, scale: 0.85, rotate: -4 } : false}
                animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
                transition={{
                    duration: 0.28,
                    delay: dealing && dealDelay ? dealDelay / 1000 : 0,
                    ease: [0.34, 1.4, 0.64, 1],
                }}
                whileHover={playable && hoverable ? { y: -12, scale: 1.04 } : undefined}
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
