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
//   --points-only    only update the leaderboard points (积分) of events that
//                    were already imported; nothing else is changed
//
// The download is cached in .cache/liquipedia/potato-cup.json. Re-running
// --apply replaces the imported events (ids starting with "lp-") in place.
// Content from Liquipedia is CC-BY-SA 3.0; every event links back to its page.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createClient, userAgentFor } from '../lib/liquipedia/fetch.js';
import { downloadDump, mergePlayers, planImport, writeEvent, writeEventPoints } from '../lib/liquipedia/importer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const CACHE = path.join(__dirname, '../.cache/liquipedia/potato-cup.json');

function parseArgs(argv) {
  const args = { apply: false, refresh: false, input: null, only: null, pointsOnly: false, contact: process.env.LIQUIPEDIA_CONTACT || '' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--refresh') args.refresh = true;
    else if (a === '--points-only') args.pointsOnly = true;
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
    const fmt = e.playoffFormat ? `${e.format}组+${e.playoffFormat}` : e.loserAdvances ? `${e.format}(败者晋级)` : e.format;
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
  if (plan.aliased.length) {
    console.log('\n== 按平台上手动合并/改名的记录归到 ==');
    for (const m of plan.aliased) console.log(`${m.from.join(', ')} -> ${m.into}`);
  }
  if (plan.merged.length) {
    console.log('\n== 名字相近、已合并为同一选手 ==');
    for (const m of plan.merged) console.log(`${m.from.join(', ')} -> ${m.into}`);
  }
  if (plan.playerMerges.length) {
    console.log('\n== 数据库里已有的同名选手资料，将合并（对局、报名、投票都转到保留的名字上） ==');
    for (const m of plan.playerMerges) console.log(`${m.from} -> ${m.into}`);
  }
  if (plan.accountClashes.length) {
    console.log('\n== 两个名字都在平台上用过，没有自动合并（需要的话在选手管理里手动合并） ==');
    for (const c of plan.accountClashes) console.log(`${c.other}  /  ${c.kept}`);
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
  let platformIds = [];
  let aliases = {};
  let importedBefore = [];
  if (process.env.DATABASE_URL) {
    const pg = (await import('pg')).default;
    db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const rows = (await db.query(`
      SELECT p.id,
        (p.last_ip IS NOT NULL
         OR EXISTS (SELECT 1 FROM axsuck.tournament_players tp
                    WHERE tp.player_id = p.id AND tp.tournament_id NOT LIKE 'lp-%')
         OR EXISTS (SELECT 1 FROM axsuck.time_votes v WHERE v.player_id = p.id)
         OR EXISTS (SELECT 1 FROM axsuck.custom_votes v WHERE v.player_id = p.id)) AS platform
      FROM axsuck.players p
    `)).rows;
    existingIds = rows.map((r) => r.id);
    platformIds = rows.filter((r) => r.platform).map((r) => r.id);
    importedBefore = (await db.query(
      `SELECT id, source_title FROM axsuck.tournaments WHERE id LIKE 'lp-%'`
    )).rows;
    aliases = Object.fromEntries(
      (await db.query('SELECT alias, player_id FROM axsuck.player_aliases')).rows.map((r) => [r.alias, r.player_id])
    );
  } else if (args.apply) {
    throw new Error('DATABASE_URL is not set');
  }

  const plan = planImport({ pages: dump.pages, templates: dump.templates, existingIds, platformIds, aliases });
  if (args.only) plan.events = plan.events.filter((e) => e.sourceTitle.includes(args.only));

  if (args.pointsOnly) {
    const withPoints = plan.events.filter((e) => e.pointsTable);
    console.log('== 积分 ==');
    for (const e of withPoints) {
      console.log(`${e.id.padEnd(40)} ${e.pointsSeason} ${e.pointsKind === 'monthly' ? '月赛' : '周赛'}  ${e.pointsTable.map((r) => `${r.from === r.to ? r.from : `${r.from}-${r.to}`}:${r.points}`).join(' ')}`);
    }
    console.log(`\n${withPoints.length} 个赛事有积分`);
    if (!args.apply) {
      console.log('\n这是预览，没有写入数据库。确认无误后加 --apply 写入积分。');
    } else {
      let updated = 0;
      for (const e of plan.events) if (await writeEventPoints(db, e)) updated += 1;
      console.log(`\n完成：更新了 ${updated} 个已导入赛事的积分（没有积分的赛事已清空积分）。`);
    }
    await db?.end();
    return;
  }
  report(plan);

  // Events imported earlier from these pages that the import no longer
  // produces (e.g. a group stage that used to be split into one event per
  // group) are removed.
  const covered = (title) => title in dump.pages && (!args.only || title.includes(args.only));
  const planned = new Set(plan.events.map((e) => e.id));
  const stale = importedBefore.filter((t) => covered(t.source_title) && !planned.has(t.id));
  if (stale.length) {
    console.log(`\n== 将删除的旧导入赛事（${stale.length}，已不再单独成赛） ==`);
    for (const t of stale) console.log(`${t.id}  （来自 ${t.source_title}）`);
  }

  if (!args.apply) {
    console.log('\n这是预览，没有写入数据库。确认无误后加 --apply 导入。');
  } else {
    for (const [i, e] of plan.events.entries()) {
      await writeEvent(db, e);
      console.log(`[${i + 1}/${plan.events.length}] 已导入 ${e.id}`);
    }
    for (const t of stale) {
      await db.query('DELETE FROM axsuck.tournaments WHERE id = $1', [t.id]);
      console.log(`已删除 ${t.id}`);
    }
    for (const m of plan.playerMerges) {
      await mergePlayers(db, m.from, m.into);
      console.log(`已合并 ${m.from} -> ${m.into}`);
    }
    console.log(`\n完成：导入 ${plan.events.length} 个赛事。`);
  }
  await db?.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
