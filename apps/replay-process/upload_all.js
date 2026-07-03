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
    console.log(`Importing: ${t.name} (${t.id})`);
    console.log(`==================================================`);

    const histDate = t.scheduled_time ? `${t.scheduled_time} 20:00:00` : new Date().toISOString().slice(0, 19).replace('T', ' ');

    const payload = {
        name: t.name,
        description: t.description,
        status: t.status || 'completed',
        player_capacity: t.player_capacity || 16,
        hold_third_place: t.hold_third_place || 0,
        scheduled_time: t.scheduled_time || '',
        created_at: histDate,
        updated_at: histDate,
        players: t.players,
        matches: t.matches.map(m => {
            let status = m.status || 'pending';
            let score1 = m.score1;
            let score2 = m.score2;
            
            // Check for walkover/弃权 (score 99)
            if (m.score1 === 99 || m.score2 === 99 || m.status === 'walkover') {
                status = 'walkover';
                score1 = 0;
                score2 = 0;
            }

            return {
                round: m.round,
                position: m.position,
                player1_id: m.player1_id,
                player2_id: m.player2_id,
                score1: score1,
                score2: score2,
                winner_id: m.winner_id,
                status: status
            };
        })
    };

    await apiFetch(`/tournaments/${t.id}/import`, 'POST', payload);
    console.log(`Successfully imported tournament ${t.id}!`);
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
