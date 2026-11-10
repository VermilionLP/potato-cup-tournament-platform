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

test("the server's refusals (4xx) are not reported; server failures are", () => {
  const refused = Object.assign(new Error("现在轮到 A 方禁用"), { status: 403 });
  assert.equal(errorReport(refused), null);
  assert.equal(errorReport(Object.assign(new Error("Ban/Pick 刚刚被别人更新了，已刷新为最新状态"), { status: 409 })), null);
  assert.ok(errorReport(Object.assign(new Error("Internal Server Error"), { status: 500 })));
});
