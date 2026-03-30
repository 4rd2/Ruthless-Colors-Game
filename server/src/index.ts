// ============================================================
// Server Entry — Express + Socket.IO
// ============================================================

import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import cors from 'cors';
import dotenv from 'dotenv';

import { C2S, S2C } from '../../shared/events';
import { CardColor } from '../../shared/types';
import { RECONNECT_GRACE_MS } from '../../shared/constants';
import {
    createRoom,
    joinRoom,
    getRoom,
    canStartGame,
    markGameStarted,
    removePlayer,
    findRoomBySocketId,
    findPlayerByName,
    updateSocketId,
    getLobbyState,
} from './lobby';
import {
    createGame,
    getGame,
    deleteGame,
    playCard,
    drawCard,
    chooseColor,
    chooseSwapTarget,
    resolveColorRoulette,
    sanitizeGameState,
} from './game';

dotenv.config();

const app = express();
const server = http.createServer(app);

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(cors({ origin: CLIENT_ORIGIN }));

// In production, serve the built client
const clientDist = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDist));

const io = new Server(server, {
    cors: {
        origin: CLIENT_ORIGIN,
        methods: ['GET', 'POST'],
    },
});

// ─── Helper: send game state to all players ─────────────────

function broadcastGameState(roomCode: string): void {
    const game = getGame(roomCode);
    if (!game) return;
    const room = getRoom(roomCode);
    if (!room) return;

    for (const player of game.players) {
        const lobbyPlayer = room.players.find((p) => p.id === player.id);
        if (lobbyPlayer?.connected) {
            io.to(lobbyPlayer.socketId).emit(
                S2C.GAME_STATE,
                sanitizeGameState(game, player.id),
            );
        }
    }
}

// ─── Socket.IO Connection Handler ───────────────────────────

io.on('connection', (socket) => {
    console.log(`[connect] ${socket.id}`);

    // --- Check Room Status ---
    socket.on(C2S.CHECK_ROOM, (roomCode: string, callback) => {
        const room = getRoom(roomCode);
        if (!room) {
            callback({ exists: false });
            return;
        }
        callback({
            exists: true,
            gameStarted: room.gameStarted,
        });
    });

    // --- Create Room ---
    socket.on(C2S.CREATE_ROOM, (data: { playerName: string }, callback) => {
        const { room, playerId } = createRoom(data.playerName, socket.id);
        socket.join(room.code);
        callback({
            roomCode: room.code,
            playerId,
            lobby: getLobbyState(room),
        });
        console.log(`[room] ${data.playerName} created room ${room.code}`);
    });

    // --- Join Room ---
    socket.on(C2S.JOIN_ROOM, (data: { roomCode: string; playerName: string }, callback) => {
        const result = joinRoom(data.roomCode, data.playerName, socket.id);
        if ('error' in result) {
            callback({ error: result.error });
            return;
        }
        socket.join(result.room.code);
        callback({
            roomCode: result.room.code,
            playerId: result.playerId,
            lobby: getLobbyState(result.room),
        });
        // Notify all players in room
        io.to(result.room.code).emit(S2C.LOBBY_UPDATE, getLobbyState(result.room));
        console.log(`[room] ${data.playerName} joined room ${data.roomCode}`);
    });

    // --- Start Game ---
    socket.on(C2S.START_GAME, (data: { roomCode: string; playerId: string }, callback) => {
        const room = getRoom(data.roomCode);
        if (!room) {
            callback({ error: 'Room not found' });
            return;
        }
        const check = canStartGame(room, data.playerId);
        if (!check.ok) {
            callback({ error: check.error });
            return;
        }

        markGameStarted(data.roomCode);
        const gamePlayers = room.players.map((p) => ({
            id: p.id,
            socketId: p.socketId,
            name: p.name,
        }));
        const state = createGame(data.roomCode, gamePlayers);

        callback({ success: true });
        io.to(data.roomCode).emit(S2C.GAME_STARTED);
        broadcastGameState(data.roomCode);
        console.log(`[game] Game started in room ${data.roomCode}`);
    });

    // --- Play Card ---
    socket.on(C2S.PLAY_CARD, (data: { roomCode: string; playerId: string; cardId: string; chosenColor?: CardColor }) => {
        const game = getGame(data.roomCode);
        if (!game) return;

        const result = playCard(game, data.playerId, data.cardId, data.chosenColor);
        if (!result.success) {
            socket.emit(S2C.ERROR, { message: result.error });
            return;
        }

        // Broadcast events
        if (result.eliminatedPlayers) {
            for (const p of result.eliminatedPlayers) {
                io.to(data.roomCode).emit(S2C.PLAYER_ELIMINATED, { playerId: p.id, playerName: p.name });
            }
        }
        if (result.handsPassed) {
            io.to(data.roomCode).emit(S2C.HANDS_PASSED);
        }

        broadcastGameState(data.roomCode);
    });

    // --- Draw Card ---
    socket.on(C2S.DRAW_CARD, (data: { roomCode: string; playerId: string }) => {
        const game = getGame(data.roomCode);
        if (!game) return;

        const result = drawCard(game, data.playerId);
        if (!result.success) {
            socket.emit(S2C.ERROR, { message: result.error });
            return;
        }

        if (result.eliminatedPlayers) {
            for (const p of result.eliminatedPlayers) {
                io.to(data.roomCode).emit(S2C.PLAYER_ELIMINATED, { playerId: p.id, playerName: p.name });
            }
        }

        broadcastGameState(data.roomCode);
    });

    // --- Choose Color ---
    socket.on(C2S.CHOOSE_COLOR, (data: { roomCode: string; playerId: string; color: CardColor }) => {
        const game = getGame(data.roomCode);
        if (!game) return;

        const result = chooseColor(game, data.playerId, data.color);
        if (!result.success) {
            socket.emit(S2C.ERROR, { message: result.error });
            return;
        }

        broadcastGameState(data.roomCode);
    });

    // --- Choose Swap Target ---
    socket.on(C2S.CHOOSE_SWAP_TARGET, (data: { roomCode: string; playerId: string; targetPlayerId: string }) => {
        const game = getGame(data.roomCode);
        if (!game) return;

        const result = chooseSwapTarget(game, data.playerId, data.targetPlayerId);
        if (!result.success) {
            socket.emit(S2C.ERROR, { message: result.error });
            return;
        }

        if (result.eliminatedPlayers) {
            for (const p of result.eliminatedPlayers) {
                io.to(data.roomCode).emit(S2C.PLAYER_ELIMINATED, { playerId: p.id, playerName: p.name });
            }
        }

        io.to(data.roomCode).emit(S2C.HANDS_SWAPPED, {
            player1: data.playerId,
            player2: data.targetPlayerId,
        });
        broadcastGameState(data.roomCode);
    });

    // --- Color Roulette Choice ---
    socket.on(C2S.COLOR_ROULETTE_CHOICE, (data: { roomCode: string; playerId: string; color: CardColor }) => {
        const game = getGame(data.roomCode);
        if (!game) return;

        const result = resolveColorRoulette(game, data.playerId, data.color);
        if (!result.success) {
            socket.emit(S2C.ERROR, { message: result.error });
            return;
        }

        if (result.rouletteCards) {
            io.to(data.roomCode).emit(S2C.COLOR_ROULETTE_REVEAL, {
                cards: result.rouletteCards,
                playerId: data.playerId,
            });
        }

        if (result.eliminatedPlayers) {
            for (const p of result.eliminatedPlayers) {
                io.to(data.roomCode).emit(S2C.PLAYER_ELIMINATED, { playerId: p.id, playerName: p.name });
            }
        }

        broadcastGameState(data.roomCode);
    });

    // --- Reconnect ---
    socket.on(C2S.RECONNECT, (data: { roomCode: string; playerId: string }, callback) => {
        const room = getRoom(data.roomCode);
        if (!room) {
            callback({ error: 'Room not found' });
            return;
        }

        updateSocketId(data.roomCode, data.playerId, socket.id);
        socket.join(data.roomCode);

        // Update game player socketId too
        const game = getGame(data.roomCode);
        if (game) {
            const gamePlayer = game.players.find((p) => p.id === data.playerId);
            if (gamePlayer) gamePlayer.socketId = socket.id;
        }

        callback({ success: true, lobby: getLobbyState(room) });
        io.to(data.roomCode).emit(S2C.PLAYER_RECONNECTED, { playerId: data.playerId });

        if (game) {
            broadcastGameState(data.roomCode);
        }

        console.log(`[reconnect] ${data.playerId} reconnected to ${data.roomCode}`);
    });

    // --- Rejoin by Name ---
    socket.on(C2S.REJOIN_BY_NAME, (data: { roomCode: string; playerName: string }, callback) => {
        const room = getRoom(data.roomCode);
        if (!room) {
            callback({ error: 'Room not found' });
            return;
        }

        const player = findPlayerByName(data.roomCode, data.playerName);
        if (!player) {
            callback({ error: 'No player with that name found in this room' });
            return;
        }

        // Update socket and mark connected
        updateSocketId(data.roomCode, player.id, socket.id);
        socket.join(data.roomCode);

        // Update game player socketId too
        const game = getGame(data.roomCode);
        if (game) {
            const gamePlayer = game.players.find((p) => p.id === player.id);
            if (gamePlayer) gamePlayer.socketId = socket.id;
        }

        callback({
            success: true,
            playerId: player.id,
            roomCode: data.roomCode,
            lobby: getLobbyState(room),
            gameInProgress: room.gameStarted,
        });
        io.to(data.roomCode).emit(S2C.PLAYER_RECONNECTED, { playerId: player.id });

        if (game) {
            broadcastGameState(data.roomCode);
        }

        console.log(`[rejoin] ${data.playerName} rejoined room ${data.roomCode}`);
    });

    // --- Disconnect ---
    socket.on('disconnect', () => {
        const found = findRoomBySocketId(socket.id);
        if (!found) return;

        const { room, player } = found;
        player.connected = false;

        console.log(`[disconnect] ${player.name} disconnected from ${room.code}`);

        if (!room.gameStarted) {
            // In lobby, remove immediately
            const updatedRoom = removePlayer(room.code, player.id);
            if (updatedRoom) {
                io.to(room.code).emit(S2C.LOBBY_UPDATE, getLobbyState(updatedRoom));
            }
        } else {
            // In game, give grace period
            io.to(room.code).emit(S2C.PLAYER_DISCONNECTED, {
                playerId: player.id,
                playerName: player.name,
            });

            player.disconnectTimer = setTimeout(() => {
                // If still disconnected after grace period, eliminate player
                const game = getGame(room.code);
                if (game) {
                    const gamePlayer = game.players.find((p) => p.id === player.id);
                    if (gamePlayer && !gamePlayer.isEliminated) {
                        gamePlayer.isEliminated = true;
                        game.drawPile.push(...gamePlayer.hand);
                        gamePlayer.hand = [];
                        io.to(room.code).emit(S2C.PLAYER_ELIMINATED, {
                            playerId: player.id,
                            playerName: player.name,
                        });
                        broadcastGameState(room.code);
                    }
                }
            }, RECONNECT_GRACE_MS);
        }
    });
});

// --- Catch-all for SPA routing in production ---
app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
});

server.listen(PORT, () => {
    console.log(`🃏 Ruthless Colors server running on port ${PORT}`);
});
