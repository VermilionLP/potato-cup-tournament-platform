// Imports finished Potato Cup events from the War Thunder Liquipedia wiki.
//
//   node scripts/import-liquipedia.js                 # dry run: report only
//   node scripts/import-liquipedia.js --apply         # write to the database
//
// Options:
//   --input <file>   use a saved dump instead of downloading
//                    ({ pages: { title: wikitext }, templates: { name: wikitext } })
//   --refresh        download again even if the cached dump exists
//   --only <text>    only events whose page title contains <text>
//   --contact <text> contact for the User-Agent (or LIQUIPEDIA_CONTACT in .env)
//
// The download is cached in .cache/liquipedia/potato-cup.json. Re-running
// --apply replaces the imported events (ids starting with "lp-") in place.
// Content from Liquipedia is CC-BY-SA 3.0; every event links back to its page.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createClient, userAgentFor } from '../lib/liquipedia/fetch.js';
import { downloadDump, planImport, writeEvent } from '../lib/liquipedia/importer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const CACHE = path.join(__dirname, '../.cache/liquipedia/potato-cup.json');

function parseArgs(argv) {
  const args = { apply: false, refresh: false, input: null, only: null, contact: process.env.LIQUIPEDIA_CONTACT || '' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--refresh') args.refresh = true;
    else if (a === '--input') args.input = argv[++i];
    else if (a === '--only') args.only = argv[++i];
    else if (a === '--contact') args.contact = argv[++i];
    else throw new Error(`Unknown option ${a}`);
  }
  return args;
}

async function loadDump(args) {
  if (args.input) return JSON.parse(fs.readFileSync(args.input, 'utf8'));
  if (!args.refresh && fs.existsSync(CACHE)) {
    console.log(`使用缓存 ${CACHE}（加 --refresh 重新下载）`);
    return JSON.parse(fs.readFileSync(CACHE, 'utf8'));
  }
  const client = createClient({ userAgent: userAgentFor(args.contact), log: (m) => console.log(m) });
  const dump = await downloadDump(client, (m) => console.log(m));
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, JSON.stringify(dump));
  return dump;
}

function report(plan) {
  console.log('\n== 将导入的赛事 ==');
  for (const e of plan.events) {
    const fmt = e.playoffFormat ? `swiss+${e.playoffFormat}` : e.format;
    const games = e.matches.filter((r) => r.player1_id && r.player2_id).length;
    console.log(`${e.date || '????-??-??'}  ${e.id.padEnd(48)} ${fmt.padEnd(18)} ${String(e.players.length).padStart(3)} 人 ${String(games).padStart(4)} 场  ${e.name}`);
  }
  console.log(`\n共 ${plan.events.length} 个赛事，${plan.matchCount} 场对局，${plan.playerCount} 名选手（其中新选手 ${plan.newPlayers.length} 名）`);
  if (plan.skipped.length) {
    console.log('\n== 跳过的页面 ==');
    for (const s of plan.skipped) console.log(`${s.title}: ${s.reason}`);
  }
  const warnings = plan.warnings.filter((w) => !/资格赛对阵/.test(w.message));
  if (warnings.length) {
    console.log('\n== 需要在 Liquipedia 上核对的数据 ==');
    for (const w of warnings) console.log(`${w.title}: ${w.message}`);
  }
  if (plan.merged.length) {
    console.log('\n== 名字相近、已合并为同一选手 ==');
    for (const m of plan.merged) console.log(`${m.from.join(', ')} -> ${m.into}`);
  }
  if (plan.similar.length) {
    console.log('\n== 名字相近但未合并 ==');
    for (const g of plan.similar) console.log(g.join(' / '));
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dump = await loadDump(args);

  let db = null;
  let existingIds = [];
  if (process.env.DATABASE_URL) {
    const pg = (await import('pg')).default;
    db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    existingIds = (await db.query('SELECT id FROM axsuck.players')).rows.map((r) => r.id);
  } else if (args.apply) {
    throw new Error('DATABASE_URL is not set');
  }

  const plan = planImport({ pages: dump.pages, templates: dump.templates, existingIds });
  if (args.only) plan.events = plan.events.filter((e) => e.sourceTitle.includes(args.only));
  report(plan);

  if (!args.apply) {
    console.log('\n这是预览，没有写入数据库。确认无误后加 --apply 导入。');
  } else {
    for (const [i, e] of plan.events.entries()) {
      await writeEvent(db, e);
      console.log(`[${i + 1}/${plan.events.length}] 已导入 ${e.id}`);
    }
    console.log(`\n完成：导入 ${plan.events.length} 个赛事。`);
  }
  await db?.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
