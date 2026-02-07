const fs = require('fs').promises;

class TournamentAnalyzer {
    constructor(apiKey, battlenetConfigPath, subdomain) {
        this.apiKey = apiKey;
        this.baseUrl = "https://api.challonge.com/v1";
        this.subdomain = subdomain;
        this.battlenetConfigPath = battlenetConfigPath;
        this.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
            "Accept": "application/json",
            "Connection": "keep-alive"
        };
        this.results = null;
    }

    async _loadBattlenetConfig() {
        try {
            const data = await fs.readFile(this.battlenetConfigPath, 'utf-8');
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

    async processReplayData(replayFile) {
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
                    map_name: replay.map || replay.map_name,
                    players: replay.players
                };
            });
            return { player_races: playerRaces, match_data: matchData };
        } catch (error) {
            console.error(`Error processing replay data: ${error.message}`);
            throw new Error(`Failed to process replay data: ${error.message}`);
        }
    }

    async analyzeTournament(tournamentId, replayFile, matchObjectMap = {}, bnetIdMap = {}) {
        const [tournamentInfo, replayData] = await Promise.all([
            this.getTournamentInfo(tournamentId, true),
            this.processReplayData(replayFile)
        ]);

        const participants = Object.fromEntries(
            (tournamentInfo.participants || []).map(p => [
                String(p.participant.id), 
                p.participant.display_name.replace(/\s*\(invitation pending\)/g, '')
            ])
        );
        const matches = (tournamentInfo.matches || []).map(m => m.match);

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

            const matchIndices = matchObjectMap[String(match.id)];
            const matchIndicesArray = Array.isArray(matchIndices) ? matchIndices : (matchIndices !== undefined ? [matchIndices] : []);
            
            const matchReplays = matchIndicesArray.map(idx => replayData.match_data[idx]).filter(Boolean);
            const replayMatch = matchReplays[0] || { players: [] }; // Primary replay for metadata

            // Match Challonge names to replay names
            const player1Mapping = bnetIdMap[player1Name] || {};
            const player2Mapping = bnetIdMap[player2Name] || {};
            
            const player1BnetList = player1Mapping.accounts || (Array.isArray(player1Mapping) ? player1Mapping : [player1Mapping]);
            const player2BnetList = player2Mapping.accounts || (Array.isArray(player2Mapping) ? player2Mapping : [player2Mapping]);

            const player1Replay = replayMatch.players.find(p =>
                p.name === player1Name ||
                player1BnetList.some(bnet => (typeof bnet === 'string' ? bnet === p.name : bnet.id === p.name))
            ) || replayMatch.players[0] || {};
            const player2Replay = replayMatch.players.find(p =>
                p.name === player2Name ||
                player2BnetList.some(bnet => (typeof bnet === 'string' ? bnet === p.name : bnet.id === p.name))
            ) || replayMatch.players[1] || {};

            const player1Bnet = player1BnetList[0]; // Take primary for summary
            const player2Bnet = player2BnetList[0];

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

            for (const [playerName, replayPlayer, bnet, score, totalScore, mapping] of [
                [player1Name, player1Replay, player1Bnet, score1, totalScore1, player1Mapping],
                [player2Name, player2Replay, player2Bnet, score2, totalScore2, player2Mapping]
            ]) {
                if (!this.results.players[playerName]) {
                    this.results.players[playerName] = {
                        challonge_name: playerName,
                        replay_name: replayPlayer.name || playerName,
                        battlenet_id: bnet && bnet.id ? bnet.id : bnet && bnet.battle_net_name ? bnet.battle_net_name : bnet && bnet.name ? bnet.name : "Unknown",
                        battlenet_url: bnet && bnet.url ? bnet.url : bnet && bnet.battle_net_url ? bnet.battle_net_url : replayPlayer.battle_net_url || "Unknown",
                        races: replayData.player_races[replayPlayer.name] || { picked_race: "Unknown", actual_race: "Unknown" },
                        total_score: 0,
                        matches_played: 0,
                        flag: mapping.flag || 'cn',
                        team: mapping.team || '',
                        alias: mapping.alias || '',
                        link: mapping.link || ''
                    };
                }
                this.results.players[playerName].total_score += totalScore;
                this.results.players[playerName].matches_played += 1;
            }

            const playerRaces = {};
            replayMatch.players.forEach(player => {
                playerRaces[player.name] = {
                    picked_race: player.picked_race,
                    actual_race: player.actual_race
                };
            });

            const mapNames = matchReplays.map(r => r.map_name).filter(Boolean);
            const combinedMapName = mapNames.length > 1 ? mapNames.join(', ') : (mapNames[0] || "Unknown");

            const games = matchReplays.map(r => {
                const p1r = r.players.find(p =>
                    p.name === player1Name ||
                    player1BnetList.some(bnet => (typeof bnet === 'string' ? bnet === p.name : bnet.id === p.name))
                ) || r.players[0] || {};
                const p2r = r.players.find(p =>
                    p.name === player2Name ||
                    player2BnetList.some(bnet => (typeof bnet === 'string' ? bnet === p.name : bnet.id === p.name))
                ) || r.players[1] || {};

                return {
                    map: r.map_name,
                    winner: r.winner === (p1r.name || 'Unknown') ? 1 : 2,
                    player1_race: (p1r.actual_race || 'Unknown')[0],
                    player2_race: (p2r.actual_race || 'Unknown')[0]
                };
            });

            this.results.matches.push({
                match_id: match.id,
                replay_file: replayFile,
                start_time: replayMatch.start_time || match.started_at || new Date().toISOString(),
                map_name: combinedMapName,
                all_maps: mapNames,
                games: games,
                player1: {
                    challonge_id: player1Id,
                    challonge_name: player1Name,
                    replay_name: player1Replay.name || player1Name,
                    battlenet_id: player1Bnet && (player1Bnet.battle_net_name || player1Bnet.name) ? (player1Bnet.battle_net_name || player1Bnet.name) : "Unknown",
                    battlenet_url: player1Bnet && player1Bnet.battle_net_url ? player1Bnet.battle_net_url : player1Replay.battle_net_url || "Unknown",
                    score: score1,
                    total_score: totalScore1,
                    races: playerRaces[player1Replay.name] || { picked_race: "Unknown", actual_race: "Unknown" }
                },
                player2: {
                    challonge_id: player2Id,
                    challonge_name: player2Name,
                    replay_name: player2Replay.name || player2Name,
                    battlenet_id: player2Bnet && (player2Bnet.battle_net_name || player2Bnet.name) ? (player2Bnet.battle_net_name || player2Bnet.name) : "Unknown",
                    battlenet_url: player2Bnet && player2Bnet.battle_net_url ? player2Bnet.battle_net_url : player2Replay.battle_net_url || "Unknown",
                    score: score2,
                    total_score: totalScore2,
                    races: playerRaces[player2Replay.name] || { picked_race: "Unknown", actual_race: "Unknown" }
                },
                state: match.state,
                winner_id: match.winner_id ? String(match.winner_id) : null,
                round: match.round,
                identifier: match.identifier
            });
        }

        const raceCounts = { P: 0, T: 0, Z: 0, R: 0 };
        for (const player of Object.values(this.results.players)) {
            const primaryRace = player.races.actual_race[0];
            if (raceCounts.hasOwnProperty(primaryRace)) {
                raceCounts[primaryRace]++;
            }
        }
        this.results.race_distribution = raceCounts;

        return this.results;
    }

    async saveResults(outputPath) {
        if (!this.results) throw new Error("No results to save. Run analyzeTournament first.");
        await fs.writeFile(outputPath, JSON.stringify(this.results, null, 2), 'utf-8');
    }
}

module.exports = TournamentAnalyzer;
