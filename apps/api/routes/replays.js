import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, unlinkSync, mkdirSync, existsSync } from 'fs';
import { exec } from 'child_process';
import util from 'util';
import zlib from 'zlib';
import os from 'os';
import { MatchRepo } from '../repositories/match-repo.js';
import { getPlayerDisplayName } from '../repositories/player-repo.js';

const execPromise = util.promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));
const PYTHON_COMMANDS = process.env.PYTHON_BIN
  ? [process.env.PYTHON_BIN]
  : ['python3', 'python'];

// Configuration for QQ Groups
const ALLOWED_QQ_GROUPS = (process.env.ALLOWED_QQ_GROUPS || '460309159,1002072430')
  .split(',')
  .map(g => g.trim());

function quoteShellArg(value) {
  return `"${value.replace(/(["\\$`])/g, '\\$1')}"`;
}

async function getPythonCommand() {
  const errors = [];

  for (const command of PYTHON_COMMANDS) {
    try {
      await execPromise(`${quoteShellArg(command)} -c "import sc2reader, spawningtool, json"`);
      return { ok: true, command };
    } catch (err) {
      errors.push(`${command}: ${err.message}`);
    }
  }

  return { ok: false, error: errors.join('\n') };
}

async function parseReplay(scriptPath, replayPath) {
  const envCheck = await getPythonCommand();
  if (!envCheck.ok) {
    return envCheck;
  }

  const { stdout } = await execPromise(
    `${quoteShellArg(envCheck.command)} ${quoteShellArg(scriptPath)} ${quoteShellArg(replayPath)}`
  );
  return { ok: true, stdout };
}

// Helper to check python dependencies
export async function checkPythonEnvironment() {
  return getPythonCommand();
}

export default async function replaysRoutes(fastify) {
  const db = fastify.db;

  // Middleware/helper to validate QQ group validation
  function validateQQGroup(qqGroup) {
    if (!qqGroup) {
      throw fastify.httpErrors.badRequest('QQ Group number is required.');
    }
    if (!ALLOWED_QQ_GROUPS.includes(qqGroup.toString().trim())) {
      throw fastify.httpErrors.forbidden('Invalid QQ Group. Access denied.');
    }
  }

  // Verify QQ Group number
  fastify.post('/verify-qq', async (req) => {
    const { qqGroup } = req.body;
    if (!qqGroup) {
      throw fastify.httpErrors.badRequest('QQ Group number is required.');
    }
    const isValid = ALLOWED_QQ_GROUPS.includes(qqGroup.toString().trim());
    return { valid: isValid };
  });

  // Upload replay(s) for a match
  fastify.post('/matches/:matchId/replays', async (req) => {
    const { matchId } = req.params;
    const { replays, qqGroup } = req.body; // replays is array of { filename, content (base64) }

    validateQQGroup(qqGroup);

    if (!replays || !Array.isArray(replays) || replays.length === 0) {
      throw fastify.httpErrors.badRequest('No replays provided.');
    }

    // Check if match exists
    const match = db.prepare('SELECT id FROM matches WHERE id = ?').get(matchId);
    if (!match) {
      throw fastify.httpErrors.notFound('Match not found.');
    }

    // Verify python is available
    const envCheck = await checkPythonEnvironment();
    if (!envCheck.ok) {
      throw fastify.httpErrors.internalServerError(
        'Server python environment is not fully configured (missing sc2reader/spawningtool).'
      );
    }

    const tempDir = join(os.tmpdir(), 'suck-replays');
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }

    const results = [];
    const scriptPath = join(__dirname, '..', 'scripts', 'parse_replay.py');

    for (const rep of replays) {
      const { filename, content } = rep;
      if (!filename || !content) continue;

      const buffer = Buffer.from(content, 'base64');
      const tempFilePath = join(tempDir, `${Date.now()}_${filename}`);

      try {
        // 1. Write raw replay to temporary file
        writeFileSync(tempFilePath, buffer);

        // 2. Call python script to parse
        const parseResult = await parseReplay(scriptPath, tempFilePath);
        if (!parseResult.ok) {
          throw new Error(parseResult.error);
        }
        const { stdout } = parseResult;
        const parsedData = JSON.parse(stdout);

        // 3. Compress raw replay buffer with Gzip
        const compressed = zlib.gzipSync(buffer);

        // 4. Save to database
        const stmt = db.prepare(`
          INSERT INTO match_replays (
            match_id, filename, compressed_data, parsed_data, winner, map_name, game_length
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
          matchId,
          filename,
          compressed,
          JSON.stringify(parsedData),
          parsedData.winner,
          parsedData.map_name,
          parsedData.game_length
        );

        results.push({ filename, status: 'success' });
      } catch (err) {
        fastify.log.error(`Error parsing replay ${filename}: ${err.message}`);
        results.push({ filename, status: 'error', error: err.message });
      } finally {
        // Clean up temporary file
        try {
          if (existsSync(tempFilePath)) {
            unlinkSync(tempFilePath);
          }
        } catch (_) { }
      }
    }

    // Trigger real-time broadcast
    const matchObj = db.prepare('SELECT tournament_id FROM matches WHERE id = ?').get(matchId);
    if (matchObj) {
      fastify.tournamentEvents.emit(`update:${matchObj.tournament_id}`, { type: 'replays_updated', matchId });
    }

    return { results };
  });

  // Helper to match player from replay
  function findMatchPlayer(repName, players) {
    if (!repName) return null;
    const nameLower = repName.toLowerCase().trim();
    
    // Check exact ID match
    let matched = players.find(p => p.id.toLowerCase().trim() === nameLower);
    if (matched) return matched;
    
    // Check exact display name match (derived from first non-empty battle tag nickname)
    matched = players.find(p => (p.display_name || '').toLowerCase().trim() === nameLower);
    if (matched) return matched;
    
    // Check inside battle_tags JSON
    for (const p of players) {
      if (p.battle_tags) {
        try {
          const tags = typeof p.battle_tags === 'string' ? JSON.parse(p.battle_tags) : p.battle_tags;
          const tagList = [];
          if (tags) {
            for (const key of Object.keys(tags)) {
              const val = tags[key];
              if (Array.isArray(val)) {
                tagList.push(...val.filter(Boolean).map(t => t.toLowerCase().trim()));
              } else if (typeof val === 'string' && val) {
                tagList.push(val.toLowerCase().trim());
              }
            }
          }
          const hasMatch = tagList.some(tag => tag === nameLower || tag.split('#')[0] === nameLower);
          if (hasMatch) return p;
        } catch (_) {}
      }
    }

    // Check inside bnet_ids JSON array
    for (const p of players) {
      if (p.bnet_ids) {
        try {
          const ids = typeof p.bnet_ids === 'string' ? JSON.parse(p.bnet_ids) : p.bnet_ids;
          if (Array.isArray(ids)) {
            const hasMatch = ids.some(item => {
              if (typeof item === 'string') {
                return item.toLowerCase().trim() === nameLower;
              } else if (item && typeof item === 'object' && item.id) {
                return item.id.toLowerCase().trim() === nameLower;
              }
              return false;
            });
            if (hasMatch) return p;
          }
        } catch (_) {}
      }
    }
    
    // Check sub-string match
    const candidates = players.filter(p => 
      p.id.toLowerCase().includes(nameLower) || 
      (p.display_name || '').toLowerCase().includes(nameLower) ||
      nameLower.includes(p.id.toLowerCase())
    );
    if (candidates.length === 1) {
      return candidates[0];
    }
    return null;
  }

  // Batch upload and auto-match replays for a tournament
  fastify.post('/tournaments/:id/replays/batch', async (req) => {
    const { id: tournamentId } = req.params;
    const { replays, qqGroup } = req.body; // replays is array of { filename, content (base64) }

    validateQQGroup(qqGroup);

    if (!replays || !Array.isArray(replays) || replays.length === 0) {
      throw fastify.httpErrors.badRequest('No replays provided.');
    }

    const tournament = db.prepare('SELECT id FROM tournaments WHERE id = ?').get(tournamentId);
    if (!tournament) {
      throw fastify.httpErrors.notFound('Tournament not found.');
    }

    const envCheck = await checkPythonEnvironment();
    if (!envCheck.ok) {
      throw fastify.httpErrors.internalServerError(
        'Server python environment is not fully configured (missing sc2reader/spawningtool).'
      );
    }

    // Fetch players to do mapping
    const players = db.prepare(`
      SELECT p.*
      FROM tournament_players tp
      JOIN players p ON tp.player_id = p.id
      WHERE tp.tournament_id = ?
    `).all(tournamentId).map(p => ({
      ...p,
      display_name: getPlayerDisplayName(p)
    }));

    const tempDir = join(os.tmpdir(), 'suck-replays');
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }

    const results = [];
    const scriptPath = join(__dirname, '..', 'scripts', 'parse_replay.py');

    for (const rep of replays) {
      const { filename, content } = rep;
      if (!filename || !content) continue;

      const buffer = Buffer.from(content, 'base64');
      const tempFilePath = join(tempDir, `${Date.now()}_${filename}`);

      try {
        writeFileSync(tempFilePath, buffer);
        const parseResult = await parseReplay(scriptPath, tempFilePath);
        if (!parseResult.ok) {
          throw new Error(parseResult.error);
        }
        const { stdout } = parseResult;
        const parsedData = JSON.parse(stdout);
        const compressed = zlib.gzipSync(buffer);

        // Find players
        const repPlayers = parsedData.teams?.flatMap(t => t.players || []) || [];
        if (repPlayers.length < 2) {
          throw new Error('Replay does not have 2 players');
        }

        const repP1Name = repPlayers[0].name;
        const repP2Name = repPlayers[1].name;

        const p1 = findMatchPlayer(repP1Name, players);
        const p2 = findMatchPlayer(repP2Name, players);

        if (!p1 || !p2) {
          results.push({
            filename,
            status: 'unmapped',
            content,
            repPlayers: [repP1Name, repP2Name],
            p1Matched: p1 ? p1.id : null,
            p2Matched: p2 ? p2.id : null
          });
          continue;
        }

        // Auto-save matched Battle.net IDs to player profiles
        const addBnetIdToPlayer = (player, bnetId) => {
          let bnetIds = [];
          if (player.bnet_ids) {
            try {
              bnetIds = typeof player.bnet_ids === 'string' ? JSON.parse(player.bnet_ids) : player.bnet_ids;
            } catch (_) {}
          }
          if (!Array.isArray(bnetIds)) bnetIds = [];
          
          const hasId = bnetIds.some(item => {
            if (typeof item === 'string') return item.toLowerCase().trim() === bnetId.toLowerCase().trim();
            if (item && typeof item === 'object' && item.id) return item.id.toLowerCase().trim() === bnetId.toLowerCase().trim();
            return false;
          });
          
          if (!hasId) {
            bnetIds.push({ id: bnetId, url: '' });
            db.prepare('UPDATE players SET bnet_ids = ? WHERE id = ?').run(JSON.stringify(bnetIds), player.id);
            player.bnet_ids = JSON.stringify(bnetIds);
          }
        };

        addBnetIdToPlayer(p1, repP1Name);
        addBnetIdToPlayer(p2, repP2Name);

        // Find match
        const match = db.prepare(`
          SELECT * FROM matches 
          WHERE tournament_id = ? 
            AND ((player1_id = ? AND player2_id = ?) OR (player1_id = ? AND player2_id = ?))
        `).get(tournamentId, p1.id, p2.id, p2.id, p1.id);

        if (!match) {
          throw new Error(`No scheduled match found for ${p1.display_name || p1.id} vs ${p2.display_name || p2.id}`);
        }

        // Check if duplicate replay file (same name or same match/map/length)
        const duplicate = db.prepare(`
          SELECT id FROM match_replays 
          WHERE match_id = ? AND filename = ?
        `).get(match.id, filename);

        if (duplicate) {
          results.push({ filename, status: 'skipped', message: 'Replay already uploaded for this match', matchId: match.id });
          continue;
        }

        // Save replay to database
        const stmt = db.prepare(`
          INSERT INTO match_replays (
            match_id, filename, compressed_data, parsed_data, winner, map_name, game_length
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
          match.id,
          filename,
          compressed,
          JSON.stringify(parsedData),
          parsedData.winner,
          parsedData.map_name,
          parsedData.game_length
        );

        // Auto-update match score and result
        const allReplays = db.prepare(`
          SELECT id, parsed_data, winner FROM match_replays WHERE match_id = ?
        `).all(match.id);

        const matchRepo = MatchRepo(db);
        let score1 = 0;
        let score2 = 0;

        const p1Row = db.prepare('SELECT * FROM players WHERE id = ?').get(match.player1_id);
        const p2Row = db.prepare('SELECT * FROM players WHERE id = ?').get(match.player2_id);
        const p1Name = getPlayerDisplayName(p1Row) || match.player1_id;
        const p2Name = getPlayerDisplayName(p2Row) || match.player2_id;

        const checkPlayerMatch = (player, nameLower) => {
          if (!player) return false;
          if (player.id.toLowerCase().trim() === nameLower) return true;
          const disp = getPlayerDisplayName(player);
          if (disp && disp.toLowerCase().trim() === nameLower) return true;
          if (player.battle_tags) {
            try {
              const tags = typeof player.battle_tags === 'string' ? JSON.parse(player.battle_tags) : player.battle_tags;
              const tagList = Object.values(tags || {}).filter(Boolean).map(t => t.toLowerCase().trim());
              return tagList.some(tag => tag === nameLower || tag.split('#')[0] === nameLower);
            } catch (_) {}
          }
          return false;
        };

        allReplays.forEach(r => {
          const parsed = JSON.parse(r.parsed_data);
          const rWinner = r.winner || parsed.winner;
          
          if (rWinner) {
            const rWinnerLower = rWinner.toLowerCase().trim();
            if (checkPlayerMatch(p1Row, rWinnerLower)) {
              score1++;
            } else if (checkPlayerMatch(p2Row, rWinnerLower)) {
              score2++;
            }
          }
        });

        if (score1 > 0 || score2 > 0) {
          let winnerId = null;
          if (score1 > score2) winnerId = match.player2_id;
          else if (score2 > score1) winnerId = match.player1_id;

          db.prepare(`
            UPDATE matches SET score1 = ?, score2 = ?, winner_id = ?, status = 'completed'
            WHERE id = ?
          `).run(score1, score2, winnerId, match.id);

          matchRepo.advanceWinner(tournamentId, match.id);
        }

        results.push({ filename, status: 'success', matchId: match.id, p1: p1.display_name || p1.id, p2: p2.display_name || p2.id });
      } catch (err) {
        results.push({ filename, status: 'error', error: err.message });
      } finally {
        try {
          if (existsSync(tempFilePath)) {
            unlinkSync(tempFilePath);
          }
        } catch (_) {}
      }
    }

    // Trigger real-time broadcast
    fastify.tournamentEvents.emit(`update:${tournamentId}`, { type: 'replays_updated' });

    return { results };
  });

  // Get replays for a match
  fastify.get('/matches/:matchId/replays', async (req) => {
    const { matchId } = req.params;
    const replays = db.prepare(`
      SELECT id, match_id, filename, parsed_data, winner, map_name, game_length, uploaded_at
      FROM match_replays
      WHERE match_id = ?
      ORDER BY uploaded_at ASC
    `).all(matchId);

    return replays.map(r => ({
      ...r,
      parsed_data: JSON.parse(r.parsed_data)
    }));
  });

  // Download raw decompressed replay
  fastify.get('/replays/:replayId/download', async (req, reply) => {
    const { replayId } = req.params;
    const replay = db.prepare('SELECT filename, compressed_data FROM match_replays WHERE id = ?').get(replayId);
    if (!replay) {
      throw fastify.httpErrors.notFound('Replay not found.');
    }

    // Decompress on the fly
    const rawData = zlib.gunzipSync(replay.compressed_data);

    reply
      .header('Content-Disposition', `attachment; filename="${encodeURIComponent(replay.filename)}"`)
      .header('Content-Type', 'application/octet-stream')
      .send(rawData);
  });

  // Delete a replay
  fastify.delete('/replays/:replayId', async (req) => {
    const { replayId } = req.params;
    const matchInfo = db.prepare(`
      SELECT m.tournament_id FROM match_replays mr
      JOIN matches m ON mr.match_id = m.id
      WHERE mr.id = ?
    `).get(replayId);

    const result = db.prepare('DELETE FROM match_replays WHERE id = ?').run(replayId);
    if (result.changes === 0) {
      throw fastify.httpErrors.notFound('Replay not found.');
    }

    if (matchInfo) {
      fastify.tournamentEvents.emit(`update:${matchInfo.tournament_id}`, { type: 'replay_deleted', replayId });
    }

    return { success: true };
  });

  // Generate Liquipedia Wiki Script for a tournament
  fastify.get('/tournaments/:id/wiki', async (req) => {
    const { id: tournamentId } = req.params;
    const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId);
    if (!tournament) {
      throw fastify.httpErrors.notFound('Tournament not found.');
    }

    function getPlayerInfoFromReplay(playerId, playerDisplayName, playerBattleTags, playerBnetIds, parsedData) {
      const repPlayers = parsedData.teams?.flatMap((t, tIdx) => (t.players || []).map(p => ({ ...p, teamIdx: tIdx }))) || [];
      const pIdLower = playerId.toLowerCase().trim();
      const pDispLower = (playerDisplayName || '').toLowerCase().trim();
      
      let tags = {};
      if (playerBattleTags) {
        try {
          tags = typeof playerBattleTags === 'string' ? JSON.parse(playerBattleTags) : playerBattleTags;
        } catch (_) {}
      }
      const tagList = [];
      if (tags) {
        for (const key of Object.keys(tags)) {
          const val = tags[key];
          if (Array.isArray(val)) {
            tagList.push(...val.filter(Boolean).map(t => t.toLowerCase().trim()));
          } else if (typeof val === 'string' && val) {
            tagList.push(val.toLowerCase().trim());
          }
        }
      }

      let bnetIds = [];
      if (playerBnetIds) {
        try {
          bnetIds = typeof playerBnetIds === 'string' ? JSON.parse(playerBnetIds) : playerBnetIds;
        } catch (_) {}
      }
      const bnetNames = bnetIds.map(b => (typeof b === 'string' ? b : b.id).toLowerCase().trim());

      return repPlayers.find(p => {
        if (!p.name) return false;
        const nameLower = p.name.toLowerCase().trim();
        return nameLower === pIdLower || 
               nameLower === pDispLower || 
               tagList.some(tag => tag === nameLower || tag.split('#')[0] === nameLower) ||
               bnetNames.includes(nameLower);
      });
    }

    const players = db.prepare(`
      SELECT 
        p.id, 
        p.bnet_ids,
        p.battle_tags,
        COALESCE(tp.flag, p.flag) AS flag, 
        COALESCE(tp.team, p.team) AS team, 
        COALESCE(tp.link, p.link) AS link, 
        tp.seed, 
        tp.registered_at
      FROM tournament_players tp
      JOIN players p ON tp.player_id = p.id
      WHERE tp.tournament_id = ?
      ORDER BY tp.seed IS NULL, tp.seed ASC, tp.registered_at ASC
    `).all(tournamentId).map(p => ({
      ...p,
      display_name: getPlayerDisplayName(p)
    }));

    const matches = db.prepare(`
      SELECT m.*, 
             p1.battle_tags AS player1_battle_tags,
             p1.bnet_ids AS player1_bnet_ids,
             COALESCE(tp1.flag, p1.flag) AS player1_flag,
             COALESCE(tp1.team, p1.team) AS player1_team,
             COALESCE(tp1.link, p1.link) AS player1_link,
             p2.battle_tags AS player2_battle_tags,
             p2.bnet_ids AS player2_bnet_ids,
             COALESCE(tp2.flag, p2.flag) AS player2_flag,
             COALESCE(tp2.team, p2.team) AS player2_team,
             COALESCE(tp2.link, p2.link) AS player2_link,
             w.battle_tags AS winner_battle_tags
      FROM matches m
      LEFT JOIN players p1 ON m.player1_id = p1.id
      LEFT JOIN tournament_players tp1 ON tp1.tournament_id = m.tournament_id AND tp1.player_id = m.player1_id
      LEFT JOIN players p2 ON m.player2_id = p2.id
      LEFT JOIN tournament_players tp2 ON tp2.tournament_id = m.tournament_id AND tp2.player_id = m.player2_id
      LEFT JOIN players w ON m.winner_id = w.id
      WHERE m.tournament_id = ?
      ORDER BY m.round ASC, m.position ASC
    `).all(tournamentId).map(m => {
      const p1Name = getPlayerDisplayName({ id: m.player1_id, battle_tags: m.player1_battle_tags }) || m.player1_id || 'TBD';
      const p2Name = getPlayerDisplayName({ id: m.player2_id, battle_tags: m.player2_battle_tags }) || m.player2_id || 'TBD';
      const winnerName = getPlayerDisplayName({ id: m.winner_id, battle_tags: m.winner_battle_tags }) || m.winner_id;
      return {
        ...m,
        player1_name: p1Name,
        player2_name: p2Name,
        winner_name: winnerName
      };
    });

    // Fetch replays for these matches to extract maps and game details
    const matchIds = matches.map(m => m.id);
    const replays = matchIds.length > 0
      ? db.prepare(`SELECT * FROM match_replays WHERE match_id IN (${matchIds.join(',')})`).all()
      : [];

    const replaysByMatchId = {};
    replays.forEach(r => {
      r.parsed_data = JSON.parse(r.parsed_data);
      replaysByMatchId[r.match_id] = replaysByMatchId[r.match_id] || [];
      replaysByMatchId[r.match_id].push(r);
    });

    // Determine tournament date based on earliest replay time, fallback to creation date
    let earliestReplayTime = null;
    replays.forEach(r => {
      if (r.parsed_data?.start_time) {
        if (earliestReplayTime === null || r.parsed_data.start_time < earliestReplayTime) {
          earliestReplayTime = r.parsed_data.start_time;
        }
      }
    });

    const formattedDate = tournament.created_at ? tournament.created_at.split(' ')[0] : new Date().toISOString().split('T')[0];
    let tournamentDate = formattedDate;
    if (earliestReplayTime) {
      const d = new Date(earliestReplayTime * 1000);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      tournamentDate = `${year}-${month}-${day}`;
    }

    const tournamentNumberMatch = tournament.name.match(/\d+$/);
    const tournamentNumber = tournamentNumberMatch ? tournamentNumberMatch[0] : 'XXX';

    // Dynamically build web application tournament URL using referer header
    let bracketUrl = `https://challonge.com/succk${tournamentNumber}`;
    if (req.headers.referer) {
      try {
        const refUrl = new URL(req.headers.referer);
        bracketUrl = `${refUrl.origin}/tournament/${tournamentId}`;
      } catch (_) {}
    }

    let wikiScript = `{{DISPLAYTITLE:StarCraft Ultra Chicken King #{{SUBPAGENAME}}}}\n`;
    wikiScript += `{{SUCK_Navbox}}\n`;
    wikiScript += `{{Infobox league\n`;
    wikiScript += `|name=S.U.C.K #{{SUBPAGENAME}}\n`;
    wikiScript += `|image=Alpha X logo dec 2020.png\n`;
    wikiScript += `|series=StarCraft Ultra Chicken King\n`;
    wikiScript += `|abbreviation=SUCK\n`;
    wikiScript += `|tickername=SUCK#{{SUBPAGENAME}}\n`;
    wikiScript += `|number={{SUBPAGENAME}}\n`;
    wikiScript += `|organizer=AlphaX战队星际水友群\n`;
    wikiScript += `|sponsor=\n`;
    wikiScript += `|game=lotv\n`;
    wikiScript += `|server=cn\n`;
    wikiScript += `|type=Online\n`;
    wikiScript += `|country=China\n`;
    wikiScript += `|format=1v1<br>Single-elimination\n`;
    wikiScript += `|prizepool=0\n`;
    wikiScript += `|localcurrency=cny\n`;
    wikiScript += `|date=${tournamentDate}\n`;
    wikiScript += `|liquipediatier=4 |tiertype=Showmatch\n`;
    wikiScript += `|bracket=${bracketUrl}\n`;
    wikiScript += `}}\n\n`;

    wikiScript += `==Format==\n`;
    wikiScript += `* 单淘 Single-elimination bracket\n`;

    const matchCounts = matches.map(m => (replaysByMatchId[m.id] || []).length).filter(c => c > 0);
    const maxGames = matchCounts.length > 0 ? Math.max(...matchCounts) : 1;
    let formatBo = "Bo1";
    if (maxGames > 1) {
      formatBo = `Bo${maxGames % 2 === 0 ? maxGames + 1 : maxGames}`;
    }
    wikiScript += `* 所有比赛均${formatBo} All matches are ${formatBo}\n`;
    wikiScript += `* 败者晋级 Loser of each match advance to the next round.\n\n`;

    wikiScript += `===Map Pool===\n`;
    wikiScript += `* 选手可以Ban图或者限定天梯地图，不然主办随机选了 Player can specify maps to ban, or demand ladder maps. Otherwise the organizer will randomly pick from all Blizzard or GSL maps.\n`;
    wikiScript += `{{MapPoolTable|size=x132px}}\n\n`;

    wikiScript += `==Talents==\n`;
    wikiScript += `{{BroadcasterCard\n`;
    wikiScript += `|position=Host\n`;
    wikiScript += `|b1=Wayne|b1flag=CN|b1link=User:Wayne19980\n`;
    wikiScript += `}}\n`;
    wikiScript += `{{BroadcasterCard\n`;
    wikiScript += `|position=Caster\n`;
    wikiScript += `|b1=Wayne|b1flag=CN|b1link=User:Wayne19980\n`;
    wikiScript += `}}\n\n`;

    wikiScript += `==Prize Pool==\n`;
    wikiScript += `{{ParticipantTable|hidden=true\n`;
    players.forEach((player, index) => {
      const displayName = player.display_name;
      // Get race from replays or default to 'u'
      let race = 'u';
      const playerMatches = matches.filter(m => m.player1_id === player.id || m.player2_id === player.id);
      for (const pm of playerMatches) {
        const reps = replaysByMatchId[pm.id] || [];
        if (reps.length > 0) {
          const repPlayer = getPlayerInfoFromReplay(player.id, player.display_name, player.battle_tags, player.bnet_ids, reps[0].parsed_data);
          if (repPlayer && repPlayer.race) {
            race = repPlayer.race[0].toLowerCase();
            break;
          }
        }
      }
      const flag = player.flag || "cn";
      const teamStr = player.team ? `|p${index + 1}team=${player.team}` : "";
      const linkStr = player.link ? `|p${index + 1}link=${player.link}` : "";
      wikiScript += `|p${index + 1}=${displayName}|p${index + 1}race=${race}|p${index + 1}flag=${flag}${teamStr}${linkStr}\n`;
    });
    wikiScript += `}}\n`;

    const playerCount = players.length;
    wikiScript += `{{SoloPrizePool\n`;
    wikiScript += `|{{Slot|place=1}}\n`;
    if (playerCount >= 2) wikiScript += `|{{Slot|place=2}}\n`;

    if (playerCount === 3) {
      wikiScript += `|{{Slot|place=3}}\n`;
    } else if (playerCount >= 4) {
      if (tournament.hold_third_place === 1) {
        wikiScript += `|{{Slot|place=3}}\n`;
        wikiScript += `|{{Slot|place=4}}\n`;
      } else {
        wikiScript += `|{{Slot|place=3-4}}\n`;
      }
    }

    if (playerCount >= 8) {
      wikiScript += `|{{Slot|place=5-8}}\n`;
    } else if (playerCount > 4) {
      const placeStr = playerCount === 5 ? "5" : `5-${playerCount}`;
      wikiScript += `|{{Slot|place=${placeStr}}}\n`;
    }
    if (playerCount >= 16) {
      wikiScript += `|{{Slot|place=9-16}}\n`;
    } else if (playerCount > 8) {
      const placeStr = playerCount === 9 ? "9" : `9-${playerCount}`;
      wikiScript += `|{{Slot|place=${placeStr}}}\n`;
    }
    wikiScript += `}}\n\n`;

    wikiScript += `==Notable Participants==\n`;
    wikiScript += `{{ParticipantTable|count=true|onlyNotable=|tournament=#}}\n\n`;

    wikiScript += `==Results==\n`;

    const bracketTemplates = {
      2: "Bracket/2",
      4: "Bracket/4",
      8: "Bracket/8",
      16: "Bracket/16",
    };
    const bracketTemplate = bracketTemplates[playerCount] || "Bracket/16";
    const tournamentIdStr = tournamentNumber.padStart(4, "0");

    wikiScript += `{{Bracket|${bracketTemplate}|id=AXsuck${tournamentIdStr}\n`;

    // Group matches by round for bracket structure rendering
    const maxDbRound = Math.max(...matches.map(m => m.round), 1);
    const rounds = {};
    matches.forEach(m => {
      const lpRound = maxDbRound - m.round + 1;
      rounds[lpRound] = rounds[lpRound] || [];
      rounds[lpRound].push(m);
    });

    const roundKeys = Object.keys(rounds).sort((a, b) => parseInt(a) - parseInt(b));
    roundKeys.forEach(rKey => {
      const roundMatches = rounds[rKey];
      wikiScript += `|R${rKey}Name=Round ${rKey}\n`;
      roundMatches.forEach((m, idx) => {
        const matchReplays = replaysByMatchId[m.id] || [];
        const numGames = matchReplays.length;
        const winner = m.winner_id === m.player1_id ? 1 : (m.winner_id === m.player2_id ? 2 : 0);
        const isWalkover = m.status === 'walkover';

        const p1Name = m.player1_name || 'TBD';
        const p2Name = m.player2_name || 'TBD';

        const matchIdx = idx + 1;
        wikiScript += `|R${rKey}M${matchIdx} = {{Match\n`;

        if (isWalkover) {
          wikiScript += `    |winner=${winner}\n`;
          const opp1Score = winner === 1 ? "W" : "FF";
          const opp2Score = winner === 2 ? "W" : "FF";
          wikiScript += `    |opponent1={{1Opponent|${p1Name}|score=${opp1Score}}}\n`;
          wikiScript += `    |opponent2={{1Opponent|${p2Name}|score=${opp2Score}}}\n`;
        } else {
          const bestOf = numGames > 0 ? (numGames % 2 === 0 ? numGames + 1 : numGames) : 1;
          wikiScript += `    |bestof=${bestOf}\n`;
          wikiScript += `    |winner=${winner || ''}\n`;

          let matchDateStr = `${formattedDate} 20:00 {{abbr/CST}}`;
          if (matchReplays.length > 0 && matchReplays[0].parsed_data?.start_time) {
            const dateObj = new Date(matchReplays[0].parsed_data.start_time * 1000);
            const year = dateObj.getFullYear();
            const month = String(dateObj.getMonth() + 1).padStart(2, '0');
            const day = String(dateObj.getDate()).padStart(2, '0');
            const hours = String(dateObj.getHours()).padStart(2, '0');
            const minutes = String(dateObj.getMinutes()).padStart(2, '0');
            matchDateStr = `${year}-${month}-${day} ${hours}:${minutes} {{abbr/CST}}`;
          }
          wikiScript += `    |date=${matchDateStr}\n`;

          const p1Bnet = m.player1_bnet_ids;
          const p2Bnet = m.player2_bnet_ids;

          let race1 = 'u';
          let race2 = 'u';
          if (matchReplays.length > 0) {
            const repP1 = getPlayerInfoFromReplay(m.player1_id, m.player1_name, m.player1_battle_tags, p1Bnet, matchReplays[0].parsed_data);
            const repP2 = getPlayerInfoFromReplay(m.player2_id, m.player2_name, m.player2_battle_tags, p2Bnet, matchReplays[0].parsed_data);
            if (repP1 && repP1.race) race1 = repP1.race[0].toLowerCase();
            if (repP2 && repP2.race) race2 = repP2.race[0].toLowerCase();
          }

          wikiScript += `    |opponent1={{1Opponent|${p1Name}|race=${race1}}}\n`;
          wikiScript += `    |opponent2={{1Opponent|${p2Name}|race=${race2}}}\n`;

          if (numGames > 0) {
            matchReplays.forEach((rep, gIdx) => {
              const mapName = (rep.map_name || 'Unknown').replace("-天梯版", "").replace("- 天梯版", "");
              
              const repP1 = getPlayerInfoFromReplay(m.player1_id, m.player1_name, m.player1_battle_tags, p1Bnet, rep.parsed_data);
              const repP2 = getPlayerInfoFromReplay(m.player2_id, m.player2_name, m.player2_battle_tags, p2Bnet, rep.parsed_data);

              const gRace1 = (repP1 && repP1.race ? repP1.race : 'u')[0].toLowerCase();
              const gRace2 = (repP2 && repP2.race ? repP2.race : 'u')[0].toLowerCase();
              
              let gWinner = '0';
              if (rep.winner) {
                const repWinnerLower = rep.winner.toLowerCase().trim();
                const p1MatchesWinner = repP1 && repP1.name && repP1.name.toLowerCase().trim() === repWinnerLower;
                const p2MatchesWinner = repP2 && repP2.name && repP2.name.toLowerCase().trim() === repWinnerLower;
                if (p1MatchesWinner) gWinner = '1';
                else if (p2MatchesWinner) gWinner = '2';
              }

              wikiScript += `    |map${gIdx + 1}={{Map|map=${mapName}|race1=${gRace1}|race2=${gRace2}|winner=${gWinner}}}\n`;
            });
          } else {
            wikiScript += `    |map1={{Map|map=TBD|race1=${race1}|race2=${race2}|winner=${winner || '0'}}}\n`;
          }
        }
        wikiScript += `}}\n`;
      });
    });
    wikiScript += `}}\n`;

    return { wikiScript };
  });
}
