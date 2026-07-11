-- Play-with-bots: bots are ordinary player rows flagged is_bot.
ALTER TABLE players ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT false;
