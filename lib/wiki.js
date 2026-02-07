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
    wikiScript += `* 所有比赛均Bo1 All matches are Bo1\n`;
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
        const cleanedName = player.challonge_name.replace(/\s*\(invitation pending\)/g, '');
        const race = player.races.picked_race ? player.races.picked_race[0].toLowerCase() : 'r';
        wikiScript += `|p${index + 1}=${cleanedName}|p${index + 1}race=${race}|p${index + 1}flag=cn\n`;
    });
    wikiScript += `}}\n`;
    wikiScript += `{{SoloPrizePool\n`;
    wikiScript += `|{{Slot|place=1}}\n`;
    wikiScript += `|{{Slot|place=2}}\n`;
    wikiScript += `|{{Slot|place=3-4}}\n`;
    wikiScript += `|{{Slot|place=5-8}}\n`;
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

    const playerCount = Object.keys(results.players).length;
    const bracketTemplate = bracketTemplates[playerCount] || "Bracket/16";
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
            const player1Name = match.player1.challonge_name.replace(/\s*\(invitation pending\)/g, '');
            const player2Name = match.player2.challonge_name.replace(/\s*\(invitation pending\)/g, '');
            const winner = match.winner_id === String(match.player1.challonge_id) ? 1 : 2;
            
            wikiScript += `|R${round}M${matchNum}={{Match\n`;
            wikiScript += `    |bestof=1\n`;
            wikiScript += `    |winner=${winner}\n`;
            wikiScript += `    |date=${match.start_time.replace('T', ' ').split('.')[0]} {{abbr/UTC}} \n`;
            wikiScript += `    |opponent1={{1Opponent|${player1Name}|race=${match.player1.races.picked_race[0].toLowerCase()}}}\n`;
            wikiScript += `    |opponent2={{1Opponent|${player2Name}|race=${match.player2.races.picked_race[0].toLowerCase()}}}\n`;
            
            const mapName = match.map_name.replace('-天梯版', '');
            const race1 = match.player1.races.actual_race[0].toLowerCase();
            const race2 = match.player2.races.actual_race[0].toLowerCase();
            // In Liquipedia maps, winner=1 means opponent1 won, winner=2 means opponent2 won.
            // Wait, the original code had: winner=${match.winner_id === String(match.player1.challonge_id) ? 2 : 1}
            // That seems inverted if winner=1 is player1. Let's check Liquipedia docs or keep as is if it was working.
            // Actually, if player1 wins, winner should be 1.
            const mapWinner = match.winner_id === String(match.player1.challonge_id) ? 1 : 2;
            
            wikiScript += `    |map1={{Map|map=${mapName}|race1=${race1}|race2=${race2}|winner=${mapWinner}}}\n`;
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
