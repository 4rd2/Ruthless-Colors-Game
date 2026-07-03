// ============================================================
// Waiting Room
// ============================================================

import { useState } from 'react';
import { Socket } from 'socket.io-client';
import { C2S } from '@shared/events';
import { AppState } from '../App';
import { ToastType } from './Toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';



interface Props {
    socket: Socket;
    state: AppState;
    patchState: (p: Partial<AppState>) => void;
    addToast: (msg: string, type?: ToastType) => void;
}

export default function WaitingRoom({ socket, state, addToast }: Props) {
    const { lobby, playerId, roomCode } = state;
    if (!lobby) return null;

    const isHost = lobby.players.find(p => p.id === playerId)?.isHost ?? false;

    const [copyCodeLabel, setCopyCodeLabel] = useState('Copy Code');
    const [copyLinkLabel, setCopyLinkLabel] = useState('Copy Link');

    const copyCode = () => {
        navigator.clipboard.writeText(lobby.roomCode);
        setCopyCodeLabel('Copied!');
        setTimeout(() => setCopyCodeLabel('Copy Code'), 2000);
    };

    const copyLink = () => {
        const url = `${window.location.origin}${window.location.pathname}?room=${lobby.roomCode}`;
        navigator.clipboard.writeText(url);
        setCopyLinkLabel('Copied Link!');
        setTimeout(() => setCopyLinkLabel('Copy Link'), 2000);
    };

    const startGame = () => {
        socket.emit(C2S.START_GAME, { roomCode, playerId }, (res: any) => {
            if (res?.error) addToast(res.error, 'error');
        });
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-zinc-900 px-4 py-8">
            <Card className="w-full max-w-md bg-zinc-800 border-zinc-700 text-zinc-100">
                <CardHeader>
                    <CardTitle className="text-white">🃏 Waiting for Players</CardTitle>
                    <CardDescription className="text-zinc-400">Share this code with your friends:</CardDescription>
                </CardHeader>

                <CardContent className="flex flex-col gap-4">
                    {/* Room code row */}
                    <div className="flex flex-col items-center gap-3 rounded-lg bg-zinc-900 px-4 py-3">
                        <span className="font-mono text-2xl font-bold tracking-widest text-white">
                            {lobby.roomCode}
                        </span>
                        <div className="flex w-full gap-2">
                            <Button size="sm" variant="outline" className="flex-1 bg-blue-600 hover:bg-blue-500 text-white border-transparent" onClick={copyCode}>{copyCodeLabel}</Button>
                            <Button size="sm" variant="outline" className="flex-1 bg-blue-600 hover:bg-blue-500 text-white border-transparent" onClick={copyLink}>{copyLinkLabel}</Button>
                        </div>
                    </div>

                    {/* Player list */}
                    <ul className="flex flex-col gap-1">
                        {lobby.players.map(p => (
                            <li
                                key={p.id}
                                className="flex items-center gap-2 rounded-md px-2 py-1.5 bg-zinc-900/50 border border-zinc-700"
                            >
                                <span className="size-2 rounded-full bg-blue-500" />
                                <span className="flex-1 text-zinc-200">{p.name}</span>
                                {p.isHost && (
                                    <Badge className="bg-blue-600 text-white border-transparent">Host</Badge>
                                )}
                            </li>
                        ))}
                    </ul>

                    <p className="text-sm text-zinc-500">
                        {lobby.players.length} / {lobby.maxPlayers} players
                    </p>
                    {isHost ? (
                        <Button
                            className="w-full bg-blue-600 hover:bg-blue-500 text-white border-transparent disabled:bg-zinc-700 disabled:text-zinc-500"
                            disabled={lobby.players.length < 2}
                            onClick={startGame}
                        >
                            Start Game
                        </Button>
                    ) : (
                        <p className="text-sm text-zinc-500">Waiting for host to start...</p>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
