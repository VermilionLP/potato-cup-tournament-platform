const TournamentAnalyzer = require('./lib/analyzer');
const { API_KEY, BNET_CONFIG, SUB_DOMAIN } = require('./config');

async function main() {
    const analyzer = new TournamentAnalyzer(API_KEY, BNET_CONFIG, SUB_DOMAIN);
    try {
        const tournament = await analyzer.getTournamentInfo('11760756', true);
        console.log(`Tournament: ${tournament.name}`);
        const pMap = {};
        tournament.participants.forEach(p => {
            pMap[p.participant.id] = p.participant.display_name;
        });

        tournament.matches.forEach(m => {
            const match = m.match;
            console.log(`Match ID: ${match.id}, Raw Round: ${match.round}, Order: ${match.suggested_play_order}, P1: ${pMap[match.player1_id]}, P2: ${pMap[match.player2_id]}, Score: ${match.scores_csv}, Winner: ${pMap[match.winner_id]}`);
        });
    } catch (e) {
        console.error(e);
    }
}
main();
