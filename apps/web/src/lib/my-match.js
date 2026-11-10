// "My match" card on the event page: what the signed-in player has to do
// next in this event. Pure.
//
// state:
//   checkin       check-in is open and the player has not checked in
//   checked-in    checked in, waiting for the start
//   checkin-soon  check-in opens later (checkin.opens_at)
//   registered    registered, nothing to do before the start
//   play          the next match can be played and nobody reported it
//   reported      the player reported a score: the opponent confirms it
//   confirm       the opponent reported a score: confirm or dispute it
//   claimed       the opponent claims a walkover: dispute it if wrong
//   claim         the player claimed a walkover: an admin confirms it
//   disputed      a report is disputed: an admin settles it
//   waiting       the next match waits for its opponent (previous match)
//   idle          no match right now (between Swiss rounds, or done)
//   out           eliminated (lost an elimination match, nothing pending)
//   forfeited     kept in the event without checking in: every match is lost

const decided = (m) => m.status === "completed" || m.status === "walkover";
const GROUP_STAGE = new Set(["sw", "gse", "gwb", "glb"]);

/** The match the player plays next: a playable one first, then one waiting for an opponent. */
export function nextMatchOf(matches = [], playerId, order = null) {
  const mine = matches.filter((m) => m.status === "pending" && (m.player1_id === playerId || m.player2_id === playerId));
  const rank = (m) => order?.get?.(m.id) ?? m.id;
  const byOrder = (a, b) => rank(a) - rank(b);
  const playable = mine.filter((m) => m.player1_id && m.player2_id).sort(byOrder);
  if (playable.length) return playable[0];
  return mine.sort(byOrder)[0] || null;
}

/** The report from this player's side: { mine, kind, myScore, theirScore, winner, disputed, counter }. */
export function reportView(match, playerId) {
  const r = match?.pending_report;
  if (!r) return null;
  const meFirst = match.player1_id === playerId;
  const flip = (x) => (x ? { ...x, myScore: meFirst ? x.score1 : x.score2, theirScore: meFirst ? x.score2 : x.score1 } : null);
  return { ...flip(r), mine: r.by === playerId, counter: flip(r.counter) };
}

export function myMatchInfo(t, playerId, { order = null } = {}) {
  if (!t || !playerId) return null;
  const me = (t.players || []).find((p) => p.id === playerId);
  if (!me) return null;

  if (t.status === "registration") {
    const c = t.checkin || {};
    if (!c.enabled) return { state: "registered", me };
    if (me.checked_in_at) return { state: "checked-in", me, checkin: c };
    return { state: c.open ? "checkin" : "checkin-soon", me, checkin: c };
  }
  if (t.status !== "in_progress") return null;
  if (me.forfeited) return { state: "forfeited", me };

  const matches = t.matches || [];
  const match = nextMatchOf(matches, playerId, order);
  if (!match) {
    const lost = matches.some(
      (m) => decided(m) && !GROUP_STAGE.has(m.bracket) && m.winner_id && m.winner_id !== playerId
        && (m.player1_id === playerId || m.player2_id === playerId)
        // Double elimination: a winners-bracket loss drops to the losers bracket.
        && m.bracket !== "wb" && !(m.bracket === "gf" && m.position === 1 && t.grand_final_reset),
    );
    return { state: lost ? "out" : "idle", me };
  }

  const opponentId = match.player1_id === playerId ? match.player2_id : match.player1_id;
  const opponent = opponentId ? (t.players || []).find((p) => p.id === opponentId) || { id: opponentId, display_name: opponentId } : null;
  const base = { me, match, opponentId, opponent };
  if (!opponentId) return { ...base, state: "waiting" };

  const report = reportView(match, playerId);
  if (!report) return { ...base, state: "play" };
  if (report.disputed) return { ...base, report, state: "disputed" };
  if (report.mine) return { ...base, report, state: report.kind === "walkover" ? "claim" : "reported" };
  return { ...base, report, state: report.kind === "walkover" ? "claimed" : "confirm" };
}

/**
 * The one thing a player should do now on the event page, for the phone's
 * action bar (PlayerActionBar): { kind, title, label, match? } or null.
 *   register  sign-ups are open and the player isn't in yet
 *   checkin   check-in is open and they haven't checked in
 *   report    their match can be played: report the score after it
 *   confirm   the opponent reported a score: confirm or dispute it
 */
export function playerAction(t, playerId, { order = null, canSignUp = false, isRegistered = false } = {}) {
  if (!t) return null;
  if (t.status === "registration" && canSignUp && !isRegistered) {
    return { kind: "register", title: "报名进行中", label: "立即报名" };
  }
  const info = myMatchInfo(t, playerId, { order });
  if (!info) return null;
  if (info.state === "checkin") return { kind: "checkin", title: "签到已开放", label: "立即签到" };
  const vs = info.opponent ? `对手 ${info.opponent.display_name || info.opponentId}` : "";
  if (info.state === "play") return { kind: "report", title: `轮到你比赛了 · ${vs}`, label: "填报比分", match: info.match };
  if (info.state === "confirm") return { kind: "confirm", title: `对手已报分 · ${info.report.myScore} : ${info.report.theirScore}`, label: "去确认", match: info.match };
  return null;
}
