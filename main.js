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
            console.error(`Error loading Battle.net config: ${error.message}`);
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

    async loadReplayData(replayFile) {
        try {
            const data = JSON.parse(await fs.readFile(replayFile, 'utf-8'));
            if (!Array.isArray(data)) {
                throw new Error('Replay data is not an array');
            }
            return { matches: data };
        } catch (error) {
            console.error(`Error loading replay data: ${error.message}`);
            throw new Error(`Failed to load replay data: ${error.message}`);
        }
    }

    async processReplayData(replayFile, matchObjectMap) {
        try {
            const replayDataList = JSON.parse(await fs.readFile(replayFile, 'utf-8'));
            if (!Array.isArray(replayDataList)) {
                throw new Error('Replay data is not an array');
            }
            const playerRaces = {};
            const matchData = {};
            replayDataList.forEach((replay, index) => {
                if (!replay.players || !Array.isArray(replay.players)) {
                    console.warn(`Replay data missing players at index ${index}: ${JSON.stringify(replay)}`);
                    return;
                }
                replay.players.forEach(player => {
                    if (player.name) {
                        playerRaces[player.name] = {
                            picked_race: player.picked_race || 'Unknown',
                            actual_race: player.actual_race || 'Unknown'
                        };
                    }
                });
                matchData[index] = {
                    winner: replay.winner,
                    start_time: replay.start_time,
                    map_name: replay.map_name,
                    players: replay.players
                };
            });
            return { player_races: playerRaces, match_data: matchData };
        } catch (error) {
            console.error(`Error processing replay data: ${error.message}`);
            throw new Error(`Failed to process replay data: ${error.message}`);
        }
    }

    async analyzeTournament(tournamentId, replayFile, matchObjectMap, bnetIdMap) {
        const [tournamentInfo, replayData, battlenetIds] = await Promise.all([
            this.getTournamentInfo(tournamentId, true),
            this.processReplayData(replayFile, matchObjectMap),
            this._loadBattlenetConfig(BNET_CONFIG)
        ]);

        if (Object.keys(matchObjectMap).length === 0) {
            console.warn('matchObjectMap is empty, using default mapping');
        }
        if (Object.keys(bnetIdMap).length === 0) {
            console.warn('bnetIdMap is empty, using default Battle.net IDs');
        }

        const participants = Object.fromEntries(
            (tournamentInfo.participants || []).map(p => [String(p.participant.id), p.participant.display_name])
        );
        const matches = (tournamentInfo.matches || []).map(m => m.match);
        console.log("participants:", participants);

        this.results = {
            tournament_name: tournamentInfo.name,
            tournament_id: tournamentId,
            tournament_date: tournamentInfo.started_at || tournamentInfo.matches[0]?.started_at,
            tournament_type: tournamentInfo.tournament_type,
            hold_third_place_match: tournamentInfo.hold_third_place_match,
            matches: [],
            players: {}
        };

        for (const match of matches) {
            const player1Id = match.player1_id ? String(match.player1_id) : null;
            const player2Id = match.player2_id ? String(match.player2_id) : null;

            if (!player1Id || !player2Id) continue;

            const player1Name = participants[player1Id] || "Unknown";
            const player2Name = participants[player2Id] || "Unknown";

            const matchIndex = matchObjectMap[String(match.id)];
            const replayMatch = replayData.match_data[matchIndex] || {};

            // Match Challonge names to replay names
            const player1Replay = replayMatch.players.find(p =>
                p.name === player1Name ||
                (bnetIdMap[player1Name] && bnetIdMap[player1Name] === p.name)
            ) || replayMatch.players[0] || {};
            const player2Replay = replayMatch.players.find(p =>
                p.name === player2Name ||
                (bnetIdMap[player2Name] && bnetIdMap[player2Name] === p.name)
            ) || replayMatch.players[1] || {};

            const player1Bnet = bnetIdMap[player1Name];
            const player2Bnet = bnetIdMap[player2Name];

            const scoresCsv = match.scores_csv || "0-0";
            const [score1, score2] = scoresCsv.split('-').map(s => parseInt(s.trim()) || 0);

            let totalScore1, totalScore2;
            if (tournamentInfo.tournament_type === "round robin") {
                if (score1 > score2) [totalScore1, totalScore2] = [3, 0];
                else if (score1 < score2) [totalScore1, totalScore2] = [0, 3];
                else[totalScore1, totalScore2] = [1, 1];
            } else {
                [totalScore1, totalScore2] = [score1, score2];
            }

            for (const [playerName, replayPlayer, bnet, score, totalScore] of [
                [player1Name, player1Replay, player1Bnet, score1, totalScore1],
                [player2Name, player2Replay, player2Bnet, score2, totalScore2]
            ]) {
                if (!this.results.players[playerName]) {
                    this.results.players[playerName] = {
                        challonge_name: playerName,
                        replay_name: replayPlayer.name || playerName,
                        battlenet_id: bnet && bnet.battle_net_name ? bnet.battle_net_name : bnet && bnet.name ? bnet.name : "Unknown",
                        battlenet_url: bnet && bnet.battle_net_url ? bnet.battle_net_url : replayPlayer.battle_net_url || "Unknown",
                        races: replayData.player_races[replayPlayer.name] || { picked_race: "Unknown", actual_race: "Unknown" },
                        total_score: 0,
                        matches_played: 0
                    };
                }
                this.results.players[playerName].total_score += totalScore;
                this.results.players[playerName].matches_played += 1;
            }

            this.results.matches.push({
                match_id: match.id,
                replay_file: replayFile,
                start_time: replayMatch.start_time || match.started_at || new Date().toISOString(),
                map_name: replayMatch.map_name || "Unknown",
                player1: {
                    challonge_id: player1Id,
                    challonge_name: player1Name,
                    replay_name: player1Replay.name || player1Name,
                    battlenet_id: player1Bnet && (player1Bnet.battle_net_name || player1Bnet.name) ? (player1Bnet.battle_net_name || player1Bnet.name) : "Unknown",
                    battlenet_url: player1Bnet && player1Bnet.battle_net_url ? player1Bnet.battle_net_url : player1Replay.battle_net_url || "Unknown",
                    score: score1,
                    total_score: totalScore1,
                    races: replayData.player_races[player1Replay.name] || { picked_race: "Unknown", actual_race: "Unknown" }
                },
                player2: {
                    challonge_id: player2Id,
                    challonge_name: player2Name,
                    replay_name: player2Replay.name || player2Name,
                    battlenet_id: player2Bnet && (player2Bnet.battle_net_name || player2Bnet.name) ? (player2Bnet.battle_net_name || player2Bnet.name) : "Unknown",
                    battlenet_url: player2Bnet && player2Bnet.battle_net_url ? player2Bnet.battle_net_url : player2Replay.battle_net_url || "Unknown",
                    score: score2,
                    total_score: totalScore2,
                    races: replayData.player_races[player2Replay.name] || { picked_race: "Unknown", actual_race: "Unknown" }
                },
                state: match.state,
                winner_id: match.winner_id ? String(match.winner_id) : null,
                round: match.round,
                identifier: match.identifier
            });
        }

        // Add racial distribution
        const raceCounts = { P: 0, T: 0, Z: 0, R: 0 };
        for (const player of Object.values(this.results.players)) {
            raceCounts[player.races.actual_race[0]] = (raceCounts[player.races.actual_race[0]] || 0) + 1;
        }
        this.results.race_distribution = raceCounts;

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

app.post('/api/load-replay-data', async (req, res) => {
    const { replayFile } = req.body;
    if (!replayFile) {
        return res.status(400).json({ error: 'replayFile is required' });
    }
    try {
        const results = await analyzer.loadReplayData(path.join(path.dirname(REPLAY_FILE), replayFile));
        res.json(results);
    } catch (error) {
        console.error(`Error in /api/load-replay-data: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/analyze', async (req, res) => {
    const { tournamentId, replayFile, matchObjectMap, bnetIdMap } = req.body;
    if (!tournamentId || !replayFile) {
        return res.status(400).json({ error: 'tournamentId and replayFile are required' });
    }
    try {
        const results = await analyzer.analyzeTournament(tournamentId, path.join(path.dirname(REPLAY_FILE), replayFile), matchObjectMap || {}, bnetIdMap || {});
        res.json(results);
    } catch (error) {
        console.error(`Error in /api/analyze: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/generate-wiki', async (req, res) => {
    const { results } = req.body;
    if (!results || !results.matches || !results.players) {
        return res.status(400).json({ error: 'Invalid results data' });
    }

    let wikiScript = `{{DISPLAYTITLE:StarCraft Ultra Chicken King #${results.tournament_name.match(/\d+$/)[0]}}}\n`;
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
    wikiScript += `|date=${results.tournament_date.split('T')[0]}\n`; // Update with actual date if available
    wikiScript += `|liquipediatier=4 |tiertype=Showmatch\n`;
    wikiScript += `|bracket=https://challonge.com/succk${results.tournament_name.match(/\d+$/)[0]}\n`;
    wikiScript += `}}\n`;

    wikiScript += `==Format==\n`;
    wikiScript += `* 单淘 Single-elimination bracket\n`;
    wikiScript += `* 所有比赛均Bo1 All matches are Bo1\n`;
    wikiScript += `* 败者晋级 Loser of each match advance to the next round.\n`;

    wikiScript += `===Map Pool===\n`;
    wikiScript += `* 选手可以Ban图或者限定天梯地图，不然主办随机选了 Player can specify maps to ban, or demand ladder maps. Otherwise the organizer will randomly pick from all Blizzard or GSL maps.\n`;
    wikiScript += `{{Maps}}\n`;

    wikiScript += `==Talents==\n`;
    wikiScript += `{{BroadcasterCard\n`;
    wikiScript += `|position=Host\n`;
    wikiScript += `|b1=Wayne|b1flag=CN|b1link=User:Wayne19980\n`;
    wikiScript += `}}\n`;
    wikiScript += `{{BroadcasterCard\n`;
    wikiScript += `|position=Caster\n`;
    wikiScript += `|b1=Wayne|b1flag=CN|b1link=User:Wayne19980\n`;
    wikiScript += `}}\n`;

    wikiScript += `==Prize Pool==\n`;
    wikiScript += `{{ParticipantTable|hidden=true\n`;
    Object.values(results.players).forEach((player, index) => {
        wikiScript += `|p${index + 1}=${player.challonge_name}|p${index + 1}race=${player.races.actual_race[0]}|p${index + 1}flag=cn\n`;
    });
    wikiScript += `}}\n`;
    wikiScript += `{{SoloPrizePool\n`;
    wikiScript += `|{{Slot|place=1}}\n`;
    wikiScript += `|{{Slot|place=2}}\n`;
    wikiScript += `|{{Slot|place=3-4}}\n`;
    wikiScript += `|{{Slot|place=5-8}}\n`;
    wikiScript += `}}\n`;

    wikiScript += `==Notable Participants==\n`;
    wikiScript += `{{ParticipantTable|count=true|onlyNotable=|tournament=#}}\n`;

    wikiScript += `==Results==\n`;
    const bracketTemplates = {
        2: "Bracket/2",
        3: "Bracket/2L1D",
        4: "Bracket/4",
        5: "Bracket/2L1DH2L",
        6: "Bracket/4L2DS",
        7: "Bracket/2L1DH4L",
        8: "Bracket/8",
        9: "Bracket/2L1DH2LH4L",
        10: "Bracket/4L2DH4LS",
        11: "Bracket/2L1DH2LH4L2DSL",
        12: "Bracket/8L4DSS",
        13: "Bracket/2L1DH4LH4L2DSL",
        14: "Bracket/4L2DH8LS",
        15: "Bracket/4L2DH8LS",
        16: "Bracket/16"
    };
    const playerCount = Object.keys(results.players).length;
    const bracketTemplate = bracketTemplates[playerCount] || "Bracket/16";
    const tournamentNumber = results.tournament_name.match(/\d+$/)[0].padStart(4, '0');
    wikiScript += `{{Bracket|${bracketTemplate}|id=AXsuck${tournamentNumber}\n`;
    const matchesByRound = {};
    results.matches.forEach(match => {
        matchesByRound[match.round] = matchesByRound[match.round] || [];
        matchesByRound[match.round].push(match);
    });

    for (const round in matchesByRound) {
        let matchNum = 1;
        matchesByRound[round].forEach(match => {
            wikiScript += `|R${round}M${matchNum}={{Match\n`;
            wikiScript += `    |bestof=1\n`;
            wikiScript += `    |winner=${match.winner_id === String(match.player1.challonge_id) ? 1 : 2}\n`;
            wikiScript += `    |date=${match.start_time.replace('T', ' ').split('.')[0]} {{abbr/UTC}} \n`;
            wikiScript += `    |opponent1={{1Opponent|${match.player1.challonge_name}}}\n`;
            wikiScript += `    |opponent2={{1Opponent|${match.player2.challonge_name}}}\n`;
            wikiScript += `    |map1={{Map|map=${match.map_name.replace('-天梯版', '')}|race1=${match.player1.races.actual_race[0]}|race2=${match.player2.races.actual_race[0]}|winner=${match.winner_id === String(match.player1.challonge_id) ? 1 : 2}}}\n`;
            // wikiScript += `    |map1={{Map|map=${match.map_name.replace('-天梯版', '')}|race1=${match.player1.races.actual_race[0]}|race2=${match.player2.races.actual_race[0]}|winner=${match.winner_id === String(match.player1.challonge_id) ? 2 : 1}}}\n`;
            wikiScript += `}}\n`;
            matchNum++;
        });
    }
    wikiScript += `}}\n`;

    wikiScript += `==Racial Distribution==\n`;
    wikiScript += `{{RaceDist|last=1}}\n`;

    wikiScript += `==View Games==\n`;
    wikiScript += `===VODs===\n`;
    wikiScript += `*[https://space.bilibili.com/10130071/lists/5654276?type=season VODs on Bilibili]\n`;

    res.set('Content-Type', 'text/plain');
    res.send(wikiScript);
});

// Serve the web interface
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});