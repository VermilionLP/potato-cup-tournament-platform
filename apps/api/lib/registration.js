// Registering for an event, withdrawing and checking in: the rules, shared
// by the site's routes (routes/registrations.js, after requireSelfOrAdmin)
// and the official QQ bot's (routes/bot.js, for the player bound to the
// QQ account). Callers check who may act; these check what may happen.
// `admin` lifts the player-only limits (contact, ladder limit, the
// check-in window), as on the site.

import { PlayerRepo } from '../repositories/player-repo.js';
import { TournamentRepo } from '../repositories/tournament-repo.js';
import { LadderRepo } from '../repositories/ladder-repo.js';
import { CONTACT_REQUIRED, hasContact } from './contact.js';
import { checkinState } from './checkin.js';
import { hasLadderLimit, ladderLimitProblem } from './ladder-limit.js';

async function eventOr404(fastify, tournamentId) {
  const t = await TournamentRepo(fastify.db).getById(tournamentId);
  if (!t) throw fastify.httpErrors.notFound('Tournament not found');
  return t;
}

function reseed(fastify, t) {
  if (t.seed_mode === 'manual') return null;
  return LadderRepo(fastify.db).autoSeeds(t.id).then(() => {
    fastify.tournamentEvents.emit(`update:${t.id}`, { type: 'seeds_updated' });
  });
}

/**
 * Adds the player. `seenIp`: the request's IP when the player acts for
 * themselves (kept as their last IP, as before). Returns the event row.
 */
export async function registerPlayer(fastify, { tournamentId, playerId, admin = false, seenIp = null }) {
  const players = PlayerRepo(fastify.db);
  const tourneys = TournamentRepo(fastify.db);
  const t = await eventOr404(fastify, tournamentId);
  if (t.status !== 'registration') throw fastify.httpErrors.badRequest('报名已截止');

  const existing = await players.getById(playerId);
  if (!admin && !hasContact(existing?.battle_tags)) throw fastify.httpErrors.badRequest(CONTACT_REQUIRED);
  // Ladder limit: players signing up themselves; admins can add anyone.
  if (hasLadderLimit(t) && !admin) {
    const problem = ladderLimitProblem(t, await LadderRepo(fastify.db).limitStanding(t, playerId));
    if (problem) throw fastify.httpErrors.forbidden(problem);
  }

  if (!existing) {
    await players.upsert(playerId, 'cn', '', '', '{}', seenIp);
  } else if (seenIp) {
    await fastify.db.query('UPDATE axsuck.players SET last_ip = $1, last_seen_at = NOW() WHERE id = $2', [seenIp, playerId]);
  }
  let added;
  try {
    added = await tourneys.addPlayer(tournamentId, playerId);
  } catch (err) {
    if (err?.message === 'Tournament is full') throw fastify.httpErrors.conflict('报名人数已满');
    throw err;
  }
  if (!added) throw fastify.httpErrors.conflict('已经报名了');

  // Registration defaults to ladder-ordered seeds; manual seed edits opt out.
  await reseed(fastify, t);
  fastify.tournamentEvents.emit(`update:${tournamentId}`, { type: 'player_registered', player_id: playerId });
  return t;
}

/** Removes the player; `onlyOpen` refuses once registration has closed (the bot). Returns whether they were registered. */
export async function unregisterPlayer(fastify, { tournamentId, playerId, onlyOpen = false }) {
  const t = await eventOr404(fastify, tournamentId);
  if (onlyOpen && t.status !== 'registration') throw fastify.httpErrors.badRequest('报名已截止，请联系管理员退出');
  const was = await fastify.db.query(
    'SELECT 1 FROM axsuck.tournament_players WHERE tournament_id = $1 AND player_id = $2', [tournamentId, playerId],
  );
  await TournamentRepo(fastify.db).removePlayer(tournamentId, playerId);
  await reseed(fastify, t);
  fastify.tournamentEvents.emit(`update:${tournamentId}`, { type: 'player_unregistered', player_id: playerId });
  return was.rows.length > 0;
}

/** Checks the player in (or takes it back). Players only while check-in is open; admins any time during registration. */
export async function setCheckin(fastify, { tournamentId, playerId, checkedIn, admin = false }) {
  const t = await eventOr404(fastify, tournamentId);
  if (!t.checkin_enabled) throw fastify.httpErrors.badRequest('这场赛事不需要签到');
  if (t.status !== 'registration') throw fastify.httpErrors.badRequest('赛事已开始，签到已结束');
  if (!admin && !checkinState(t).open) {
    throw fastify.httpErrors.badRequest('签到将在开赛前 30 分钟开放');
  }
  const res = await fastify.db.query(`
    UPDATE axsuck.tournament_players SET checked_in_at = ${checkedIn ? 'COALESCE(checked_in_at, NOW())' : 'NULL'}
    WHERE tournament_id = $1 AND player_id = $2
    RETURNING checked_in_at
  `, [tournamentId, playerId]);
  if (!res.rowCount) throw fastify.httpErrors.badRequest('该选手没有报名这场赛事');
  fastify.tournamentEvents.emit(`update:${tournamentId}`, { type: checkedIn ? 'player_checked_in' : 'player_checkin_undone', player_id: playerId });
  return { player_id: playerId, checked_in_at: res.rows[0].checked_in_at };
}
