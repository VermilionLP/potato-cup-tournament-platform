import { test } from "node:test";
import assert from "node:assert/strict";
import { convertOklch, legacyCss, transformFallbacks } from "../scripts/legacy-css.mjs";

test("oklch colours become sRGB hex", () => {
  assert.equal(convertOklch("a{color:oklch(1 0 0)}"), "a{color:#ffffff}");
  assert.equal(convertOklch("a{color:oklch(0 0 0)}"), "a{color:#000000}");
  assert.equal(convertOklch("a{color:oklch(62.8% .2577 29.23)}"), "a{color:#ff0000}");
  assert.equal(convertOklch("a{color:oklch(0.5 0 0 / 0.5)}"), "a{color:#63636380}");
  // Tailwind amber-500 is roughly #f99c00.
  assert.match(convertOklch("--color-amber-500:oklch(76.9% .188 70.08)"), /--color-amber-500:#f[89a-f][0-9a-f]{4}/);
  assert.equal(convertOklch("a{color:oklch(var(--l) 0 0)}"), "a{color:oklch(var(--l) 0 0)}", "unreadable stays");
});

test("translate / scale / rotate get transform fallbacks", () => {
  const css = ".-translate-y-1\\/2{--tw-translate-y:-50%;translate:var(--tw-translate-x) var(--tw-translate-y)}.scale-0{--tw-scale-x:0%;scale:var(--tw-scale-x) var(--tw-scale-y)}.rotate-90{rotate:90deg}.x{color:red}";
  const fb = transformFallbacks(css);
  assert.ok(fb.includes("@supports not (translate:0){.-translate-y-1\\/2{transform:translate(var(--tw-translate-x),var(--tw-translate-y))}}"));
  assert.ok(fb.includes("@supports not (scale:0){.scale-0{transform:scale(var(--tw-scale-x),var(--tw-scale-y))}}"));
  assert.ok(fb.includes("@supports not (rotate:0){.rotate-90{transform:rotate(90deg)}}"));
  assert.ok(!fb.includes(".x{"));
  assert.ok(legacyCss(":root{--a:oklch(1 0 0)}").startsWith(":root{--a:#ffffff;--a-rgb:255 255 255}"));
});

test("theme variables get -rgb twins and opacity utilities use them", () => {
  const css = ":root{--primary:oklch(1 0 0);--ring:oklch(1 0 0 / 50%)}.bg-primary\\/10{background-color:var(--primary)}@supports (color:color-mix(in lab, red, red)){.bg-primary\\/10{background-color:color-mix(in oklab, var(--primary) 10%, transparent)}}";
  const out = legacyCss(css);
  assert.ok(out.includes("--primary:#ffffff;--primary-rgb:255 255 255"));
  assert.ok(out.includes("--ring:#ffffff80") && !out.includes("--ring-rgb"));
  assert.ok(out.includes(".bg-primary\\/10{background-color:rgb(var(--primary-rgb) / 0.1)}@supports"));
  assert.ok(out.includes("color-mix(in oklab, var(--primary) 10%, transparent)"), "modern rule kept");
});

test("merged selector lists keep their solid rule", () => {
  const css = ":root{--background:oklch(0 0 0)}.bg-background,.bg-background\\/25{background-color:var(--background)}@supports (color:color-mix(in lab, red, red)){.bg-background\\/25{background-color:color-mix(in oklab, var(--background) 25%, transparent)}}";
  const out = legacyCss(css);
  assert.ok(out.includes(".bg-background,.bg-background\\/25{background-color:var(--background)}.bg-background\\/25{background-color:rgb(var(--background-rgb) / 0.25)}@supports"));
});

test("consecutive opacity utilities are all rewritten", () => {
  const one = (n) => `.a${n}{color:var(--p)}@supports (color:color-mix(in lab, red, red)){.a${n}{color:color-mix(in oklab, var(--p) ${n}%, transparent)}}`;
  const out = legacyCss(":root{--p:oklch(0 0 0)}" + one(10) + one(20) + one(30));
  for (const n of [10, 20, 30]) assert.ok(out.includes(`.a${n}{color:rgb(var(--p-rgb) / ${n / 100})}`), String(n));
});
