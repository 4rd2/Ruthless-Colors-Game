// ============================================================
// useSoundEffects — maps game events to synthesized sounds.
//
// Own plays/draws are voiced immediately in GameBoard's handlers
// (no server round-trip lag), so isSelf events are skipped here.
// ============================================================

import { useEffect } from 'react';
import { CardValue } from '@shared/types';
import { gameEvents } from '../lib/gameEvents';
import { play } from '../sound';

export function useSoundEffects(): void {
    useEffect(() => {
        const unsubs = [
            gameEvents.on('card_played', ({ card, isSelf }) => {
                if (isSelf) return; // voiced optimistically in GameBoard
                play(card.value === CardValue.WildParry ? 'parry' : 'cardPlay');
            }),
            gameEvents.on('cards_drawn', ({ isSelf, count }) => {
                if (isSelf) return;
                play('cardDraw', { intensity: count });
            }),
            gameEvents.on('stack_changed', ({ from, to }) => {
                if (to > from && to > 0) play('stack', { intensity: to });
            }),
            gameEvents.on('turn_changed', ({ isSelf }) => {
                if (isSelf) play('turn');
            }),
            gameEvents.on('hands_swapped', () => play('swap')),
            gameEvents.on('hands_passed', () => play('swap')),
            gameEvents.on('roulette_reveal', () => play('roulette')),
            gameEvents.on('player_eliminated', () => play('elimination')),
            gameEvents.on('game_over', ({ isSelf }) => play(isSelf ? 'victory' : 'defeat')),
            gameEvents.on('play_rejected', () => play('error')),
        ];
        return () => unsubs.forEach((off) => off());
    }, []);
}
