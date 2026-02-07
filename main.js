const express = require('express');
const fs = require('fs').promises;
const path = require('path');
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

const app = express();
const port = process.env.PORT || 3000;

// Initialize Analyzer
const analyzer = new TournamentAnalyzer(API_KEY, BNET_CONFIG, SUB_DOMAIN);

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const MAPPINGS_FILE = path.join(__dirname, 'mappings.json');

// Ensure temp directory exists
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

ensureDir(TEMP_REPLAY_DIR).catch(err => {
    console.error(`Failed to create temp directory: ${err.message}`);
});

ensureMappingsFile().catch(err => {
    console.error(`Failed to create mappings file: ${err.message}`);
});

// Helper for exec
const execPromise = util.promisify(exec);

// API Endpoints
app.get('/api/tournaments', async (req, res, next) => {
    try {
        const tournaments = await analyzer.getTournamentList();
        res.json(tournaments);
    } catch (error) {
        next(error);
    }
});

app.get('/api/tournament/:id', async (req, res, next) => {
    try {
        const tournamentInfo = await analyzer.getTournamentInfo(req.params.id, true);
        res.json(tournamentInfo);
    } catch (error) {
        next(error);
    }
});

app.get('/api/replay-files', async (req, res, next) => {
    try {
        const dir = path.dirname(REPLAY_FILE);
        const files = await fs.readdir(dir);
        const replayFiles = files.filter(f => f.startsWith('replay_dat_') && f.endsWith('.json'))
            .sort((a, b) => b.localeCompare(a)); // Newest first
        res.json(replayFiles);
    } catch (error) {
        next(error);
    }
});

app.get('/api/mappings', async (req, res, next) => {
    try {
        const data = await fs.readFile(MAPPINGS_FILE, 'utf8');
        res.json(JSON.parse(data));
    } catch (error) {
        next(error);
    }
});

app.post('/api/mappings', async (req, res, next) => {
    try {
        const { players } = req.body;
        if (!players) return res.status(400).json({ error: 'players mapping is required' });
        
        await fs.writeFile(MAPPINGS_FILE, JSON.stringify({ players }, null, 2));
        res.json({ message: 'Mappings saved' });
    } catch (error) {
        next(error);
    }
});

app.post('/api/run-replayreader', async (req, res, next) => {
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
            for (const file of files) {
                const buffer = Buffer.from(file.content, 'base64');
                await fs.writeFile(path.join(TEMP_REPLAY_DIR, file.name), buffer);
            }
        } else if (folder) {
            replayFolder = folder;
        }

        // Run Python script
        await execPromise(`python "${PYTHON_SCRIPT}" "${replayFolder}"`);
        res.json({ message: 'Replay processing completed' });
    } catch (error) {
        next(error);
    }
});

app.post('/api/load-replay-data', async (req, res, next) => {
    const { replayFile } = req.body;
    if (!replayFile) return res.status(400).json({ error: 'replayFile is required' });

    try {
        const dataPath = path.join(path.dirname(REPLAY_FILE), replayFile);
        const results = await analyzer.loadReplayData(dataPath);
        res.json(results);
    } catch (error) {
        next(error);
    }
});

app.post('/api/analyze', async (req, res, next) => {
    const { tournamentId, replayFile, matchObjectMap, bnetIdMap } = req.body;
    if (!tournamentId || !replayFile) {
        return res.status(400).json({ error: 'tournamentId and replayFile are required' });
    }
    try {
        const dataPath = path.join(path.dirname(REPLAY_FILE), replayFile);
        const results = await analyzer.analyzeTournament(tournamentId, dataPath, matchObjectMap || {}, bnetIdMap || {});
        res.json(results);
    } catch (error) {
        next(error);
    }
});

app.post('/api/generate-wiki', (req, res) => {
    const { results } = req.body;
    try {
        const wikiScript = generateWiki(results);
        res.set('Content-Type', 'text/plain');
        res.send(wikiScript);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Centralized Error Handler
app.use((err, req, res, next) => {
    console.error(`[Error] ${err.stack}`);
    res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error'
    });
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
