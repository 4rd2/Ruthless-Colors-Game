// ============================================================
// Lobby Screen
// ============================================================

import { useState, useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { C2S } from '@shared/events';
import { AppState } from '../App';



// ── Divider ─────────────────────────────────────────────────

function Divider({ label }: { label: string }) {
    return (
        <div>
            <div />
            <span>{label}</span>
            <div />
        </div>
    );
}

// ── Error box ───────────────────────────────────────────────

function ErrorBox({ message }: { message: string | null }) {
    if (!message) return null;
    return (
        <div>
            {message}
        </div>
    );
}

// ── Title ───────────────────────────────────────────────────

function Title({ subtitle }: { subtitle?: string }) {
    return (
        <div>
            <h1>
                RUTHLESS COLORS
            </h1>
            {subtitle && <p>{subtitle}</p>}
        </div>
    );
}

// ── Props ───────────────────────────────────────────────────

interface Props {
    socket: Socket;
    state: AppState;
    patchState: (p: Partial<AppState>) => void;
}

// ── Main component ──────────────────────────────────────────

export default function LobbyScreen({ socket, patchState }: Props) {
    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [error, setError] = useState<string | null>(null);
    const nameRef = useRef<HTMLInputElement>(null);

    // Invite-URL flow state
    const [urlRoom, setUrlRoom]       = useState<string | null>(null);
    const [checking, setChecking]     = useState(false);
    const [roomCheck, setRoomCheck]   = useState<{ exists: boolean; gameStarted: boolean } | null>(null);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const room   = params.get('room');
        if (room) {
            setUrlRoom(room.toUpperCase());
            setChecking(true);
            socket.emit(C2S.CHECK_ROOM, room.toUpperCase(), (res: { exists: boolean; gameStarted: boolean }) => {
                setChecking(false);
                setRoomCheck(res);
            });
        }
        setTimeout(() => nameRef.current?.focus(), 100);
    }, [socket]);

    // Auto-clear error
    useEffect(() => {
        if (!error) return;
        const t = setTimeout(() => setError(null), 4000);
        return () => clearTimeout(t);
    }, [error]);

    const showError = (msg: string) => setError(msg);

    const goHome = () => {
        const url = new URL(window.location.href);
        url.searchParams.delete('room');
        window.history.pushState({}, '', url.toString());
        setUrlRoom(null);
        setRoomCheck(null);
        setError(null);
    };

    // ── Emit helpers ────────────────────────────────────────

    const handleCreate = () => {
        if (!name.trim()) { showError('Please enter your name'); return; }
        socket.emit(C2S.CREATE_ROOM, { playerName: name.trim() }, (res: any) => {
            if (res.error) { showError(res.error); return; }
            const url = new URL(window.location.href);
            url.searchParams.set('room', res.roomCode);
            window.history.pushState({}, '', url.toString());
            patchState({ playerId: res.playerId, playerName: name.trim(), roomCode: res.roomCode, lobby: res.lobby, screen: 'waiting' });
        });
    };

    const handleJoin = () => {
        if (!name.trim()) { showError('Please enter your name'); return; }
        if (!code.trim()) { showError('Please enter a room code'); return; }
        const roomCode = code.trim().toUpperCase();
        socket.emit(C2S.JOIN_ROOM, { roomCode, playerName: name.trim() }, (res: any) => {
            if (res.error) { showError(res.error); return; }
            const url = new URL(window.location.href);
            url.searchParams.set('room', res.roomCode);
            window.history.pushState({}, '', url.toString());
            patchState({ playerId: res.playerId, playerName: name.trim(), roomCode: res.roomCode, lobby: res.lobby, screen: 'waiting' });
        });
    };

    const handleRejoin = () => {
        if (!name.trim()) { showError('Please enter your name to rejoin'); return; }
        if (!code.trim()) { showError('Please enter the room code to rejoin'); return; }
        const roomCode = code.trim().toUpperCase();
        socket.emit(C2S.REJOIN_BY_NAME, { roomCode, playerName: name.trim() }, (res: any) => {
            if (res.error) { showError(res.error); return; }
            const url = new URL(window.location.href);
            url.searchParams.set('room', res.roomCode);
            window.history.pushState({}, '', url.toString());
            patchState({ playerId: res.playerId, playerName: name.trim(), roomCode: res.roomCode, lobby: res.lobby, screen: res.gameInProgress ? 'game' : 'waiting' });
        });
    };

    const handleInviteAction = () => {
        if (!name.trim()) { showError('Please enter your name'); return; }
        const roomCode = urlRoom!;
        if (roomCheck?.gameStarted) {
            socket.emit(C2S.REJOIN_BY_NAME, { roomCode, playerName: name.trim() }, (res: any) => {
                if (res.error) { showError(res.error); return; }
                patchState({ playerId: res.playerId, playerName: name.trim(), roomCode: res.roomCode, lobby: res.lobby, screen: res.gameInProgress ? 'game' : 'waiting' });
            });
        } else {
            socket.emit(C2S.JOIN_ROOM, { roomCode, playerName: name.trim() }, (res: any) => {
                if (res.error) { showError(res.error); return; }
                patchState({ playerId: res.playerId, playerName: name.trim(), roomCode: res.roomCode, lobby: res.lobby, screen: 'waiting' });
            });
        }
    };

    // ── Invite-URL: checking ────────────────────────────────

    if (urlRoom && checking) {
        return (
            <div>
                <div>
                    <Title subtitle="Checking game status..." />
                </div>
            </div>
        );
    }

    // ── Invite-URL: room not found ──────────────────────────

    if (urlRoom && roomCheck && !roomCheck.exists) {
        return (
            <div>
                <div>
                    <Title />
                    <p>Room not found or game has ended.</p>
                    <button style={{ width: 'auto', padding: '12px 24px' }} onClick={goHome}>
                        Back to Home
                    </button>
                </div>
            </div>
        );
    }

    // ── Invite-URL: join form ───────────────────────────────

    if (urlRoom && roomCheck?.exists) {
        return (
            <div>
                <div>
                    <Title
                        subtitle={`You've been invited to room `}
                    />
                    <p>
                        Room{' '}
                        <span>
                            {urlRoom}
                        </span>
                    </p>

                    <div>
                        <input
                            ref={nameRef}
                            type="text"
                            placeholder="Your name"
                            maxLength={16}
                            autoComplete="off"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleInviteAction()}
                        />
                        <button
                            onClick={handleInviteAction}
                        >
                            {roomCheck.gameStarted ? '🔄 Rejoin Game' : 'Join Game'}
                        </button>
                        <ErrorBox message={error} />
                        <Divider label="or" />
                        <button style={{ opacity: 0.8 }} onClick={goHome}>
                            Go to Main Menu
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ── Standard lobby ──────────────────────────────────────

    return (
        <div>
            <div>
                <Title subtitle="Brutal. Stackable. No mercy given." />

                <div>
                    <input
                        ref={nameRef}
                        type="text"
                        placeholder="Your name"
                        maxLength={16}
                        autoComplete="off"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleCreate()}
                    />
                    <button onClick={handleCreate}>
                        Create Game
                    </button>

                    <Divider label="or join a game" />

                    <input
                        type="text"
                        placeholder="Enter room code"
                        maxLength={6}
                        autoComplete="off"
                        value={code}
                        onChange={e => setCode(e.target.value.toUpperCase())}
                        onKeyDown={e => e.key === 'Enter' && handleJoin()}
                        style={{ textTransform: 'uppercase', letterSpacing: '4px', textAlign: 'center' }}
                    />
                    <button onClick={handleJoin}>
                        Join Game
                    </button>

                    <Divider label="or rejoin a game" />

                    <button onClick={handleRejoin}>
                        🔄 Rejoin Game
                    </button>

                    <ErrorBox message={error} />
                </div>
            </div>
        </div>
    );
}
