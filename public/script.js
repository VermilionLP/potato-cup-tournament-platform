let tournaments = [];
let tournamentInfo = null;
let replayFiles = [];
let matchObjectMap = {};
let bnetIdMap = {};
let replayMatchObjects = [];
let selectedReplayFiles = [];
let selectedFolderPath = '';
let isFolderPickerSupported = typeof window.showDirectoryPicker === 'function';

const setStatus = (id, message, type = '') => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = message;
    el.className = 'status-msg ' + type;
    el.style.display = message ? 'block' : 'none';
};

const showLoading = (btnId, isLoading) => {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    if (isLoading) {
        btn.disabled = true;
        const originalText = btn.textContent;
        btn.dataset.originalText = originalText;
        btn.innerHTML = `<span class="loading-spinner"></span> Loading...`;
    } else {
        btn.disabled = false;
        btn.textContent = btn.dataset.originalText || btn.textContent;
    }
};

async function fetchTournaments() {
    try {
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
    } catch (err) {
        console.error('Failed to fetch tournaments:', err);
    }
}

async function loadTournament() {
    const tournamentId = document.getElementById('tournamentSelect').value;
    if (!tournamentId) return;
    
    setStatus('replayStatus', 'Loading tournament info...', 'success');
    try {
        const response = await fetch(`/api/tournament/${tournamentId}`);
        tournamentInfo = await response.json();
        if (!response.ok) throw new Error(tournamentInfo.error || 'Failed to load tournament');

        document.getElementById('tournamentDetails').textContent = JSON.stringify(tournamentInfo, null, 2);
        document.getElementById('tournamentInfo').style.display = 'block';

        // Populate match list
        const matchList = document.getElementById('matchList');
        matchList.innerHTML = '';
        const participants = Object.fromEntries(
            (tournamentInfo.participants || []).map(p => [
                String(p.participant.id), 
                p.participant.display_name.replace(/\s*\(invitation pending\)/g, '')
            ])
        );

        (tournamentInfo.matches || []).forEach(m => {
            const match = m.match;
            const li = document.createElement('li');
            li.dataset.matchId = match.id;
            const p1 = participants[String(match.player1_id)] || 'Unknown';
            const p2 = participants[String(match.player2_id)] || 'Unknown';
            li.textContent = `Match ${match.id}: ${p1} vs ${p2} (ID: ${match.id})`;
            matchList.appendChild(li);
        });

        // Populate participant list
        const participantList = document.getElementById('participantList');
        participantList.innerHTML = '';
        (tournamentInfo.participants || []).forEach(p => {
            const participant = p.participant;
            const displayName = participant.display_name.replace(/\s*\(invitation pending\)/g, '');
            const li = document.createElement('li');
            li.dataset.participantId = participant.id;
            li.dataset.name = displayName;
            li.textContent = displayName;
            participantList.appendChild(li);
        });

        document.getElementById('matchReplayObjectSection').style.display = 'block';
        document.getElementById('playerBnetSection').style.display = 'block';
        setupDragAndDrop();
        setStatus('replayStatus', 'Tournament loaded. Now select replays.', 'success');
    } catch (error) {
        setStatus('replayStatus', `Error: ${error.message}`, 'error');
    }
}

async function selectReplayFolder() {
    if (!isFolderPickerSupported) return;

    try {
        const dirHandle = await window.showDirectoryPicker();
        setStatus('replayFolderStatus', `Reading files from ${dirHandle.name}...`, 'success');
        
        selectedReplayFiles = [];
        selectedFolderPath = '';

        for await (const entry of dirHandle.values()) {
            if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.sc2replay')) {
                const file = await entry.getFile();
                const reader = new FileReader();
                const content = await new Promise((resolve) => {
                    reader.onload = (e) => resolve(e.target.result.split(',')[1]);
                    reader.readAsDataURL(file);
                });
                selectedReplayFiles.push({ name: entry.name, content });
            }
        }

        if (selectedReplayFiles.length === 0) {
            setStatus('replayFolderStatus', 'No .SC2Replay files found in the selected folder.', 'error');
            document.getElementById('processReplaysBtn').style.display = 'none';
        } else {
            setStatus('replayFolderStatus', `Found ${selectedReplayFiles.length} replay file(s). Click "Process Replays" to begin.`, 'success');
            document.getElementById('processReplaysBtn').style.display = 'inline-block';
        }
    } catch (error) {
        if (error.name !== 'AbortError') {
            setStatus('replayFolderStatus', `Error selecting folder: ${error.message}`, 'error');
        }
    }
}

function useFolderPath() {
    const folderPath = document.getElementById('replayFolderPath').value.trim();
    if (!folderPath) {
        setStatus('replayFolderStatus', 'Please enter a valid folder path.', 'error');
        return;
    }
    selectedFolderPath = folderPath;
    setStatus('replayFolderStatus', `Using folder path: ${folderPath}`, 'success');
    document.getElementById('processReplaysBtn').style.display = 'inline-block';
}

async function runReplayReader() {
    setStatus('replayStatus', 'Processing replays on server...', 'success');
    showLoading('processReplaysBtn', true);
    
    try {
        const body = (selectedReplayFiles.length > 0)
            ? { files: selectedReplayFiles }
            : { folder: selectedFolderPath };

        const response = await fetch('/api/run-replayreader', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Failed to process replays');

        setStatus('replayStatus', 'Replays processed successfully!', 'success');
        await loadReplayFiles();
    } catch (error) {
        setStatus('replayStatus', `Error: ${error.message}`, 'error');
    } finally {
        showLoading('processReplaysBtn', false);
    }
}

async function loadReplayFiles() {
    try {
        const response = await fetch('/api/replay-files');
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to fetch replay data files');

        replayFiles = Array.isArray(data) ? data : [];
        const select = document.getElementById('replayFileSelect');
        select.innerHTML = '<option value="">Select a replay data file...</option>';

        if (replayFiles.length === 0) {
            setStatus('replayStatus', 'No processed replay data found. Please run the processor first.', 'error');
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
    } catch (error) {
        setStatus('replayStatus', `Error: ${error.message}`, 'error');
    }
}

async function loadReplayPlayers() {
    const replayFile = document.getElementById('replayFileSelect').value;
    if (!replayFile) return;

    setStatus('replayStatus', 'Loading replay data...', 'success');
    showLoading('loadPlayersBtn', true);

    try {
        const response = await fetch(`/api/load-replay-data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ replayFile })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to load replay data');

        if (!data.matches || data.matches.length === 0) {
            setStatus('replayStatus', 'No match data found in the selected file.', 'error');
            return;
        }

        replayMatchObjects = data.matches;
        
        // Populate lists
        const replayObjectList = document.getElementById('replayObjectList');
        const bnetIdList = document.getElementById('bnetIdList');
        replayObjectList.innerHTML = '';
        bnetIdList.innerHTML = '';

        replayMatchObjects.forEach((match, index) => {
            const li = document.createElement('li');
            li.dataset.matchIndex = index;
            const playersStr = match.players.map(p => p.name).join(' vs ');
            li.textContent = `Replay ${index + 1}: ${playersStr}`;
            replayObjectList.appendChild(li);
        });

        const uniquePlayers = new Map();
        replayMatchObjects.forEach(match => {
            match.players.forEach(p => {
                if (p.name) uniquePlayers.set(p.name, p.battle_net_url || '');
            });
        });

        uniquePlayers.forEach((url, name) => {
            const li = document.createElement('li');
            li.dataset.bnetId = name;
            li.textContent = `${name} (${url ? 'Has Profile' : 'No Profile'})`;
            bnetIdList.appendChild(li);
        });

        setStatus('replayStatus', `Loaded ${replayMatchObjects.length} matches. Please link them above.`, 'success');
    } catch (error) {
        setStatus('replayStatus', `Error: ${error.message}`, 'error');
    } finally {
        showLoading('loadPlayersBtn', false);
    }
}

function setupDragAndDrop() {
    const sortableOptions = {
        group: { name: 'shared', pull: false, put: false },
        animation: 200,
        ghostClass: 'sortable-ghost',
        onEnd: () => {
            updateMatchObjectMap();
            updateBnetIdMap();
        }
    };

    Sortable.create(document.getElementById('matchList'), sortableOptions);
    Sortable.create(document.getElementById('replayObjectList'), sortableOptions);
    Sortable.create(document.getElementById('participantList'), sortableOptions);
    Sortable.create(document.getElementById('bnetIdList'), sortableOptions);
}

function updateMatchObjectMap() {
    matchObjectMap = {};
    const matchItems = document.getElementById('matchList').getElementsByTagName('li');
    const replayItems = document.getElementById('replayObjectList').getElementsByTagName('li');
    const min = Math.min(matchItems.length, replayItems.length);
    
    for (let i = 0; i < min; i++) {
        const matchId = matchItems[i].dataset.matchId;
        const matchIndex = replayItems[i].dataset.matchIndex;
        if (matchId && matchIndex !== undefined) {
            matchObjectMap[matchId] = parseInt(matchIndex);
        }
    }
}

function updateBnetIdMap() {
    bnetIdMap = {};
    const pItems = document.getElementById('participantList').getElementsByTagName('li');
    const bItems = document.getElementById('bnetIdList').getElementsByTagName('li');
    const min = Math.min(pItems.length, bItems.length);
    
    for (let i = 0; i < min; i++) {
        const pName = pItems[i].dataset.name;
        const bId = bItems[i].dataset.bnetId;
        if (pName && bId) bnetIdMap[pName] = bId;
    }
}

async function analyzeTournament() {
    const tournamentId = document.getElementById('tournamentSelect').value;
    const replayFile = document.getElementById('replayFileSelect').value;
    if (!tournamentId || !replayFile) return alert('Please select tournament and replay data file first.');

    updateMatchObjectMap();
    updateBnetIdMap();

    setStatus('replayStatus', 'Analyzing tournament...', 'success');
    showLoading('analyzeBtn', true);

    try {
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tournamentId, replayFile, matchObjectMap, bnetIdMap })
        });
        
        const results = await response.json();
        if (!response.ok) throw new Error(results.error || 'Analysis failed');

        document.getElementById('results').textContent = JSON.stringify(results, null, 2);
        document.getElementById('resultsSection').style.display = 'block';
        
        const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const dl = document.getElementById('downloadLink');
        dl.href = url;
        dl.style.display = 'inline-block';

        await generateWikiScript(results);
        setStatus('replayStatus', 'Analysis complete!', 'success');
    } catch (error) {
        setStatus('replayStatus', `Error: ${error.message}`, 'error');
    } finally {
        showLoading('analyzeBtn', false);
    }
}

async function generateWikiScript(results) {
    const response = await fetch('/api/generate-wiki', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ results })
    });
    
    if (!response.ok) throw new Error('Failed to generate wiki script');
    
    const wikiScript = await response.text();
    document.getElementById('wikiOutput').value = wikiScript;
    document.getElementById('wikiSection').style.display = 'block';
}

function copyWikiToClipboard() {
    const wikiOutput = document.getElementById('wikiOutput');
    wikiOutput.select();
    document.execCommand('copy');
    alert('Wiki script copied to clipboard!');
}

window.onload = () => {
    fetchTournaments();
    if (!isFolderPickerSupported) {
        document.getElementById('folderPicker').style.display = 'none';
        document.getElementById('folderInput').style.display = 'block';
        setStatus('replayFolderStatus', 'Note: Chrome/Edge recommended for folder picking.', 'error');
    }
};
