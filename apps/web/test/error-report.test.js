import { test } from "node:test";
import assert from "node:assert/strict";
import { errorReport } from "../src/lib/error-report.js";

test("reports real errors, skips noise and extensions", () => {
  const e = new TypeError("Cannot read properties of undefined (reading 'id')");
  const r = errorReport(e, { page: "/tournament/t1", userAgent: "UA" });
  assert.equal(r.message, e.message);
  assert.equal(r.page, "/tournament/t1");
  assert.ok(r.stack.includes("TypeError"));
  assert.equal(errorReport(null, { message: "ResizeObserver loop completed with undelivered notifications." }), null);
  assert.equal(errorReport(new Error("Failed to fetch")), null);
  assert.equal(errorReport({ message: "x", stack: "at chrome-extension://abc/content.js:1:1" }), null);
  assert.equal(errorReport(undefined, { message: "" }), null);
  assert.equal(errorReport("plain string rejection").message, "plain string rejection");
});
