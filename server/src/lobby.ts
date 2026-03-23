// ============================================================
// Lobby — room management, player join/leave, connection codes
// ============================================================

import { v4 as uuid } from 'uuid';
import { LobbyState } from '../../shared/types';
import { MAX_PLAYERS, MIN_PLAYERS, ROOM_CODE_LENGTH, RECONNECT_GRACE_MS } from '../../shared/constants';

// ─── Types ──────────────────────────────────────────────────

export interface LobbyPlayer {
    id: string;
    socketId: string;
    name: string;
    isHost: boolean;
    connected: boolean;
    disconnectTimer?: ReturnType<typeof setTimeout>;
}

export interface Room {
    code: string;
    players: LobbyPlayer[];
    gameStarted: boolean;
}

// ─── Storage ────────────────────────────────────────────────

const rooms = new Map<string, Room>();

// ─── Room Code Generation ───────────────────────────────────

function generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 to avoid confusion
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    // Ensure uniqueness
    if (rooms.has(code)) return generateRoomCode();
    return code;
}

// ─── Room Operations ────────────────────────────────────────

export function createRoom(playerName: string, socketId: string): { room: Room; playerId: string } {
    const code = generateRoomCode();
    const playerId = uuid();
    const room: Room = {
        code,
        players: [
            {
                id: playerId,
                socketId,
                name: playerName,
                isHost: true,
                connected: true,
            },
        ],
        gameStarted: false,
    };
    rooms.set(code, room);
    return { room, playerId };
}

export function joinRoom(
    roomCode: string,
    playerName: string,
    socketId: string,
): { room: Room; playerId: string } | { error: string } {
    const room = rooms.get(roomCode.toUpperCase());
    if (!room) return { error: 'Room not found' };
    if (room.gameStarted) return { error: 'Game already in progress' };
    if (room.players.length >= MAX_PLAYERS) return { error: 'Room is full' };

    // Check for duplicate names
    if (room.players.some((p) => p.name.toLowerCase() === playerName.toLowerCase())) {
        return { error: 'Name already taken in this room' };
    }

    const playerId = uuid();
    room.players.push({
        id: playerId,
        socketId,
        name: playerName,
        isHost: false,
        connected: true,
    });

    return { room, playerId };
}

export function getRoom(roomCode: string): Room | undefined {
    return rooms.get(roomCode.toUpperCase());
}

export function canStartGame(room: Room, playerId: string): { ok: boolean; error?: string } {
    const player = room.players.find((p) => p.id === playerId);
    if (!player?.isHost) return { ok: false, error: 'Only the host can start the game' };
    if (room.players.length < MIN_PLAYERS) return { ok: false, error: `Need at least ${MIN_PLAYERS} players` };
    return { ok: true };
}

export function markGameStarted(roomCode: string): void {
    const room = rooms.get(roomCode);
    if (room) room.gameStarted = true;
}

export function removePlayer(roomCode: string, playerId: string): Room | null {
    const room = rooms.get(roomCode);
    if (!room) return null;

    room.players = room.players.filter((p) => p.id !== playerId);

    // If room is empty, delete it
    if (room.players.length === 0) {
        rooms.delete(roomCode);
        return null;
    }

    // If host left, assign new host
    if (!room.players.some((p) => p.isHost)) {
        room.players[0].isHost = true;
    }

    return room;
}

export function findRoomBySocketId(socketId: string): { room: Room; player: LobbyPlayer } | undefined {
    for (const room of rooms.values()) {
        const player = room.players.find((p) => p.socketId === socketId);
        if (player) return { room, player };
    }
    return undefined;
}

export function updateSocketId(roomCode: string, playerId: string, newSocketId: string): void {
    const room = rooms.get(roomCode);
    if (!room) return;
    const player = room.players.find((p) => p.id === playerId);
    if (player) {
        player.socketId = newSocketId;
        player.connected = true;
        if (player.disconnectTimer) {
            clearTimeout(player.disconnectTimer);
            player.disconnectTimer = undefined;
        }
    }
}

/** Find a disconnected player by name in a room (for rejoin) */
export function findPlayerByName(roomCode: string, playerName: string): LobbyPlayer | undefined {
    const room = rooms.get(roomCode.toUpperCase());
    if (!room) return undefined;
    return room.players.find(
        (p) => p.name.toLowerCase() === playerName.toLowerCase()
    );
}

export function deleteRoom(roomCode: string): void {
    rooms.delete(roomCode);
}

// ─── State Serialization ───────────────────────────────────

export function getLobbyState(room: Room): LobbyState {
    return {
        roomCode: room.code,
        players: room.players.map((p) => ({
            id: p.id,
            name: p.name,
            isHost: p.isHost,
        })),
        maxPlayers: MAX_PLAYERS,
    };
}
