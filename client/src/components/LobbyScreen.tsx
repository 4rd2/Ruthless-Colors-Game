// ============================================================
// Lobby Screen
// ============================================================

import { useState, useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { C2S } from '@shared/events';
import { AppState } from '../App';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';



// ── Divider ─────────────────────────────────────────────────

function Divider({ label }: { label: string }) {
    return (
        <div className="relative flex items-center gap-2 my-2">
            <Separator className="flex-1" />
            <span className="text-xs text-zinc-500 shrink-0">{label}</span>
            <Separator className="flex-1" />
        </div>
    );
}

// ── Error box ───────────────────────────────────────────────

function ErrorBox({ message }: { message: string | null }) {
    if (!message) return null;
    return (
        <Alert variant="destructive">
            <AlertDescription>{message}</AlertDescription>
        </Alert>
    );
}

// ── Title ───────────────────────────────────────────────────

function Title({ subtitle }: { subtitle?: string }) {
    return (
        <div className="mb-6 text-center">
            <h1 className="text-4xl font-black tracking-widest uppercase text-white">
                RUTHLESS COLORS
            </h1>
            {subtitle && <p className="mt-1 text-sm text-zinc-400">{subtitle}</p>}
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
            <div className="flex min-h-screen items-center justify-center bg-zinc-900">
                <div className="w-full max-w-sm px-4">
                    <Title subtitle="Checking game status..." />
                </div>
            </div>
        );
    }

    // ── Invite-URL: room not found ──────────────────────────

    if (urlRoom && roomCheck && !roomCheck.exists) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-zinc-900">
                <div className="flex w-full max-w-sm flex-col gap-4 px-4">
                    <Title />
                    <p className="text-center text-sm text-zinc-400">Room not found or game has ended.</p>
                    <Button variant="outline" className="border-blue-700 text-blue-400 hover:bg-blue-900/40 hover:text-blue-300" onClick={goHome}>
                        Back to Home
                    </Button>
                </div>
            </div>
        );
    }

    // ── Invite-URL: join form ───────────────────────────────

    if (urlRoom && roomCheck?.exists) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-zinc-900">
                <div className="w-full max-w-sm px-4">
                    <Title
                        subtitle={`You've been invited to room `}
                    />
                    <p className="mb-4 text-center text-sm text-zinc-400">
                        Room{' '}
                        <span className="font-mono font-bold tracking-widest text-white">
                            {urlRoom}
                        </span>
                    </p>

                    <div className="flex flex-col gap-3">
                        <Input
                            ref={nameRef}
                            type="text"
                            className="text-zinc-100 placeholder:text-zinc-500 bg-zinc-800 border-zinc-700"
                            placeholder="Your name"
                            maxLength={16}
                            autoComplete="off"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleInviteAction()}
                        />
                        <Button className="bg-blue-600 hover:bg-blue-500 text-white border-transparent" onClick={handleInviteAction}>
                            {roomCheck.gameStarted ? '🔄 Rejoin Game' : 'Join Game'}
                        </Button>
                        <ErrorBox message={error} />
                        <Divider label="or" />
                        <Button variant="ghost" className="text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800" onClick={goHome}>
                            Go to Main Menu
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    // ── Standard lobby ──────────────────────────────────────

    return (
        <div className="flex min-h-screen items-center justify-center bg-zinc-900">
            <div className="w-full max-w-sm px-4">
                <Title subtitle="Brutal. Stackable. No mercy given." />

                <div className="flex flex-col gap-3">
                    <Input
                        ref={nameRef}
                        type="text"
                        className="text-zinc-100 placeholder:text-zinc-500 bg-zinc-800 border-zinc-700"
                            placeholder="Your name"
                        maxLength={16}
                        autoComplete="off"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleCreate()}
                    />
                    <Button className="bg-blue-600 hover:bg-blue-500 text-white border-transparent" onClick={handleCreate}>
                        Create Game
                    </Button>

                    <Divider label="or join a game" />

                    <Input
                        type="text"
                        className="text-zinc-100 placeholder:text-zinc-500 bg-zinc-800 border-zinc-700"
                        placeholder="Enter room code"
                        maxLength={6}
                        autoComplete="off"
                        value={code}
                        onChange={e => setCode(e.target.value.toUpperCase())}
                        onKeyDown={e => e.key === 'Enter' && handleJoin()}
                        style={{ textTransform: 'uppercase', letterSpacing: '4px', textAlign: 'center' }}
                    />
                    <Button className="bg-blue-600 hover:bg-blue-500 text-white border-transparent" onClick={handleJoin}>
                        Join Game
                    </Button>

                    <Divider label="or rejoin a game" />

                    <Button variant="outline" className="border-blue-700 text-blue-400 hover:bg-blue-900/40 hover:text-blue-300" onClick={handleRejoin}>
                        🔄 Rejoin Game
                    </Button>

                    <ErrorBox message={error} />
                </div>
            </div>
        </div>
    );
}
