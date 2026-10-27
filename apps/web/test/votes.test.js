import assert from "node:assert/strict";
import { test } from "node:test";
import {
  VOTE_TIME_SLOTS, customVoteTopics, formatVoteTime, groupVoteDates, nextVoteOccurrence,
  pastVotes, suggestedVoteTimes, voteIso, voteOptionsFrom,
} from "../src/lib/votes.js";

test("time slots run 13:00 to 23:30 every half hour", () => {
  assert.equal(VOTE_TIME_SLOTS.length, 22);
  assert.equal(VOTE_TIME_SLOTS[0], "13:00");
  assert.equal(VOTE_TIME_SLOTS[1], "13:30");
  assert.equal(VOTE_TIME_SLOTS.at(-1), "23:30");
});

test("next occurrence skips to next week once the time has passed", () => {
  const thu = new Date(2026, 9, 29, 21, 0); // Thursday 21:00
  assert.equal(voteIso(nextVoteOccurrence(4, 20, 30, thu)), "2026-11-05T20:30:00");
  assert.equal(voteIso(nextVoteOccurrence(4, 22, 0, thu)), "2026-10-29T22:00:00");
});

test("suggestions are unique, at most six, and move with the week offset", () => {
  const now = new Date(2026, 9, 26, 12, 0); // Monday
  const s = suggestedVoteTimes({ top_slots: [{ weekday: 4, time: "20:30" }] }, 0, now);
  assert.ok(s.length <= 6 && s.length >= 5);
  assert.equal(new Set(s.map((x) => x.proposed_time)).size, s.length);
  assert.equal(s[0].proposed_time, "2026-10-29T20:30:00");
  assert.equal(suggestedVoteTimes(null, 1, now)[0].proposed_time, "2026-11-05T20:30:00");
});

test("vote options merge votes with suggestions and group by date", () => {
  const votes = [
    { player_id: "a", proposed_time: "2026-10-29T20:30:00" },
    { player_id: "b", proposed_time: "2026-10-29T20:30:00" },
    { player_id: "a", proposed_time: "2026-10-31T15:00:00" },
  ];
  const options = voteOptionsFrom(votes, [{ proposed_time: "2026-10-29T20:30:00" }, { proposed_time: "2026-11-01T15:00:00" }]);
  assert.deepEqual(options.map((o) => [o.proposed_time.slice(5, 16), o.count, o.suggested]), [
    ["10-29T20:30", 2, true], ["10-31T15:00", 1, false], ["11-01T15:00", 0, true],
  ]);
  const days = groupVoteDates(options);
  assert.equal(days.length, 3);
  assert.equal(days[0].formattedDate, "10/29 周四");
  assert.equal(days[0].options[0].timeOnly, "20:30");
});

test("formatting, past votes and custom topics", () => {
  assert.equal(formatVoteTime("2026-10-31T20:30:00"), "2026-10-31 (周六) 20:30");
  assert.equal(formatVoteTime("本周六晚8点"), "本周六晚8点");
  assert.equal(pastVotes([{ proposed_time: "2020-01-01T00:00:00" }, { proposed_time: "2999-01-01T00:00:00" }]).length, 1);
  const topics = customVoteTopics([
    { topic: "服务器", value: "亚服", player_id: "a" },
    { topic: "服务器", value: "欧服", player_id: "b" },
    { topic: "服务器", value: "欧服", player_id: "c" },
  ]);
  assert.deepEqual(topics[0].options.map((o) => [o.value, o.count]), [["欧服", 2], ["亚服", 1]]);
});
