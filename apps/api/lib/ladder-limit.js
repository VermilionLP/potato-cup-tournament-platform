// Ladder limit of an event (migration 038): players may sign up themselves
// only when their rating in the event's own ladder division (its game mode
// and event type) is at most a given MMR, or their league at most a given
// one. Unrated and provisional players (under PROVISIONAL_GAMES games in that
// division) can't sign up. Admins adding players are not limited.

import { PROVISIONAL_GAMES } from './ladder.js';

// Lowest to highest.
export const LIMIT_TIERS = Object.freeze([
  { group: 'bronze', name: '青铜' },
  { group: 'silver', name: '白银' },
  { group: 'gold', name: '黄金' },
  { group: 'platinum', name: '白金' },
  { group: 'diamond', name: '钻石' },
  { group: 'master', name: '大师' },
]);

export const MIN_LIMIT_MMR = 1000;
export const MAX_LIMIT_MMR = 9999;

const tierIndex = (group) => LIMIT_TIERS.findIndex((t) => t.group === group);
const tierName = (group) => LIMIT_TIERS[tierIndex(group)]?.name || group;
const blank = (v) => v === undefined || v === null || v === '';

/**
 * { max_mmr, max_tier } from a request body (ladder_max_mmr /
 * ladder_max_tier; empty clears), or { error }.
 */
export function normalizeLadderLimit(body = {}) {
  const mmrRaw = body.ladder_max_mmr;
  const tierRaw = body.ladder_max_tier;
  const max_mmr = blank(mmrRaw) ? null : Number(mmrRaw);
  const max_tier = blank(tierRaw) ? null : String(tierRaw);
  if (max_mmr !== null && (!Number.isInteger(max_mmr) || max_mmr < MIN_LIMIT_MMR || max_mmr > MAX_LIMIT_MMR)) {
    return { error: `天梯分上限必须是 ${MIN_LIMIT_MMR}-${MAX_LIMIT_MMR} 之间的整数` };
  }
  if (max_tier !== null && tierIndex(max_tier) < 0) {
    return { error: `段位上限必须是：${LIMIT_TIERS.map((t) => t.group).join(', ')}` };
  }
  if (max_mmr !== null && max_tier !== null) return { error: '天梯分上限和段位上限只能设置一项' };
  return { max_mmr, max_tier };
}

export const hasLadderLimit = (t) => t?.ladder_max_mmr != null || Boolean(t?.ladder_max_tier);

/**
 * Why `rating` (the player's row in the event's division, or null when they
 * have no games there) may not sign up for event `t`; null when they may.
 */
export function ladderLimitProblem(t, rating) {
  if (!hasLadderLimit(t)) return null;
  if (!rating || !rating.games) {
    return '本场比赛有天梯分限制，你在本场比赛的天梯里还没有成绩，暂时不能报名';
  }
  if (rating.games < PROVISIONAL_GAMES) {
    return `本场比赛有天梯分限制，你在本场比赛的天梯还在定级中（${rating.games} / ${PROVISIONAL_GAMES} 场），暂时不能报名`;
  }
  if (t.ladder_max_mmr != null && rating.mmr > t.ladder_max_mmr) {
    return `本场比赛限天梯分 ${t.ladder_max_mmr} 及以下，你的天梯分是 ${rating.mmr}`;
  }
  if (t.ladder_max_tier) {
    const group = rating.tier?.group;
    const own = group === 'grandmaster' ? LIMIT_TIERS.length : tierIndex(group);
    if (own > tierIndex(t.ladder_max_tier)) {
      return `本场比赛限${tierName(t.ladder_max_tier)}及以下段位，你的段位是${rating.tier?.name || group}`;
    }
  }
  return null;
}
