let tournaments = [];
let tournamentInfo = null;
let replayFiles = [];
let matchObjectMap = {};
let bnetIdMap = {};
let replayMatchObjects = [];
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

        // Populate match list for match-to-replay-object linking
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
            li.textContent = `Match ${match.id}: ${li.dataset.player1} vs ${li.dataset.player2} (${match.started_at})`;
            matchList.appendChild(li);
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

        document.getElementById('matchReplayObjectSection').style.display = 'block';
        document.getElementById('playerBnetSection').style.display = 'block';
        setupDragAndDrop(); // Keep for potential reordering, but mapping will use position
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
        });
        select.style.display = 'block';
        document.getElementById('loadPlayersBtn').style.display = 'block';
        status.textContent = '';
    } catch (error) {
        console.error('Error in loadReplayFiles:', error);
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
    const replayObjectList = document.getElementById('replayObjectList');
    const bnetIdList = document.getElementById('bnetIdList');
    replayObjectList.innerHTML = '';
    bnetIdList.innerHTML = '';
    status.textContent = 'Loading replay data...';

    try {
        console.log(`Fetching /api/load-replay-data for replayFile: ${replayFile}`);
        const response = await fetch(`/api/load-replay-data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ replayFile })
        });

        const data = await response.json();
        console.log('Response from /api/load-replay-data:', data);

        if (!response.ok) {
            throw new Error(data.error || 'Failed to load replay data');
        }

        if (!data.matches || !Array.isArray(data.matches)) {
            status.textContent = 'No match data found in the selected replay file. Check replayreader.py output.';
            return;
        }

        // Populate replay match objects
        replayMatchObjects = data.matches;
        replayMatchObjects.forEach((match, index) => {
            const li = document.createElement('li');
            li.dataset.matchIndex = index;
            li.textContent = `Match ${index + 1}: ${match.players.map(p => p.name).join(' vs ')} (${match.start_time})`;
            replayObjectList.appendChild(li);
        });

        // Populate unique Battle.net IDs
        const uniquePlayers = new Map();
        replayMatchObjects.forEach(match => {
            match.players.forEach(player => {
                if (player.name && !uniquePlayers.has(player.name)) {
                    uniquePlayers.set(player.name, player.battle_net_url || '');
                }
            });
        });

        uniquePlayers.forEach((battleNetUrl, name) => {
            const li = document.createElement('li');
            li.dataset.bnetId = name;
            li.textContent = `${name} (${battleNetUrl || 'No URL'})`;
            bnetIdList.appendChild(li);
        });

        document.getElementById('playerBnetSection').style.display = 'block';
        status.textContent = `Loaded ${replayMatchObjects.length} matches and ${uniquePlayers.size} unique players.`;
    } catch (error) {
        console.error('Error in loadReplayPlayers:', error);
        status.textContent = `Error loading replay data: ${error.message}`;
    }
}

function setupDragAndDrop() {
    Sortable.create(document.getElementById('matchList'), {
        group: 'match-objects',
        animation: 150,
        onEnd: updateMatchObjectMap
    });
    Sortable.create(document.getElementById('replayObjectList'), {
        group: 'match-objects',
        animation: 150,
        onEnd: updateMatchObjectMap
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
}

function updateMatchObjectMap() {
    matchObjectMap = {};
    const matchList = document.getElementById('matchList');
    const replayObjectList = document.getElementById('replayObjectList');
    const matchItems = matchList.getElementsByTagName('li');
    const replayItems = replayObjectList.getElementsByTagName('li');
    const minLength = Math.min(matchItems.length, replayItems.length);
    for (let i = 0; i < minLength; i++) {
        const matchId = matchItems[i].dataset.matchId;
        const matchIndex = replayItems[i].dataset.matchIndex;
        if (matchId && matchIndex !== undefined) {
            matchObjectMap[matchId] = parseInt(matchIndex);
            console.log(`Mapped Match ${matchId} to Replay Index ${matchIndex} by position`);
        }
    }
    console.log('Current matchObjectMap:', matchObjectMap);
}

function updateBnetIdMap() {
    bnetIdMap = {};
    const participantList = document.getElementById('participantList');
    const bnetIdList = document.getElementById('bnetIdList');
    const participantItems = participantList.getElementsByTagName('li');
    const bnetItems = bnetIdList.getElementsByTagName('li');
    const minLength = Math.min(participantItems.length, bnetItems.length);
    for (let i = 0; i < minLength; i++) {
        const participantName = participantItems[i].dataset.name;
        const bnetId = bnetItems[i].dataset.bnetId;
        if (participantName && bnetId) {
            bnetIdMap[participantName] = bnetId;
            console.log(`Mapped ${participantName} to Battle.net ID ${bnetId} by position`);
        }
    }
    console.log('Current bnetIdMap:', bnetIdMap);
}

async function analyzeTournament() {
    const tournamentId = document.getElementById('tournamentSelect').value;
    const replayFile = document.getElementById('replayFileSelect').value;
    if (!tournamentId || !replayFile) return alert('Please select a tournament and replay file');

    const status = document.getElementById('replayStatus');
    try {
        console.log('Sending to /api/analyze:', { tournamentId, replayFile, matchObjectMap, bnetIdMap });
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tournamentId, replayFile, matchObjectMap, bnetIdMap })
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
        console.error('Error in analyzeTournament:', error);
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