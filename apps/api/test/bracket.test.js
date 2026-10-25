import assert from "node:assert/strict";
import { test } from "node:test";
import {
  describeBracket,
  LIQUIPEDIA_BRACKET_TEMPLATES,
  liquipediaBracketTemplate,
} from "../lib/bracket.js";

function digits(name) {
  return (name.match(/\d+/g) || []).reduce((sum, value) => sum + Number(value), 0);
}

test("describeBracket handles power-of-two fields", () => {
  const eight = describeBracket(8);
  assert.equal(eight.size, 8);
  assert.equal(eight.firstRoundMatches, 4);
  assert.equal(eight.byes, 0);
  assert.deepEqual(eight.rounds.map((round) => round.matches), [4, 2, 1]);
  assert.equal(eight.totalMatches, 7);

  const thirtyTwo = describeBracket(32);
  assert.equal(thirtyTwo.size, 32);
  assert.equal(thirtyTwo.firstRoundMatches, 16);
  assert.equal(thirtyTwo.byes, 0);
  assert.deepEqual(thirtyTwo.rounds.map((round) => round.matches), [16, 8, 4, 2, 1]);
});

test("describeBracket puts byes on the top seeds", () => {
  const seventeen = describeBracket(17);
  assert.equal(seventeen.size, 32);
  assert.equal(seventeen.firstRoundMatches, 1);
  assert.equal(seventeen.byes, 15);
  assert.deepEqual(seventeen.rounds.map((round) => round.matches), [1, 8, 4, 2, 1]);

  const thirtyOne = describeBracket(31);
  assert.equal(thirtyOne.size, 32);
  assert.equal(thirtyOne.firstRoundMatches, 15);
  assert.equal(thirtyOne.byes, 1);
  assert.deepEqual(thirtyOne.rounds.map((round) => round.matches), [15, 8, 4, 2, 1]);
});

test("describeBracket round counts add up to n - 1", () => {
  for (let n = 2; n <= 32; n += 1) {
    const bracket = describeBracket(n);
    const played = bracket.rounds.reduce((sum, round) => sum + round.matches, 0);
    assert.equal(played, n - 1, `n=${n}`);
    assert.equal(bracket.totalMatches, n - 1, `n=${n}`);
  }
});

test("Liquipedia templates cover 2..32 and digits sum to player count", () => {
  for (let n = 2; n <= 32; n += 1) {
    const name = liquipediaBracketTemplate(n);
    assert.ok(name, `missing template for ${n}`);
    assert.equal(digits(name), n, `${n}: ${name}`);
  }
});

test("128-player brackets describe seven rounds and use Bracket/128", () => {
  const bracket = describeBracket(128);
  assert.equal(bracket.size, 128);
  assert.equal(bracket.firstRoundMatches, 64);
  assert.equal(bracket.byes, 0);
  assert.equal(bracket.totalRounds, 7);
  assert.equal(bracket.totalMatches, 127);
  assert.deepEqual(bracket.rounds.map((round) => round.matches), [64, 32, 16, 8, 4, 2, 1]);
  assert.equal(liquipediaBracketTemplate(128), "Bracket/128");
});

test("larger fields fall back to the next power-of-two template", () => {
  assert.equal(liquipediaBracketTemplate(33), "Bracket/64");
  assert.equal(liquipediaBracketTemplate(64), "Bracket/64");
  assert.equal(liquipediaBracketTemplate(128), "Bracket/128");
});

test("15 players no longer reuse the 14-player template", () => {
  assert.equal(liquipediaBracketTemplate(14), "Bracket/4L2DH8LS");
  assert.equal(liquipediaBracketTemplate(15), "Bracket/2L1DH4LH8L");
});

test("17/31/32 templates match the documented structures", () => {
  assert.equal(liquipediaBracketTemplate(17), "Bracket/2L1DH2LH4LH8L");
  assert.equal(liquipediaBracketTemplate(31), "Bracket/2L1DH4LH8LH16L");
  assert.equal(liquipediaBracketTemplate(32), "Bracket/32");
  assert.equal(Object.keys(LIQUIPEDIA_BRACKET_TEMPLATES).length, 31);
});
