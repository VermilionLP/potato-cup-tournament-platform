import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildContact,
  contactIsEmpty,
  parseContact,
  splitContactInput,
} from "../src/lib/contact.js";

test("parseContact reads the QQ/Discord keys", () => {
  const contact = parseContact('{"qq":"12345","discord":"someone#1"}');
  assert.equal(contact.qq, "12345");
  assert.equal(contact.discord, "someone#1");
});

test("parseContact tolerates the old Battle.net tag shape", () => {
  const contact = parseContact({ cn: ["Bnet#1"], global: ["Bnet#9"] });
  assert.equal(contact.qq, "");
  assert.equal(contact.discord, "");
});

test("parseContact tolerates garbage and empty input", () => {
  for (const raw of [null, undefined, "", "not json", "[1,2]", 42]) {
    const contact = parseContact(raw);
    assert.equal(contact.qq, "");
    assert.equal(contact.discord, "");
    assert.deepEqual(contact.base, {});
  }
});

test("buildContact keeps unknown keys and drops the migrated ones", () => {
  const contact = buildContact(
    { legacy: { global: ["old"] }, keep: "x" },
    { qq: " 42 ", discord: " name " },
  );
  assert.deepEqual(contact, {
    legacy: { global: ["old"] },
    keep: "x",
    qq: "42",
    discord: "name",
  });
});

test("buildContact removes empty fields", () => {
  const contact = buildContact({ legacy: { cn: ["old"] } }, { qq: "", discord: "  " });
  assert.deepEqual(contact, { legacy: { cn: ["old"] } });
});

test("contactIsEmpty only reports true when both fields are blank", () => {
  assert.equal(contactIsEmpty({ qq: "", discord: "" }), true);
  assert.equal(contactIsEmpty(parseContact("{}")), true);
  assert.equal(contactIsEmpty({ qq: "1", discord: "" }), false);
  assert.equal(contactIsEmpty({ qq: "", discord: "d" }), false);
});

test("splitContactInput treats digits as QQ and everything else as Discord", () => {
  assert.deepEqual(splitContactInput("123456789"), {
    qq: "123456789",
    discord: "",
  });
  assert.deepEqual(splitContactInput("  name#1234 "), {
    qq: "",
    discord: "name#1234",
  });
  assert.deepEqual(splitContactInput("@someone"), {
    qq: "",
    discord: "someone",
  });
});

test("splitContactInput ignores empty and implausible values", () => {
  for (const raw of [null, undefined, "", "   ", "@"]) {
    assert.deepEqual(splitContactInput(raw), { qq: "", discord: "" });
  }
});

test("splitContactInput honours an explicit @ for Discord names", () => {
  assert.deepEqual(splitContactInput("@123456"), {
    qq: "",
    discord: "123456",
  });
});
