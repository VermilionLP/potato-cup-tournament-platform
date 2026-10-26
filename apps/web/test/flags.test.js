import assert from "node:assert/strict";
import { test } from "node:test";
import { flagSrc, normalizeFlagCode } from "../src/lib/flags.js";

test("normalizeFlagCode lowercases and keeps two-letter codes", () => {
  assert.equal(normalizeFlagCode("CN"), "cn");
  assert.equal(normalizeFlagCode(" ru "), "ru");
});

test("normalizeFlagCode maps common aliases", () => {
  assert.equal(normalizeFlagCode("uk"), "gb");
  assert.equal(normalizeFlagCode("ZH"), "cn");
});

test("normalizeFlagCode rejects unusable values", () => {
  for (const raw of [null, undefined, "", "c", "chn", "1a", "中国"]) {
    assert.equal(normalizeFlagCode(raw), "");
  }
});

test("flagSrc points at the bundled SVG assets", () => {
  assert.equal(flagSrc("kr"), "/flags/kr.svg");
  assert.equal(flagSrc("nope"), "");
});
