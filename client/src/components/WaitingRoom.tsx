// ============================================================
// Waiting Room
// ============================================================

import { useState } from 'react';
import { Socket } from 'socket.io-client';
import { C2S } from '@shared/events';
import { AppState } from '../App';
import { ToastType } from './Toast';



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
        <div>
            <div>
                <h2>🃏 Waiting for Players</h2>
                <p>Share this code with your friends:</p>

                {/* Room code row */}
                <div>
                    <span>
                        {lobby.roomCode}
                    </span>
                    <div>
                        <button onClick={copyCode}>{copyCodeLabel}</button>
                        <button onClick={copyLink}>{copyLinkLabel}</button>
                    </div>
                </div>

                {/* Player list */}
                <ul>
                    {lobby.players.map(p => (
                        <li
                            key={p.id}
                        >
                            <span />
                            <span>{p.name}</span>
                            {p.isHost && (
                                <span>
                                    Host
                                </span>
                            )}
                        </li>
                    ))}
                </ul>

                <p>
                    {lobby.players.length} / {lobby.maxPlayers} players
                </p>

                <div>
                    {isHost ? (
                        <button
                            disabled={lobby.players.length < 2}
                            onClick={startGame}
                        >
                            Start Game
                        </button>
                    ) : (
                        <p>Waiting for host to start...</p>
                    )}
                </div>
            </div>
        </div>
    );
}
