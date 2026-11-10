import { test } from "node:test";
import assert from "node:assert/strict";
import { bracketImageLayout, CARD_H, CARD_W, eventTimeText } from "../src/lib/bracket-image.js";

const players = ["a", "b", "c", "d"].map((id, i) => ({ id, display_name: id.toUpperCase(), flag: i ? "cn" : "us" }));

// 4-player single elimination: two semis (round 2) into the final (round 1), plus third place.
const single = [
  { id: 1, bracket: "main", round: 2, position: 1, player1_id: "a", player2_id: "d", status: "completed", winner_id: "a", score1: 2, score2: 0 },
  { id: 2, bracket: "main", round: 2, position: 2, player1_id: "b", player2_id: "c", status: "walkover", winner_id: "c" },
  { id: 3, bracket: "main", round: 1, position: 1, player1_id: "a", player2_id: "c", status: "pending" },
  { id: 4, bracket: "main", round: 0, position: 1, player1_id: "d", player2_id: "b", status: "pending" },
];

test("single elimination: every match, labels, links, third place, scores", () => {
  const l = bracketImageLayout({ tournament: { id: "w1", name: "Weekly", status: "in_progress", players, game_mode: "rb", vehicle_pool: "prop" }, matches: single });
  assert.equal(l.cards.length, 4);
  assert.deepEqual(l.labels.map((x) => x.text), ["半决赛", "总决赛"]);
  assert.equal(l.links.length, 2);
  assert.deepEqual(l.notes.map((n) => n.text), ["三四名决赛"]);
  const [semi1, semi2, final] = l.cards;
  assert.deepEqual(semi1.rows.map((r) => [r.name, r.score, r.won]), [["A", "2", true], ["D", "0", false]]);
  assert.deepEqual(semi2.rows.map((r) => r.score), ["弃", "胜"]);
  // The final sits between its two semis, and is live (both players, pending).
  assert.equal(final.y + CARD_H / 2, (semi1.y + semi2.y) / 2 + CARD_H / 2);
  assert.equal(final.live, true);
  assert.ok(l.width >= 2 * CARD_W);
  assert.deepEqual(l.header.tags, ["RB", "螺旋桨", "单败淘汰", "4 名选手"]);
  assert.deepEqual(l.flags.sort(), ["cn", "us"]);
  assert.equal(l.header.champion, null);
});

test("double elimination: winners (with the grand final) and losers stacked in one picture", () => {
  const de = [
    { id: 11, bracket: "wb", round: 2, position: 1, player1_id: "a", player2_id: "d", next_match_id: 13, status: "completed", winner_id: "a", score1: 2, score2: 1 },
    { id: 12, bracket: "wb", round: 2, position: 2, player1_id: "b", player2_id: "c", next_match_id: 13, status: "completed", winner_id: "b", score1: 2, score2: 0 },
    { id: 13, bracket: "wb", round: 1, position: 1, player1_id: "a", player2_id: "b", status: "completed", winner_id: "a", score1: 2, score2: 0 },
    { id: 21, bracket: "lb", round: 2, position: 1, player1_id: "d", player2_id: "c", next_match_id: 22, status: "completed", winner_id: "d", score1: 2, score2: 1 },
    { id: 22, bracket: "lb", round: 1, position: 1, player1_id: "b", player2_id: "d", status: "completed", winner_id: "b", score1: 2, score2: 1 },
    { id: 31, bracket: "gf", round: 1, position: 1, player1_id: "a", player2_id: "b", status: "completed", winner_id: "a", score1: 3, score2: 1 },
  ];
  const l = bracketImageLayout({ tournament: { id: "d1", name: "Monthly", status: "completed", players }, matches: de, doubleElim: true });
  assert.equal(l.cards.length, 6);
  assert.deepEqual(l.titles.map((t) => t.text), ["胜者组", "败者组"]);
  assert.deepEqual(l.labels.map((x) => x.text), ["胜者组第 1 轮", "胜者组决赛", "总决赛", "败者组第 1 轮", "败者组决赛"]);
  // The losers band is below every winners card.
  const wbBottom = Math.max(...l.cards.slice(0, 2).map((c) => c.y + CARD_H));
  const lbTop = Math.min(...l.cards.filter((c) => [4, 5].includes(c.number)).map((c) => c.y));
  assert.ok(lbTop > wbBottom);
  assert.equal(l.links.length, 3);
  assert.deepEqual(l.header.champion, { name: "A", flag: "us" });
  assert.equal(l.header.kind, "最终对阵");
  assert.ok(l.height > lbTop);
});

test("preview wording and event time", () => {
  const l = bracketImageLayout({ tournament: { name: "P", status: "registration", players }, matches: single });
  assert.equal(l.header.kind, "对阵预览");
  assert.match(l.header.note, /开赛时可能变化/);
  assert.equal(eventTimeText("2026-11-14T20:00"), "2026/11/14 周六 20:00");
  assert.equal(eventTimeText(""), "");
});

test("a bye shows 轮空 in the empty slot and no score", () => {
  const l = bracketImageLayout({
    tournament: { status: "registration", players },
    matches: [{ id: 1, bracket: "main", round: 1, position: 1, player1_id: "a", player2_id: null, status: "completed", winner_id: "a" }],
  });
  assert.deepEqual(l.cards[0].rows.map((r) => [r.name, r.score, r.lost]), [["A", "", false], ["轮空", "", false]]);
});

test("Swiss: standings table, then one column per round; byes as a note", () => {
  const sw = [
    { id: 1, bracket: "sw", round: 1, position: 1, player1_id: "a", player2_id: "b", status: "completed", winner_id: "a", score1: 2, score2: 0 },
    { id: 2, bracket: "sw", round: 1, position: 2, player1_id: "c", player2_id: null, status: "completed", winner_id: "c" },
    { id: 3, bracket: "sw", round: 2, position: 1, player1_id: "a", player2_id: "c", status: "pending" },
  ];
  const standings = [
    { player_id: "a", rank: 1, wins: 1, losses: 0, points: 1, game_diff: 2, buchholz: 0, byes: 0 },
    { player_id: "c", rank: 2, wins: 1, losses: 0, points: 1, game_diff: 0, buchholz: 0, byes: 1 },
    { player_id: "b", rank: 3, wins: 0, losses: 1, points: 0, game_diff: -2, buchholz: 1, byes: 0 },
  ];
  const l = bracketImageLayout({ tournament: { status: "in_progress", players }, view: "swiss", matches: sw, standings, totalRounds: 3 });
  assert.equal(l.tables.length, 1);
  assert.deepEqual(l.tables[0].rows.map((r) => r.cells), [["1", "A", "1-0", "1", "+2", "0"], ["2", "C", "1-0", "1", "0", "0"], ["3", "B", "0-1", "0", "-2", "1"]]);
  assert.equal(l.tables[0].rows[1].mark, "轮空");
  assert.deepEqual(l.labels.map((x) => x.text), ["第 1 轮", "第 2 轮"]);
  assert.equal(l.cards.length, 3);
  assert.match(l.cards[1].byeNote, /轮空 · C 记一胜/);
  // Rounds sit under the table.
  assert.ok(Math.min(...l.cards.map((c) => c.y)) > l.tables[0].y + l.tables[0].height);
  assert.ok(l.header.tags.includes("瑞士轮 · 3 轮"));
  assert.equal(l.links.length, 0);
});

test("group stage: every group under the other, placings then its bracket", () => {
  const gm = (id, group, extra) => ({ id, swiss_group: group, bracket: "gse", status: "pending", ...extra });
  const matches = [
    gm(1, 1, { round: 2, position: 1, player1_id: "a", player2_id: "b", next_match_id: 3, status: "completed", winner_id: "a", score1: 2, score2: 1 }),
    gm(2, 1, { round: 2, position: 2, player1_id: "c", player2_id: "d", next_match_id: 3 }),
    gm(3, 1, { round: 1, position: 1, player1_id: "a" }),
    gm(4, 2, { round: 1, position: 1, player1_id: "b", player2_id: "c" }),
  ];
  const groups = [
    { group: 1, label: "A", complete: false, rows: [{ player_id: "a", rank: 1, how: "", qualified: false }, { player_id: "b", rank: 2, how: "首轮负", qualified: false }] },
    { group: 2, label: "B", complete: true, rows: [{ player_id: "c", rank: 1, how: "出线战胜", qualified: true }] },
  ];
  const l = bracketImageLayout({ tournament: { status: "in_progress", players }, view: "groups", matches, groups, groupFormat: "single_elim", perGroup: 1 });
  assert.deepEqual(l.groups.map((g) => [g.text, g.sub]), [["A 组", ""], ["B 组", "已结束"]]);
  assert.equal(l.tables.length, 2);
  assert.deepEqual(l.tables[1].rows[0].cells, ["1", "C", "出线"]);
  assert.equal(l.tables[0].rows[0].cells[0], "–");
  assert.equal(l.cards.length, 4);
  assert.equal(l.links.length, 2);
  // B's title comes after every card of A.
  const aBottom = Math.max(...l.cards.filter((c) => c.rows[0].name !== "B").map((c) => c.y));
  assert.ok(l.groups[1].y > aBottom);
  assert.deepEqual(l.labels.map((x) => x.text), ["半决赛", "总决赛", "总决赛"]);
});
