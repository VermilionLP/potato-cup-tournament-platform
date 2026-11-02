import { test } from "node:test";
import assert from "node:assert/strict";
import { lazy } from "../src/lib/lazy.js";

test("loads once, retries after a failure", async () => {
  let calls = 0;
  const ok = lazy(async () => ({ n: ++calls }));
  const [a, b] = await Promise.all([ok(), ok()]);
  assert.equal(a, b);
  assert.equal(calls, 1);

  let tries = 0;
  const flaky = lazy(async () => {
    if (++tries === 1) throw new Error("offline");
    return "ok";
  });
  await assert.rejects(flaky(), /offline/);
  assert.equal(await flaky(), "ok");
  assert.equal(tries, 2);
});
