import assert from "node:assert/strict";
import { test } from "node:test";
import { PLAYER_KEYS, readPlayerKeys } from "../src/lib/player-key.js";

test("device keys are read per player ID and survive bad storage", () => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  assert.deepEqual(readPlayerKeys(), {});
  store.set(PLAYER_KEYS, JSON.stringify({ alice: "k1" }));
  assert.equal(readPlayerKeys().alice, "k1");
  store.set(PLAYER_KEYS, "not json");
  assert.deepEqual(readPlayerKeys(), {});
  store.set(PLAYER_KEYS, "[1,2]");
  assert.deepEqual(readPlayerKeys(), {});
  delete globalThis.localStorage;
});
