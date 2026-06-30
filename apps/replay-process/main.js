const fastify = require('fastify')({
    logger: true,
    bodyLimit: 50 * 1024 * 1024
});
const path = require('path');
const fs = require('fs').promises;
const { exec } = require('child_process');
const util = require('util');
const {
    API_KEY,
    SUB_DOMAIN,
    BNET_CONFIG,
    PYTHON_SCRIPT,
    TEMP_REPLAY_DIR,
    REPLAY_FILE
} = require('./config');

const TournamentAnalyzer = require('./lib/analyzer');
const { generateWiki } = require('./lib/wiki');

const port = process.env.PORT || 3000;

// Initialize Analyzer
const analyzer = new TournamentAnalyzer(API_KEY, BNET_CONFIG, SUB_DOMAIN);

const MAPPINGS_FILE = path.join(__dirname, 'mappings.json');
const PULLED_TOURNAMENTS_FILE = path.join(__dirname, 'pulled_tournaments.json');

// Helper for exec
const execPromise = util.promisify(exec);

// Register Static Files
fastify.register(require('@fastify/static'), {
    root: path.join(__dirname, 'public'),
    prefix: '/',
});

// Ensure directories and files
async function ensureDir(dir) {
    try {
        await fs.mkdir(dir, { recursive: true });
    } catch (err) {
        if (err.code !== 'EEXIST') throw err;
    }
}

async function ensureMappingsFile() {
    try {
        await fs.access(MAPPINGS_FILE);
    } catch {
        await fs.writeFile(MAPPINGS_FILE, JSON.stringify({ players: {} }, null, 2));
    }
}

// Routes
fastify.get('/api/tournaments', async (request, reply) => {
    const tournaments = await analyzer.getTournamentList();
    return tournaments;
});

fastify.get('/api/tournament/:id', async (request, reply) => {
    try {
        const tournamentInfo = await analyzer.getTournamentInfo(request.params.id, true);
        return tournamentInfo;
    } catch (error) {
        reply.status(500).send({ error: error.message });
    }
});

fastify.get('/api/replay-files', async (request, reply) => {
    const dir = path.dirname(REPLAY_FILE);
    const files = await fs.readdir(dir);
    const replayFiles = files.filter(f => f.startsWith('replay_dat_') && f.endsWith('.json'))
        .sort((a, b) => b.localeCompare(a));
    return replayFiles;
});

fastify.get('/api/mappings', async (request, reply) => {
    const data = await fs.readFile(MAPPINGS_FILE, 'utf8');
    return JSON.parse(data);
});

fastify.get('/api/pulled-tournaments', async (request, reply) => {
    try {
        const data = await fs.readFile(PULLED_TOURNAMENTS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        reply.status(404).send({ error: 'pulled_tournaments.json not found' });
    }
});

fastify.post('/api/pulled-tournaments', async (request, reply) => {
    try {
        const data = request.body;
        await fs.writeFile(PULLED_TOURNAMENTS_FILE, JSON.stringify(data, null, 2));
        return { success: true };
    } catch (e) {
        reply.status(500).send({ error: e.message });
    }
});

fastify.post('/api/mappings', async (request, reply) => {
    const { players: newPlayers } = request.body;
    if (!newPlayers) {
        reply.status(400).send({ error: 'players mapping is required' });
        return;
    }

    let existingData = { players: {} };
    try {
        const data = await fs.readFile(MAPPINGS_FILE, 'utf8');
        existingData = JSON.parse(data);
    } catch (e) { }

    const mergedPlayers = { ...existingData.players };

    for (const [name, newInfo] of Object.entries(newPlayers)) {
        if (mergedPlayers[name]) {
            const existingAccounts = mergedPlayers[name].accounts || [];
            const newAccounts = newInfo.accounts || [];
            const accountMap = new Map();
            existingAccounts.forEach(acc => accountMap.set(acc.url || acc.id, acc));
            newAccounts.forEach(acc => accountMap.set(acc.url || acc.id, acc));

            mergedPlayers[name] = {
                ...newInfo,
                accounts: Array.from(accountMap.values())
            };
        } else {
            mergedPlayers[name] = newInfo;
        }
    }

    await fs.writeFile(MAPPINGS_FILE, JSON.stringify({ players: mergedPlayers }, null, 2));
    return { message: 'Mappings saved and merged' };
});

fastify.post('/api/run-replayreader', async (request, reply) => {
    const { files, folder } = request.body;
    if (!files && !folder) {
        reply.status(400).send({ error: 'Either files or folder path is required' });
        return;
    }

    const tempFiles = await fs.readdir(TEMP_REPLAY_DIR);
    await Promise.all(tempFiles.map(f => fs.unlink(path.join(TEMP_REPLAY_DIR, f))));

    let replayFolder = TEMP_REPLAY_DIR;

    if (files && Array.isArray(files)) {
        for (const file of files) {
            const buffer = Buffer.from(file.content, 'base64');
            await fs.writeFile(path.join(TEMP_REPLAY_DIR, file.name), buffer);
        }
    } else if (folder) {
        replayFolder = folder;
    }

    await execPromise(`python "${PYTHON_SCRIPT}" "${replayFolder}"`);
    return { message: 'Replay processing completed' };
});

fastify.post('/api/load-replay-data', async (request, reply) => {
    const { replayFile } = request.body;
    if (!replayFile) {
        reply.status(400).send({ error: 'replayFile is required' });
        return;
    }

    const dataPath = path.join(path.dirname(REPLAY_FILE), replayFile);
    const results = await analyzer.loadReplayData(dataPath);
    return results;
});

fastify.post('/api/analyze', async (request, reply) => {
    const { tournamentId, replayFile, matchObjectMap, bnetIdMap } = request.body;
    if (!tournamentId || !replayFile) {
        reply.status(400).send({ error: 'tournamentId and replayFile are required' });
        return;
    }
    const dataPath = path.join(path.dirname(REPLAY_FILE), replayFile);
    const results = await analyzer.analyzeTournament(tournamentId, dataPath, matchObjectMap || {}, bnetIdMap || {});
    return results;
});

fastify.post('/api/generate-wiki', async (request, reply) => {
    const { results } = request.body;
    try {
        const wikiScript = generateWiki(results);
        reply.type('text/plain').send(wikiScript);
    } catch (error) {
        reply.status(400).send({ error: error.message });
    }
});

// Fallback to index.html
fastify.get('/', async (request, reply) => {
    return reply.sendFile('index.html');
});

// Start Server
const start = async () => {
    try {
        await ensureDir(TEMP_REPLAY_DIR);
        await ensureMappingsFile();
        await fastify.listen({ port: port, host: '0.0.0.0' });
        console.log(`Server running at http://localhost:${port}`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();
