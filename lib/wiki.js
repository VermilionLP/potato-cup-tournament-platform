/**
 * Generates Liquipedia wiki markup for the tournament results.
 */
function generateWiki(results) {
    if (!results || !results.matches || !results.players) {
        throw new Error('Invalid results data for wiki generation');
    }

    const tournamentNumberMatch = results.tournament_name.match(/\d+$/);
    const tournamentNumber = tournamentNumberMatch ? tournamentNumberMatch[0] : 'XXX';
    const formattedDate = results.tournament_date ? results.tournament_date.split('T')[0] : new Date().toISOString().split('T')[0];

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
    wikiScript += `|date=${formattedDate}\n`;
    wikiScript += `|liquipediatier=4 |tiertype=Showmatch\n`;
    wikiScript += `|bracket=https://challonge.com/succk${tournamentNumber}\n`;
    wikiScript += `}}\n\n`;

    wikiScript += `==Format==\n`;
    wikiScript += `* 单淘 Single-elimination bracket\n`;
    
    // Determine the most common bestof
    const matchCounts = results.matches.map(m => m.games.length).filter(c => c > 0);
    const maxGames = matchCounts.length > 0 ? Math.max(...matchCounts) : 1;
    let formatBo = "Bo1";
    if (maxGames > 1) {
        formatBo = `Bo${maxGames % 2 === 0 ? maxGames + 1 : maxGames}`;
    }
    
    wikiScript += `* 所有比赛均${formatBo} All matches are ${formatBo}\n`;
    wikiScript += `* 败者晋级 Loser of each match advance to the next round.\n\n`;

    wikiScript += `===Map Pool===\n`;
    wikiScript += `* 选手可以Ban图或者限定天梯地图，不然主办随机选了 Player can specify maps to ban, or demand ladder maps. Otherwise the organizer will randomly pick from all Blizzard or GSL maps.\n`;
    wikiScript += `{{Maps}}\n\n`;

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
    Object.values(results.players).forEach((player, index) => {
        const displayName = player.alias || player.challonge_name;
        const race = (player.races.picked_race || player.races.actual_race)[0].toLowerCase();
        const flag = player.flag || 'cn';
        const team = player.team ? `|p${index + 1}team=${player.team}` : '';
        const link = player.link ? `|p${index + 1}link=${player.link}` : '';
        wikiScript += `|p${index + 1}=${displayName}|p${index + 1}race=${race}|p${index + 1}flag=${flag}${team}${link}\n`;
    });
    wikiScript += `}}\n`;

    const playerCount = Object.keys(results.players).length;
    wikiScript += `{{SoloPrizePool\n`;
    wikiScript += `|{{Slot|place=1}}\n`;
    if (playerCount >= 2) wikiScript += `|{{Slot|place=2}}\n`;
    
    if (playerCount === 3) {
        wikiScript += `|{{Slot|place=3}}\n`;
    } else if (playerCount >= 4) {
        if (results.hold_third_place_match) {
            wikiScript += `|{{Slot|place=3}}\n`;
            wikiScript += `|{{Slot|place=4}}\n`;
        } else {
            wikiScript += `|{{Slot|place=3-4}}\n`;
        }
    }

    if (playerCount >= 8) {
        wikiScript += `|{{Slot|place=5-8}}\n`;
    } else if (playerCount > 4) {
        const placeStr = playerCount === 5 ? '5' : `5-${playerCount}`;
        wikiScript += `|{{Slot|place=${placeStr}}}\n`;
    }
    if (playerCount >= 16) {
        wikiScript += `|{{Slot|place=9-16}}\n`;
    } else if (playerCount > 8) {
        const placeStr = playerCount === 9 ? '9' : `9-${playerCount}`;
        wikiScript += `|{{Slot|place=${placeStr}}}\n`;
    }
    wikiScript += `}}\n\n`;

    wikiScript += `==Notable Participants==\n`;
    wikiScript += `{{ParticipantTable|count=true|onlyNotable=|tournament=#}}\n\n`;

    wikiScript += `==Results==\n`;
    
    const bracketTemplates = {
        2: "Bracket/2", 3: "Bracket/2L1D", 4: "Bracket/4", 5: "Bracket/2L1DH2L",
        6: "Bracket/4L2DS", 7: "Bracket/2L1DH4L", 8: "Bracket/8", 9: "Bracket/2L1DH2LH4L",
        10: "Bracket/4L2DH4LS", 11: "Bracket/2L1DH2LH4L2DSL", 12: "Bracket/8L4DSS",
        13: "Bracket/2L1DH4LH4L2DSL", 14: "Bracket/4L2DH8LS", 15: "Bracket/4L2DH8LS",
        16: "Bracket/16"
    };
    
    // Choose template based on match count (better for small showmatches)
    const matchCount = results.matches.length;
    const bracketTemplate = bracketTemplates[matchCount + 1] || bracketTemplates[playerCount] || "Bracket/16";
    const tournamentId = tournamentNumber.padStart(4, '0');
    
    wikiScript += `{{Bracket|${bracketTemplate}|id=AXsuck${tournamentId}\n`;

    const matchesByRound = {};
    results.matches.forEach(match => {
        matchesByRound[match.round] = matchesByRound[match.round] || [];
        matchesByRound[match.round].push(match);
    });

    // Sort rounds
    const rounds = Object.keys(matchesByRound).sort((a, b) => parseInt(a) - parseInt(b));

        rounds.forEach(round => {
        let matchNum = 1;
        matchesByRound[round].forEach(match => {
            const p1Data = results.players[match.player1.challonge_name] || {};
            const p2Data = results.players[match.player2.challonge_name] || {};
            
            const player1Name = p1Data.alias || match.player1.challonge_name;
            const player2Name = p2Data.alias || match.player2.challonge_name;
            const winner = match.winner_id === String(match.player1.challonge_id) ? 1 : 2;
            
            const numGames = match.games.length;
            const isWalkover = numGames === 0 && match.winner_id;

            wikiScript += `|R${round}M${matchNum}={{Match\n`;
            
            if (isWalkover) {
                wikiScript += `    |winner=${winner}\n`;
                const opp1Score = winner === 1 ? 'W' : 'FF';
                const opp2Score = winner === 2 ? 'W' : 'FF';
                wikiScript += `    |opponent1={{1Opponent|${player1Name}|score=${opp1Score}}}\n`;
                wikiScript += `    |opponent2={{1Opponent|${player2Name}|score=${opp2Score}}}\n`;
            } else {
                const bestOf = numGames > 0 ? (numGames % 2 === 0 ? numGames + 1 : numGames) : 1;
                wikiScript += `    |bestof=${bestOf}\n`;
                wikiScript += `    |winner=${winner}\n`;
                wikiScript += `    |date=${match.start_time.replace('T', ' ').split('.')[0]} {{abbr/UTC}} \n`;
                
                const race1 = (match.player1.races.picked_race || match.player1.races.actual_race || 'u')[0].toLowerCase();
                const race2 = (match.player2.races.picked_race || match.player2.races.actual_race || 'u')[0].toLowerCase();
                
                wikiScript += `    |opponent1={{1Opponent|${player1Name}|race=${race1}}}\n`;
                wikiScript += `    |opponent2={{1Opponent|${player2Name}|race=${race2}}}\n`;
                
                if (numGames > 0) {
                    match.games.forEach((game, gIdx) => {
                        const mapName = game.map.replace('-天梯版', '');
                        const gRace1 = (game.player1_race || 'u').toLowerCase();
                        const gRace2 = (game.player2_race || 'u').toLowerCase();
                        wikiScript += `    |map${gIdx + 1}={{Map|map=${mapName}|race1=${gRace1}|race2=${gRace2}|winner=${game.winner}}}\n`;
                    });
                } else {
                    const mapName = (match.map_name || match.map || 'Unknown').replace('-天梯版', '');
                    wikiScript += `    |map1={{Map|map=${mapName}|race1=${race1}|race2=${race2}|winner=${winner}}}\n`;
                }
            }
            wikiScript += `}}\n`;
            matchNum++;
        });
    });
    wikiScript += `}}\n\n`;

    wikiScript += `==Racial Distribution==\n`;
    wikiScript += `{{RaceDist|last=1}}\n\n`;

    wikiScript += `==View Games==\n`;
    wikiScript += `===VODs===\n`;
    wikiScript += `*[https://space.bilibili.com/10130071/lists/5654276?type=season VODs on Bilibili]\n`;

    return wikiScript;
}

module.exports = { generateWiki };
