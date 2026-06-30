const fs = require('fs').promises;

// Set default endpoint to production. Can be overridden if needed.
// const BASE_URL = process.env.API_URL || 'https://axsuck.duckdns.org/api';
const BASE_URL = process.env.API_URL || 'http://localhost:3100/api';
const HEADERS = {
    'Content-Type': 'application/json',
    'x-player-id': 'wayne19980',
    'x-qq-group': '460309159'
};

async function apiFetch(path, method = 'GET', body = null) {
    const headers = { ...HEADERS };
    if (!body) {
        delete headers['Content-Type'];
    }
    const options = {
        method,
        headers
    };
    if (body) {
        options.body = JSON.stringify(body);
    }
    const res = await fetch(`${BASE_URL}${path}`, options);
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`API Error ${res.status} on ${method} ${path}: ${text}`);
    }
    return res;
}

async function uploadTournament(t, existingPlayers) {
    console.log(`\n==================================================`);
    console.log(`Uploading: ${t.name} (${t.id})`);
    console.log(`==================================================`);

    // 1. Create tournament
    console.log('1. Creating tournament...');
    try {
        await apiFetch('/tournaments', 'POST', {
            id: t.id,
            name: t.name,
            description: t.description,
            player_capacity: t.player_capacity,
            hold_third_place: t.hold_third_place
        });
    } catch (err) {
        if (err.message.includes('409') || err.message.includes('already exists') || err.message.includes('Conflict')) {
            console.log('Tournament already exists, continuing...');
        } else {
            throw err;
        }
    }

    // 2. Create players
    console.log('2. Creating/upserting players...');
    for (const p of t.players) {
        if (existingPlayers.has(p.id)) {
            console.log(`Player ${p.id} already exists, skipping creation to prevent overwrite.`);
            continue;
        }
        try {
            await apiFetch('/players', 'POST', {
                id: p.id,
                flag: p.flag || 'cn',
                team: p.team || '',
                link: p.link || ''
            });
            existingPlayers.add(p.id);
        } catch (err) {
            console.warn(`Failed to create player ${p.id}:`, err.message);
        }
    }

    // Set status to registration first so we can register players
    console.log('Setting status to registration...');
    await apiFetch(`/tournaments/${t.id}/status`, 'POST', { status: 'registration' });

    // 3. Register players
    console.log('3. Registering players...');
    for (const p of t.players) {
        try {
            await apiFetch(`/tournaments/${t.id}/register`, 'POST', { player_id: p.id });
        } catch (err) {
            console.warn(`Failed to register player ${p.id}:`, err.message);
        }
    }

    // 4. Set seeds
    console.log('4. Setting seeds...');
    const sortedPlayers = [...t.players].sort((a, b) => (a.seed || 99) - (b.seed || 99));
    const playerIds = sortedPlayers.map(p => p.id);
    await apiFetch(`/tournaments/${t.id}/seeds`, 'POST', { player_ids: playerIds });

    // 5. Generate bracket
    console.log('5. Generating bracket...');
    const bracketRes = await apiFetch(`/tournaments/${t.id}/bracket`, 'POST', {});
    let currentMatches = await bracketRes.json();
    console.log(`Generated ${currentMatches.length} matches in bracket.`);

    // If there is a 3rd place match (round === 0), manually create it in the database
    const thirdPlaceMatch = t.matches.find(m => m.round === 0);
    if (thirdPlaceMatch) {
        console.log('Detected 3rd place match (Round 0) in source. Manually creating it...');
        try {
            await apiFetch(`/tournaments/${t.id}/matches/manual`, 'POST', {
                round: 0,
                position: thirdPlaceMatch.position,
                player1_id: thirdPlaceMatch.player1_id,
                player2_id: thirdPlaceMatch.player2_id
            });
            console.log('3rd place match created successfully.');
        } catch (err) {
            console.warn('Failed to manually create 3rd place match:', err.message);
        }
    }

    // Set status to in_progress
    console.log('Setting status to in_progress...');
    await apiFetch(`/tournaments/${t.id}/status`, 'POST', { status: 'in_progress', scheduled_time: t.scheduled_time });

    // 6. Submit match results round-by-round
    console.log('6. Submitting match results...');
    const rounds = [...new Set(currentMatches.map(m => m.round))].sort((a, b) => b - a);

    for (const r of rounds) {
        console.log(`Processing Round ${r}...`);
        
        // Refresh bracket matches to get updated players in later rounds
        const refreshRes = await apiFetch(`/tournaments/${t.id}/bracket`);
        currentMatches = await refreshRes.json();

        const roundMatches = currentMatches.filter(m => m.round === r);
        
        for (const dbMatch of roundMatches) {
            if (dbMatch.status !== 'pending') {
                console.log(`Match ${dbMatch.id} (Round ${dbMatch.round}, Pos ${dbMatch.position}) already completed: ${dbMatch.status}`);
                continue;
            }

            if (!dbMatch.player1_id || !dbMatch.player2_id) {
                console.log(`Match ${dbMatch.id} has empty players: ${dbMatch.player1_id} vs ${dbMatch.player2_id}. Skipping.`);
                continue;
            }

            // Find corresponding Challonge match
            const challongeMatch = t.matches.find(cm => {
                return (cm.player1_id === dbMatch.player1_id && cm.player2_id === dbMatch.player2_id) ||
                       (cm.player1_id === dbMatch.player2_id && cm.player2_id === dbMatch.player1_id);
            });

            if (!challongeMatch) {
                console.warn(`Could not find Challonge match for ${dbMatch.player1_id} vs ${dbMatch.player2_id} in Round ${dbMatch.round}`);
                continue;
            }

            console.log(`Submitting result for match ${dbMatch.id}: ${dbMatch.player1_id} vs ${dbMatch.player2_id}`);
            
            let score1 = challongeMatch.score1;
            let score2 = challongeMatch.score2;
            if (challongeMatch.player1_id === dbMatch.player2_id) {
                score1 = challongeMatch.score2;
                score2 = challongeMatch.score1;
            }

            if (challongeMatch.status === 'walkover') {
                await apiFetch(`/tournaments/${t.id}/matches/${dbMatch.id}/walkover`, 'POST', { winner_id: challongeMatch.winner_id });
                console.log(`  Walkover result submitted. Winner: ${challongeMatch.winner_id}`);
            } else {
                await apiFetch(`/tournaments/${t.id}/matches/${dbMatch.id}/result`, 'POST', { score1, score2 });
                console.log(`  Result submitted: ${score1}-${score2}`);
            }
        }
    }

    // Set status to completed
    console.log('Setting status to completed...');
    await apiFetch(`/tournaments/${t.id}/status`, 'POST', { status: 'completed', scheduled_time: t.scheduled_time });
    console.log(`Finished uploading tournament ${t.id}!`);
}

async function main() {
    try {
        console.log(`Starting migration to: ${BASE_URL}`);
        
        // Fetch existing players to avoid overwriting them
        let existingPlayers = new Set();
        try {
            const playersRes = await apiFetch('/players');
            const playersData = await playersRes.json();
            existingPlayers = new Set(playersData.map(p => p.id));
            console.log(`Loaded ${existingPlayers.size} existing players from server.`);
        } catch (e) {
            console.warn('Failed to load existing players list, will try to create all:', e.message);
        }

        const data = JSON.parse(await fs.readFile('pulled_tournaments.json', 'utf8'));
        console.log(`Loaded ${data.length} tournaments from pulled_tournaments.json`);

        // Upload one by one
        for (let i = 0; i < data.length; i++) {
            const t = data[i];
            try {
                await uploadTournament(t, existingPlayers);
            } catch (err) {
                console.error(`Failed to upload tournament ${t.id}:`, err.message);
                console.log('Skipping to next tournament...');
            }
        }
        console.log('\nAll migrations completed!');
    } catch (e) {
        console.error('Migration failed:', e);
    }
}

main();
