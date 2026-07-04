// ============================================================
// Supabase Edge Function — Game Action Router (Deno)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';
import { CardColor } from './types.ts';
import {
    initializeNewGame,
    playCard,
    drawCard,
    chooseColor,
    chooseSwapTarget,
    resolveColorRoulette,
    sanitizeGameState,
} from './game.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
};

Deno.serve(async (req) => {
    // Handle CORS Preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const body = await req.json();
        const {
            action,
            roomCode,
            playerId,
            playerName,
            cardId,
            chosenColor,
            targetPlayerId,
            color,
        } = body;

        // --- Helper: broadcast to channel via HTTP Realtime REST ---
        const broadcastToRoom = async (event: string, payload: any) => {
            await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
                method: 'POST',
                headers: {
                    'apikey': supabaseServiceKey,
                    'Authorization': `Bearer ${supabaseServiceKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    messages: [
                        {
                            topic: `room:${roomCode || payload.roomCode}`,
                            event: event,
                            private: false,
                            payload: payload,
                        },
                    ],
                }),
            });
        };

        // --- Helper: broadcast updated game state to all players ---
        const broadcastStateToAll = async (state: any) => {
            const messages = state.players.map((p: any) => ({
                topic: `room:${state.roomCode}`,
                event: `s2c:game_state:${p.id}`,
                private: false,
                payload: sanitizeGameState(state, p.id),
            }));

            await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
                method: 'POST',
                headers: {
                    'apikey': supabaseServiceKey,
                    'Authorization': `Bearer ${supabaseServiceKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ messages }),
            });
        };

        // --- Helper: broadcast lobby update ---
        const broadcastLobbyUpdate = async (code: string) => {
            const { data: players } = await supabase
                .from('players')
                .select('id, name, is_host')
                .eq('room_code', code);
            if (players) {
                await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
                    method: 'POST',
                    headers: {
                        'apikey': supabaseServiceKey,
                        'Authorization': `Bearer ${supabaseServiceKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        messages: [
                            {
                                topic: `room:${code}`,
                                event: 's2c:lobby_update',
                                private: false,
                                payload: {
                                    roomCode: code,
                                    players: players.map((p) => ({ id: p.id, name: p.name, isHost: p.is_host })),
                                    maxPlayers: 4,
                                },
                            },
                        ],
                    }),
                });
            }
        };

        // --- Router ---
        switch (action) {
            case 'create_room': {
                if (!playerName) return new Response(JSON.stringify({ error: 'Player name required' }), { status: 400, headers: corsHeaders });

                // 1. Generate room code
                let code = '';
                const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
                let exists = true;
                while (exists) {
                    code = '';
                    for (let i = 0; i < 4; i++) {
                        code += chars[Math.floor(Math.random() * chars.length)];
                    }
                    const { data } = await supabase.from('rooms').select('code').eq('code', code).maybeSingle();
                    if (!data) exists = false;
                }

                // 2. Create room row
                const { error: roomErr } = await supabase
                    .from('rooms')
                    .insert({ code, status: 'lobby' });
                if (roomErr) throw roomErr;

                // 3. Create player row
                const playerUUID = crypto.randomUUID();
                const { error: playerErr } = await supabase
                    .from('players')
                    .insert({ id: playerUUID, room_code: code, name: playerName, is_host: true });
                if (playerErr) throw playerErr;

                // 4. Set room host
                await supabase.from('rooms').update({ host_id: playerUUID }).eq('code', code);

                const lobbyState = {
                    roomCode: code,
                    players: [{ id: playerUUID, name: playerName, isHost: true }],
                    maxPlayers: 4,
                };

                return new Response(JSON.stringify({ roomCode: code, playerId: playerUUID, lobby: lobbyState }), { headers: corsHeaders });
            }

            case 'join_room': {
                if (!roomCode || !playerName) {
                    return new Response(JSON.stringify({ error: 'Room code and player name required' }), { status: 400, headers: corsHeaders });
                }
                const formattedCode = roomCode.toUpperCase();

                // 1. Verify room exists
                const { data: room } = await supabase.from('rooms').select('*').eq('code', formattedCode).maybeSingle();
                if (!room) return new Response(JSON.stringify({ error: 'Room not found' }), { status: 400, headers: corsHeaders });
                if (room.status !== 'lobby') return new Response(JSON.stringify({ error: 'Game already in progress' }), { status: 400, headers: corsHeaders });

                // 2. Query player count
                const { data: players } = await supabase.from('players').select('id, name').eq('room_code', formattedCode);
                const currentPlayers = players || [];
                if (currentPlayers.length >= 4) return new Response(JSON.stringify({ error: 'Room is full' }), { status: 400, headers: corsHeaders });

                // 3. Verify unique name
                if (currentPlayers.some((p) => p.name.toLowerCase() === playerName.toLowerCase())) {
                    return new Response(JSON.stringify({ error: 'Name already taken in this room' }), { status: 400, headers: corsHeaders });
                }

                // 4. Insert player
                const playerUUID = crypto.randomUUID();
                const { error: playerErr } = await supabase
                    .from('players')
                    .insert({ id: playerUUID, room_code: formattedCode, name: playerName, is_host: false });
                if (playerErr) throw playerErr;

                // 5. Broadcast lobby update
                await broadcastLobbyUpdate(formattedCode);

                const lobbyState = {
                    roomCode: formattedCode,
                    players: [...currentPlayers.map((p) => ({ id: p.id, name: p.name, isHost: p.id === room.host_id })), { id: playerUUID, name: playerName, isHost: false }],
                    maxPlayers: 4,
                };

                return new Response(JSON.stringify({ roomCode: formattedCode, playerId: playerUUID, lobby: lobbyState }), { headers: corsHeaders });
            }

            case 'check_room': {
                if (!roomCode) return new Response(JSON.stringify({ error: 'Room code required' }), { status: 400, headers: corsHeaders });
                const formattedCode = roomCode.toUpperCase();
                const { data: room } = await supabase.from('rooms').select('*').eq('code', formattedCode).maybeSingle();
                if (!room) return new Response(JSON.stringify({ exists: false }), { headers: corsHeaders });

                return new Response(JSON.stringify({ exists: true, gameStarted: room.status !== 'lobby' }), { headers: corsHeaders });
            }

            case 'start_game': {
                if (!roomCode || !playerId) return new Response(JSON.stringify({ error: 'Room code and player ID required' }), { status: 400, headers: corsHeaders });

                const { data: room } = await supabase.from('rooms').select('*').eq('code', roomCode).maybeSingle();
                if (!room) return new Response(JSON.stringify({ error: 'Room not found' }), { status: 404, headers: corsHeaders });
                if (room.host_id !== playerId) return new Response(JSON.stringify({ error: 'Only the host can start the game' }), { status: 403, headers: corsHeaders });

                const { data: dbPlayers } = await supabase.from('players').select('*').eq('room_code', roomCode);
                const playersList = dbPlayers || [];
                if (playersList.length < 2) return new Response(JSON.stringify({ error: 'Need at least 2 players' }), { status: 400, headers: corsHeaders });

                // Create state
                const gameState = initializeNewGame(roomCode, playersList.map((p) => ({ id: p.id, name: p.name })));

                // Update tables in DB
                await supabase.from('rooms').update({ status: 'playing' }).eq('code', roomCode);
                await supabase.from('games').insert({
                    room_code: roomCode,
                    current_player_index: gameState.currentPlayerIndex,
                    direction: gameState.direction,
                    chosen_color: gameState.chosenColor,
                    draw_stack: gameState.drawStack,
                    draw_stack_origin_index: gameState.drawStackOriginIndex,
                    phase: gameState.phase,
                    discard_pile: gameState.discardPile,
                    draw_pile: gameState.drawPile,
                });

                for (const p of gameState.players) {
                    await supabase.from('player_hands').insert({
                        player_id: p.id,
                        room_code: roomCode,
                        cards: p.hand,
                    });
                }

                // Broadcast start game & states
                await broadcastToRoom('s2c:game_started', { roomCode });
                await broadcastStateToAll(gameState);

                return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
            }

            case 'play_card': {
                if (!roomCode || !playerId || !cardId) return new Response(JSON.stringify({ error: 'Missing parameters' }), { status: 400, headers: corsHeaders });

                // Load Game State
                const { data: gameRow } = await supabase.from('games').select('*').eq('room_code', roomCode).maybeSingle();
                if (!gameRow) return new Response(JSON.stringify({ error: 'Game not found' }), { status: 404, headers: corsHeaders });

                const { data: dbPlayers } = await supabase.from('players').select('*').eq('room_code', roomCode);
                const { data: handsRows } = await supabase.from('player_hands').select('*').eq('room_code', roomCode);

                const playersList = dbPlayers || [];
                const handsMap = (handsRows || []).reduce((acc: any, row: any) => {
                    acc[row.player_id] = row.cards;
                    return acc;
                }, {});

                const state: any = {
                    roomCode,
                    currentPlayerIndex: gameRow.current_player_index,
                    direction: gameRow.direction,
                    chosenColor: gameRow.chosen_color,
                    drawStack: gameRow.draw_stack,
                    drawStackOriginIndex: gameRow.draw_stack_origin_index,
                    winnerId: gameRow.winner_id,
                    phase: gameRow.phase,
                    discard_pile: gameRow.discard_pile,
                    draw_pile: gameRow.draw_pile,
                    discardPile: gameRow.discard_pile,
                    drawPile: gameRow.draw_pile,
                    players: playersList.map((p) => ({
                        id: p.id,
                        name: p.name,
                        isEliminated: p.is_eliminated,
                        hand: handsMap[p.id] || [],
                    })),
                };

                const playedCard = state.players[state.currentPlayerIndex]?.hand.find((c: any) => c.id === cardId);
                const result = playCard(state, playerId, cardId, chosenColor);
                if (!result.success) {
                    return new Response(JSON.stringify({ error: result.error }), { status: 400, headers: corsHeaders });
                }

                // Save state changes to DB
                await supabase.from('games').update({
                    current_player_index: state.currentPlayerIndex,
                    direction: state.direction,
                    chosen_color: state.chosenColor,
                    draw_stack: state.drawStack,
                    draw_stack_origin_index: state.drawStackOriginIndex,
                    winner_id: state.winnerId,
                    phase: state.phase,
                    discard_pile: state.discardPile,
                    draw_pile: state.drawPile,
                }).eq('room_code', roomCode);

                // Update players list (eliminations)
                if (result.eliminatedPlayers) {
                    for (const p of result.eliminatedPlayers) {
                        await supabase.from('players').update({ is_eliminated: true }).eq('id', p.id);
                    }
                }

                // Update hands
                for (const p of state.players) {
                    await supabase.from('player_hands').update({ cards: p.hand }).eq('player_id', p.id);
                }

                // Update room if game over
                if (state.phase === 'game_over') {
                    await supabase.from('rooms').update({ status: 'game_over' }).eq('code', roomCode);
                }

                // Broadcast events
                if (playedCard) {
                    await broadcastToRoom('s2c:card_played', { playerId, card: playedCard });
                }
                if (result.eliminatedPlayers) {
                    for (const p of result.eliminatedPlayers) {
                        await broadcastToRoom('s2c:player_eliminated', { playerId: p.id, playerName: p.name });
                    }
                }
                if (result.handsPassed) {
                    await broadcastToRoom('s2c:hands_passed', {});
                }
                if (state.phase === 'game_over' && state.winnerId) {
                    const winner = state.players.find((p: any) => p.id === state.winnerId);
                    await broadcastToRoom('s2c:game_over', { winnerId: state.winnerId, winnerName: winner?.name ?? 'Someone' });
                }

                await broadcastStateToAll(state);
                return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
            }

            case 'draw_card': {
                if (!roomCode || !playerId) return new Response(JSON.stringify({ error: 'Missing parameters' }), { status: 400, headers: corsHeaders });

                const { data: gameRow } = await supabase.from('games').select('*').eq('room_code', roomCode).maybeSingle();
                if (!gameRow) return new Response(JSON.stringify({ error: 'Game not found' }), { status: 404, headers: corsHeaders });

                const { data: dbPlayers } = await supabase.from('players').select('*').eq('room_code', roomCode);
                const { data: handsRows } = await supabase.from('player_hands').select('*').eq('room_code', roomCode);

                const playersList = dbPlayers || [];
                const handsMap = (handsRows || []).reduce((acc: any, row: any) => {
                    acc[row.player_id] = row.cards;
                    return acc;
                }, {});

                const state: any = {
                    roomCode,
                    currentPlayerIndex: gameRow.current_player_index,
                    direction: gameRow.direction,
                    chosenColor: gameRow.chosen_color,
                    drawStack: gameRow.draw_stack,
                    drawStackOriginIndex: gameRow.draw_stack_origin_index,
                    winnerId: gameRow.winner_id,
                    phase: gameRow.phase,
                    discard_pile: gameRow.discard_pile,
                    draw_pile: gameRow.draw_pile,
                    discardPile: gameRow.discard_pile,
                    drawPile: gameRow.draw_pile,
                    players: playersList.map((p) => ({
                        id: p.id,
                        name: p.name,
                        isEliminated: p.is_eliminated,
                        hand: handsMap[p.id] || [],
                    })),
                };

                const drawCount = state.drawStack > 0 ? state.drawStack : 1;
                const result = drawCard(state, playerId);
                if (!result.success) {
                    return new Response(JSON.stringify({ error: result.error }), { status: 400, headers: corsHeaders });
                }

                // Save state to DB
                await supabase.from('games').update({
                    current_player_index: state.currentPlayerIndex,
                    chosen_color: state.chosenColor,
                    draw_stack: state.drawStack,
                    draw_stack_origin_index: state.drawStackOriginIndex,
                    winner_id: state.winnerId,
                    phase: state.phase,
                    discard_pile: state.discardPile,
                    draw_pile: state.drawPile,
                }).eq('room_code', roomCode);

                if (result.eliminatedPlayers) {
                    for (const p of result.eliminatedPlayers) {
                        await supabase.from('players').update({ is_eliminated: true }).eq('id', p.id);
                    }
                }

                for (const p of state.players) {
                    await supabase.from('player_hands').update({ cards: p.hand }).eq('player_id', p.id);
                }

                if (state.phase === 'game_over') {
                    await supabase.from('rooms').update({ status: 'game_over' }).eq('code', roomCode);
                }

                // Broadcast
                await broadcastToRoom('s2c:cards_drawn', { playerId, count: drawCount });
                if (result.eliminatedPlayers) {
                    for (const p of result.eliminatedPlayers) {
                        await broadcastToRoom('s2c:player_eliminated', { playerId: p.id, playerName: p.name });
                    }
                }
                if (state.phase === 'game_over' && state.winnerId) {
                    const winner = state.players.find((p: any) => p.id === state.winnerId);
                    await broadcastToRoom('s2c:game_over', { winnerId: state.winnerId, winnerName: winner?.name ?? 'Someone' });
                }

                await broadcastStateToAll(state);
                return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
            }

            case 'choose_color': {
                if (!roomCode || !playerId || !chosenColor) return new Response(JSON.stringify({ error: 'Missing parameters' }), { status: 400, headers: corsHeaders });

                const { data: gameRow } = await supabase.from('games').select('*').eq('room_code', roomCode).maybeSingle();
                if (!gameRow) return new Response(JSON.stringify({ error: 'Game not found' }), { status: 404, headers: corsHeaders });

                const { data: dbPlayers } = await supabase.from('players').select('*').eq('room_code', roomCode);
                const { data: handsRows } = await supabase.from('player_hands').select('*').eq('room_code', roomCode);

                const playersList = dbPlayers || [];
                const handsMap = (handsRows || []).reduce((acc: any, row: any) => {
                    acc[row.player_id] = row.cards;
                    return acc;
                }, {});

                const state: any = {
                    roomCode,
                    currentPlayerIndex: gameRow.current_player_index,
                    direction: gameRow.direction,
                    chosenColor: gameRow.chosen_color,
                    drawStack: gameRow.draw_stack,
                    drawStackOriginIndex: gameRow.draw_stack_origin_index,
                    winnerId: gameRow.winner_id,
                    phase: gameRow.phase,
                    discard_pile: gameRow.discard_pile,
                    draw_pile: gameRow.draw_pile,
                    discardPile: gameRow.discard_pile,
                    drawPile: gameRow.draw_pile,
                    players: playersList.map((p) => ({
                        id: p.id,
                        name: p.name,
                        isEliminated: p.is_eliminated,
                        hand: handsMap[p.id] || [],
                    })),
                };

                const result = chooseColor(state, playerId, chosenColor as CardColor);
                if (!result.success) {
                    return new Response(JSON.stringify({ error: result.error }), { status: 400, headers: corsHeaders });
                }

                await supabase.from('games').update({
                    current_player_index: state.currentPlayerIndex,
                    chosen_color: state.chosenColor,
                    phase: state.phase,
                }).eq('room_code', roomCode);

                await broadcastStateToAll(state);
                return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
            }

            case 'choose_swap_target': {
                if (!roomCode || !playerId || !targetPlayerId) return new Response(JSON.stringify({ error: 'Missing parameters' }), { status: 400, headers: corsHeaders });

                const { data: gameRow } = await supabase.from('games').select('*').eq('room_code', roomCode).maybeSingle();
                if (!gameRow) return new Response(JSON.stringify({ error: 'Game not found' }), { status: 404, headers: corsHeaders });

                const { data: dbPlayers } = await supabase.from('players').select('*').eq('room_code', roomCode);
                const { data: handsRows } = await supabase.from('player_hands').select('*').eq('room_code', roomCode);

                const playersList = dbPlayers || [];
                const handsMap = (handsRows || []).reduce((acc: any, row: any) => {
                    acc[row.player_id] = row.cards;
                    return acc;
                }, {});

                const state: any = {
                    roomCode,
                    currentPlayerIndex: gameRow.current_player_index,
                    direction: gameRow.direction,
                    chosenColor: gameRow.chosen_color,
                    drawStack: gameRow.draw_stack,
                    drawStackOriginIndex: gameRow.draw_stack_origin_index,
                    winnerId: gameRow.winner_id,
                    phase: gameRow.phase,
                    discard_pile: gameRow.discard_pile,
                    draw_pile: gameRow.draw_pile,
                    discardPile: gameRow.discard_pile,
                    drawPile: gameRow.draw_pile,
                    players: playersList.map((p) => ({
                        id: p.id,
                        name: p.name,
                        isEliminated: p.is_eliminated,
                        hand: handsMap[p.id] || [],
                    })),
                };

                const result = chooseSwapTarget(state, playerId, targetPlayerId);
                if (!result.success) {
                    return new Response(JSON.stringify({ error: result.error }), { status: 400, headers: corsHeaders });
                }

                // Save
                await supabase.from('games').update({
                    current_player_index: state.currentPlayerIndex,
                    phase: state.phase,
                    winner_id: state.winnerId,
                    discard_pile: state.discardPile,
                    draw_pile: state.drawPile,
                }).eq('room_code', roomCode);

                if (result.eliminatedPlayers) {
                    for (const p of result.eliminatedPlayers) {
                        await supabase.from('players').update({ is_eliminated: true }).eq('id', p.id);
                    }
                }

                for (const p of state.players) {
                    await supabase.from('player_hands').update({ cards: p.hand }).eq('player_id', p.id);
                }

                if (state.phase === 'game_over') {
                    await supabase.from('rooms').update({ status: 'game_over' }).eq('code', roomCode);
                }

                // Broadcast
                await broadcastToRoom('s2c:hands_swapped', { player1: playerId, player2: targetPlayerId });
                if (result.eliminatedPlayers) {
                    for (const p of result.eliminatedPlayers) {
                        await broadcastToRoom('s2c:player_eliminated', { playerId: p.id, playerName: p.name });
                    }
                }
                if (state.phase === 'game_over' && state.winnerId) {
                    const winner = state.players.find((p: any) => p.id === state.winnerId);
                    await broadcastToRoom('s2c:game_over', { winnerId: state.winnerId, winnerName: winner?.name ?? 'Someone' });
                }

                await broadcastStateToAll(state);
                return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
            }

            case 'color_roulette_choice': {
                if (!roomCode || !playerId || !color) return new Response(JSON.stringify({ error: 'Missing parameters' }), { status: 400, headers: corsHeaders });

                const { data: gameRow } = await supabase.from('games').select('*').eq('room_code', roomCode).maybeSingle();
                if (!gameRow) return new Response(JSON.stringify({ error: 'Game not found' }), { status: 404, headers: corsHeaders });

                const { data: dbPlayers } = await supabase.from('players').select('*').eq('room_code', roomCode);
                const { data: handsRows } = await supabase.from('player_hands').select('*').eq('room_code', roomCode);

                const playersList = dbPlayers || [];
                const handsMap = (handsRows || []).reduce((acc: any, row: any) => {
                    acc[row.player_id] = row.cards;
                    return acc;
                }, {});

                const state: any = {
                    roomCode,
                    currentPlayerIndex: gameRow.current_player_index,
                    direction: gameRow.direction,
                    chosenColor: gameRow.chosen_color,
                    drawStack: gameRow.draw_stack,
                    drawStackOriginIndex: gameRow.draw_stack_origin_index,
                    winnerId: gameRow.winner_id,
                    phase: gameRow.phase,
                    discard_pile: gameRow.discard_pile,
                    draw_pile: gameRow.draw_pile,
                    discardPile: gameRow.discard_pile,
                    drawPile: gameRow.draw_pile,
                    players: playersList.map((p) => ({
                        id: p.id,
                        name: p.name,
                        isEliminated: p.is_eliminated,
                        hand: handsMap[p.id] || [],
                    })),
                };

                const result = resolveColorRoulette(state, playerId, color as CardColor);
                if (!result.success) {
                    return new Response(JSON.stringify({ error: result.error }), { status: 400, headers: corsHeaders });
                }

                // Save
                await supabase.from('games').update({
                    current_player_index: state.currentPlayerIndex,
                    phase: state.phase,
                    winner_id: state.winnerId,
                    discard_pile: state.discardPile,
                    draw_pile: state.drawPile,
                }).eq('room_code', roomCode);

                if (result.eliminatedPlayers) {
                    for (const p of result.eliminatedPlayers) {
                        await supabase.from('players').update({ is_eliminated: true }).eq('id', p.id);
                    }
                }

                for (const p of state.players) {
                    await supabase.from('player_hands').update({ cards: p.hand }).eq('player_id', p.id);
                }

                if (state.phase === 'game_over') {
                    await supabase.from('rooms').update({ status: 'game_over' }).eq('code', roomCode);
                }

                // Broadcast
                if (result.rouletteCards) {
                    await broadcastToRoom('s2c:color_roulette_reveal', { cards: result.rouletteCards, playerId });
                }
                if (result.eliminatedPlayers) {
                    for (const p of result.eliminatedPlayers) {
                        await broadcastToRoom('s2c:player_eliminated', { playerId: p.id, playerName: p.name });
                    }
                }
                if (state.phase === 'game_over' && state.winnerId) {
                    const winner = state.players.find((p: any) => p.id === state.winnerId);
                    await broadcastToRoom('s2c:game_over', { winnerId: state.winnerId, winnerName: winner?.name ?? 'Someone' });
                }

                await broadcastStateToAll(state);
                return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
            }

            case 'reconnect':
            case 'rejoin_by_name': {
                if (!roomCode) return new Response(JSON.stringify({ error: 'Room code required' }), { status: 400, headers: corsHeaders });

                const { data: room } = await supabase.from('rooms').select('*').eq('code', roomCode).maybeSingle();
                if (!room) return new Response(JSON.stringify({ error: 'Room not found' }), { status: 400, headers: corsHeaders });

                let targetPlayer = null;
                if (action === 'reconnect' && playerId) {
                    const { data } = await supabase.from('players').select('*').eq('id', playerId).eq('room_code', roomCode).maybeSingle();
                    targetPlayer = data;
                } else if (action === 'rejoin_by_name' && playerName) {
                    const { data } = await supabase.from('players').select('*').eq('room_code', roomCode).ilike('name', playerName.trim()).maybeSingle();
                    targetPlayer = data;
                }

                if (!targetPlayer) {
                    return new Response(JSON.stringify({ error: 'Player not found in this room' }), { status: 404, headers: corsHeaders });
                }

                // Mark connected in DB
                await supabase.from('players').update({ connected: true }).eq('id', targetPlayer.id);

                // Broadcast player reconnected
                await broadcastToRoom('s2c:player_reconnected', { playerId: targetPlayer.id });

                const { data: dbPlayers } = await supabase.from('players').select('*').eq('room_code', roomCode);
                const playersList = dbPlayers || [];

                const lobbyState = {
                    roomCode,
                    players: playersList.map((p) => ({ id: p.id, name: p.name, isHost: p.id === room.host_id })),
                    maxPlayers: 4,
                };

                const gameInProgress = room.status === 'playing';

                // If game is in progress, also send the current game state to all players
                if (gameInProgress) {
                    const { data: gameRow } = await supabase.from('games').select('*').eq('room_code', roomCode).maybeSingle();
                    if (gameRow) {
                        const { data: handsRows } = await supabase.from('player_hands').select('*').eq('room_code', roomCode);
                        const handsMap = (handsRows || []).reduce((acc: any, row: any) => {
                            acc[row.player_id] = row.cards;
                            return acc;
                        }, {});

                        const state: any = {
                            roomCode,
                            currentPlayerIndex: gameRow.current_player_index,
                            direction: gameRow.direction,
                            chosenColor: gameRow.chosen_color,
                            drawStack: gameRow.draw_stack,
                            drawStackOriginIndex: gameRow.draw_stack_origin_index,
                            winnerId: gameRow.winner_id,
                            phase: gameRow.phase,
                            discard_pile: gameRow.discard_pile,
                            draw_pile: gameRow.draw_pile,
                            discardPile: gameRow.discard_pile,
                            drawPile: gameRow.draw_pile,
                            players: playersList.map((p) => ({
                                id: p.id,
                                name: p.name,
                                isEliminated: p.is_eliminated,
                                hand: handsMap[p.id] || [],
                            })),
                        };
                        await broadcastStateToAll(state);
                    }
                } else {
                    // Update lobby for others
                    await broadcastLobbyUpdate(roomCode);
                }

                return new Response(
                    JSON.stringify({
                        success: true,
                        playerId: targetPlayer.id,
                        roomCode,
                        lobby: lobbyState,
                        gameInProgress,
                    }),
                    { headers: corsHeaders }
                );
            }

            case 'eliminate_disconnected_player': {
                if (!roomCode || !targetPlayerId) return new Response(JSON.stringify({ error: 'Missing parameters' }), { status: 400, headers: corsHeaders });

                // 1. Verify player is actually disconnected
                const { data: playerRow } = await supabase.from('players').select('*').eq('id', targetPlayerId).maybeSingle();
                if (!playerRow || playerRow.connected) {
                    return new Response(JSON.stringify({ error: 'Player is still connected or not found' }), { status: 400, headers: corsHeaders });
                }

                // 2. Load game
                const { data: gameRow } = await supabase.from('games').select('*').eq('room_code', roomCode).maybeSingle();
                if (!gameRow) return new Response(JSON.stringify({ error: 'Game not found' }), { status: 404, headers: corsHeaders });

                const { data: dbPlayers } = await supabase.from('players').select('*').eq('room_code', roomCode);
                const { data: handsRows } = await supabase.from('player_hands').select('*').eq('room_code', roomCode);

                const playersList = dbPlayers || [];
                const handsMap = (handsRows || []).reduce((acc: any, row: any) => {
                    acc[row.player_id] = row.cards;
                    return acc;
                }, {});

                const state: any = {
                    roomCode,
                    currentPlayerIndex: gameRow.current_player_index,
                    direction: gameRow.direction,
                    chosenColor: gameRow.chosen_color,
                    drawStack: gameRow.draw_stack,
                    drawStackOriginIndex: gameRow.draw_stack_origin_index,
                    winnerId: gameRow.winner_id,
                    phase: gameRow.phase,
                    discard_pile: gameRow.discard_pile,
                    draw_pile: gameRow.draw_pile,
                    discardPile: gameRow.discard_pile,
                    drawPile: gameRow.draw_pile,
                    players: playersList.map((p) => ({
                        id: p.id,
                        name: p.name,
                        isEliminated: p.is_eliminated,
                        hand: handsMap[p.id] || [],
                    })),
                };

                const gamePlayer = state.players.find((p: any) => p.id === targetPlayerId);
                if (gamePlayer && !gamePlayer.isEliminated) {
                    gamePlayer.isEliminated = true;
                    state.drawPile.push(...gamePlayer.hand);
                    gamePlayer.hand = [];

                    // Save
                    await supabase.from('players').update({ is_eliminated: true }).eq('id', targetPlayerId);
                    await supabase.from('player_hands').update({ cards: [] }).eq('player_id', targetPlayerId);
                    await supabase.from('games').update({
                        draw_pile: state.drawPile,
                    }).eq('room_code', roomCode);

                    // Check win/gameover
                    const winnerId = checkWinCondition(state);
                    if (winnerId) {
                        state.winnerId = winnerId;
                        state.phase = 'game_over';
                        await supabase.from('games').update({ winner_id: winnerId, phase: 'game_over' }).eq('room_code', roomCode);
                        await supabase.from('rooms').update({ status: 'game_over' }).eq('code', roomCode);
                    }

                    // Broadcast
                    await broadcastToRoom('s2c:player_eliminated', { playerId: targetPlayerId, playerName: playerRow.name });
                    if (state.phase === 'game_over' && state.winnerId) {
                        const winner = state.players.find((p: any) => p.id === state.winnerId);
                        await broadcastToRoom('s2c:game_over', { winnerId: state.winnerId, winnerName: winner?.name ?? 'Someone' });
                    }

                    await broadcastStateToAll(state);
                }

                return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
            }

            default:
                return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), { status: 400, headers: corsHeaders });
        }
    } catch (err) {
        console.error('Error handling request:', err);
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
    }
});
