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
        
        // Sort tournaments by ID or created_at (descending)
        tournaments.sort((a, b) => {
            // Usually higher ID means newer, or use created_at if available
            const dateA = new Date(a.created_at || 0).getTime();
            const dateB = new Date(b.created_at || 0).getTime();
            if (dateA !== dateB) return dateB - dateA;
            return b.id - a.id;
        });

        const select = document.getElementById('tournamentSelect');
        select.innerHTML = '<option value="">Select a tournament...</option>';
        tournaments.forEach(t => {
            const option = document.createElement('option');
            option.value = t.id;
            option.textContent = `${t.id} - ${t.name}`;
            select.appendChild(option);
        });

        // Load replay files list
        const filesResponse = await fetch('/api/replay-files');
        const files = await filesResponse.json();
        const replaySelect = document.getElementById('replayFileSelect');
        replaySelect.innerHTML = '<option value="">Select a replay data file...</option>';
        files.forEach(file => {
            const option = document.createElement('option');
            option.value = file;
            option.textContent = file;
            replaySelect.appendChild(option);
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
            li.className = 'container-item';
            li.dataset.matchId = match.id;
            const p1 = participants[String(match.player1_id)] || 'Unknown';
            const p2 = participants[String(match.player2_id)] || 'Unknown';
            const round = match.round > 0 ? `R${match.round}` : `LB R${Math.abs(match.round)}`;
            li.innerHTML = `
                <div><strong>${round} M${match.suggested_play_order}:</strong> ${p1} vs ${p2}</div>
                <ul class="drop-zone" data-match-id="${match.id}"></ul>
            `;
            matchList.appendChild(li);
        });

        // Populate participant list
        const participantList = document.getElementById('participantList');
        participantList.innerHTML = '';
        (tournamentInfo.participants || []).forEach(p => {
            const participant = p.participant;
            const displayName = participant.display_name.replace(/\s*\(invitation pending\)/g, '');
            const li = document.createElement('li');
            li.className = 'container-item';
            li.dataset.participantId = participant.id;
            li.dataset.name = displayName;
            li.innerHTML = `
                <div style="display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 0.5rem;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <strong>${displayName}</strong>
                        <div style="display: flex; gap: 0.3rem;">
                            <input type="text" class="flag-input" placeholder="flag (cn)" title="Flag (e.g. cn, hk)" style="width: 45px; padding: 2px 5px; font-size: 0.8rem;" value="cn">
                            <input type="text" class="team-input" placeholder="team" title="Team Tag" style="width: 70px; padding: 2px 5px; font-size: 0.8rem;">
                        </div>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 0.3rem;">
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <small style="color: #64748b; width: 40px;">Alias:</small>
                            <input type="text" class="alias-input" placeholder="Liquipedia ID" style="flex-grow: 1; padding: 2px 5px; font-size: 0.8rem;">
                        </div>
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <small style="color: #64748b; width: 40px;">Link:</small>
                            <input type="text" class="link-input" placeholder="User:Wayne19980" style="flex-grow: 1; padding: 2px 5px; font-size: 0.8rem;">
                        </div>
                    </div>
                </div>
                <ul class="drop-zone" data-participant-name="${displayName}"></ul>
            `;
            participantList.appendChild(li);
        });

        document.getElementById('matchReplayObjectSection').style.display = 'block';
        document.getElementById('playerBnetSection').style.display = 'block';
        setupDragAndDrop();
        setStatus('replayStatus', 'Tournament loaded. Now select replays.', 'success');
        
        // Auto-match players if mappings exist
        await autoMatchPlayers();
    } catch (error) {
        setStatus('replayStatus', `Error: ${error.message}`, 'error');
    }
}

async function autoMatchPlayers() {
    try {
        const response = await fetch('/api/mappings');
        const { players: mappings } = await response.json();
        
        const bnetIdList = document.getElementById('bnetIdList');
        const bItems = Array.from(bnetIdList.querySelectorAll('li.draggable'));
        
        if (bItems.length === 0) return;

        // Try to match based on saved mappings
        document.querySelectorAll('#participantList .drop-zone').forEach(zone => {
            const pName = zone.dataset.participantName;
            const mapping = mappings[pName];
            
            if (mapping) {
                const container = zone.closest('.container-item');
                if (mapping.flag) container.querySelector('.flag-input').value = mapping.flag;
                if (mapping.team) container.querySelector('.team-input').value = mapping.team;
                if (mapping.alias) container.querySelector('.alias-input').value = mapping.alias;
                if (mapping.link) container.querySelector('.link-input').value = mapping.link;

                const accounts = mapping.accounts || (Array.isArray(mapping) ? mapping : [mapping]);
                
                accounts.forEach(m => {
                    const mappedBnetId = typeof m === 'string' ? m : m.id;
                    const mappedBnetUrl = typeof m === 'object' ? m.url : null;

                    const bIndex = bItems.findIndex(b => {
                        if (mappedBnetUrl && b.dataset.bnetUrl === mappedBnetUrl) return true;
                        return b.dataset.bnetId === mappedBnetId;
                    });

                    if (bIndex !== -1) {
                        const bItem = bItems.splice(bIndex, 1)[0];
                        zone.appendChild(bItem);
                    }
                });
            }
        });
    } catch (err) {
        console.error('Failed to auto-match players:', err);
    }
}

async function autoMatchMatches(providedMappings = null) {
    try {
        let mappings;
        if (providedMappings) {
            mappings = providedMappings;
        } else {
            const response = await fetch('/api/mappings');
            const data = await response.json();
            mappings = data.players;
        }
        
        const replayList = document.getElementById('replayObjectList');
        const availableReplays = Array.from(replayList.querySelectorAll('li.draggable'));
        
        if (availableReplays.length === 0) return;

        // Map Challonge participant IDs to their mapped BNet IDs for quick lookup
        const participantToBnet = {};
        (tournamentInfo.participants || []).forEach(p => {
            const displayName = p.participant.display_name.replace(/\s*\(invitation pending\)/g, '');
            const mapping = mappings[displayName];
            if (mapping) {
                // Handle both single object, array of objects, and new structure
                const accounts = mapping.accounts || (Array.isArray(mapping) ? mapping : [mapping]);
                participantToBnet[p.participant.id] = accounts.map(m => typeof m === 'string' ? m : m.id);
            }
        });

        // Get all match drop zones
        const matchZones = Array.from(document.querySelectorAll('#matchList .drop-zone'));
        
        // Track which replays we've already assigned
        const usedReplayIndices = new Set();

        matchZones.forEach(zone => {
            const matchId = zone.dataset.matchId;
            const matchData = (tournamentInfo.matches || []).find(m => String(m.match.id) === String(matchId));
            
            if (!matchData) return;
            
            const p1BnetIds = participantToBnet[matchData.match.player1_id] || [];
            const p2BnetIds = participantToBnet[matchData.match.player2_id] || [];
            
            if (p1BnetIds.length === 0 || p2BnetIds.length === 0) return;

            // Find replays that match these two players
            availableReplays.forEach(replayItem => {
                if (usedReplayIndices.has(replayItem.dataset.matchIndex)) return;
                
                const replay = replayMatchObjects[parseInt(replayItem.dataset.matchIndex)];
                const replayPlayerNames = replay.players.map(p => p.name);
                
                // Check if this replay features both players (using any of their mapped IDs)
                const hasP1 = p1BnetIds.some(id => replayPlayerNames.includes(id));
                const hasP2 = p2BnetIds.some(id => replayPlayerNames.includes(id));
                
                if (hasP1 && hasP2) {
                    zone.appendChild(replayItem);
                    usedReplayIndices.add(replayItem.dataset.matchIndex);
                }
            });
        });
    } catch (err) {
        console.error('Failed to auto-match matches:', err);
    }
}

async function savePlayerMappings() {
    updateBnetIdMap();
    try {
        const response = await fetch('/api/mappings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ players: bnetIdMap })
        });
        if (response.ok) {
            // After saving, immediately trigger match linking using the current mappings
            await autoMatchMatches(bnetIdMap);
            setStatus('replayStatus', 'Mappings saved and matches linked!', 'success');
        } else {
            throw new Error('Failed to save mappings');
        }
    } catch (err) {
        alert('Error saving mappings: ' + err.message);
    }
}

async function selectReplayFolder() {
    try {
        setStatus('replayFolderStatus', 'Waiting for folder selection...', 'success');
        const response = await fetch('/api/pick-folder');
        const data = await response.json();
        
        if (data.path) {
            document.getElementById('replayFolderPath').value = data.path;
            selectedFolderPath = data.path;
            selectedReplayFiles = []; // Use path instead of uploaded files
            setStatus('replayFolderStatus', `Selected: ${data.path}`, 'success');
        } else {
            setStatus('replayFolderStatus', 'Folder selection cancelled.', 'error');
        }
    } catch (error) {
        setStatus('replayFolderStatus', `Error picking folder: ${error.message}`, 'error');
    }
}

async function processAndLoadReplays() {
    const folderPath = document.getElementById('replayFolderPath').value.trim();
    
    if (selectedReplayFiles.length === 0 && !folderPath) {
        return alert('Please pick a folder or enter a folder path first.');
    }
    
    if (folderPath) {
        selectedFolderPath = folderPath;
        selectedReplayFiles = []; // Clear picked files if path is used
    }

    setStatus('replayFolderStatus', 'Processing replays...', 'success');
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

        // Automatically load the newest replay data file
        const filesResponse = await fetch('/api/replay-files');
        const files = await filesResponse.json();
        if (files.length > 0) {
            const newestFile = files[0];
            const select = document.getElementById('replayFileSelect');
            
            // Update select options if they aren't updated yet
            select.innerHTML = '<option value="">Select a replay data file...</option>';
            files.forEach(file => {
                const option = document.createElement('option');
                option.value = file;
                option.textContent = file;
                select.appendChild(option);
            });
            
            select.value = newestFile;
            await loadReplayPlayers();
        }
        
        setStatus('replayFolderStatus', 'Replays processed and loaded!', 'success');
    } catch (error) {
        setStatus('replayFolderStatus', `Error: ${error.message}`, 'error');
    }
}

function updateFolderStatus() {
    if (selectedReplayFiles.length === 0) {
        setStatus('replayFolderStatus', 'No .SC2Replay files found in the selected folder.', 'error');
    } else {
        setStatus('replayFolderStatus', `Picked ${selectedReplayFiles.length} replay file(s). Click "Process & Load" to begin.`, 'success');
        document.getElementById('replayFolderPath').value = ''; // Clear path if files are picked
    }
}

async function selectReplayFolder() {
    try {
        setStatus('replayFolderStatus', 'Waiting for folder selection...', 'success');
        const response = await fetch('/api/pick-folder');
        const data = await response.json();
        
        if (data.path) {
            document.getElementById('replayFolderPath').value = data.path;
            selectedFolderPath = data.path;
            selectedReplayFiles = []; // Use path instead of uploaded files
            setStatus('replayFolderStatus', `Selected: ${data.path}`, 'success');
        } else {
            setStatus('replayFolderStatus', 'Folder selection cancelled.', 'error');
        }
    } catch (error) {
        setStatus('replayFolderStatus', `Error picking folder: ${error.message}`, 'error');
    }
}

async function handleFallbackFolder(input) {
    const files = Array.from(input.files);
    if (files.length === 0) return;

    setStatus('replayFolderStatus', `Reading ${files.length} files...`, 'success');
    
    selectedReplayFiles = [];
    selectedFolderPath = '';

    const replayFiles = files.filter(f => f.name.toLowerCase().endsWith('.sc2replay'));
    
    for (const file of replayFiles) {
        const content = await readFileAsBase64(file);
        selectedReplayFiles.push({ name: file.name, content });
    }

    updateFolderStatus();
}

function readFileAsBase64(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result.split(',')[1]);
        reader.readAsDataURL(file);
    });
}

function updateFolderStatus() {
    if (selectedReplayFiles.length === 0) {
        setStatus('replayFolderStatus', 'No .SC2Replay files found in the selected folder.', 'error');
    } else {
        setStatus('replayFolderStatus', `Picked ${selectedReplayFiles.length} replay file(s). Click "Process & Load" to begin.`, 'success');
        document.getElementById('replayFolderPath').value = ''; // Clear path if files are picked
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

        replayMatchObjects.sort((a, b) => {
            const timeA = new Date(a.start_time || 0).getTime();
            const timeB = new Date(b.start_time || 0).getTime();
            return timeA - timeB; // Oldest first (chronological)
        });

        replayMatchObjects.forEach((match, index) => {
            const li = document.createElement('li');
            li.className = 'draggable';
            li.dataset.matchIndex = index;
            const p1 = match.players[0] || { name: '?', actual_race: '?' };
            const p2 = match.players[1] || { name: '?', actual_race: '?' };
            const p1Str = `${p1.name}(${p1.actual_race ? p1.actual_race[0] : '?'})`;
            const p2Str = `${p2.name}(${p2.actual_race ? p2.actual_race[0] : '?'})`;
            
            // Try to get result from p.result, otherwise fallback to match.winner
            const results = match.players.map(p => {
                if (p.result) return p.result === 'Win' ? 'W' : 'L';
                if (match.winner) return p.name === match.winner ? 'W' : 'L';
                return '-';
            });
            const resultStr = results.join('-');
            
            const timeStr = match.start_time ? match.start_time.replace('T', ' ').split('.')[0] : 'Unknown Time';
            const mapStr = match.map || match.map_name || 'Unknown Map';
            
            li.innerHTML = `
                <div class="replay-item-content" title="Time: ${timeStr}&#10;Map: ${mapStr}">
                    ${p1Str} vs ${p2Str} (${resultStr || '-'})
                </div>
            `;
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
            li.className = 'draggable';
            li.dataset.bnetId = name;
            li.dataset.bnetUrl = url;
            li.textContent = `${name}`;
            bnetIdList.appendChild(li);
        });

        setStatus('replayStatus', `Loaded ${replayMatchObjects.length} matches. Please link them above.`, 'success');
        
        setupDragAndDrop();
        // After loading replays, try auto-matching
        await autoMatchPlayers();
        await autoMatchMatches();
    } catch (error) {
        setStatus('replayStatus', `Error: ${error.message}`, 'error');
    }
}

function setupDragAndDrop() {
    const replayOptions = {
        group: 'replays',
        animation: 200,
        ghostClass: 'sortable-ghost',
        draggable: '.draggable'
    };

    const bnetOptions = {
        group: 'bnetIds',
        animation: 200,
        ghostClass: 'sortable-ghost',
        draggable: '.draggable'
    };

    // Source lists - check if already initialized
    const replaySource = document.getElementById('replayObjectList');
    if (replaySource && !replaySource.sortable) {
        replaySource.sortable = Sortable.create(replaySource, replayOptions);
    }
    
    const bnetSource = document.getElementById('bnetIdList');
    if (bnetSource && !bnetSource.sortable) {
        bnetSource.sortable = Sortable.create(bnetSource, bnetOptions);
    }

    // Target drop zones for matches
    document.querySelectorAll('#matchList .drop-zone').forEach(el => {
        if (!el.sortable) {
            el.sortable = Sortable.create(el, replayOptions);
        }
    });

    // Target drop zones for participants
    document.querySelectorAll('#participantList .drop-zone').forEach(el => {
        if (!el.sortable) {
            el.sortable = Sortable.create(el, bnetOptions);
        }
    });
}

function updateMatchObjectMap() {
    matchObjectMap = {};
    document.querySelectorAll('#matchList .drop-zone').forEach(zone => {
        const matchId = zone.dataset.matchId;
        const items = zone.querySelectorAll('li');
        if (items.length > 0) {
            // If one-to-many, we can store an array or just the first one if the analyzer expects a single index
            // Looking at the analyzer, it seems to expect matchObjectMap[matchId] = replayIndex
            // If we want to support multiple replays per match, we might need to update the analyzer
            // For now, let's store an array and see if analyzer can handle it, or just take the first.
            // Let's check analyzer.js
            matchObjectMap[matchId] = Array.from(items).map(li => parseInt(li.dataset.matchIndex));
        }
    });
}

function updateBnetIdMap() {
    bnetIdMap = {};
    document.querySelectorAll('#participantList .drop-zone').forEach(zone => {
        const pName = zone.dataset.participantName;
        const container = zone.closest('.container-item');
        const flag = container.querySelector('.flag-input').value || 'cn';
        const team = container.querySelector('.team-input').value || '';
        const alias = container.querySelector('.alias-input').value || '';
        const link = container.querySelector('.link-input').value || '';
        const items = zone.querySelectorAll('li');
        
        bnetIdMap[pName] = {
            flag: flag,
            team: team,
            alias: alias,
            link: link,
            accounts: Array.from(items).map(item => ({
                id: item.dataset.bnetId,
                url: item.dataset.bnetUrl || ''
            }))
        };
    });
}

async function analyzeTournament() {
    const tournamentId = document.getElementById('tournamentSelect').value;
    const replayFile = document.getElementById('replayFileSelect').value;
    if (!tournamentId) return alert('Please select a tournament first.');
    if (!replayFile) return alert('No replay data loaded. Please process replays first.');

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
};
