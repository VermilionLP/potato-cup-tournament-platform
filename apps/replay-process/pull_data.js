const TournamentAnalyzer = require('./lib/analyzer');
const { API_KEY, BNET_CONFIG, SUB_DOMAIN } = require('./config');

async function main() {
    const analyzer = new TournamentAnalyzer(API_KEY, BNET_CONFIG, SUB_DOMAIN);
    try {
        console.log('Fetching tournaments from Challonge...');
        const tournaments = await analyzer.getTournamentList();
        console.log(`Fetched ${tournaments.length} tournaments.`);
        tournaments.forEach(t => {
            console.log(`- [${t.id}] ${t.name} (state: ${t.state})`);
        });
    } catch (e) {
        console.error('Error:', e);
    }
}

main();
