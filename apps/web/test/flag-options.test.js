import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync } from "node:fs";
import { COMMON_FLAGS, FLAG_CODES, flagOptions, flagProblem, looksLikeAccountId } from "../src/lib/flag-options.js";

test("nationality options: every flag shipped, common ones first", () => {
  for (const code of FLAG_CODES) assert.ok(existsSync(new URL(`../static/flags/${code}.svg`, import.meta.url)), code);
  for (const code of COMMON_FLAGS) assert.ok(FLAG_CODES.includes(code), code);
  const { common, others } = flagOptions("zh-CN");
  assert.equal(common[0].code, "cn");
  assert.equal(common.length + others.length, FLAG_CODES.length);
  assert.equal(flagProblem("jp"), "");
  assert.equal(flagProblem("xx"), "");
  assert.match(flagProblem(""), /国籍/);
  assert.match(flagProblem("zz"), /国籍/);
});

test("a numeric War Thunder account ID is flagged, names are not", () => {
  assert.equal(looksLikeAccountId("98765432"), true);
  assert.equal(looksLikeAccountId(" 12345 "), true);
  assert.equal(looksLikeAccountId("Vermilion"), false);
  assert.equal(looksLikeAccountId("1N1ck"), false);
  assert.equal(looksLikeAccountId("1234"), false);
});
