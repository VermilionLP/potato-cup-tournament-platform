// Matches waiting for an admin, in words (#lib/admin-pending.svelte.js
// polls them; AdminMenu and /admin list them). Pure.

/** A stable key per item: the same dispute is announced once. */
export const pendingKey = (i) => `${i.match_id}:${i.kind}:${i.at}`;

/** "A vs B：比分有异议" / "A vs B：B 申报对手弃权". */
export function pendingText(i, nameOf = (id) => id) {
  const vs = `${nameOf(i.player1_id)} vs ${nameOf(i.player2_id)}`;
  return i.kind === "dispute" ? `${vs}：比分有异议` : `${vs}：${nameOf(i.by)} 申报对手弃权`;
}

/** The console of the event, where the match is settled. */
export const pendingHref = (i) => `/tournament/${encodeURIComponent(i.tournament_id)}/console`;
