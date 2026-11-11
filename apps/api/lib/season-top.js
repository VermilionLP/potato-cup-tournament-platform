// The season's Top 20, revealed one player a day from the last place to #1
// (the 年度 Top20 page, routes/season-top.js; the QQ group is told by
// lib/bot-scheduler.js). The ranking starts from the season's points summed
// over every event type (player-awards.js seasonPointsRanking); admins can
// reorder it and swap players before each one is revealed. Pure.

export const TOP_SIZE = 20;
export const REVEAL_EVERY_MS = 24 * 60 * 60 * 1000;
// Reveals older than this when the QQ notice runs are not announced late.
export const ANNOUNCE_LATE_MS = 36 * 60 * 60 * 1000;

/** Player ids, trimmed and without repeats, at most TOP_SIZE. */
export function normalizeRanking(list) {
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const id = String(raw ?? '').trim();
    if (id && !out.includes(id)) out.push(id);
    if (out.length === TOP_SIZE) break;
  }
  return out;
}

/** When the reveal of place `rank` (1 = top) happens, as ms, or null. */
export function revealAt(startAt, rank, size) {
  const start = startAt ? new Date(startAt).getTime() : NaN;
  if (!Number.isFinite(start) || rank < 1 || rank > size) return null;
  return start + (size - rank) * REVEAL_EVERY_MS;
}

/** How many places are revealed at `now` (from the last place up). */
export function revealedCount(startAt, size, now = Date.now()) {
  const start = startAt ? new Date(startAt).getTime() : NaN;
  if (!Number.isFinite(start) || now < start) return 0;
  return Math.min(size, Math.floor((now - start) / REVEAL_EVERY_MS) + 1);
}

/**
 * What visitors see: the revealed places (last place first), when the next
 * one comes and whether it's over. Unrevealed players are left out.
 */
export function publicView(row, now = Date.now()) {
  const ranking = normalizeRanking(row?.ranking);
  const size = ranking.length;
  const count = revealedCount(row?.start_at, size, now);
  const revealed = [];
  for (let k = 0; k < count; k += 1) {
    const rank = size - k;
    revealed.push({ rank, id: ranking[rank - 1], at: new Date(revealAt(row.start_at, rank, size)).toISOString() });
  }
  const nextRank = size - count;
  return {
    size,
    start_at: row?.start_at ? new Date(row.start_at).toISOString() : null,
    revealed,
    next: row?.start_at && nextRank >= 1 ? { rank: nextRank, at: new Date(revealAt(row.start_at, nextRank, size)).toISOString() } : null,
    done: size > 0 && count === size,
    started: count > 0,
  };
}

/**
 * Why an admin's change can't be saved ('' when it can): once the reveal
 * started, revealed places can't change and neither can the start.
 */
export function changeProblem(before, after, now = Date.now()) {
  const old = normalizeRanking(before?.ranking);
  const next = normalizeRanking(after.ranking);
  if (!next.length) return '至少要有 1 名选手';
  const count = revealedCount(before?.start_at, old.length, now);
  if (!count) return '';
  if (next.length !== old.length) return '揭晓开始后不能改变人数';
  const sameStart = new Date(after.start_at ?? before.start_at).getTime() === new Date(before.start_at).getTime();
  if (!sameStart) return '揭晓开始后不能修改开始时间';
  for (let k = 0; k < count; k += 1) {
    const i = old.length - 1 - k;
    if (next[i] !== old[i]) return `第 ${i + 1} 名已经揭晓，不能再改`;
  }
  return '';
}

/**
 * The reveals the QQ group should hear about now: places revealed since the
 * last notice, last place first, leaving out ones more than
 * ANNOUNCE_LATE_MS old (the site was down, or the start was set in the
 * past). Returns { ranks, announced } (the new announced count).
 */
export function revealsToAnnounce(row, now = Date.now()) {
  const ranking = normalizeRanking(row?.ranking);
  const size = ranking.length;
  const count = revealedCount(row?.start_at, size, now);
  const from = Math.max(0, Number(row?.announced) || 0);
  const ranks = [];
  for (let k = from; k < count; k += 1) {
    const rank = size - k;
    if (now - revealAt(row.start_at, rank, size) <= ANNOUNCE_LATE_MS) ranks.push(rank);
  }
  return { ranks, announced: Math.max(from, count) };
}
