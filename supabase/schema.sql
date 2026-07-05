-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing tables if they exist to start fresh
DROP TABLE IF EXISTS player_hands CASCADE;
DROP TABLE IF EXISTS games CASCADE;
DROP TABLE IF EXISTS players CASCADE;
DROP TABLE IF EXISTS rooms CASCADE;

-- 1. Rooms Table
CREATE TABLE rooms (
    code TEXT PRIMARY KEY CHECK (length(code) = 4),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('lobby', 'playing', 'game_over')),
    host_id UUID,
    is_public BOOLEAN DEFAULT false NOT NULL
);

-- 2. Players Table
CREATE TABLE players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_code TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_host BOOLEAN DEFAULT false NOT NULL,
    connected BOOLEAN DEFAULT true NOT NULL,
    is_eliminated BOOLEAN DEFAULT false NOT NULL,
    last_seen_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 3. Games Table
CREATE TABLE games (
    room_code TEXT PRIMARY KEY REFERENCES rooms(code) ON DELETE CASCADE,
    current_player_index INT DEFAULT 0 NOT NULL,
    direction INT DEFAULT 1 NOT NULL CHECK (direction IN (1, -1)), -- 1 = Clockwise, -1 = CounterClockwise
    chosen_color TEXT CHECK (chosen_color IN ('red', 'blue', 'green', 'yellow', 'wild') OR chosen_color IS NULL),
    draw_stack INT DEFAULT 0 NOT NULL,
    draw_stack_origin_index INT DEFAULT -1 NOT NULL,
    winner_id UUID REFERENCES players(id) ON DELETE SET NULL,
    phase TEXT NOT NULL CHECK (phase IN ('waiting', 'playing', 'choosing_color', 'color_roulette', 'choosing_swap_target', 'game_over')),
    discard_pile JSONB DEFAULT '[]'::jsonb NOT NULL, -- Array of Cards
    draw_pile JSONB DEFAULT '[]'::jsonb NOT NULL -- Array of Cards
);

-- 4. Player Hands Table
CREATE TABLE player_hands (
    player_id UUID PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
    room_code TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
    cards JSONB DEFAULT '[]'::jsonb NOT NULL -- Array of Cards in the player's hand
);

-- Add indexes for performance
CREATE INDEX idx_players_room_code ON players(room_code);
CREATE INDEX idx_player_hands_room_code ON player_hands(room_code);

-- Enable Row Level Security (optional for now, but we enable tables to allow read/write or add bypass RLS policies if desired)
-- Since we are not using Supabase Auth (using custom UUIDs for players), we will allow public access for development,
-- or control access using the player_id / room_code checks.
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_hands ENABLE ROW LEVEL SECURITY;

-- Create simple permissive RLS policies for our anonymous player setup:
CREATE POLICY "Public Rooms Access" ON rooms FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Players Access" ON players FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Games Access" ON games FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Player Hands Access" ON player_hands FOR ALL USING (true) WITH CHECK (true);
