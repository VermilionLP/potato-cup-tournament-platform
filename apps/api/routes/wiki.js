// Liquipedia wiki export for a tournament.
// Extracted from the removed replay module: it only needs tournament, player
// and match data, never replay files.

import { getPlayerDisplayName } from '../repositories/player-repo.js';
import { liquipediaBracketTemplate } from '../lib/bracket.js';

function toDateOnly(value) {
  if (!value) return new Date().toISOString().split('T')[0];
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(value).split(' ')[0];
}

export default async function wikiRoutes(fastify) {
  const db = fastify.db;

  fastify.get('/tournaments/:id/wiki', async (req) => {
    const { id: tournamentId } = req.params;
    const tourneyRes = await db.query('SELECT * FROM axsuck.tournaments WHERE id = $1', [tournamentId]);
    const tournament = tourneyRes.rows[0];
    if (!tournament) {
      throw fastify.httpErrors.notFound('Tournament not found.');
    }
    if (tournament.format && tournament.format !== 'single_elim') {
      throw fastify.httpErrors.badRequest(
        'Liquipedia 导出目前只支持单败淘汰赛；双败/瑞士轮的模板将在后续版本提供。',
      );
    }

    const playersRes = await db.query(`
      SELECT 
        p.id, 
        p.bnet_ids,
        p.battle_tags,
        COALESCE(NULLIF(p.flag, ''), NULLIF(tp.flag, ''), 'cn') AS flag, 
        COALESCE(NULLIF(tp.team, ''), p.team, '') AS team, 
        COALESCE(NULLIF(tp.link, ''), p.link, '') AS link, 
        tp.seed, 
        tp.registered_at
      FROM axsuck.tournament_players tp
      JOIN axsuck.players p ON tp.player_id = p.id
      WHERE tp.tournament_id = $1
      ORDER BY tp.seed IS NULL, tp.seed ASC, tp.registered_at ASC
    `, [tournamentId]);
    const players = playersRes.rows.map(p => ({
      ...p,
      display_name: getPlayerDisplayName(p)
    }));

    const matchesRes = await db.query(`
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
      FROM axsuck.matches m
      LEFT JOIN axsuck.players p1 ON m.player1_id = p1.id
      LEFT JOIN axsuck.tournament_players tp1 ON tp1.tournament_id = m.tournament_id AND tp1.player_id = m.player1_id
      LEFT JOIN axsuck.players p2 ON m.player2_id = p2.id
      LEFT JOIN axsuck.tournament_players tp2 ON tp2.tournament_id = m.tournament_id AND tp2.player_id = m.player2_id
      LEFT JOIN axsuck.players w ON m.winner_id = w.id
      WHERE m.tournament_id = $1
      ORDER BY m.round ASC, m.position ASC
    `, [tournamentId]);
    const matches = matchesRes.rows.map(m => {
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

    const formattedDate = toDateOnly(tournament.created_at);
    const tournamentDate = formattedDate;

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

    const playerCount = players.length;
    let wikiScript = `{{DISPLAYTITLE:Potato Cup Weekly #{{SUBPAGENAME}} (土豆杯周赛#{{SUBPAGENAME}})}}\n`;
    wikiScript += `{{Template:Potato Cup Navbox}}\n`;
    wikiScript += `{{tabs static\n`;
    wikiScript += `|link1=Potato_Cup_Weekly/{{SUBPAGENAME}}|name1=Weekly #{{SUBPAGENAME}}\n`;
    wikiScript += `|link2=Potato_Cup_Weekly/{{SUBPAGENAME}}/Beginners|name2=Weekly #{{SUBPAGENAME}} Beginners\n`;
    wikiScript += `}}\n`;
    wikiScript += `{{Infobox league\n`;
    wikiScript += `|name=Potato Cup Weekly #{{SUBPAGENAME}}\n`;
    wikiScript += `|image=Potato_Cup_2026_lightmode.png\n`;
    wikiScript += `|icon=Potato_Cup_2026_icon_lightmode.png\n`;
    wikiScript += `|imagedark=Potato_Cup_2026_darkmode.png\n`;
    wikiScript += `|icondark=Potato_Cup_icon_darkmode.png\n`;
    wikiScript += `|series=Potato Cup\n`;
    wikiScript += `|abbreviation=\n`;
    wikiScript += `|tickername=Potato Cup Weekly #{{SUBPAGENAME}}\n`;
    wikiScript += `|number={{SUBPAGENAME}}\n`;
    wikiScript += `|organizer=Vermilion\n`;
    wikiScript += `|sponsor=Vermilion\n`;
    wikiScript += `|server=Europe\n`;
    wikiScript += `|type=Online\n`;
    wikiScript += `|country=World\n`;
    wikiScript += `|format=1v1<br>Playoffs\n`;
    wikiScript += `|mode=RB\n`;
    wikiScript += `|vehicle=Aviation\n`;
    wikiScript += `|prizepool=200\n`;
    wikiScript += `|localcurrency=cny\n`;
    wikiScript += `|date=${tournamentDate}\n`;
    wikiScript += `|player_number=${players.length}\n`;
    wikiScript += `|liquipediatier=4 |liquipediatiertype=Weekly\n`;
    wikiScript += `|web=\n`;
    wikiScript += `|bracket=${bracketUrl}\n`;
    wikiScript += `}}\n\n`;
    wikiScript += `==Format==\n`;
    wikiScript += `* Before Finals are {{abbr/Bo3}}.\n`;
    wikiScript += `* 所有比赛均Bo1 All matches are Bo1\n`;
    wikiScript += `* 败者晋级 Loser of each match advance to the next round.\n\n`;

    wikiScript += `===Map Pool===\n`;
    wikiScript += `* 选手可以Ban图或者限定天梯地图，不然主办随机选了 Player can specify maps to ban, or demand ladder maps. Otherwise the organizer will randomly pick from all Blizzard or GSL maps.\n`;
    wikiScript += `{{MapPoolTable|size=x132px}}\n\n`;

    wikiScript += `==Talents==\n`;
    wikiScript += `{{BroadcasterCard\n`;
    wikiScript += `|position=Host\n`;
    wikiScript += `|b1=Vermilion\n`;
    wikiScript += `}}\n`;
    wikiScript += `{{BroadcasterCard\n`;
    wikiScript += `|position=Caster\n`;
    wikiScript += `|b1=KATO Megumi|b1flag=CN\n`;
    wikiScript += `|b2=Avı Physıcα|b2flag=CN\n`;
    wikiScript += `|b3=TheWindupBird|b3flag=CN\n`;
    wikiScript += `}}\n\n`;
    wikiScript += `==Prize Pool==\n`;
    wikiScript += `{{SoloPrizePool|localcurrency=cny\n`;
    wikiScript += `|points1=PotatoCup Leaderboard 2026|points1link=Potato_Cup/Leaderboard/2026\n`;
    wikiScript += `|{{Slot|place=1|localprize=136|points=100}}\n`;
    wikiScript += `|{{Slot|place=2|localprize=49|points=60}}\n`;
    wikiScript += `|{{Slot|place=3-4|localprize=8|points=35}}\n`;
    wikiScript += `|{{Slot|place=5-8|localprize=0|points=10}}\n`;
    wikiScript += `}}\n\n`;
    wikiScript += `==Notable Participants==\n`;
    wikiScript += `{{ParticipantTable|count=true|onlyNotable=|tournament=#}}\n\n`;

    wikiScript += `==Results==\n`;

    const matchCount = matches.length;
    const bracketTemplate =
      liquipediaBracketTemplate(playerCount) ||
      liquipediaBracketTemplate(matchCount + 1) ||
      "Bracket/16";
    const tournamentIdStr = tournamentNumber.padStart(4, "0");

    wikiScript += `{{Bracket|${bracketTemplate}|id=pcweek${tournamentIdStr}\n`;

    // Group matches by round for bracket structure rendering
    const maxDbRound = Math.max(...matches.map(m => m.round), 1);
    const rounds = {};
    matches.forEach(m => {
      // Skip bye rounds (where one opponent is null/TBD and the match was skipped/walkover/never played)
      const isBye = (!m.player1_id && m.player2_id) || (m.player1_id && !m.player2_id);
      if (isBye) return;

      const lpRound = maxDbRound - m.round + 1;
      rounds[lpRound] = rounds[lpRound] || [];
      rounds[lpRound].push(m);
    });

    const roundKeys = Object.keys(rounds).sort((a, b) => parseInt(a) - parseInt(b));
    roundKeys.forEach(rKey => {
      const roundMatches = rounds[rKey];
      roundMatches.forEach((m, idx) => {
        const winner = m.winner_id === m.player1_id ? 1 : (m.winner_id === m.player2_id ? 2 : 0);
        const isWalkover = m.status === 'walkover';

        const p1Name = m.player1_name || 'TBD';
        const p2Name = m.player2_name || 'TBD';

        const matchIdx = idx + 1;
        wikiScript += `|R${rKey}M${matchIdx}={{Match\n`;

        if (isWalkover) {
          wikiScript += `    |winner=${winner}\n`;
          const opp1Score = winner === 1 ? "W" : "FF";
          const opp2Score = winner === 2 ? "W" : "FF";
          wikiScript += `    |opponent1={{1Opponent|${p1Name}|score=${opp1Score}}}\n`;
          wikiScript += `    |opponent2={{1Opponent|${p2Name}|score=${opp2Score}}}\n`;
        } else {
          wikiScript += `    |bestof=1\n`;
          wikiScript += `    |winner=${winner}\n`;
          wikiScript += `    |date=${formattedDate} 20:00:00 {{abbr/CST}} \n`;
          wikiScript += `    |opponent1={{1Opponent|${p1Name}}}\n`;
          wikiScript += `    |opponent2={{1Opponent|${p2Name}}}\n`;
          wikiScript += `    |map1={{Map|map=TBD|winner=${winner}}}\n`;
        }
        wikiScript += `}}\n`;
      });
    });
    wikiScript += `}}\n\n`;

    wikiScript += `==Racial Distribution==\n`;
    wikiScript += `{{RaceDist|last=1}}\n\n`;

    wikiScript += `==View Games==\n`;
    wikiScript += `===VODs===\n`;
    wikiScript += `*[https://space.bilibili.com/10130071/lists/5654276?type=season VODs on Bilibili]\n`;

    return { wikiScript };
  });
}
