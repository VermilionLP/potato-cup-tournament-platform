import assert from "node:assert/strict";
import { test } from "node:test";
import {
  channelOptions,
  channelState,
  channelUrl,
  liveElsewhere,
  parseChannel,
  savedChannel,
  savedStreamMode,
  saveChannel,
  saveStreamMode,
  withChannel,
} from "../src/lib/live-channels.js";

const event = {
  id: "t",
  active_match_id: 5,
  overlay_scene: "hybrid",
  live_channels: [
    { channel: 1, active_match_id: 5, overlay_scene: "hybrid", overlay_round: 2, overlay_stage: "wb:2" },
    { channel: 3, active_match_id: 9, overlay_scene: "ingame", overlay_round: 1, overlay_stage: null },
  ],
};

test("channel numbers fall back to 1", () => {
  assert.equal(parseChannel("3"), 3);
  for (const bad of [null, undefined, "", "0", "10", "x", "1.5"]) assert.equal(parseChannel(bad), 1, String(bad));
});

test("each channel sees its own live match and overlay state", () => {
  const three = withChannel(event, 3);
  assert.deepEqual([three.active_match_id, three.overlay_scene, three.overlay_stage, three.live_channel], [9, "ingame", null, 3]);
  const one = withChannel(event, 1);
  assert.deepEqual([one.active_match_id, one.overlay_scene, one.overlay_stage], [5, "hybrid", "wb:2"]);
  // A channel nobody used yet: nothing live, automatic scene.
  const two = withChannel(event, 2);
  assert.deepEqual([two.active_match_id, two.overlay_scene, two.overlay_stage], [null, "auto", null]);
  assert.equal(two.live_channels, event.live_channels, "the rest of the event is kept");
  // An event from an API without channels: the top-level fields are channel 1.
  assert.equal(channelState({ active_match_id: 4 }, 1).active_match_id, 4);
  assert.equal(channelState({ active_match_id: 4 }, 2).active_match_id, null);
});

test("matches live on the other channels", () => {
  assert.deepEqual([...liveElsewhere(event, 1)], [[9, 3]]);
  assert.deepEqual([...liveElsewhere(event, 3)], [[5, 1]]);
  assert.deepEqual([...liveElsewhere(event, 2)], [[5, 1], [9, 3]]);
});

test("channel choices: those in use plus the next one", () => {
  assert.deepEqual(channelOptions(event, 1), [1, 3, 4]);
  assert.deepEqual(channelOptions(event, 2), [1, 2, 3, 4]);
  assert.deepEqual(channelOptions({ live_channels: [{ channel: 1, active_match_id: null, overlay_scene: "auto" }] }, 1), [1, 2]);
  const full = { live_channels: Array.from({ length: 9 }, (_, i) => ({ channel: i + 1, active_match_id: i + 1 })) };
  assert.deepEqual(channelOptions(full, 1), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test("overlay links carry the channel", () => {
  assert.equal(channelUrl("https://x/tournament/t/overlay", 1), "https://x/tournament/t/overlay");
  assert.equal(channelUrl("https://x/tournament/t/overlay", 2), "https://x/tournament/t/overlay?channel=2");
  assert.equal(channelUrl("https://x/tournament/t/overlay?scene=intro", 4), "https://x/tournament/t/overlay?scene=intro&channel=4");
});

test("channel and stream mode are remembered per event", () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  };
  try {
    saveChannel("a", 3);
    saveStreamMode("a", true);
    assert.equal(savedChannel("a"), 3);
    assert.equal(savedChannel("b"), 1);
    assert.equal(savedStreamMode("a"), true);
    assert.equal(savedStreamMode("b"), false);
    globalThis.localStorage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
    assert.equal(savedChannel("a"), 1);
    saveChannel("a", 2); // no throw
  } finally {
    delete globalThis.localStorage;
  }
});
