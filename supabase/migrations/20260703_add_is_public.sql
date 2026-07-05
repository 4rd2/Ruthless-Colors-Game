-- Public/private rooms: run this against the existing hosted DB
-- (schema.sql is the from-scratch script; this migrates in place).

ALTER TABLE rooms ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;

-- Fast lookup for the public games list (only public lobby rooms are queried)
CREATE INDEX IF NOT EXISTS idx_rooms_public_lobby
    ON rooms (is_public, status)
    WHERE is_public = true;
