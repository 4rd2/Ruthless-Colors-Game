// ============================================================
// Sound Engine — synthesized Web Audio effects, no asset files
//
// The AudioContext is created lazily on the first user gesture
// (browser autoplay policy; iOS requires a genuine gesture).
// All playback is fire-and-forget and safe to call anytime.
// ============================================================

export type SoundName =
    | 'cardPlay'
    | 'cardDraw'
    | 'stack'
    | 'parry'
    | 'turn'
    | 'swap'
    | 'roulette'
    | 'elimination'
    | 'victory'
    | 'defeat'
    | 'error';

const MUTE_KEY = 'rc:muted';

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let muted = localStorage.getItem(MUTE_KEY) === '1';
const muteListeners = new Set<(muted: boolean) => void>();

// ── Context lifecycle ────────────────────────────────────────

function ensureContext(): void {
    if (ctx) {
        if (ctx.state === 'suspended') void ctx.resume();
        return;
    }
    try {
        ctx = new AudioContext();
        masterGain = ctx.createGain();
        masterGain.gain.value = muted ? 0 : 1;
        masterGain.connect(ctx.destination);

        // Pre-render 0.2s of white noise, reused by every noise burst
        noiseBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.2), ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    } catch {
        ctx = null;
    }
}

/** Call once from main.tsx. Unlocks audio on the first user gesture. */
export function initSound(): void {
    const unlock = () => {
        ensureContext();
        if (ctx && ctx.state !== 'suspended') {
            window.removeEventListener('pointerdown', unlock);
            window.removeEventListener('keydown', unlock);
        }
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    // iOS suspends the context when the tab is backgrounded
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && ctx?.state === 'suspended') {
            void ctx.resume();
        }
    });
}

// ── Mute ─────────────────────────────────────────────────────

export function isMuted(): boolean {
    return muted;
}

export function setMuted(value: boolean): void {
    muted = value;
    localStorage.setItem(MUTE_KEY, value ? '1' : '0');
    if (ctx && masterGain) {
        // Short ramp avoids an audible click
        masterGain.gain.cancelScheduledValues(ctx.currentTime);
        masterGain.gain.setValueAtTime(masterGain.gain.value, ctx.currentTime);
        masterGain.gain.linearRampToValueAtTime(value ? 0 : 1, ctx.currentTime + 0.02);
    }
    for (const fn of muteListeners) fn(muted);
}

export function toggleMuted(): boolean {
    setMuted(!muted);
    return muted;
}

export function onMuteChange(fn: (muted: boolean) => void): () => void {
    muteListeners.add(fn);
    return () => muteListeners.delete(fn);
}

// ── Synthesis primitives ─────────────────────────────────────

/** Filtered white-noise burst — the basis of card flicks and whooshes. */
function noiseBurst(opts: {
    when?: number;
    dur: number;
    filterHz: number;
    filterQ?: number;
    gain: number;
    /** Sweep the bandpass frequency to this value over the duration */
    sweepTo?: number;
}): void {
    if (!ctx || !masterGain || !noiseBuffer) return;
    const t = (opts.when ?? ctx.currentTime);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = opts.dur > 0.2;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(opts.filterHz, t);
    if (opts.sweepTo) filter.frequency.exponentialRampToValueAtTime(opts.sweepTo, t + opts.dur);
    filter.Q.value = opts.filterQ ?? 1;

    const g = ctx.createGain();
    g.gain.setValueAtTime(opts.gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + opts.dur);

    src.connect(filter).connect(g).connect(masterGain);
    src.start(t);
    src.stop(t + opts.dur + 0.02);
}

/** Simple enveloped oscillator tone. */
function tone(opts: {
    when?: number;
    freq: number;
    dur: number;
    type?: OscillatorType;
    gain?: number;
    /** Glide the pitch to this frequency over the duration */
    sweepTo?: number;
}): void {
    if (!ctx || !masterGain) return;
    const t = (opts.when ?? ctx.currentTime);
    const osc = ctx.createOscillator();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(opts.freq, t);
    if (opts.sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.sweepTo), t + opts.dur);

    const g = ctx.createGain();
    const peak = opts.gain ?? 0.15;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + opts.dur);

    osc.connect(g).connect(masterGain);
    osc.start(t);
    osc.stop(t + opts.dur + 0.02);
}

/** Sequence of tones (arpeggios, tick trains). */
function arp(freqs: number[], stepMs: number, opts?: { type?: OscillatorType; dur?: number; gain?: number }): void {
    if (!ctx) return;
    const start = ctx.currentTime;
    freqs.forEach((freq, i) => {
        tone({
            when: start + (i * stepMs) / 1000,
            freq,
            dur: opts?.dur ?? 0.14,
            type: opts?.type ?? 'triangle',
            gain: opts?.gain ?? 0.12,
        });
    });
}

// ── Effect recipes ───────────────────────────────────────────

const recipes: Record<SoundName, (intensity: number) => void> = {
    // Sharp little flick — a card hitting the pile
    cardPlay: () => {
        noiseBurst({ dur: 0.05, filterHz: 1800, filterQ: 0.8, gain: 0.5 });
        noiseBurst({ dur: 0.02, filterHz: 4200, filterQ: 2, gain: 0.25 });
    },

    // Softer slide — pulling a card off the deck
    cardDraw: () => {
        noiseBurst({ dur: 0.07, filterHz: 900, filterQ: 0.7, gain: 0.3 });
    },

    // Low thud + rising saw: tension grows with the stack size
    stack: (intensity) => {
        const size = Math.min(intensity, 20);
        tone({ freq: 90, dur: 0.18, type: 'sine', gain: 0.3, sweepTo: 40 });
        tone({ freq: 220 + size * 22, dur: 0.3, type: 'sawtooth', gain: 0.09, sweepTo: 320 + size * 30 });
    },

    // Metallic clink — the parry reflect
    parry: () => {
        tone({ freq: 2600, dur: 0.12, type: 'square', gain: 0.08 });
        tone({ freq: 3900, dur: 0.25, type: 'sine', gain: 0.1 });
        noiseBurst({ dur: 0.03, filterHz: 6000, filterQ: 3, gain: 0.2 });
    },

    // Two rising ticks — your turn
    turn: () => {
        arp([660, 880], 70, { type: 'sine', dur: 0.09, gain: 0.1 });
    },

    // Whoosh — hands swapping/passing
    swap: () => {
        noiseBurst({ dur: 0.18, filterHz: 400, filterQ: 1.2, gain: 0.35, sweepTo: 2500 });
        noiseBurst({ when: (ctx?.currentTime ?? 0) + 0.18, dur: 0.17, filterHz: 2500, filterQ: 1.2, gain: 0.3, sweepTo: 400 });
    },

    // Accelerating-then-slowing tick train — the roulette spin
    roulette: () => {
        if (!ctx) return;
        const gaps = [0, 200, 360, 490, 590, 670, 740, 820, 930, 1080, 1280];
        const start = ctx.currentTime;
        gaps.forEach((ms, i) => {
            tone({ when: start + ms / 1000, freq: 520 + (i % 2) * 60, dur: 0.05, type: 'square', gain: 0.06 });
        });
        tone({ when: start + 1.5, freq: 1040, dur: 0.3, type: 'triangle', gain: 0.14 });
    },

    // Descending sweep + crash — someone hit the mercy limit
    elimination: () => {
        tone({ freq: 600, dur: 0.5, type: 'sawtooth', gain: 0.14, sweepTo: 120 });
        noiseBurst({ dur: 0.35, filterHz: 500, filterQ: 0.6, gain: 0.3 });
    },

    // Major arpeggio — you win
    victory: () => {
        arp([523.25, 659.25, 783.99, 1046.5], 90, { type: 'triangle', dur: 0.3, gain: 0.14 });
        arp([1046.5, 1318.5], 120, { type: 'sine', dur: 0.5, gain: 0.07 });
    },

    // Minor descent — you lose
    defeat: () => {
        arp([440, 349.23, 261.63], 160, { type: 'triangle', dur: 0.4, gain: 0.12 });
    },

    // Dull thunk — invalid play
    error: () => {
        tone({ freq: 150, dur: 0.12, type: 'square', gain: 0.08, sweepTo: 100 });
    },
};

/** Play a named effect. Safe no-op before the audio unlock or when muted. */
export function play(name: SoundName, opts?: { intensity?: number }): void {
    if (muted) return;
    ensureContext();
    if (!ctx || ctx.state !== 'running' || !masterGain) return;
    try {
        recipes[name](opts?.intensity ?? 1);
    } catch (err) {
        console.warn(`[sound] failed to play "${name}"`, err);
    }
}
