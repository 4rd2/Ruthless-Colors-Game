// ============================================================
// UNO No Mercy — Socket.IO Event Constants
// ============================================================

// --- Client → Server ---
export const C2S = {
    CREATE_ROOM: 'c2s:create_room',
    JOIN_ROOM: 'c2s:join_room',
    START_GAME: 'c2s:start_game',
    PLAY_CARD: 'c2s:play_card',
    DRAW_CARD: 'c2s:draw_card',
    CHOOSE_COLOR: 'c2s:choose_color',
    CHOOSE_SWAP_TARGET: 'c2s:choose_swap_target',
    COLOR_ROULETTE_CHOICE: 'c2s:color_roulette_choice',
    RECONNECT: 'c2s:reconnect',
    REJOIN_BY_NAME: 'c2s:rejoin_by_name',
} as const;

// --- Server → Client ---
export const S2C = {
    ROOM_CREATED: 's2c:room_created',
    ROOM_JOINED: 's2c:room_joined',
    LOBBY_UPDATE: 's2c:lobby_update',
    GAME_STARTED: 's2c:game_started',
    GAME_STATE: 's2c:game_state',
    CARD_PLAYED: 's2c:card_played',
    CARDS_DRAWN: 's2c:cards_drawn',
    PLAYER_ELIMINATED: 's2c:player_eliminated',
    GAME_OVER: 's2c:game_over',
    COLOR_ROULETTE_REVEAL: 's2c:color_roulette_reveal',
    HANDS_SWAPPED: 's2c:hands_swapped',
    HANDS_PASSED: 's2c:hands_passed',
    ERROR: 's2c:error',
    PLAYER_DISCONNECTED: 's2c:player_disconnected',
    PLAYER_RECONNECTED: 's2c:player_reconnected',
} as const;
