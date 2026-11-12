-- A binding code binds up to two openids within its 10 minutes: QQ gives
-- the official bot a different openid for a person in a group and in a
-- private chat (routes/bot.js BIND_CODE_USES).
ALTER TABLE axsuck.qq_bind_codes ADD COLUMN IF NOT EXISTS uses INTEGER NOT NULL DEFAULT 0;
