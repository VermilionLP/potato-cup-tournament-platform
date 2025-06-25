let tournaments = [];
let tournamentInfo = null;
let replayFiles = [];
let matchReplayMap = {};

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
    
    const response = await fetch(`/api/tournament/${tournamentId}`);
    tournamentInfo = await response.json();
    document.getElementById('tournamentDetails').textContent = JSON.stringify(tournamentInfo, null, 2);
    document.getElementById('tournamentInfo').style.display = 'block';

    // Populate match list for drag-and-drop
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

    document.getElementById('matchReplaySection').style.display = 'block';
    setupDragAndDrop();
}

async function runReplayReader() {
    const folder = document.getElementById('replayFolder').value;
    if (!folder) return alert('Please enter a folder path');
    
    const status = document.getElementById('replayStatus');
    status.textContent = 'Processing replays...';
    try {
        const response = await fetch('/api/run-replayreader', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folder })
        });
        const result = await response.json();
        if (response.ok) {
            status.textContent = result.message;
            await loadReplayFiles();
        } else {
            status.textContent = `Error: ${result.error}`;
        }
    } catch (error) {
        status.textContent = `Error: ${error.message}`;
    }
}

async function loadReplayFiles() {
    const response = await fetch('/api/replay-files');
    replayFiles = await response.json();
    const select = document.getElementById('replayFileSelect');
    select.innerHTML = '<option value="">Select a replay file...</option>';
    replayFiles.forEach(file => {
        const option = document.createElement('option');
        option.value = file;
        option.textContent = file;
        select.appendChild(option);
    });
    select.style.display = 'block';
    select.onchange = loadReplayPlayers;
}

async function loadReplayPlayers() {
    const replayFile = document.getElementById('replayFileSelect').value;
    if (!replayFile) return;

    const response = await fetch(`/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournamentId: document.getElementById('tournamentSelect').value, replayFile })
    });
    const data = await response.json();
    const replayPlayerList = document.getElementById('replayPlayerList');
    replayPlayerList.innerHTML = '';
    Object.keys(data.players).forEach(player => {
        const li = document.createElement('li');
        li.dataset.player = player;
        li.textContent = `${player} (${data.players[player].race})`;
        replayPlayerList.appendChild(li);
    });
}

function setupDragAndDrop() {
    const matchList = document.getElementById('matchList');
    const replayPlayerList = document.getElementById('replayPlayerList');

    Sortable.create(matchList, {
        group: 'shared',
        animation: 150,
        onEnd: updateMatchReplayMap
    });

    Sortable.create(replayPlayerList, {
        group: 'shared',
        animation: 150,
        onEnd: updateMatchReplayMap
    });
}

function updateMatchReplayMap() {
    matchReplayMap = {};
    const matches = document.getElementById('matchList').children;
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

    const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournamentId, replayFile, matchReplayMap })
    });
    const results = await response.json();
    document.getElementById('results').textContent = JSON.stringify(results, null, 2);
    document.getElementById('resultsSection').style.display = 'block';
    document.getElementById('downloadLink').href = '/results.json';
}

window.onload = fetchTournaments;