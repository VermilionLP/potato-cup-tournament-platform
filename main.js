const fs = require('fs').promises;
const { API_KEY, SUB_DOMAIN, BNET_CONFIG, REPLAY_FILE, OUTPUT_FILE } = require('./config');

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
        const data = await fs.readFile(configPath, 'utf-8');
        return JSON.parse(data);
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

        console.log(`Sending request to ${url} with params ${params.toString()}`);
        const response = await fetch(`${url}?${params.toString()}`, { headers: this.headers });
        console.log(`Response status: ${response.status}`);
        console.log(`Response headers: ${JSON.stringify(Object.fromEntries(response.headers))}`);
        
        const text = await response.text();
        console.log(`Response text: ${text.slice(0, 500)}...`);

        if (!response.ok) {
            throw new Error(`Failed to fetch tournament list: ${response.status} - ${text}`);
        }

        const data = JSON.parse(text);
        return data.map(item => item.tournament);
    }

    async printTournamentList() {
        const tournaments = await this.getTournamentList();
        console.log("\nAvailable Tournaments:");
        console.log("-".repeat(50));
        tournaments.forEach(tournament => {
            console.log(`ID: ${tournament.id} | Name: ${tournament.name}`);
        });
        console.log("-".repeat(50));
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
            participants[String(p.id)] = p.display_name	;
        });
        return participants;
    }

    async printParticipants(tournamentId) {
        const participants = await this.getParticipants(tournamentId);
        console.log("\nTournament Participants:");
        console.log("-".repeat(50));
        for (const [id, display_name] of Object.entries(participants)) {
            console.log(`ID: ${id} | Name: ${display_name}`);
        };
        console.log("-".repeat(50));
    }

    async processReplayData(replayFile) {
        const replayDataList = JSON.parse(await fs.readFile(replayFile, 'utf-8'));
        const playerRaces = {};
        for (const replay of replayDataList) {
            for (const player of replay.players) {
                playerRaces[player.name] = player.actual_race;
            }
        }
        const matchStart = replayDataList.length > 0 ? replayDataList[0].start_time : new Date().toISOString();
        return { player_races: playerRaces, match_start: matchStart };
    }

    async analyzeTournament(tournamentId, replayFile) {
        const [tournamentInfo, replayData, battlenetIds] = await Promise.all([
            this.getTournamentInfo(tournamentId, true),
            this.processReplayData(replayFile),
            this._loadBattlenetConfig(BNET_CONFIG)
        ]);

        const participants = Object.fromEntries(
            (tournamentInfo.participants || []).map(p => [String(p.participant.id), p.participant.display_name])
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

            const player1Bnet = battlenetIds.find(p => p.challonge_names.includes(player1Name)) || null;
            const player2Bnet = battlenetIds.find(p => p.challonge_names.includes(player2Name)) || null;

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

async function main() {
    const analyzer = new TournamentAnalyzer(API_KEY, BNET_CONFIG, SUB_DOMAIN);

    await analyzer.printTournamentList();
    const userInput = await new Promise(resolve => {
        process.stdin.once('data', data => resolve(data.toString().trim()));
        process.stdout.write("Enter the tournament ID you want to analyze (add '-p' to print participants only): ");
    });

    const [tournamentId, ...flags] = userInput.split(' ');
    const printParticipantsOnly = flags.includes('-p');

    if (printParticipantsOnly) {
        await analyzer.printParticipants(tournamentId);
    } else {
        try {
            const results = await analyzer.analyzeTournament(tournamentId, REPLAY_FILE);
            await analyzer.saveResults(OUTPUT_FILE);
            console.log(`Results saved to ${OUTPUT_FILE}`);
            console.log(`Tournament: ${results.tournament_name}`);
            console.log(`Total matches: ${results.matches.length}`);
            console.log(`Total players: ${Object.keys(results.players).length}`);
        } catch (error) {
            console.error(`Error: ${error.message}`);
        }
    }
    process.exit(0); // Exit cleanly after input
}

main().catch(error => {
    console.error(`Main error: ${error.message}`);
    process.exit(1);
});