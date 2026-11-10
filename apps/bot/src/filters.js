// Which messages the bots may react to. Pure.

/**
 * The community (OneBot) bot answers only in whitelisted groups and never in
 * private chats, to keep the account's activity low and predictable. The
 * official bot is limited by the QQ platform itself (it only receives
 * messages that @ it, and private chats with users who added it).
 */
export function allowSession(session, config) {
  if (session.platform !== 'onebot') return true;
  if (session.isDirect || !session.guildId) return false;
  return Boolean(config.onebot?.groups.has(String(session.guildId)));
}
