// What the event page (routes/tournament/[id]) derives from an event:
// which matches belong to which stage, labels, the elimination bracket's
// sections, placements, and which matches a result feeds into. Pure
// functions, tested with node --test.

import { bracketRoundLabel, bracketRoundTotal, maxRound, roundLabel } from "./bracket.js";
import { eliminationStandings } from "./standings.js";
import { GROUP_STAGE_BRACKETS, groupLabel } from "./tournament.js";

const decided = (m) => m.status === "completed" || m.status === "walkover";

export const EVENT_STATUS_LABELS = {
  registration: "报名中",
  voting: "时间投票",
  in_progress: "比赛进行中",
  completed: "已结束",
};
export const eventStatusLabel = (s) => EVENT_STATUS_LABELS[s] || s;

export const isTwoStageEvent = (t) => Boolean(t?.playoff_format);
export const inPlayoffStage = (t) => isTwoStageEvent(t) && t?.current_stage === "playoff";

/**
 * Matches of the elimination bracket: the playoff of a two-stage event,
 * everything but Swiss rounds otherwise (all of a Swiss event's).
 */
export function bracketMatchesOf(t) {
  return (t?.matches || []).filter((m) =>
    isTwoStageEvent(t) ? !GROUP_STAGE_BRACKETS.includes(m.bracket) : t?.format !== "swiss" ? m.bracket !== "sw" : true,
  );
}

export function groupStageMatchesOf(t) {
  return (t?.matches || []).filter((m) => GROUP_STAGE_BRACKETS.includes(m.bracket));
}

/** Matches the overlay shows: the group stage until the playoff starts, then the playoff. */
export function overlayStageMatches(t) {
  return (t?.matches || []).filter((m) =>
    isTwoStageEvent(t) ? (t?.current_stage === "playoff") === !GROUP_STAGE_BRACKETS.includes(m.bracket) : true,
  );
}

/** Whether the elimination bracket shown outside the group stage is double elimination. */
export function isDoubleElimEvent(t) {
  return isTwoStageEvent(t) ? t?.playoff_format === "double_elim" : t?.format === "double_elim";
}

/** Players needed before a bracket preview can be drawn. */
export const previewMinPlayers = (t) => (t?.format === "double_elim" ? 4 : 2);

/** Display name of a player; "BYE (轮空)" for an empty first-round slot. */
export function playerNamer(t, bracketMatches = bracketMatchesOf(t)) {
  const totalRounds = maxRound(bracketMatches);
  return (pid, match = null) => {
    if (!pid) {
      if (match && (!match.bracket || match.bracket === "main") && match.round === totalRounds) return "BYE (轮空)";
      return "TBD";
    }
    const p = t?.players?.find((x) => x.id === pid);
    return p?.display_name || pid;
  };
}

/** "胜者组第 2 轮", "小组赛 A 组 第 3 轮", "总决赛"... for a match. */
export function roundLabeler(t, bracketMatches = bracketMatchesOf(t)) {
  const totalRounds = maxRound(bracketMatches);
  const wbTotal = bracketRoundTotal(bracketMatches, "wb");
  const lbTotal = bracketRoundTotal(bracketMatches, "lb");
  const twoStage = isTwoStageEvent(t);
  return (match) => {
    if (!match) return "";
    if (match.bracket === "sw") {
      return twoStage && match.swiss_group
        ? `小组赛 ${groupLabel(match.swiss_group)} 组 第 ${match.round} 轮`
        : `瑞士轮 第 ${match.round} 轮`;
    }
    if (["gse", "gwb", "glb"].includes(match.bracket)) {
      const own = (t?.matches || []).filter(
        (x) => x.bracket === match.bracket && (x.swiss_group || 1) === (match.swiss_group || 1),
      );
      const total = Math.max(1, ...own.map((x) => x.round));
      const prefix = `小组赛 ${groupLabel(match.swiss_group)} 组`;
      if (match.bracket === "gse") return `${prefix} ${roundLabel(match.round, total)}`;
      const side = match.bracket === "glb" ? "lb" : "wb";
      if (match.round === 1) return `${prefix} ${side === "lb" ? "败者组" : "胜者组"}出线战`;
      return `${prefix} ${bracketRoundLabel(side, match.round, total)}`;
    }
    if (match.bracket === "wb") return bracketRoundLabel("wb", match.round, wbTotal);
    if (match.bracket === "lb") return bracketRoundLabel("lb", match.round, lbTotal);
    if (match.bracket === "gf") return match.position === 2 ? "总决赛 · 重置" : "总决赛";
    return roundLabel(match.round, totalRounds);
  };
}

/** Single-elimination rounds (third-place match excluded), first round first. */
export function eliminationRounds(bracketMatches = []) {
  const map = {};
  for (const m of bracketMatches) {
    if (m.round === 0) continue;
    (map[m.round] ||= []).push(m);
  }
  return Object.entries(map)
    .map(([round, ms]) => ({ round: parseInt(round), matches: ms.sort((a, b) => a.position - b.position) }))
    .sort((a, b) => b.round - a.round);
}

/**
 * Big single-elimination brackets are shown in sections of 32 players
 * (16 on phones), then the final stage once it has started (or on request).
 * `mode`: "auto" | "sections" | "final". Returns the rounds to draw and
 * the section numbers for the controls.
 */
export function bracketSections(rounds = [], { mobile = false, mode = "auto", index = 0 } = {}) {
  const firstCount = rounds[0]?.matches?.length || 0;
  const sectionFirstMatches = Math.min(mobile ? 8 : 16, Math.max(2, firstCount));
  const sectionDepth = Math.max(1, Math.round(Math.log2(sectionFirstMatches)) + 1);
  const sectionCount = Math.max(1, Math.ceil(firstCount / sectionFirstMatches));
  const maxRoundNumber = rounds.length ? Math.max(...rounds.map((r) => r.round)) : 1;
  const finalStartRound = Math.max(1, maxRoundNumber - (sectionDepth - 1));
  let autoFinal = false;
  if (sectionCount > 1) {
    const finalRound = rounds.find((r) => r.round === finalStartRound);
    autoFinal = Boolean(finalRound?.matches.some((m) => m.player1_id || m.player2_id || decided(m)));
  }
  const showFinalStage = sectionCount > 1 && (mode === "final" || (mode === "auto" && autoFinal));
  let displayRounds;
  if (!rounds.length) displayRounds = [];
  else if (sectionCount <= 1) displayRounds = rounds;
  else if (showFinalStage) displayRounds = rounds.filter((r) => r.round <= finalStartRound);
  else {
    displayRounds = rounds
      .filter((r) => r.round >= finalStartRound)
      .map((r) => {
        const size = sectionFirstMatches >> (maxRoundNumber - r.round);
        const start = index * size;
        return { ...r, matches: r.matches.slice(start, start + size) };
      });
  }
  return { sectionFirstMatches, sectionCount, showFinalStage, displayRounds };
}

/**
 * The match that decides the title: the grand final (or its reset) for
 * double elimination, the last match of the main bracket otherwise.
 */
export function championshipMatchOf(bracketMatches = [], doubleElim = false) {
  if (!bracketMatches.length) return null;
  if (doubleElim) {
    const gfs = bracketMatches.filter((m) => m.bracket === "gf").sort((a, b) => a.position - b.position);
    const played = gfs.filter((m) => decided(m) && m.winner_id);
    return played.length ? played[played.length - 1] : gfs[0] || null;
  }
  return bracketMatches.find((m) => m.round === 1 && m.position === 1) || null;
}

/** Champion and runner-up of a finished event, or null. */
export function podiumOf(t, bracketMatches = bracketMatchesOf(t)) {
  if (!bracketMatches.length || t?.status !== "completed") return null;
  if (t.format === "swiss" && !isTwoStageEvent(t)) {
    const table = t.standings || [];
    if (!table.length) return null;
    return { champion: table[0].player_id, runnerUp: table[1]?.player_id ?? null };
  }
  const final = championshipMatchOf(bracketMatches, isDoubleElimEvent(t));
  if (!final || final.status !== "completed") return null;
  const champion = final.winner_id;
  return { champion, runnerUp: champion === final.player1_id ? final.player2_id : final.player1_id };
}

/**
 * Final placements: Swiss straight from the server's standings; elimination
 * from the bracket. Two-stage events list the playoff's placements, then
 * everyone out in the group stage by group rank.
 */
export function eventStandings(t, bracketMatches = bracketMatchesOf(t)) {
  if (!bracketMatches.length) return [];
  const twoStage = isTwoStageEvent(t);

  if (t.format === "swiss" && !twoStage) {
    const byId = new Map((t.players || []).map((p) => [p.id, p]));
    return (t.standings || []).map((row) => {
      const p = byId.get(row.player_id) || {};
      return {
        id: row.player_id,
        display_name: p.display_name,
        flag: p.flag,
        team: p.team,
        link: p.link,
        rank: row.rank === 1 ? "第 1 名 (冠军)" : row.rank === 2 ? "第 2 名 (亚军)" : `第 ${row.rank} 名`,
        eliminatedRound: null,
        matchesPlayed: row.wins + row.losses,
        matchesWon: row.wins,
      };
    });
  }

  const doubleElim = isDoubleElimEvent(t);
  let placed = eliminationStandings({
    matches: bracketMatches,
    players: t.players || [],
    doubleElim,
    championshipMatch: championshipMatchOf(bracketMatches, doubleElim),
  });
  if (!twoStage) return placed;

  // In the playoff: group qualifiers, plus anyone invited straight into it.
  const qualified = new Set((t.group_stage?.qualifiers || []).map((q) => q.player_id));
  for (const m of bracketMatches) {
    if (m.player1_id) qualified.add(m.player1_id);
    if (m.player2_id) qualified.add(m.player2_id);
  }
  const rowsById = new Map();
  for (const g of t.group_stage?.groups || []) {
    for (const row of g.rows) rowsById.set(row.player_id, { ...row, label: g.label });
  }
  for (const p of placed) {
    const row = rowsById.get(p.id);
    if (row && row.wins !== undefined) {
      p.matchesWon += row.wins;
      p.matchesPlayed += row.wins + row.losses;
    }
  }
  // Bracket groups: count the group matches themselves.
  if (t.format !== "swiss") {
    const byId = new Map(placed.map((p) => [p.id, p]));
    for (const m of groupStageMatchesOf(t)) {
      if (m.bracket === "sw" || !m.player1_id || !m.player2_id || !m.winner_id) continue;
      for (const id of [m.player1_id, m.player2_id]) {
        const p = byId.get(id);
        if (!p) continue;
        p.matchesPlayed += 1;
        if (m.winner_id === id) p.matchesWon += 1;
      }
    }
  }
  const groupStageOut = placed
    .filter((p) => !qualified.has(p.id))
    .map((p) => {
      const row = rowsById.get(p.id);
      return { ...p, rank: row ? `小组赛出局（${row.label} 组第 ${row.rank} 名）` : "小组赛出局", groupRank: row?.rank ?? 99 };
    })
    .sort((a, b) => a.groupRank - b.groupRank || b.matchesWon - a.matchesWon);
  return placed.filter((p) => qualified.has(p.id)).concat(groupStageOut);
}

/**
 * Matches a result feeds into: later Swiss rounds of the same group (they
 * were paired from it), or the matches the winner / loser move on to.
 */
export function downstreamMatches(match, matches = []) {
  if (!match) return [];
  if (match.bracket === "sw") {
    return matches.filter(
      (x) => x.bracket === "sw" && x.round > match.round && (x.swiss_group ?? null) === (match.swiss_group ?? null),
    );
  }
  const ids = [];
  if (match.next_match_id) ids.push(match.next_match_id);
  if (match.loser_next_match_id) ids.push(match.loser_next_match_id);
  // Legacy single-elimination brackets link implicitly by position.
  if (ids.length === 0 && (!match.bracket || match.bracket === "main") && match.round - 1 >= 1) {
    const next = matches.find(
      (x) => x.bracket === "main" && x.round === match.round - 1 && x.position === Math.ceil(match.position / 2),
    );
    if (next) ids.push(next.id);
  }
  return ids.map((id) => matches.find((x) => x.id === id)).filter(Boolean);
}

/** Whether any match this one feeds into (directly or later) has been played. */
export function hasDependentMatchPlayed(match, matches = []) {
  const seen = new Set();
  const check = (m) => {
    for (const next of downstreamMatches(m, matches)) {
      if (seen.has(next.id)) continue;
      seen.add(next.id);
      if (decided(next) || next.winner_id) return true;
      if (check(next)) return true;
    }
    return false;
  };
  return check(match);
}

/** Confirmation text before correcting a recorded result ("修正比分" / "改判弃权"). */
export function correctionWarning(match, matches, actionLabel) {
  const dependent = hasDependentMatchPlayed(match, matches);
  if (match.bracket === "sw" && downstreamMatches(match, matches).length > 0) {
    return dependent
      ? `【警告】瑞士轮后续轮次已经有比赛打完！\n${actionLabel}会删除第 ${match.round + 1} 轮及之后的所有对阵和比分，并按新结果重新配对。\n\n确定继续吗？`
      : `${actionLabel}会删除第 ${match.round + 1} 轮及之后的对阵（都还没开打），并按新结果重新配对。确定继续吗？`;
  }
  return dependent
    ? `【警告】该场比赛的晋级选手已在后续轮次进行了比赛！\n${actionLabel}会先重置本场，后续所有相关比赛的比分与晋级状态都将被清空。\n\n确定继续吗？`
    : `${actionLabel}会先重置本场结果，再按新结果重新晋级。确定继续吗？`;
}

/** Toast after a score was entered: who won and who moves on. */
export function resultMessage(t, match, winnerId, playerName) {
  if (t?.format === "double_elim" || isTwoStageEvent(t)) {
    let destination = "胜者晋级下一轮";
    if (match.bracket === "wb" || match.bracket === "gwb") destination = "胜者晋级胜者组，败者进入败者组";
    else if (match.bracket === "gf") {
      destination =
        match.position === 1 && winnerId === match.player2_id && t?.grand_final_reset
          ? "败者组冠军赢下首场，将进行重置赛"
          : "总决赛胜者夺冠";
    }
    return `已判定游戏获胜者为 ${playerName(winnerId)}，${destination}`;
  }
  const loserId = winnerId === match.player1_id ? match.player2_id : match.player1_id;
  const loserAdvances = t?.loser_advances === 1 || t?.loser_advances === true;
  return `已判定游戏获胜者为 ${playerName(winnerId)}，${loserAdvances ? "败者" : "胜者"} ${playerName(loserAdvances ? loserId : winnerId)} 晋级`;
}

/** "A 2 : 1 B" or "弃权判定，A 晋级" for a recorded result. */
export function recordedResultLabel(match, playerName) {
  if (!match) return "";
  if (match.status === "walkover") return `弃权判定，${playerName(match.winner_id)} 晋级`;
  return `${playerName(match.player1_id)} ${match.score1 ?? 0} : ${match.score2 ?? 0} ${playerName(match.player2_id)}`;
}

/** Player IDs by seed, then by registration time. */
export function seedOrderOf(players = []) {
  const seedOf = (p) => (p.seed !== null && p.seed !== undefined ? p.seed : 999999);
  return [...players]
    .sort((a, b) => seedOf(a) - seedOf(b) || new Date(a.registered_at) - new Date(b.registered_at))
    .map((p) => p.id);
}

/** Playable matches (both players in, not played) in recommended order. */
export function playableInOrder(matches = [], order = new Map()) {
  return matches
    .filter((m) => m.status === "pending" && m.player1_id && m.player2_id)
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}
