import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bracketMatchesOf,
  bracketSections,
  correctionWarning,
  downstreamMatches,
  eliminationRounds,
  eventStandings,
  hasDependentMatchPlayed,
  overlayStageMatches,
  playerNamer,
  podiumOf,
  recordedResultLabel,
  resultMessage,
  roundLabeler,
  seedOrderOf,
} from "../src/lib/event-view.js";

let id = 0;
const m = (bracket, round, position, p1, p2, winner = null, extra = {}) => ({
  id: `m${++id}`, bracket, round, position, player1_id: p1, player2_id: p2, winner_id: winner,
  status: winner ? "completed" : "pending", score1: winner ? 2 : null, score2: winner ? 1 : null, ...extra,
});
const players = (...ids) => ids.map((x, i) => ({ id: x, display_name: x.toUpperCase(), seed: i + 1 }));

// 4-player single elimination: a beat b, c beat d, a beat c.
function singleElim() {
  const final = m("main", 1, 1, "a", "c", "a");
  const s1 = m("main", 2, 1, "a", "b", "a", { next_match_id: final.id });
  const s2 = m("main", 2, 2, "c", "d", "c", { next_match_id: final.id });
  return { id: "t", status: "completed", format: "single_elim", players: players("a", "b", "c", "d"), matches: [s1, s2, final] };
}

test("stage matches of a two-stage event", () => {
  const t = {
    format: "swiss",
    playoff_format: "single_elim",
    current_stage: "group",
    matches: [m("sw", 1, 1, "a", "b"), m("main", 1, 1, null, null)],
  };
  assert.deepEqual(bracketMatchesOf(t).map((x) => x.bracket), ["main"]);
  assert.deepEqual(overlayStageMatches(t).map((x) => x.bracket), ["sw"]);
  assert.deepEqual(overlayStageMatches({ ...t, current_stage: "playoff" }).map((x) => x.bracket), ["main"]);
  // A Swiss event's bracket is its Swiss rounds.
  assert.equal(bracketMatchesOf({ format: "swiss", matches: t.matches }).length, 2);
});

test("player names and round labels", () => {
  const t = singleElim();
  const name = playerNamer(t);
  assert.equal(name("a"), "A");
  assert.equal(name(null), "TBD");
  assert.equal(name(null, { bracket: "main", round: 2 }), "BYE (轮空)");
  const label = roundLabeler(t);
  assert.equal(label(t.matches[2]), "总决赛");
  assert.equal(label(m("gf", 1, 2, null, null)), "总决赛 · 重置");
  assert.equal(label(m("sw", 3, 1, "a", "b")), "瑞士轮 第 3 轮");
  assert.equal(roundLabeler({ playoff_format: "single_elim", matches: [] })(m("sw", 2, 1, "a", "b", null, { swiss_group: 2 })), "小组赛 B 组 第 2 轮");
});

test("podium and standings of a finished single elimination", () => {
  const t = singleElim();
  assert.deepEqual(podiumOf(t), { champion: "a", runnerUp: "c" });
  const rows = eventStandings(t);
  assert.equal(rows[0].id, "a");
  assert.equal(rows[1].id, "c");
  assert.equal(podiumOf({ ...t, status: "in_progress" }), null);
});

test("Swiss standings come from the server table", () => {
  const t = {
    status: "completed",
    format: "swiss",
    players: players("a", "b"),
    matches: [m("sw", 1, 1, "a", "b", "a")],
    standings: [
      { player_id: "a", rank: 1, wins: 1, losses: 0 },
      { player_id: "b", rank: 2, wins: 0, losses: 1 },
    ],
  };
  assert.deepEqual(podiumOf(t), { champion: "a", runnerUp: "b" });
  assert.deepEqual(eventStandings(t).map((r) => r.rank), ["第 1 名 (冠军)", "第 2 名 (亚军)"]);
});

test("two-stage standings list group-stage exits after the playoff", () => {
  const final = m("main", 1, 1, "a", "c", "a");
  const t = {
    status: "completed",
    format: "swiss",
    playoff_format: "single_elim",
    current_stage: "playoff",
    players: players("a", "b", "c", "d"),
    matches: [m("sw", 1, 1, "a", "b", "a", { swiss_group: 1 }), m("sw", 1, 2, "c", "d", "c", { swiss_group: 2 }), final],
    group_stage: {
      qualifiers: [{ player_id: "a" }, { player_id: "c" }],
      groups: [
        { label: "A", rows: [{ player_id: "a", rank: 1, wins: 1, losses: 0 }, { player_id: "b", rank: 2, wins: 0, losses: 1 }] },
        { label: "B", rows: [{ player_id: "c", rank: 1, wins: 1, losses: 0 }, { player_id: "d", rank: 2, wins: 0, losses: 1 }] },
      ],
    },
  };
  const rows = eventStandings(t);
  assert.deepEqual(rows.map((r) => r.id), ["a", "c", "b", "d"]);
  assert.equal(rows[2].rank, "小组赛出局（A 组第 2 名）");
  // Group wins count towards the playoff players' totals.
  assert.equal(rows[0].matchesWon, 2);
});

test("downstream matches and corrections", () => {
  const t = singleElim();
  const [s1, , final] = t.matches;
  assert.deepEqual(downstreamMatches(s1, t.matches).map((x) => x.id), [final.id]);
  assert.equal(hasDependentMatchPlayed(s1, t.matches), true);
  assert.equal(hasDependentMatchPlayed(final, t.matches), false);
  assert.match(correctionWarning(s1, t.matches, "修正比分"), /^【警告】该场比赛的晋级选手/);
  assert.match(correctionWarning(final, t.matches, "改判弃权"), /^改判弃权会先重置本场结果/);
  // Swiss: later rounds of the same group were paired from the result.
  const sw = [m("sw", 1, 1, "a", "b", "a"), m("sw", 2, 1, "a", "c")];
  assert.match(correctionWarning(sw[0], sw, "修正比分"), /会删除第 2 轮及之后的对阵（都还没开打）/);
});

test("result messages", () => {
  const t = singleElim();
  const name = playerNamer(t);
  const match = t.matches[0];
  assert.equal(resultMessage(t, match, "a", name), "已判定游戏获胜者为 A，胜者 A 晋级");
  assert.equal(resultMessage({ ...t, loser_advances: 1 }, match, "a", name), "已判定游戏获胜者为 A，败者 B 晋级");
  const gf = m("gf", 1, 1, "a", "b");
  assert.equal(resultMessage({ ...t, format: "double_elim", grand_final_reset: true }, gf, "b", name), "已判定游戏获胜者为 B，败者组冠军赢下首场，将进行重置赛");
  assert.equal(recordedResultLabel(match, name), "A 2 : 1 B");
  assert.equal(recordedResultLabel({ ...match, status: "walkover" }, name), "弃权判定，A 晋级");
});

test("seed order: seeds first, then registration time", () => {
  const ps = [
    { id: "x", seed: null, registered_at: "2026-01-02" },
    { id: "y", seed: 2, registered_at: "2026-01-05" },
    { id: "z", seed: null, registered_at: "2026-01-01" },
    { id: "w", seed: 1, registered_at: "2026-01-09" },
  ];
  assert.deepEqual(seedOrderOf(ps), ["w", "y", "z", "x"]);
});

test("big brackets are shown in sections, then the final stage", () => {
  // 64 players: 32 first-round matches, sections of 16 on desktop.
  const ms = [];
  for (let r = 6; r >= 1; r -= 1) for (let p = 1; p <= 2 ** (r - 1); p += 1) ms.push(m("main", r, p, r === 6 ? `p${p}` : null, r === 6 ? `q${p}` : null));
  const rounds = eliminationRounds(ms);
  const desk = bracketSections(rounds, { index: 1 });
  assert.equal(desk.sectionCount, 2);
  assert.equal(desk.showFinalStage, false);
  assert.deepEqual(desk.displayRounds.map((r) => r.matches.length), [16, 8, 4, 2, 1]);
  assert.equal(desk.displayRounds[0].matches[0].position, 17);
  const phone = bracketSections(rounds, { mobile: true });
  assert.equal(phone.sectionCount, 4);
  const final = bracketSections(rounds, { mode: "final" });
  assert.deepEqual(final.displayRounds.map((r) => r.round), [2, 1]);
  assert.equal(bracketSections(eliminationRounds(singleElim().matches)).sectionCount, 1);
});
