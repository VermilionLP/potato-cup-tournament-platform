import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../migrations");

test("migration files are BOM-free UTF-8 text", () => {
  for (const name of readdirSync(migrationsDir)) {
    if (!name.endsWith(".sql")) continue;
    const buf = readFileSync(join(migrationsDir, name));
    // Postgrator hands the file straight to Postgres, which rejects a leading
    // BOM with `syntax error at or near ""` (psql hides the problem).
    assert.equal(
      buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf,
      false,
      `${name} starts with a UTF-8 BOM`,
    );
    assert.equal(buf.includes(0), false, `${name} contains a NUL byte`);
  }
});

test("every do migration has a matching undo migration", () => {
  const names = readdirSync(migrationsDir);
  for (const name of names) {
    const match = name.match(/^(\d+)\.do\.(.+)\.sql$/);
    if (!match) continue;
    assert.ok(
      names.includes(`${match[1]}.undo.${match[2]}.sql`),
      `missing undo migration for ${name}`,
    );
  }
});
