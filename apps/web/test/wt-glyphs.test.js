import assert from "node:assert/strict";
import { test } from "node:test";
import { hasGlyphs, plainGlyphs, splitGlyphs, WT_GLYPHS } from "../src/lib/wt-glyphs.js";

test("War Thunder's name marks become insignia parts; other text stays", () => {
  assert.deepEqual(splitGlyphs("F-16A"), [{ text: "F-16A" }]);
  const parts = splitGlyphs("▄JAS39C");
  assert.equal(parts.length, 2);
  assert.equal(parts[0].glyph, "▄");
  assert.equal(parts[0].label, "圆形机徽");
  assert.deepEqual(parts[1], { text: "JAS39C" });
  assert.equal(splitGlyphs("␗MiG-9 · ▃Grant I").filter((p) => p.glyph).length, 2);
  assert.equal(plainGlyphs("␗MiG-15bis"), "MiG-15bis");
  assert.equal(hasGlyphs("Spitfire Mk IXc"), true);
  assert.equal(hasGlyphs("Spitfire"), false);
  // Every mark has a drawing.
  for (const [ch, g] of Object.entries(WT_GLYPHS)) assert.ok(g.label && (g.d || g.stroke), ch);
});
