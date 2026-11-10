-- QQ bots (apps/bot).

-- Notices the community bot posts in the QQ group: the text, and the QQ
-- numbers to @ (from the players' contacts). The bot fetches unsent rows
-- and marks each one sent (lib/bot-notices.js, routes/bot.js).
CREATE TABLE IF NOT EXISTS axsuck.bot_notices (
  id BIGSERIAL PRIMARY KEY,
  kind TEXT NOT NULL,
  tournament_id TEXT,
  text TEXT NOT NULL,
  mentions TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_bot_notices_unsent
  ON axsuck.bot_notices (created_at) WHERE sent_at IS NULL;

-- The official bot's users: the openid QQ gives the bot for a person (it is
-- not the QQ number, and differs between a group and private chat) and the
-- player it belongs to. A player can have several.
CREATE TABLE IF NOT EXISTS axsuck.qq_bindings (
  openid TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES axsuck.players(id) ON DELETE CASCADE,
  bound_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_qq_bindings_player ON axsuck.qq_bindings (player_id);

-- Short-lived codes a signed-in player gets on the site and sends to the
-- official bot ("绑定 123456") to bind that QQ account.
CREATE TABLE IF NOT EXISTS axsuck.qq_bind_codes (
  code TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES axsuck.players(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);
