// ============================================================
// Mute Button — fixed top-right, persists across screens
// ============================================================

import { useEffect, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { isMuted, onMuteChange, toggleMuted } from '../sound';

export function MuteButton() {
    const [muted, setMuted] = useState(isMuted);

    useEffect(() => onMuteChange(setMuted), []);

    return (
        <button
            onClick={() => toggleMuted()}
            aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
            className="fixed z-40 flex size-11 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800/80 text-zinc-300 backdrop-blur-sm transition-colors hover:bg-zinc-700 hover:text-white"
            style={{
                top: 'max(0.5rem, env(safe-area-inset-top))',
                right: 'max(0.5rem, env(safe-area-inset-right))',
            }}
        >
            {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
        </button>
    );
}
