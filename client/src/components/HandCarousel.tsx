// ============================================================
// Hand Carousel — touch-device hand UX
//
// A horizontally scrollable, snap-to-card fan. The card nearest
// the viewport center is upright, raised, and highlighted; tap it
// to play (or flick it up). Tapping an off-center card scrolls it
// to center. Cover-flow transforms are written imperatively on
// scroll (rAF-guarded) so no React renders happen per frame.
// ============================================================

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Card } from '@shared/types';
import { CardComponent } from './Card';
import { play } from '../sound';

interface Props {
    cards: Card[];
    isPlayable: (card: Card) => boolean;
    onPlay: (card: Card) => void;
    isMyTurn: boolean;
}

const SETTLE_MS = 150;
const SHAKE_MS = 300;
/** Degrees between adjacent cards on the wheel */
const ANGLE_PER_CARD = 14;
/** Cards beyond this tilt bunch up at the fan's fixed edges */
const MAX_ANGLE = 60;

export function HandCarousel({ cards, isPlayable, onPlay, isMyTurn }: Props) {
    const reducedMotion = useReducedMotion();
    const trackRef = useRef<HTMLDivElement>(null);
    const slotRefs = useRef(new Map<string, HTMLDivElement>());
    const xformRefs = useRef(new Map<string, HTMLDivElement>());

    const [focusedIdx, setFocusedIdx] = useState(0);
    const [settled, setSettled] = useState(true);
    const [shakeCardId, setShakeCardId] = useState<string | null>(null);

    const stepRef = useRef(0);
    const focusedIdxRef = useRef(0);
    const rafPending = useRef(false);
    const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const touchingRef = useRef(false);

    // Stagger the deal-in only on the very first render of the hand
    const isInitialDeal = useRef(true);
    useEffect(() => { isInitialDeal.current = false; }, []);

    const cardsRef = useRef(cards);
    cardsRef.current = cards;

    // ── Geometry ─────────────────────────────────────────────

    const measureStep = () => {
        const anySlot = slotRefs.current.values().next().value as HTMLDivElement | undefined;
        if (anySlot && anySlot.offsetWidth > 0) stepRef.current = anySlot.offsetWidth;
        return stepRef.current;
    };

    /**
     * Half-circle wheel transforms, driven by scrollLeft.
     *
     * The fan is ANCHORED at the viewport center: every card is placed
     * at its true wheel position (x = R·sinθ, y = R·(1−cosθ), tilt θ),
     * where θ comes from its distance to the scroll center. The
     * translateX cancels the slot strip's linear slide, so swiping
     * doesn't shove the whole deck sideways — it rotates the wheel and
     * the next card sweeps up to the apex. Distant cards bunch at the
     * wheel's edges and sink below the clip line.
     */
    const applyTransforms = () => {
        const track = trackRef.current;
        const step = stepRef.current || measureStep();
        if (!track || !step) return;
        const center = track.scrollLeft / step;
        // Visual wheel radius, deliberately DECOUPLED from the scroll
        // step: the fan is a compact held-hand shape pinned at the
        // viewport center, and its edges never move. (Deriving R from
        // the step makes R·sinθ ≈ the linear slide, which is exactly
        // the whole-deck drift this replaces.)
        const cardW = step / 0.62; // slots are --card-w * 0.62 wide
        const R = cardW * 1.8;
        // Small hands spread to fill the whole fan window so the arc's
        // ends stay pinned at the clamps while scrolling; big hands use
        // the base angle and bunch at the edges.
        const n = cardsRef.current.length;
        const anglePer = Math.min(30, Math.max(ANGLE_PER_CARD, (2 * MAX_ANGLE) / Math.max(n - 1, 1)));

        cardsRef.current.forEach((card, i) => {
            const slot = slotRefs.current.get(card.id);
            const xform = xformRefs.current.get(card.id);
            if (!slot || !xform) return;
            const d = i - center;
            const ad = Math.abs(d);

            slot.style.zIndex = String(Math.max(0, 100 - Math.round(ad * 10)));
            slot.classList.toggle('is-focused', ad < 0.5);

            if (reducedMotion) {
                xform.style.transform = '';
                return;
            }
            const thetaDeg = Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, d * anglePer));
            const theta = (thetaDeg * Math.PI) / 180;
            const lift = Math.max(0, 1 - ad);
            // True wheel placement, cancelling the slot strip's linear
            // slide (d·step): swiping rotates cards through the fixed
            // fan positions instead of shoving the deck sideways.
            const x = R * Math.sin(theta) - d * step;
            const y = R * (1 - Math.cos(theta)) - lift * 14;
            const scale = 1 + lift * 0.14;
            xform.style.transform = `translateX(${x.toFixed(2)}px) translateY(${y.toFixed(2)}px) rotate(${thetaDeg.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
        });
    };

    const currentIndex = () => {
        const track = trackRef.current;
        const step = stepRef.current;
        if (!track || !step) return 0;
        return Math.max(0, Math.min(cardsRef.current.length - 1, Math.round(track.scrollLeft / step)));
    };

    const scrollToIndex = (i: number, smooth: boolean) => {
        const track = trackRef.current;
        const step = stepRef.current || measureStep();
        if (!track || !step) return;
        track.scrollTo({ left: i * step, behavior: smooth && !reducedMotion ? 'smooth' : 'auto' });
    };

    // ── Scroll handling ──────────────────────────────────────

    const handleScroll = () => {
        if (!rafPending.current) {
            rafPending.current = true;
            requestAnimationFrame(() => {
                rafPending.current = false;
                applyTransforms();
                const idx = currentIndex();
                if (idx !== focusedIdxRef.current) {
                    focusedIdxRef.current = idx;
                    setFocusedIdx(idx);
                }
            });
        }
        // Hide tooltip while moving; re-show once the scroll settles
        setSettled(false);
        if (settleTimer.current) clearTimeout(settleTimer.current);
        settleTimer.current = setTimeout(() => setSettled(true), SETTLE_MS);
    };

    useEffect(() => {
        const track = trackRef.current;
        if (!track) return;
        // scrollend is more precise where supported; debounce covers the rest
        const onScrollEnd = () => setSettled(true);
        track.addEventListener('scrollend', onScrollEnd);
        const onTouchStart = () => { touchingRef.current = true; };
        const onTouchEnd = () => { touchingRef.current = false; };
        track.addEventListener('touchstart', onTouchStart, { passive: true });
        track.addEventListener('touchend', onTouchEnd, { passive: true });
        track.addEventListener('touchcancel', onTouchEnd, { passive: true });
        return () => {
            track.removeEventListener('scrollend', onScrollEnd);
            track.removeEventListener('touchstart', onTouchStart);
            track.removeEventListener('touchend', onTouchEnd);
            track.removeEventListener('touchcancel', onTouchEnd);
        };
    }, []);

    // Re-measure on resize (card size is viewport-relative)
    useEffect(() => {
        const track = trackRef.current;
        if (!track) return;
        const ro = new ResizeObserver(() => {
            const prevIdx = focusedIdxRef.current;
            measureStep();
            scrollToIndex(prevIdx, false);
            applyTransforms();
        });
        ro.observe(track);
        return () => ro.disconnect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Mount: start centered (or on first playable if it's our turn) ──
    const mountedRef = useRef(false);
    useLayoutEffect(() => {
        if (mountedRef.current) return;
        mountedRef.current = true;
        measureStep();
        const first = isMyTurn ? cards.findIndex(isPlayable) : -1;
        const target = first >= 0 ? first : Math.floor((cards.length - 1) / 2);
        focusedIdxRef.current = Math.max(0, target);
        setFocusedIdx(focusedIdxRef.current);
        scrollToIndex(focusedIdxRef.current, false);
        applyTransforms();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Keep focus stable when the hand changes ──────────────
    const prevIdsRef = useRef<string[]>(cards.map(c => c.id));
    const idsKey = cards.map(c => c.id).join('|');

    useLayoutEffect(() => {
        const prevIds = prevIdsRef.current;
        const ids = cards.map(c => c.id);
        prevIdsRef.current = ids;
        if (ids.join('|') === prevIds.join('|')) return;

        measureStep();
        const prevFocusedId = prevIds[Math.min(focusedIdxRef.current, prevIds.length - 1)];
        const stillThere = ids.indexOf(prevFocusedId);

        let target: number;
        if (stillThere >= 0) {
            // Cards added/removed elsewhere — keep the same card under the thumb
            target = stillThere;
        } else {
            // The focused card left (we played it) — its neighbor slides in
            target = Math.max(0, Math.min(focusedIdxRef.current, ids.length - 1));
        }
        focusedIdxRef.current = target;
        setFocusedIdx(target);
        scrollToIndex(target, false);
        applyTransforms();

        // Self-draw: glide over to the newest card once things settle
        const added = ids.filter(id => !prevIds.includes(id));
        if (added.length > 0 && prevIds.length > 0) {
            const newest = ids.indexOf(added[added.length - 1]);
            setTimeout(() => {
                if (!touchingRef.current && newest < cardsRef.current.length) {
                    focusedIdxRef.current = newest;
                    setFocusedIdx(newest);
                    scrollToIndex(newest, true);
                }
            }, 250);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [idsKey]);

    // ── Your turn: auto-center the first playable card ───────
    const prevMyTurn = useRef(isMyTurn);
    useEffect(() => {
        if (isMyTurn && !prevMyTurn.current) {
            const first = cards.findIndex(isPlayable);
            if (first >= 0) {
                focusedIdxRef.current = first;
                setFocusedIdx(first);
                scrollToIndex(first, true);
            }
        }
        prevMyTurn.current = isMyTurn;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isMyTurn]);

    // ── Tap semantics ────────────────────────────────────────

    const handleCardTap = (card: Card, i: number) => {
        if (i !== focusedIdxRef.current) {
            scrollToIndex(i, true);
            return;
        }
        if (isPlayable(card)) {
            onPlay(card);
        } else {
            play('error');
            setShakeCardId(card.id);
            setTimeout(() => setShakeCardId(null), SHAKE_MS);
        }
    };

    // ── Render ───────────────────────────────────────────────

    return (
        <div
            id="player-hand"
            ref={trackRef}
            className="hand-carousel w-full"
            onScroll={handleScroll}
        >
            <div className="carousel-spacer" aria-hidden />
            {cards.map((card, i) => {
                const playable = isPlayable(card);
                const focused = i === focusedIdx;
                return (
                    <div
                        key={card.id}
                        className="carousel-slot"
                        ref={el => {
                            if (el) slotRefs.current.set(card.id, el);
                            else slotRefs.current.delete(card.id);
                        }}
                    >
                        <div
                            className={`carousel-xform${shakeCardId === card.id ? ' shake' : ''}`}
                            ref={el => {
                                if (el) xformRefs.current.set(card.id, el);
                                else xformRefs.current.delete(card.id);
                            }}
                        >
                            <CardComponent
                                card={card}
                                playable={playable}
                                onAction={() => handleCardTap(card, i)}
                                dealing
                                dealDelay={isInitialDeal.current ? i * 40 : 0}
                                dragMode={focused && playable ? 'vertical' : 'none'}
                                onPlayDrop={playable ? () => onPlay(card) : undefined}
                                showDescription={focused && settled}
                                hoverable={false}
                            />
                        </div>
                    </div>
                );
            })}
            <div className="carousel-spacer" aria-hidden />
        </div>
    );
}
