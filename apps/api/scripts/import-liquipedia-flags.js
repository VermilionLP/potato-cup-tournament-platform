// Fills in player nationality (flag) from the War Thunder Liquipedia wiki.
//
//   node scripts/import-liquipedia-flags.js            # dry run: report only
//   node scripts/import-liquipedia-flags.js --apply    # write to the database
//
// Options:
//   --overwrite      also replace a different flag on players who use the
//                    platform themselves (otherwise those are only listed)
//   --refresh        download again instead of using the cache
//   --contact <text> contact for the User-Agent (or LIQUIPEDIA_CONTACT in .env)
//
// Sources, best first: the player's Liquipedia page (Infobox country), then
// the most recent Potato Cup page that shows a flag for the player. Names
// are matched like the event import (case, _ - . spaces, Cyrillic look-alikes).
// Flags are filled in for players without one and for players that only
// appear in imported events; the flag is also updated on their imported
// event registrations.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createClient, userAgentFor } from '../lib/liquipedia/fetch.js';
import { downloadDump } from '../lib/liquipedia/importer.js';
import { collectNationalities, namesOnPages, planFlagUpdates } from '../lib/liquipedia/nationality.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const CACHE_DIR = path.join(__dirname, '../.cache/liquipedia');
const EVENTS_CACHE = path.join(CACHE_DIR, 'potato-cup.json');
const PLAYERS_CACHE = path.join(CACHE_DIR, 'players.json');

function parseArgs(argv) {
  const args = { apply: false, overwrite: false, refresh: false, contact: process.env.LIQUIPEDIA_CONTACT || '' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--overwrite') args.overwrite = true;
    else if (a === '--refresh') args.refresh = true;
    else if (a === '--contact') args.contact = argv[++i];
    else throw new Error(`Unknown option ${a}`);
  }
  return args;
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  const pg = (await import('pg')).default;
  const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  const players = (await db.query(`
    SELECT p.id, p.flag,
      EXISTS (SELECT 1 FROM axsuck.tournament_players tp
              WHERE tp.player_id = p.id AND tp.tournament_id LIKE 'lp-%')
      AND NOT EXISTS (SELECT 1 FROM axsuck.tournament_players tp
              WHERE tp.player_id = p.id AND tp.tournament_id NOT LIKE 'lp-%') AS imported
    FROM axsuck.players p
    ORDER BY p.id
  `)).rows;

  let client = null;
  const getClient = () => (client ||= createClient({ userAgent: userAgentFor(args.contact), log: (m) => console.log(m) }));

  let dump;
  if (!args.refresh && fs.existsSync(EVENTS_CACHE)) {
    console.log(`使用赛事缓存 ${EVENTS_CACHE}`);
    dump = readJson(EVENTS_CACHE);
  } else {
    dump = await downloadDump(getClient(), (m) => console.log(m));
    writeJson(EVENTS_CACHE, dump);
  }

  const names = [...new Set([...players.map((p) => p.id), ...namesOnPages(dump.pages)])].sort();
  let playerPages;
  const cached = !args.refresh && fs.existsSync(PLAYERS_CACHE) ? readJson(PLAYERS_CACHE) : null;
  if (cached && names.every((n) => n in cached.asked)) {
    console.log(`使用选手页缓存 ${PLAYERS_CACHE}`);
    playerPages = cached.pages;
  } else {
    console.log(`查询 ${names.length} 个选手页（每 2 秒一次请求，50 个一批）...`);
    playerPages = await getClient().playerPages(names);
    writeJson(PLAYERS_CACHE, { fetchedAt: new Date().toISOString(), asked: Object.fromEntries(names.map((n) => [n, 1])), pages: playerPages });
  }

  const nationalities = collectNationalities({ pages: dump.pages, playerPages });
  const plan = planFlagUpdates({ players, nationalities, overwrite: args.overwrite });

  console.log(`\n找到 ${Object.keys(playerPages).length} 个选手页，共 ${nationalities.size} 名选手有国籍信息。`);
  console.log(`\n== 将更新的国籍（${plan.updates.length}） ==`);
  for (const u of plan.updates) {
    const other = u.otherFlags.length ? `（其他页面也写过 ${u.otherFlags.join('/')}）` : '';
    console.log(`${u.id.padEnd(24)} ${(u.from || '—').padEnd(3)} -> ${u.to}  来源：${u.source}${other}`);
  }
  if (plan.conflicts.length) {
    console.log(`\n== 平台上的国籍和 Liquipedia 不同，未修改（加 --overwrite 覆盖）（${plan.conflicts.length}） ==`);
    for (const c of plan.conflicts) console.log(`${c.id.padEnd(24)} 平台 ${c.from}  Liquipedia ${c.to}  来源：${c.source}`);
  }
  if (plan.missing.length) {
    console.log(`\n== Liquipedia 上找不到国籍（${plan.missing.length}） ==`);
    console.log(plan.missing.join(', '));
  }

  if (!args.apply) {
    console.log('\n这是预览，没有写入数据库。确认无误后加 --apply 写入。');
  } else {
    const conn = await db.connect();
    try {
      await conn.query('BEGIN');
      for (const u of plan.updates) {
        await conn.query('UPDATE axsuck.players SET flag = $2 WHERE id = $1', [u.id, u.to]);
        await conn.query(
          `UPDATE axsuck.tournament_players SET flag = $2 WHERE player_id = $1 AND tournament_id LIKE 'lp-%'`,
          [u.id, u.to]
        );
      }
      await conn.query('COMMIT');
    } catch (err) {
      await conn.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      conn.release();
    }
    console.log(`\n完成：更新了 ${plan.updates.length} 名选手的国籍。`);
  }
  await db.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
