const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const { API_KEY, SUB_DOMAIN, BNET_CONFIG, OUTPUT_FILE, PYTHON_SCRIPT, TEMP_REPLAY_DIR, REPLAY_FILE } = require('./config');

const app = express();
const port = 3000;

class TournamentAnalyzer {
    constructor(apiKey, battlenetConfigPath, subdomain) {
        this.apiKey = apiKey;
        this.baseUrl = "https://api.challonge.com/v1";
        this.subdomain = subdomain;
        this.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
            "Accept": "application/json",
            "Connection": "keep-alive"
        };
    }

    async _loadBattlenetConfig(configPath) {
        try {
            const data = await fs.readFile(configPath, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            throw new Error(`Failed to load Battle.net config: ${error.message}`);
        }
    }

    _getParams() {
        const params = new URLSearchParams({
            "api_key": this.apiKey,
            "state": "all"
        });
        if (this.subdomain) {
            params.append("subdomain", this.subdomain);
        }
        return params;
    }

    async getTournamentList() {
        const url = `${this.baseUrl}/tournaments.json`;
        const params = this._getParams();
        const response = await fetch(`${url}?${params.toString()}`, { headers: this.headers });
        if (!response.ok) {
            throw new Error(`Failed to fetch tournament list: ${response.status} - ${await response.text()}`);
        }
        const data = await response.json();
        return data.map(item => item.tournament);
    }

    async getTournamentInfo(tournamentId, includeExtras = false) {
        const url = `${this.baseUrl}/tournaments/${tournamentId}.json`;
        const params = this._getParams();
        if (includeExtras) {
            params.append("include_participants", "1");
            params.append("include_matches", "1");
        }
        const response = await fetch(`${url}?${params.toString()}`, { headers: this.headers });
        if (!response.ok) {
            throw new Error(`Failed to fetch tournament: ${response.status} - ${await response.text()}`);
        }
        const data = await response.json();
        return data.tournament;
    }

    async getMatches(tournamentId) {
        const url = `${this.baseUrl}/tournaments/${tournamentId}/matches.json`;
        const params = this._getParams();
        const response = await fetch(`${url}?${params.toString()}`, { headers: this.headers });
        if (!response.ok) {
            throw new Error(`Failed to fetch matches: ${response.status} - ${await response.text()}`);
        }
        const data = await response.json();
        return data.map(item => item.match);
    }

    async getParticipants(tournamentId) {
        const url = `${this.baseUrl}/tournaments/${tournamentId}/participants.json`;
        const params = this._getParams();
        const response = await fetch(`${url}?${params.toString()}`, { headers: this.headers });
        if (!response.ok) {
            throw new Error(`Failed to fetch participants: ${response.status} - ${await response.text()}`);
        }
        const data = await response.json();
        const participants = {};
        data.forEach(participant => {
            const p = participant.participant;
            participants[String(p.id)] = p.name;
        });
        return participants;
    }

    async processReplayData(replayFile) {
        try {
            const replayDataList = JSON.parse(await fs.readFile(replayFile, 'utf-8'));
            const playerRaces = {};
            for (const replay of replayDataList) {
                for (const player of replay.players) {
                    playerRaces[player.name] = player.actual_race;
                }
            }
            const matchStart = replayDataList.length > 0 ? replayDataList[0].start_time : new Date().toISOString();
            return { player_races: playerRaces, match_start: matchStart };
        } catch (error) {
            throw new Error(`Failed to process replay data: ${error.message}`);
        }
    }

    async analyzeTournament(tournamentId, replayFile, matchReplayMap) {
        const [tournamentInfo, replayData, battlenetIds] = await Promise.all([
            this.getTournamentInfo(tournamentId, true),
            this.processReplayData(replayFile),
            this._loadBattlenetConfig(BNET_CONFIG)
        ]);

        const participants = Object.fromEntries(
            (tournamentInfo.participants || []).map(p => [String(p.participant.id), p.participant.name])
        );
        const matches = (tournamentInfo.matches || []).map(m => m.match);

        this.results = {
            tournament_name: tournamentInfo.name,
            tournament_id: tournamentId,
            matches: [],
            players: {}
        };

        for (const match of matches) {
            const player1Id = match.player1_id ? String(match.player1_id) : null;
            const player2Id = match.player2_id ? String(match.player2_id) : null;

            if (!player1Id || !player2Id) continue;

            const player1Name = participants[player1Id] || "Unknown";
            const player2Name = participants[player2Id] || "Unknown";

            const player1Bnet = matchReplayMap[player1Name]
                ? battlenetIds.find(p => p.challonge_names.includes(matchReplayMap[player1Name])) || null
                : battlenetIds.find(p => p.challonge_names.includes(player1Name)) || null;
            const player2Bnet = matchReplayMap[player2Name]
                ? battlenetIds.find(p => p.challonge_names.includes(matchReplayMap[player2Name])) || null
                : battlenetIds.find(p => p.challonge_names.includes(player2Name)) || null;

            const scoresCsv = match.scores_csv || "0-0";
            const [score1, score2] = scoresCsv.split('-').map(s => parseInt(s.trim()) || 0);

            let totalScore1, totalScore2;
            if (tournamentInfo.tournament_type === "round robin") {
                if (score1 > score2) [totalScore1, totalScore2] = [3, 0];
                else if (score1 < score2) [totalScore1, totalScore2] = [0, 3];
                else [totalScore1, totalScore2] = [1, 1];
            } else {
                [totalScore1, totalScore2] = [score1, score2];
            }

            for (const [playerName, bnet, score, totalScore] of [
                [player1Name, player1Bnet, score1, totalScore1],
                [player2Name, player2Bnet, score2, totalScore2]
            ]) {
                if (!this.results.players[playerName]) {
                    this.results.players[playerName] = {
                        battlenet_id: bnet && bnet.battle_net_name ? bnet.battle_net_name : "Unknown",
                        battlenet_url: bnet ? bnet.battle_net_url : "Unknown",
                        race: replayData.player_races[playerName] || "Unknown",
                        total_score: 0,
                        matches_played: 0
                    };
                }
                this.results.players[playerName].total_score += totalScore;
                this.results.players[playerName].matches_played += 1;
            }

            this.results.matches.push({
                match_id: match.id,
                player1: {
                    name: player1Name,
                    battlenet_id: player1Bnet && player1Bnet.battle_net_name ? player1Bnet.battle_net_name : "Unknown",
                    score: score1,
                    total_score: totalScore1,
                    race: replayData.player_races[player1Name] || "Unknown"
                },
                player2: {
                    name: player2Name,
                    battlenet_id: player2Bnet && player2Bnet.battle_net_name ? player2Bnet.battle_net_name : "Unknown",
                    score: score2,
                    total_score: totalScore2,
                    race: replayData.player_races[player2Name] || "Unknown"
                },
                start_time: match.started_at || replayData.match_start,
                state: match.state,
                winner_id: match.winner_id ? String(match.winner_id) : null,
                round: match.round,
                identifier: match.identifier
            });
        }

        return this.results;
    }

    async saveResults(outputPath) {
        await fs.writeFile(outputPath, JSON.stringify(this.results, null, 2), 'utf-8');
    }
}

// Initialize Express
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Create temp replay directory if it doesn't exist
if (!TEMP_REPLAY_DIR) {
    throw new Error('TEMP_REPLAY_DIR is not defined in config.js');
}
fs.mkdir(TEMP_REPLAY_DIR, { recursive: true }).catch(error => {
    console.error(`Failed to create temporary replay directory: ${error.message}`);
});

const analyzer = new TournamentAnalyzer(API_KEY, BNET_CONFIG, SUB_DOMAIN);

// API Endpoints
app.get('/api/tournaments', async (req, res) => {
    try {
        const tournaments = await analyzer.getTournamentList();
        res.json(tournaments);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/tournament/:id', async (req, res) => {
    try {
        const tournamentInfo = await analyzer.getTournamentInfo(req.params.id, true);
        res.json(tournamentInfo);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/replay-files', async (req, res) => {
    try {
        const dir = path.dirname(REPLAY_FILE);
        if (!dir) {
            throw new Error('Invalid REPLAY_FILE path in config.js');
        }
        const files = await fs.readdir(dir).catch(error => {
            console.error(`Failed to read directory ${dir}: ${error.message}`);
            return [];
        });
        const replayFiles = files.filter(f => f.startsWith('replay_dat_') && f.endsWith('.json'));
        res.json(replayFiles);
    } catch (error) {
        console.error(`Error in /api/replay-files: ${error.message}`);
        res.status(500).json({ error: `Failed to fetch replay files: ${error.message}` });
    }
});

app.post('/api/run-replayreader', async (req, res) => {
    try {
        const { files, folder } = req.body;
        if (!files && !folder) {
            return res.status(400).json({ error: 'Either files or folder path is required' });
        }

        // Clear temp directory
        const tempFiles = await fs.readdir(TEMP_REPLAY_DIR);
        await Promise.all(tempFiles.map(f => fs.unlink(path.join(TEMP_REPLAY_DIR, f))));

        let replayFolder = TEMP_REPLAY_DIR;

        if (files && Array.isArray(files)) {
            // Handle uploaded files (Chromium browsers)
            for (const file of files) {
                const buffer = Buffer.from(file.content, 'base64');
                await fs.writeFile(path.join(TEMP_REPLAY_DIR, file.name), buffer);
            }
        } else if (folder) {
            // Use provided folder path directly (Firefox fallback)
            replayFolder = folder;
        }

        // Run replayreader.py
        const execPromise = util.promisify(exec);
        await execPromise(`python ${PYTHON_SCRIPT} "${replayFolder}"`);
        res.json({ message: 'Replay processing completed' });
    } catch (error) {
        console.error(`Error in /api/run-replayreader: ${error.message}`);
        res.status(500).json({ error: `Failed to run replayreader.py: ${error.message}` });
    }
});

app.post('/api/analyze', async (req, res) => {
    const { tournamentId, replayFile, matchReplayMap } = req.body;
    if (!tournamentId || !replayFile) {
        return res.status(400).json({ error: 'tournamentId and replayFile are required' });
    }
    try {
        const results = await analyzer.analyzeTournament(tournamentId, path.join(path.dirname(REPLAY_FILE), replayFile), matchReplayMap || {});
        await analyzer.saveResults(OUTPUT_FILE);
        res.json(results);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Serve the web interface
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});