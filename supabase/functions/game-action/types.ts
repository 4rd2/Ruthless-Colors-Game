// ============================================================
// Ruthless Colors — Shared Types for Deno
// ============================================================

export enum CardColor {
    Red = 'red',
    Blue = 'blue',
    Green = 'green',
    Yellow = 'yellow',
    Wild = 'wild',
}

export enum CardValue {
    Zero = '0',
    One = '1',
    Two = '2',
    Three = '3',
    Four = '4',
    Five = '5',
    Six = '6',
    Seven = '7',
    Eight = '8',
    Nine = '9',
    Skip = 'skip',
    Reverse = 'reverse',
    DrawTwo = 'draw2',
    DiscardAll = 'discard_all',
    SkipEveryone = 'skip_everyone',
    WildDrawFour = 'wild_draw4',
    WildDrawSix = 'wild_draw6',
    WildDrawTen = 'wild_draw10',
    WildColorRoulette = 'wild_color_roulette',
    WildReverseDrawFour = 'wild_reverse_draw4',
    WildParry = 'wild_parry',
}

export interface Card {
    id: string;
    color: CardColor;
    value: CardValue;
}

export interface OpponentView {
    id: string;
    name: string;
    cardCount: number;
    isEliminated: boolean;
}

export interface Player {
    id: string;
    name: string;
    hand: Card[];
    isEliminated: boolean;
}

export enum GamePhase {
    Waiting = 'waiting',
    Playing = 'playing',
    ChoosingColor = 'choosing_color',
    ChoosingSwapTarget = 'choosing_swap_target',
    ColorRoulette = 'color_roulette',
    GameOver = 'game_over',
}

export enum Direction {
    Clockwise = 1,
    CounterClockwise = -1,
}

export interface GameState {
    roomCode: string;
    players: Player[];
    currentPlayerIndex: number;
    direction: Direction;
    discardPile: Card[];
    drawPile: Card[];
    phase: GamePhase;
    chosenColor: CardColor | null;
    drawStack: number;
    drawStackOriginIndex: number;
    winnerId: string | null;
}

export interface ClientGameState {
    roomCode: string;
    you: {
        id: string;
        name: string;
        hand: Card[];
        isEliminated: boolean;
    };
    opponents: OpponentView[];
    currentPlayerId: string;
    /** Who plays after the current player (null once the game is over) */
    nextPlayerId?: string | null;
    direction: Direction;
    topCard: Card;
    drawPileCount: number;
    phase: GamePhase;
    chosenColor: CardColor | null;
    drawStack: number;
    drawStackOriginId: string | null;
    winnerId: string | null;
    lastAction: GameAction | null;
}

export interface LobbyState {
    roomCode: string;
    players: { id: string; name: string; isHost: boolean }[];
    maxPlayers: number;
}

export interface PlayCardAction {
    type: 'play_card';
    cardId: string;
    chosenColor?: CardColor;
    swapTargetId?: string;
}

export interface DrawCardAction {
    type: 'draw_card';
}

export interface ChooseColorAction {
    type: 'choose_color';
    color: CardColor;
}

export interface ChooseSwapTargetAction {
    type: 'choose_swap_target';
    targetPlayerId: string;
}

export interface ColorRouletteChoiceAction {
    type: 'color_roulette_choice';
    color: CardColor;
}

export type GameAction =
    | PlayCardAction
    | DrawCardAction
    | ChooseColorAction
    | ChooseSwapTargetAction
    | ColorRouletteChoiceAction;
