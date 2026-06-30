const fs = require('fs').promises;
const TournamentAnalyzer = require('./lib/analyzer');
const { API_KEY, BNET_CONFIG, SUB_DOMAIN } = require('./config');

function cleanPlayerName(name) {
    if (!name) return 'Unknown';
    return name.replace(/\s*\(invitation pending\)/g, '').trim();
}

function shouldInclude(name) {
    const n = name.toLowerCase();
    // Exclude ST: e.g. "st#4", "st5", "st#3", "st6", "st" as a word
    if (/\bst\b/i.test(name) || /st#/i.test(name) || /st\d+/i.test(name)) {
        return false;
    }
    // Exclude "The SUCK Legends"
    if (n.includes("suck legends")) {
        return false;
    }
    // Exclude "League for Amateurs only" or similar (e.g. "League Made For Amateurs Only")
    if (n.includes("amateur")) {
        return false;
    }
    return true;
}

async function main() {
    const analyzer = new TournamentAnalyzer(API_KEY, BNET_CONFIG, SUB_DOMAIN);
    try {
        console.log('Fetching all tournaments from Challonge...');
        const rawTournaments = await analyzer.getTournamentList();
        console.log(`Total tournaments found on Challonge: ${rawTournaments.length}`);

        const filtered = rawTournaments.filter(t => shouldInclude(t.name));
        console.log(`Tournaments after filtering out ST, SUCK Legends, Amateurs: ${filtered.length}`);

        const processedTournaments = [];

        for (let i = 0; i < filtered.length; i++) {
            const tInfo = filtered[i];
            console.log(`[${i + 1}/${filtered.length}] Fetching details for: ${tInfo.name} (${tInfo.id})`);
            
            // Fetch detailed tournament info (including participants and matches)
            const detail = await analyzer.getTournamentInfo(tInfo.id, true);

            // 1. Map participants/players
            const participantsMap = {}; // challonge_id -> player_name (cleaned)
            const players = []; // list of unique players in this tournament
            
            (detail.participants || []).forEach(p => {
                const part = p.participant;
                const cleanedName = cleanPlayerName(part.display_name || part.name || part.username);
                participantsMap[part.id] = cleanedName;
                
                players.push({
                    id: cleanedName,
                    flag: 'cn', // default flag
                    team: '',   // default team
                    link: '',   // default link
                    seed: part.seed
                });
            });

            // 2. Map matches
            const matches = [];
            const rawMatches = (detail.matches || []).map(m => m.match);
            
            // Find max round to compute SUCK reverse rounds
            let maxRound = 0;
            rawMatches.forEach(m => {
                if (m.round > maxRound) {
                    maxRound = m.round;
                }
            });

            // Group matches by round to sort and assign position
            const matchesByRound = {};
            rawMatches.forEach(m => {
                if (!matchesByRound[m.round]) {
                    matchesByRound[m.round] = [];
                }
                matchesByRound[m.round].push(m);
            });

            // Sort matches in each round by suggested_play_order or ID to determine position
            Object.keys(matchesByRound).forEach(r => {
                matchesByRound[r].sort((a, b) => (a.suggested_play_order || a.id) - (b.suggested_play_order || b.id));
            });

            // Process into target match format
            rawMatches.forEach(m => {
                const challongeRound = m.round;
                const roundMatches = matchesByRound[challongeRound] || [];
                const idx = roundMatches.findIndex(x => x.id === m.id);
                const position = idx !== -1 ? idx + 1 : 1;

                // SUCK Round is reversed. Challonge round 0 is the 3rd place match, keep it as 0.
                const suckRound = challongeRound === 0 ? 0 : maxRound - challongeRound + 1;

                const p1_id = participantsMap[m.player1_id] || null;
                const p2_id = participantsMap[m.player2_id] || null;
                const winner_id = participantsMap[m.winner_id] || null;

                let score1 = 0;
                let score2 = 0;
                if (m.scores_csv) {
                    const parts = m.scores_csv.split(/[-,;]/);
                    if (parts.length >= 2) {
                        score1 = parseInt(parts[0]) || 0;
                        score2 = parseInt(parts[1]) || 0;
                    }
                }

                let status = 'pending';
                if (m.state === 'complete') {
                    status = m.forfeited ? 'walkover' : 'completed';
                }

                matches.push({
                    round: suckRound,
                    position: position,
                    player1_id: p1_id,
                    player2_id: p2_id,
                    score1: score1,
                    score2: score2,
                    winner_id: winner_id,
                    status: status
                });
            });

            // Format scheduled_time from started_at/start_at or default to created_at
            let scheduled_time = '';
            if (detail.start_at) {
                scheduled_time = new Date(detail.start_at).toISOString().split('T')[0];
            } else if (detail.started_at) {
                scheduled_time = new Date(detail.started_at).toISOString().split('T')[0];
            }

            // Map status
            let status = 'completed';
            if (detail.state === 'underway') status = 'in_progress';
            else if (detail.state === 'pending') status = 'registration';

            processedTournaments.push({
                id: detail.url, // e.g. succk42
                name: detail.name,
                description: detail.description || '',
                status: status,
                player_capacity: detail.signup_cap || 16,
                hold_third_place: detail.hold_third_place_match ? 1 : 0,
                scheduled_time: scheduled_time,
                players: players,
                matches: matches
            });
        }

        // Save to file
        const outputFile = 'pulled_tournaments.json';
        await fs.writeFile(outputFile, JSON.stringify(processedTournaments, null, 2));
        console.log(`\nSuccessfully saved ${processedTournaments.length} tournaments to ${outputFile}`);

    } catch (e) {
        console.error('Error during execution:', e);
    }
}

main();
