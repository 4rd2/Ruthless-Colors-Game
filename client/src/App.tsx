import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { C2S, S2C } from '@shared/events';
import { ClientGameState, LobbyState } from '@shared/types';
import LobbyScreen from './components/LobbyScreen';
import WaitingRoom from './components/WaitingRoom';
import GameBoard from './components/GameBoard';
import { Toaster } from './components/ui/sonner';

// ── Types ───────────────────────────────────────────────────

export type Screen = 'lobby' | 'waiting' | 'game';

export interface AppState {
    screen: Screen;
    playerId: string | null;
    playerName: string | null;
    roomCode: string | null;
    lobby: LobbyState | null;
    game: ClientGameState | null;
}

// ── Socket (module-level singleton) ────────────────────────

const socket: Socket = io({
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
});

// ── App ─────────────────────────────────────────────────────

export default function App() {
    const [appState, setAppState] = useState<AppState>({
        screen: 'lobby',
        playerId: null,
        playerName: null,
        roomCode: null,
        lobby: null,
        game: null,
    });

    // Ref so socket callbacks always see the latest state
    const stateRef = useRef(appState);
    useEffect(() => { stateRef.current = appState; });

    const patchState = useCallback((partial: Partial<AppState>) => {
        setAppState(prev => ({ ...prev, ...partial }));
    }, []);

    // ── Socket listeners ────────────────────────────────────

    useEffect(() => {
        const onConnect = () => {
            const s = stateRef.current;
            if (s.roomCode && s.playerId && s.screen === 'game') {
                socket.emit(C2S.RECONNECT, { roomCode: s.roomCode, playerId: s.playerId }, (res: any) => {
                    if (res?.error) console.warn('Reconnect failed:', res.error);
                });
            }
        };

        const onLobbyUpdate  = (lobby: LobbyState)      => patchState({ lobby });
        const onGameStarted  = ()                        => patchState({ screen: 'game' });
        const onGameState    = (game: ClientGameState)   => patchState({ game });

        const onEliminated = (data: { playerId: string; playerName: string }) => {
            if (data.playerId === stateRef.current.playerId) {
                toast.error('💀 You have been eliminated! (25+ cards)');
            } else {
                toast.warning(`💀 ${data.playerName} has been eliminated!`);
            }
        };

        const onHandsPassed    = ()                                               => toast.info('🔄 All hands have been passed!');
        const onHandsSwapped   = ()                                               => toast.info('🔀 Hands have been swapped!');
        const onRouletteReveal = (data: { cards: any[]; playerId: string })       => {
            const name = data.playerId === stateRef.current.playerId ? 'You' : 'A player';
            toast.warning(`🎰 ${name} drew ${data.cards.length} cards from Color Roulette!`);
        };
        const onDisconnected   = (data: { playerName: string })                   => toast.warning(`⚡ ${data.playerName} disconnected`);
        const onReconnected    = ()                                               => toast.success('✅ Player reconnected');
        const onError          = (data: { message: string })                      => toast.error(data.message);

        socket.on('connect',                  onConnect);
        socket.on(S2C.LOBBY_UPDATE,           onLobbyUpdate);
        socket.on(S2C.GAME_STARTED,           onGameStarted);
        socket.on(S2C.GAME_STATE,             onGameState);
        socket.on(S2C.PLAYER_ELIMINATED,      onEliminated);
        socket.on(S2C.HANDS_PASSED,           onHandsPassed);
        socket.on(S2C.HANDS_SWAPPED,          onHandsSwapped);
        socket.on(S2C.COLOR_ROULETTE_REVEAL,  onRouletteReveal);
        socket.on(S2C.PLAYER_DISCONNECTED,    onDisconnected);
        socket.on(S2C.PLAYER_RECONNECTED,     onReconnected);
        socket.on(S2C.ERROR,                  onError);

        return () => {
            socket.off('connect',                 onConnect);
            socket.off(S2C.LOBBY_UPDATE,          onLobbyUpdate);
            socket.off(S2C.GAME_STARTED,          onGameStarted);
            socket.off(S2C.GAME_STATE,            onGameState);
            socket.off(S2C.PLAYER_ELIMINATED,     onEliminated);
            socket.off(S2C.HANDS_PASSED,          onHandsPassed);
            socket.off(S2C.HANDS_SWAPPED,         onHandsSwapped);
            socket.off(S2C.COLOR_ROULETTE_REVEAL, onRouletteReveal);
            socket.off(S2C.PLAYER_DISCONNECTED,   onDisconnected);
            socket.off(S2C.PLAYER_RECONNECTED,    onReconnected);
            socket.off(S2C.ERROR,                 onError);
        };
    }, [patchState]);

    // ── Render ──────────────────────────────────────────────

    return (
        <div>
            {appState.screen === 'lobby' && (
                <LobbyScreen socket={socket} state={appState} patchState={patchState} />
            )}
            {appState.screen === 'waiting' && (
                <WaitingRoom socket={socket} state={appState} patchState={patchState} addToast={(msg, type) => {
                    if (type === 'error') toast.error(msg);
                    else if (type === 'success') toast.success(msg);
                    else if (type === 'warning') toast.warning(msg);
                    else toast.info(msg);
                }} />
            )}
            {appState.screen === 'game' && appState.game && (
                <GameBoard socket={socket} state={appState} />
            )}
            <Toaster />
        </div>
    );
}
