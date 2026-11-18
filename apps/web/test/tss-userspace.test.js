import assert from "node:assert/strict";
import { test } from "node:test";
import { draftTitle, editUrl, wikiTitle } from "../src/lib/tss-userspace.js";

test("the TSS export's draft goes to the user's own Liquipedia space", () => {
  assert.equal(wikiTitle("  GRAND FINAL  26 "), "GRAND_FINAL_26");
  assert.equal(wikiTitle("Cup [EU] #3 {x}|y"), "Cup_EU_3_xy");
  assert.equal(draftTitle("Potato Editor", "GRAND FINAL 26"), "User:Potato_Editor/GRAND_FINAL_26");
  assert.equal(draftTitle("User:Potato", ""), "User:Potato/Draft", "a pasted User: prefix and an empty page name");
  assert.equal(draftTitle("  ", "Cup"), "", "no user name: no link");
  // The start date tells same-named weekly cups apart: <name>/<year>/<MM-DD>.
  assert.equal(draftTitle("Potato", "Realistic Air Weekly", "2026-11-15"), "User:Potato/Realistic_Air_Weekly/2026/11-15");
  assert.equal(draftTitle("Potato", "Cup", "bad"), "User:Potato/Cup", "no date: no date part");
  assert.equal(editUrl("User:Potato/Cup_2026"), "https://liquipedia.net/warthunder/index.php?title=User:Potato/Cup_2026&action=edit");
  assert.match(editUrl("User:土豆/杯"), /title=User:%E5%9C%9F%E8%B1%86\/%E6%9D%AF&action=edit$/);
});
