let tournaments = [];
let tournamentInfo = null;
let replayFiles = [];
let matchReplayMap = {};
let matchFileMap = {};
let bnetIdMap = {};
let selectedReplayFiles = [];
let selectedFolderPath = '';
let isFolderPickerSupported = typeof window.showDirectoryPicker === 'function';

async function fetchTournaments() {
    const response = await fetch('/api/tournaments');
    tournaments = await response.json();
    const select = document.getElementById('tournamentSelect');
    select.innerHTML = '<option value="">Select a tournament...</option>';
    tournaments.forEach(t => {
        const option = document.createElement('option');
        option.value = t.id;
        option.textContent = `${t.id} - ${t.name}`;
        select.appendChild(option);
    });
}

async function loadTournament() {
    const tournamentId = document.getElementById('tournamentSelect').value;
    if (!tournamentId) return alert('Please select a tournament');
    
    const status = document.getElementById('replayStatus');
    try {
        const response = await fetch(`/api/tournament/${tournamentId}`);
        tournamentInfo = await response.json();
        if (!response.ok) {
            throw new Error(tournamentInfo.error || 'Failed to load tournament');
        }

        document.getElementById('tournamentDetails').textContent = JSON.stringify(tournamentInfo, null, 2);
        document.getElementById('tournamentInfo').style.display = 'block';

        // Populate match list for match-to-replay linking
        const matchList = document.getElementById('matchList');
        matchList.innerHTML = '';
        const participants = Object.fromEntries(
            (tournamentInfo.participants || []).map(p => [String(p.participant.id), p.participant.name])
        );
        (tournamentInfo.matches || []).forEach(m => {
            const match = m.match;
            const li = document.createElement('li');
            li.dataset.matchId = match.id;
            li.dataset.player1 = participants[String(match.player1_id)] || 'Unknown';
            li.dataset.player2 = participants[String(match.player2_id)] || 'Unknown';
            li.textContent = `Match ${match.id}: ${li.dataset.player1} vs ${li.dataset.player2}`;
            matchList.appendChild(li);
        });

        // Populate match list for player-to-replay linking
        const matchPlayerList = document.getElementById('matchPlayerList');
        matchPlayerList.innerHTML = '';
        (tournamentInfo.matches || []).forEach(m => {
            const match = m.match;
            const li = document.createElement('li');
            li.dataset.matchId = match.id;
            li.dataset.player1 = participants[String(match.player1_id)] || 'Unknown';
            li.dataset.player2 = participants[String(match.player2_id)] || 'Unknown';
            li.textContent = `Match ${match.id}: ${li.dataset.player1} vs ${li.dataset.player2}`;
            matchPlayerList.appendChild(li);
        });

        // Populate participant list for Battle.net ID linking
        const participantList = document.getElementById('participantList');
        participantList.innerHTML = '';
        (tournamentInfo.participants || []).forEach(p => {
            const participant = p.participant;
            const li = document.createElement('li');
            li.dataset.participantId = participant.id;
            li.dataset.name = participant.name;
            li.textContent = participant.name;
            participantList.appendChild(li);
        });

        document.getElementById('matchReplaySection').style.display = 'block';
        document.getElementById('playerBnetSection').style.display = 'block';
        setupDragAndDrop();
    } catch (error) {
        status.textContent = `Error loading tournament: ${error.message}`;
    }
}

async function selectReplayFolder() {
    if (!isFolderPickerSupported) {
        document.getElementById('replayFolderStatus').textContent = 'Folder picker not supported in this browser. Please enter the folder path manually.';
        return;
    }

    try {
        const dirHandle = await window.showDirectoryPicker();
        const folderStatus = document.getElementById('replayFolderStatus');
        folderStatus.textContent = `Selected folder: ${dirHandle.name}`;
        selectedReplayFiles = [];
        selectedFolderPath = '';

        for await (const entry of dirHandle.values()) {
            if (entry.kind === 'file' && entry.name.endsWith('.SC2Replay')) {
                const file = await entry.getFile();
                const content = await file.arrayBuffer();
                selectedReplayFiles.push({
                    name: entry.name,
                    content: Buffer.from(content).toString('base64')
                });
            }
        }

        if (selectedReplayFiles.length === 0) {
            folderStatus.textContent += '\nNo .SC2Replay files found in the selected folder.';
            document.getElementById('processReplaysBtn').style.display = 'none';
        } else {
            folderStatus.textContent += `\nFound ${selectedReplayFiles.length} .SC2Replay file(s).`;
            document.getElementById('processReplaysBtn').style.display = 'inline-block';
        }
    } catch (error) {
        document.getElementById('replayFolderStatus').textContent = `Error selecting folder: ${error.message}`;
    }
}

function useFolderPath() {
    const folderPath = document.getElementById('replayFolderPath').value.trim();
    if (!folderPath) {
        document.getElementById('replayFolderStatus').textContent = 'Please enter a valid folder path.';
        return;
    }
    selectedFolderPath = folderPath;
    document.getElementById('replayFolderStatus').textContent = `Selected folder path: ${folderPath}`;
    document.getElementById('processReplaysBtn').style.display = 'inline-block';
}

async function runReplayReader() {
    const status = document.getElementById('replayStatus');
    status.textContent = 'Processing replays...';
    try {
        const body = isFolderPickerSupported && selectedReplayFiles.length > 0
            ? { files: selectedReplayFiles }
            : { folder: selectedFolderPath };

        const response = await fetch('/api/run-replayreader', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const result = await response.json();
        if (response.ok) {
            status.textContent = result.message;
            await loadReplayFiles();
        } else {
            throw new Error(result.error || 'Failed to process replays');
        }
    } catch (error) {
        status.textContent = `Error processing replays: ${error.message}`;
    }
}

async function loadReplayFiles() {
    const status = document.getElementById('replayStatus');
    try {
        const response = await fetch('/api/replay-files');
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Failed to fetch replay files');
        }

        replayFiles = Array.isArray(data) ? data : [];
        const select = document.getElementById('replayFileSelect');
        select.innerHTML = '<option value="">Select a replay file...</option>';
        const replayFileList = document.getElementById('replayFileList');
        replayFileList.innerHTML = '';

        if (replayFiles.length === 0) {
            status.textContent = 'No replay files found. Ensure replayreader.py generated replay_dat_*.json files.';
            select.style.display = 'none';
            document.getElementById('loadPlayersBtn').style.display = 'none';
            return;
        }

        replayFiles.forEach(file => {
            const option = document.createElement('option');
            option.value = file;
            option.textContent = file;
            select.appendChild(option);

            const li = document.createElement('li');
            li.dataset.file = file;
            li.textContent = file;
            replayFileList.appendChild(li);
        });
        select.style.display = 'block';
        document.getElementById('loadPlayersBtn').style.display = 'block';
        document.getElementById('playerReplaySection').style.display = 'block';
        status.textContent = '';
    } catch (error) {
        status.textContent = `Error loading replay files: ${error.message}`;
        document.getElementById('replayFileSelect').style.display = 'none';
        document.getElementById('loadPlayersBtn').style.display = 'none';
    }
}

async function loadReplayPlayers() {
    const replayFile = document.getElementById('replayFileSelect').value;
    if (!replayFile) {
        document.getElementById('replayStatus').textContent = 'Please select a replay file.';
        return;
    }

    const status = document.getElementById('replayStatus');
    const replayPlayerList = document.getElementById('replayPlayerList');
    replayPlayerList.innerHTML = '';
    status.textContent = 'Loading players...';

    try {
        console.log(`Fetching /api/analyze for replayFile: ${replayFile}`);
        const response = await fetch(`/api/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                tournamentId: document.getElementById('tournamentSelect').value, 
                replayFile 
            })
        });

        const data = await response.json();
        console.log('Response from /api/analyze:', data);

        if (!response.ok) {
            throw new Error(data.error || 'Failed to analyze replay');
        }

        if (!data.players || typeof data.players !== 'object' || Object.keys(data.players).length === 0) {
            status.textContent = 'No players found in the selected replay file. Check replayreader.py output or file contents.';
            return;
        }

        Object.keys(data.players).forEach(player => {
            const li = document.createElement('li');
            li.dataset.player = player;
            li.textContent = `${player} (${data.players[player].race || 'Unknown'})`;
            replayPlayerList.appendChild(li);
        });

        status.textContent = `Loaded ${Object.keys(data.players).length} players.`;
    } catch (error) {
        console.error('Error in loadReplayPlayers:', error);
        status.textContent = `Error loading players: ${error.message}`;
    }
}

function setupDragAndDrop() {
    Sortable.create(document.getElementById('matchList'), {
        group: 'matches',
        animation: 150,
        onEnd: updateMatchFileMap
    });
    Sortable.create(document.getElementById('replayFileList'), {
        group: 'matches',
        animation: 150,
        onEnd: updateMatchFileMap
    });

    Sortable.create(document.getElementById('participantList'), {
        group: 'participants',
        animation: 150,
        onEnd: updateBnetIdMap
    });
    Sortable.create(document.getElementById('bnetIdList'), {
        group: 'participants',
        animation: 150,
        onEnd: updateBnetIdMap
    });

    Sortable.create(document.getElementById('matchPlayerList'), {
        group: 'players',
        animation: 150,
        onEnd: updateMatchReplayMap
    });
    Sortable.create(document.getElementById('replayPlayerList'), {
        group: 'players',
        animation: 150,
        onEnd: updateMatchReplayMap
    });
}

function updateMatchFileMap() {
    matchFileMap = {};
    const matches = document.getElementById('matchList').children;
    for (const match of matches) {
        const matchId = match.dataset.matchId;
        const replayFile = match.querySelector('li')?.dataset.file;
        if (replayFile) {
            matchFileMap[matchId] = replayFile;
        }
    }
}

function updateBnetIdMap() {
    bnetIdMap = {};
    const participants = document.getElementById('participantList').children;
    for (const participant of participants) {
        const participantName = participant.dataset.name;
        const bnetId = participant.querySelector('li')?.dataset.bnetId;
        if (bnetId) {
            bnetIdMap[participantName] = bnetId;
        }
    }
}

function updateMatchReplayMap() {
    matchReplayMap = {};
    const matches = document.getElementById('matchPlayerList').children;
    for (const match of matches) {
        const player1 = match.dataset.player1;
        const player2 = match.dataset.player2;
        const replayPlayer = match.querySelector('li')?.dataset.player;
        if (replayPlayer) {
            matchReplayMap[player1] = replayPlayer;
            matchReplayMap[player2] = replayPlayer;
        }
    }
}

async function analyzeTournament() {
    const tournamentId = document.getElementById('tournamentSelect').value;
    const replayFile = document.getElementById('replayFileSelect').value;
    if (!tournamentId || !replayFile) return alert('Please select a tournament and replay file');

    const status = document.getElementById('replayStatus');
    try {
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tournamentId, replayFile, matchReplayMap, matchFileMap, bnetIdMap })
        });
        const results = await response.json();
        if (!response.ok) {
            throw new Error(results.error || 'Failed to analyze tournament');
        }

        document.getElementById('results').textContent = JSON.stringify(results, null, 2);
        document.getElementById('resultsSection').style.display = 'block';
        document.getElementById('downloadLink').href = '/results.json';
        status.textContent = 'Analysis completed successfully.';
    } catch (error) {
        status.textContent = `Error analyzing tournament: ${error.message}`;
    }
}

window.onload = () => {
    fetchTournaments();
    document.getElementById('folderPicker').style.display = isFolderPickerSupported ? 'block' : 'none';
    document.getElementById('folderInput').style.display = isFolderPickerSupported ? 'none' : 'block';
    if (!isFolderPickerSupported) {
        document.getElementById('replayFolderStatus').textContent = 'Folder picker not supported in this browser. Please enter the folder path manually.';
    }
};