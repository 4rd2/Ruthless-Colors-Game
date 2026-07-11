// ============================================================
// Lobby Screen
// ============================================================

import { useState, useEffect, useRef } from 'react';
import type { Socket } from '../lib/supabase';
import { C2S } from '@shared/events';
import { PublicRoomInfo } from '@shared/types';
import { AppState } from '../App';
import { generateRandomName, withRandomSuffix } from '../lib/randomName';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';

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

// ── Public games list ───────────────────────────────────────

function PublicGamesList({ rooms, onJoin }: {
    rooms: PublicRoomInfo[];
    onJoin: (code: string) => void;
}) {
    if (rooms.length === 0) {
        return (
            <p className="text-center text-xs text-zinc-500">
                No public games right now — create one above.
            </p>
        );
    }
    return (
        <div className="flex max-h-52 flex-col gap-2 overflow-y-auto pr-1">
            {rooms.map(room => (
                <div
                    key={room.code}
                    className="flex items-center justify-between gap-2 rounded-lg border border-zinc-700 bg-zinc-800/70 px-3 py-2"
                >
                    <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-zinc-100">
                            {room.hostName}'s game
                        </p>
                        <p className="font-mono text-xs tracking-widest text-zinc-400">{room.code}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        <Badge className="border-transparent bg-zinc-700 text-zinc-200">
                            {room.playerCount}/{room.maxPlayers}
                        </Badge>
                        <Button
                            size="sm"
                            className="bg-blue-600 text-white border-transparent hover:bg-blue-500"
                            onClick={() => onJoin(room.code)}
                        >
                            Join
                        </Button>
                    </div>
                </div>
            ))}
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
    const [isPublic, setIsPublic] = useState(false);
    const [publicRooms, setPublicRooms] = useState<PublicRoomInfo[]>([]);
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

    // Public games: fetch once + live updates while on the main screen
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('room')) return; // invite flow, no list shown

        socket.emit(C2S.LIST_PUBLIC_ROOMS, {}, (res: any) => {
            if (res?.rooms) setPublicRooms(res.rooms);
        });
        socket.subscribeToPublicLobby((payload) => {
            if (payload?.rooms) setPublicRooms(payload.rooms);
        });
        return () => socket.unsubscribeFromPublicLobby();
    }, [socket]);

    const refreshPublicRooms = () => {
        socket.emit(C2S.LIST_PUBLIC_ROOMS, {}, (res: any) => {
            if (res?.rooms) setPublicRooms(res.rooms);
        });
    };

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

    // Blank name → assigned a random one (shown in the input)
    const resolveName = (): { finalName: string; wasGenerated: boolean } => {
        const trimmed = name.trim();
        if (trimmed) return { finalName: trimmed, wasGenerated: false };
        const generated = generateRandomName();
        setName(generated);
        return { finalName: generated, wasGenerated: true };
    };

    // ── Emit helpers ────────────────────────────────────────

    const handleCreate = () => {
        const { finalName } = resolveName();
        socket.emit(C2S.CREATE_ROOM, { playerName: finalName, isPublic }, (res: any) => {
            if (res.error) { showError(res.error); return; }
            const url = new URL(window.location.href);
            url.searchParams.set('room', res.roomCode);
            window.history.pushState({}, '', url.toString());
            patchState({ playerId: res.playerId, playerName: finalName, roomCode: res.roomCode, lobby: res.lobby, screen: 'waiting' });
        });
    };


    /** Shared by the manual code input, the public list rows, and the invite flow */
    const joinRoomWithCode = (rawCode: string) => {
        const roomCode = rawCode.trim().toUpperCase();
        if (!roomCode) { showError('Please enter a room code'); return; }
        const { finalName, wasGenerated } = resolveName();

        const attempt = (playerName: string, retryLeft: boolean) => {
            socket.emit(C2S.JOIN_ROOM, { roomCode, playerName }, (res: any) => {
                if (res.error) {
                    // Generated name collided — retry once with a numeric suffix
                    if (retryLeft && wasGenerated && res.error.includes('Name already taken')) {
                        const suffixed = withRandomSuffix(finalName);
                        setName(suffixed);
                        attempt(suffixed, false);
                        return;
                    }
                    showError(res.error);
                    refreshPublicRooms(); // the room may be full/gone — unstale the list
                    return;
                }
                const url = new URL(window.location.href);
                url.searchParams.set('room', res.roomCode);
                window.history.pushState({}, '', url.toString());
                patchState({ playerId: res.playerId, playerName, roomCode: res.roomCode, lobby: res.lobby, screen: 'waiting' });
            });
        };
        attempt(finalName, true);
    };

    const handleJoin = () => joinRoomWithCode(code);

    const handleRejoin = () => {
        // Rejoin matches your previous name — a random one can't help here
        if (!name.trim()) { showError('Enter the name you used before to rejoin'); return; }
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
        const roomCode = urlRoom!;
        if (roomCheck?.gameStarted) {
            // Rejoin needs the original name
            if (!name.trim()) { showError('Enter the name you used before to rejoin'); return; }
            socket.emit(C2S.REJOIN_BY_NAME, { roomCode, playerName: name.trim() }, (res: any) => {
                if (res.error) { showError(res.error); return; }
                patchState({ playerId: res.playerId, playerName: name.trim(), roomCode: res.roomCode, lobby: res.lobby, screen: res.gameInProgress ? 'game' : 'waiting' });
            });
        } else {
            joinRoomWithCode(roomCode);
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
                            placeholder={roomCheck.gameStarted ? 'Your name' : 'Your name (blank = random)'}
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
            <div className="w-full max-w-sm px-4 py-8">
                <Title subtitle="Brutal. Stackable. No mercy given." />

                <div className="flex flex-col gap-3">
                    <Input
                        ref={nameRef}
                        type="text"
                        className="text-zinc-100 placeholder:text-zinc-500 bg-zinc-800 border-zinc-700"
                        placeholder="Your name (blank = random)"
                        maxLength={16}
                        autoComplete="off"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleCreate()}
                    />

                    {/* Public / Private toggle */}
                    <div className="grid grid-cols-2 overflow-hidden rounded-md border border-zinc-700">
                        <Button
                            variant="ghost"
                            className={`rounded-none ${!isPublic ? 'bg-blue-600 text-white hover:bg-blue-600 hover:text-white' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}`}
                            onClick={() => setIsPublic(false)}
                        >
                            🔒 Private
                        </Button>
                        <Button
                            variant="ghost"
                            className={`rounded-none ${isPublic ? 'bg-blue-600 text-white hover:bg-blue-600 hover:text-white' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}`}
                            onClick={() => setIsPublic(true)}
                        >
                            🌐 Public
                        </Button>
                    </div>
                    {isPublic && (
                        <p className="-mt-1 text-center text-xs text-zinc-500">
                            Anyone can see and join this game from the main screen.
                        </p>
                    )}

                    <Button className="bg-blue-600 hover:bg-blue-500 text-white border-transparent" onClick={handleCreate}>
                        Create Game
                    </Button>
                    <p className="-mt-1 text-center text-xs text-zinc-500">
                        You can add 🤖 bots from the lobby after creating.
                    </p>

                    <Divider label="or join a public game" />

                    <PublicGamesList rooms={publicRooms} onJoin={joinRoomWithCode} />

                    <Divider label="or join with a code" />

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
