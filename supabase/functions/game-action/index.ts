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
import { checkWinCondition } from './rules.ts';
import { chooseBotAction, pickBotNames } from './bot.ts';
import { MAX_PLAYERS } from './constants.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
};

function sortPlayers(players: any[]): any[] {
    return [...players].sort((a, b) => {
        if (a.is_host && !b.is_host) return -1;
        if (!a.is_host && b.is_host) return 1;
        return a.id.localeCompare(b.id);
    });
}

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
            isPublic,
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
                .select('id, name, is_host, is_bot')
                .eq('room_code', code);
            if (players) {
                const sorted = sortPlayers(players);
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
                                    players: sorted.map((p) => ({ id: p.id, name: p.name, isHost: p.is_host, isBot: p.is_bot })),
                                    maxPlayers: MAX_PLAYERS,
                                },
                            },
                        ],
                    }),
                });
            }
        };

        // --- Helper: fetch joinable public rooms ---
        const getPublicRoomsList = async () => {
            const { data } = await supabase
                .from('rooms')
                .select('code, created_at, players(id, name, is_host)')
                .eq('is_public', true)
                .eq('status', 'lobby')
                .order('created_at', { ascending: false })
                .limit(20);
            return (data || [])
                .map((r: any) => ({
                    code: r.code,
                    hostName: r.players?.find((p: any) => p.is_host)?.name ?? 'Host',
                    playerCount: r.players?.length ?? 0,
                    maxPlayers: MAX_PLAYERS,
                }))
                .filter((r: any) => r.playerCount > 0 && r.playerCount < MAX_PLAYERS);
        };

        // --- Helper: push the public rooms snapshot to everyone on the main screen ---
        const broadcastPublicRoomsUpdate = async () => {
            const roomsList = await getPublicRoomsList();
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
                            topic: 'lobby:public',
                            event: 's2c:public_rooms_update',
                            private: false,
                            payload: { rooms: roomsList },
                        },
                    ],
                }),
            });
        };

        // ═══ Bot engine ══════════════════════════════════════
        // The backend is stateless, so bot turns run here: after any
        // state-mutating action, runBotTurns keeps applying bot moves
        // (fresh DB state each iteration) until it's a human's turn.

        const loadGameState = async (code: string) => {
            const { data: gameRow } = await supabase.from('games').select('*').eq('room_code', code).maybeSingle();
            if (!gameRow) return null;
            const { data: dbPlayers } = await supabase.from('players').select('*').eq('room_code', code);
            const { data: handsRows } = await supabase.from('player_hands').select('*').eq('room_code', code);
            const playersList = sortPlayers(dbPlayers || []);
            const handsMap = (handsRows || []).reduce((acc: any, row: any) => {
                acc[row.player_id] = row.cards;
                return acc;
            }, {});
            const state: any = {
                roomCode: code,
                currentPlayerIndex: gameRow.current_player_index,
                direction: gameRow.direction,
                chosenColor: gameRow.chosen_color,
                drawStack: gameRow.draw_stack,
                drawStackOriginIndex: gameRow.draw_stack_origin_index,
                winnerId: gameRow.winner_id,
                phase: gameRow.phase,
                discardPile: gameRow.discard_pile,
                drawPile: gameRow.draw_pile,
                players: playersList.map((p) => ({
                    id: p.id,
                    name: p.name,
                    isEliminated: p.is_eliminated,
                    isBot: p.is_bot,
                    hand: handsMap[p.id] || [],
                })),
            };
            return state;
        };

        const persistState = async (state: any, eliminatedPlayers?: any[]) => {
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
            }).eq('room_code', state.roomCode);
            if (eliminatedPlayers) {
                for (const p of eliminatedPlayers) {
                    await supabase.from('players').update({ is_eliminated: true }).eq('id', p.id);
                }
            }
            for (const p of state.players) {
                await supabase.from('player_hands').update({ cards: p.hand }).eq('player_id', p.id);
            }
            if (state.phase === 'game_over') {
                await supabase.from('rooms').update({ status: 'game_over' }).eq('code', state.roomCode);
            }
        };

        const broadcastResultEvents = async (
            state: any,
            actorId: string,
            result: any,
            extra: { playedCard?: any; drawCount?: number; swapTargetId?: string } = {},
        ) => {
            if (extra.playedCard) {
                await broadcastToRoom('s2c:card_played', { playerId: actorId, card: extra.playedCard });
            }
            if (extra.drawCount) {
                await broadcastToRoom('s2c:cards_drawn', { playerId: actorId, count: extra.drawCount });
            }
            if (extra.swapTargetId) {
                await broadcastToRoom('s2c:hands_swapped', { player1: actorId, player2: extra.swapTargetId });
            }
            if (result.rouletteCards) {
                await broadcastToRoom('s2c:color_roulette_reveal', { cards: result.rouletteCards, playerId: actorId });
            }
            if (result.handsPassed) {
                await broadcastToRoom('s2c:hands_passed', {});
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
        };

        const BOT_PHASES = ['playing', 'choosing_color', 'choosing_swap_target', 'color_roulette'];

        const runBotTurns = async () => {
            if (!roomCode) return;
            for (let i = 0; i < 60; i++) {
                // Fresh state every iteration: another invocation (a human
                // action or a racing bot loop) may have moved the game on.
                const state = await loadGameState(roomCode);
                if (!state) return;
                if (state.winnerId || !BOT_PHASES.includes(state.phase)) return;
                const bot = state.players[state.currentPlayerIndex];
                if (!bot?.isBot || bot.isEliminated) return; // human's turn → done

                // Thinking pause so moves animate naturally; hurry when no
                // humans are left to watch (finishing out the game).
                const humansActive = state.players.some((p: any) => !p.isBot && !p.isEliminated);
                await new Promise((r) => setTimeout(r, humansActive ? 700 : 300));

                const decision = chooseBotAction(state);
                let result: any;
                const extra: { playedCard?: any; drawCount?: number; swapTargetId?: string } = {};

                switch (decision.type) {
                    case 'play_card': {
                        extra.playedCard = bot.hand.find((c: any) => c.id === decision.cardId);
                        // Colorless wilds on purpose: the two-step
                        // choose_color path is the battle-tested one.
                        result = playCard(state, bot.id, decision.cardId);
                        break;
                    }
                    case 'draw_card': {
                        extra.drawCount = state.drawStack > 0 ? state.drawStack : 1;
                        result = drawCard(state, bot.id);
                        break;
                    }
                    case 'choose_color':
                        result = chooseColor(state, bot.id, decision.color);
                        break;
                    case 'choose_swap_target': {
                        extra.swapTargetId = decision.targetPlayerId;
                        result = chooseSwapTarget(state, bot.id, decision.targetPlayerId);
                        break;
                    }
                    case 'color_roulette_choice':
                        result = resolveColorRoulette(state, bot.id, decision.color);
                        break;
                }

                if (!result?.success) {
                    // Lost a race with another invocation, or a logic gap —
                    // stop quietly; a reconnect re-kicks the loop if needed.
                    console.error(`[bot] ${bot.name} ${decision.type} failed: ${result?.error}`);
                    return;
                }

                await persistState(state, result.eliminatedPlayers);
                await broadcastResultEvents(state, bot.id, result, extra);
            }
            console.error('[bot] iteration cap reached for room', roomCode);
        };

        const scheduleBotTurns = () => {
            const p = runBotTurns().catch((e) => console.error('[bot] loop error:', e));
            // Keep the function alive past the response where supported
            (globalThis as any).EdgeRuntime?.waitUntil?.(p);
        };

        // --- Router ---
        switch (action) {
            case 'create_room': {
                if (!playerName) return new Response(JSON.stringify({ error: 'Player name required' }), { status: 400, headers: corsHeaders });

                // Lazy cleanup: Delete rooms older than 12 hours (cascade deletes players/games/hands)
                const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
                supabase.from('rooms').delete().lt('created_at', twelveHoursAgo).then(({ error }) => {
                    if (error) console.error('Error cleaning up old rooms:', error);
                    // Stale public rooms may have vanished — refresh viewers' lists
                    else broadcastPublicRoomsUpdate().catch((e) => console.error('public rooms rebroadcast failed:', e));
                });

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
                // is_public only included when true, so private creation
                // (the default) still works if the column migration hasn't
                // been applied yet.
                const { error: roomErr } = await supabase
                    .from('rooms')
                    .insert({ code, status: 'lobby', ...(isPublic ? { is_public: true } : {}) });
                if (roomErr) throw roomErr;

                // 3. Create player row
                const playerUUID = crypto.randomUUID();
                const { error: playerErr } = await supabase
                    .from('players')
                    .insert({ id: playerUUID, room_code: code, name: playerName, is_host: true });
                if (playerErr) throw playerErr;

                // 4. Set room host
                await supabase.from('rooms').update({ host_id: playerUUID }).eq('code', code);

                // 5. Public rooms appear on everyone's main screen immediately
                if (isPublic) await broadcastPublicRoomsUpdate();

                const lobbyState = {
                    roomCode: code,
                    players: [{ id: playerUUID, name: playerName, isHost: true }],
                    maxPlayers: MAX_PLAYERS,
                };

                return new Response(JSON.stringify({ roomCode: code, playerId: playerUUID, lobby: lobbyState }), { headers: corsHeaders });
            }

            case 'create_bot_game': {
                if (!playerName) return new Response(JSON.stringify({ error: 'Player name required' }), { status: 400, headers: corsHeaders });
                const bots = Math.max(1, Math.min(MAX_PLAYERS - 1, Number(body.botCount) || 1));

                // 1. Generate room code (same alphabet as create_room)
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

                // 2. Room is always private — bot games never appear publicly
                const { error: roomErr } = await supabase.from('rooms').insert({ code, status: 'lobby' });
                if (roomErr) throw roomErr;

                // 3. Human host + bots
                const playerUUID = crypto.randomUUID();
                const { error: playerErr } = await supabase
                    .from('players')
                    .insert({ id: playerUUID, room_code: code, name: playerName, is_host: true });
                if (playerErr) throw playerErr;
                await supabase.from('rooms').update({ host_id: playerUUID }).eq('code', code);

                const botNames = pickBotNames(bots, [playerName]);
                const botRows = botNames.map((name) => ({
                    id: crypto.randomUUID(),
                    room_code: code,
                    name,
                    is_host: false,
                    is_bot: true,
                    connected: true,
                }));
                const { error: botErr } = await supabase.from('players').insert(botRows);
                if (botErr) throw botErr;

                const lobbyState = {
                    roomCode: code,
                    players: [
                        { id: playerUUID, name: playerName, isHost: true, isBot: false },
                        ...botRows.map((b) => ({ id: b.id, name: b.name, isHost: false, isBot: true })),
                    ],
                    maxPlayers: MAX_PLAYERS,
                };

                return new Response(JSON.stringify({ roomCode: code, playerId: playerUUID, lobby: lobbyState }), { headers: corsHeaders });
            }

            case 'add_bot': {
                if (!roomCode || !playerId) return new Response(JSON.stringify({ error: 'Missing parameters' }), { status: 400, headers: corsHeaders });
                const code = roomCode.toUpperCase();

                const { data: room } = await supabase.from('rooms').select('*').eq('code', code).maybeSingle();
                if (!room) return new Response(JSON.stringify({ error: 'Room not found' }), { status: 400, headers: corsHeaders });
                if (room.status !== 'lobby') return new Response(JSON.stringify({ error: 'Game already in progress' }), { status: 400, headers: corsHeaders });
                if (room.host_id !== playerId) return new Response(JSON.stringify({ error: 'Only the host can add bots' }), { status: 403, headers: corsHeaders });

                const { data: players } = await supabase.from('players').select('id, name').eq('room_code', code);
                const current = players || [];
                if (current.length >= MAX_PLAYERS) return new Response(JSON.stringify({ error: 'Room is full' }), { status: 400, headers: corsHeaders });

                const [botName] = pickBotNames(1, current.map((p) => p.name));
                const { error: botErr } = await supabase.from('players').insert({
                    id: crypto.randomUUID(),
                    room_code: code,
                    name: botName,
                    is_host: false,
                    is_bot: true,
                    connected: true,
                });
                if (botErr) throw botErr;

                await broadcastLobbyUpdate(code);
                if (room.is_public) await broadcastPublicRoomsUpdate();

                return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
            }

            case 'remove_bot': {
                if (!roomCode || !playerId || !targetPlayerId) return new Response(JSON.stringify({ error: 'Missing parameters' }), { status: 400, headers: corsHeaders });
                const code = roomCode.toUpperCase();

                const { data: room } = await supabase.from('rooms').select('*').eq('code', code).maybeSingle();
                if (!room) return new Response(JSON.stringify({ error: 'Room not found' }), { status: 400, headers: corsHeaders });
                if (room.status !== 'lobby') return new Response(JSON.stringify({ error: 'Game already in progress' }), { status: 400, headers: corsHeaders });
                if (room.host_id !== playerId) return new Response(JSON.stringify({ error: 'Only the host can remove bots' }), { status: 403, headers: corsHeaders });

                const { data: target } = await supabase.from('players').select('*').eq('id', targetPlayerId).eq('room_code', code).maybeSingle();
                if (!target?.is_bot) return new Response(JSON.stringify({ error: 'Not a bot in this room' }), { status: 400, headers: corsHeaders });

                await supabase.from('players').delete().eq('id', targetPlayerId);

                await broadcastLobbyUpdate(code);
                if (room.is_public) await broadcastPublicRoomsUpdate();

                return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
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
                const { data: players } = await supabase.from('players').select('id, name, is_bot').eq('room_code', formattedCode);
                const currentPlayers = players || [];
                if (currentPlayers.length >= MAX_PLAYERS) return new Response(JSON.stringify({ error: 'Room is full' }), { status: 400, headers: corsHeaders });

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

                // Player count changed — keep the public list fresh
                if (room.is_public) await broadcastPublicRoomsUpdate();

                const lobbyState = {
                    roomCode: formattedCode,
                    players: [...currentPlayers.map((p) => ({ id: p.id, name: p.name, isHost: p.id === room.host_id, isBot: p.is_bot })), { id: playerUUID, name: playerName, isHost: false, isBot: false }],
                    maxPlayers: MAX_PLAYERS,
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
                const playersList = sortPlayers(dbPlayers || []);
                if (playersList.length < 2) return new Response(JSON.stringify({ error: 'Need at least 2 players' }), { status: 400, headers: corsHeaders });

                // Create state
                const gameState = initializeNewGame(roomCode, playersList.map((p) => ({ id: p.id, name: p.name, isBot: p.is_bot })));

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

                // Started games leave the public list (status is no longer 'lobby')
                if (room.is_public) await broadcastPublicRoomsUpdate();

                scheduleBotTurns(); // guard: first turn is normally the human host
                return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
            }

            case 'list_public_rooms': {
                return new Response(JSON.stringify({ rooms: await getPublicRoomsList() }), { headers: corsHeaders });
            }

            case 'play_card': {
                if (!roomCode || !playerId || !cardId) return new Response(JSON.stringify({ error: 'Missing parameters' }), { status: 400, headers: corsHeaders });

                // Load Game State
                const { data: gameRow } = await supabase.from('games').select('*').eq('room_code', roomCode).maybeSingle();
                if (!gameRow) return new Response(JSON.stringify({ error: 'Game not found' }), { status: 404, headers: corsHeaders });

                const { data: dbPlayers } = await supabase.from('players').select('*').eq('room_code', roomCode);
                const { data: handsRows } = await supabase.from('player_hands').select('*').eq('room_code', roomCode);

                const playersList = sortPlayers(dbPlayers || []);
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
                        isBot: p.is_bot,
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
                scheduleBotTurns();
                return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
            }

            case 'draw_card': {
                if (!roomCode || !playerId) return new Response(JSON.stringify({ error: 'Missing parameters' }), { status: 400, headers: corsHeaders });

                const { data: gameRow } = await supabase.from('games').select('*').eq('room_code', roomCode).maybeSingle();
                if (!gameRow) return new Response(JSON.stringify({ error: 'Game not found' }), { status: 404, headers: corsHeaders });

                const { data: dbPlayers } = await supabase.from('players').select('*').eq('room_code', roomCode);
                const { data: handsRows } = await supabase.from('player_hands').select('*').eq('room_code', roomCode);

                const playersList = sortPlayers(dbPlayers || []);
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
                        isBot: p.is_bot,
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
                scheduleBotTurns();
                return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
            }

            case 'choose_color': {
                const finalColor = chosenColor || color;
                if (!roomCode || !playerId || !finalColor) return new Response(JSON.stringify({ error: 'Missing parameters' }), { status: 400, headers: corsHeaders });

                const { data: gameRow } = await supabase.from('games').select('*').eq('room_code', roomCode).maybeSingle();
                if (!gameRow) return new Response(JSON.stringify({ error: 'Game not found' }), { status: 404, headers: corsHeaders });

                const { data: dbPlayers } = await supabase.from('players').select('*').eq('room_code', roomCode);
                const { data: handsRows } = await supabase.from('player_hands').select('*').eq('room_code', roomCode);

                const playersList = sortPlayers(dbPlayers || []);
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
                        isBot: p.is_bot,
                        hand: handsMap[p.id] || [],
                    })),
                };

                const result = chooseColor(state, playerId, finalColor as CardColor);
                if (!result.success) {
                    return new Response(JSON.stringify({ error: result.error }), { status: 400, headers: corsHeaders });
                }

                await supabase.from('games').update({
                    current_player_index: state.currentPlayerIndex,
                    chosen_color: state.chosenColor,
                    phase: state.phase,
                }).eq('room_code', roomCode);

                await broadcastStateToAll(state);
                scheduleBotTurns();
                return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
            }

            case 'choose_swap_target': {
                if (!roomCode || !playerId || !targetPlayerId) return new Response(JSON.stringify({ error: 'Missing parameters' }), { status: 400, headers: corsHeaders });

                const { data: gameRow } = await supabase.from('games').select('*').eq('room_code', roomCode).maybeSingle();
                if (!gameRow) return new Response(JSON.stringify({ error: 'Game not found' }), { status: 404, headers: corsHeaders });

                const { data: dbPlayers } = await supabase.from('players').select('*').eq('room_code', roomCode);
                const { data: handsRows } = await supabase.from('player_hands').select('*').eq('room_code', roomCode);

                const playersList = sortPlayers(dbPlayers || []);
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
                        isBot: p.is_bot,
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
                scheduleBotTurns();
                return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
            }

            case 'color_roulette_choice': {
                if (!roomCode || !playerId || !color) return new Response(JSON.stringify({ error: 'Missing parameters' }), { status: 400, headers: corsHeaders });

                const { data: gameRow } = await supabase.from('games').select('*').eq('room_code', roomCode).maybeSingle();
                if (!gameRow) return new Response(JSON.stringify({ error: 'Game not found' }), { status: 404, headers: corsHeaders });

                const { data: dbPlayers } = await supabase.from('players').select('*').eq('room_code', roomCode);
                const { data: handsRows } = await supabase.from('player_hands').select('*').eq('room_code', roomCode);

                const playersList = sortPlayers(dbPlayers || []);
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
                        isBot: p.is_bot,
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
                scheduleBotTurns();
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
                const playersList = sortPlayers(dbPlayers || []);

                const lobbyState = {
                    roomCode,
                    players: playersList.map((p) => ({ id: p.id, name: p.name, isHost: p.id === room.host_id, isBot: p.is_bot })),
                    maxPlayers: MAX_PLAYERS,
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
                                isBot: p.is_bot,
                                hand: handsMap[p.id] || [],
                            })),
                        };
                        await broadcastStateToAll(state);
                    }
                    // Self-heal: if a bot turn ever stalled (loop error /
                    // runtime reaped), a returning player kicks it back on
                    scheduleBotTurns();
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

                const playersList = sortPlayers(dbPlayers || []);
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
                        isBot: p.is_bot,
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
                    // The departed player's turn may now belong to a bot
                    scheduleBotTurns();
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
