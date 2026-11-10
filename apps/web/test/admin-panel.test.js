import assert from "node:assert/strict";
import { test } from "node:test";
import { pendingHref, pendingKey, pendingText } from "../src/lib/admin-pending.js";
import { backupAge, formatBytes } from "../src/lib/backup-view.js";

test("pending matches in words", () => {
  const i = { match_id: 7, kind: "dispute", at: "x", tournament_id: "w 1", player1_id: "A", player2_id: "B", by: "A" };
  assert.equal(pendingText(i), "A vs B：比分有异议");
  assert.equal(pendingText({ ...i, kind: "walkover", by: "B" }), "A vs B：B 申报对手弃权");
  assert.equal(pendingKey(i), "7:dispute:x");
  assert.equal(pendingHref(i), "/tournament/w%201/console");
});

test("backup age and size", () => {
  const now = Date.parse("2026-11-11T12:00:00Z");
  assert.equal(backupAge("2026-11-11T11:59:30Z", now), "刚刚");
  assert.equal(backupAge("2026-11-11T11:35:00Z", now), "25 分钟前");
  assert.equal(backupAge("2026-11-11T09:00:00Z", now), "3 小时前");
  assert.equal(backupAge("2026-11-08T12:00:00Z", now), "3 天前");
  assert.equal(formatBytes(812 * 1024), "812 KB");
  assert.equal(formatBytes(3.4 * 1024 * 1024), "3.4 MB");
});
