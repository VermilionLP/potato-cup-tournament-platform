const BASE = '/api';

async function request(path, options = {}) {
  const headers = { ...options.headers };
  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }
  
  // Auto-inject QQ group and player ID from localStorage if present
  if (typeof window !== 'undefined') {
    const qqGroup = localStorage.getItem('suck_qq_group');
    if (qqGroup) {
      headers['x-qq-group'] = encodeURIComponent(qqGroup);
    }
    const playerId = localStorage.getItem('suck_player_id');
    if (playerId) {
      headers['x-player-id'] = encodeURIComponent(playerId);
    }
  }

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || err.message || 'Request failed');
  }
  return res.json();
}

const enc = encodeURIComponent;

export const API = {
  // Tournaments
  listTournaments: () => request('/tournaments'),
  getTournament: (id) => request(`/tournaments/${enc(id)}`),
  createTournament: (data) => request('/tournaments', { method: 'POST', body: JSON.stringify(data) }),
  updateStatus: (id, status, scheduled_time) => request(`/tournaments/${enc(id)}/status`, { method: 'POST', body: JSON.stringify({ status, scheduled_time }) }),
  setSeeds: (id, player_ids) => request(`/tournaments/${enc(id)}/seeds`, { method: 'POST', body: JSON.stringify({ player_ids }) }),
  generateBracket: (id) => request(`/tournaments/${enc(id)}/bracket`, { method: 'POST' }),
  getBracket: (id) => request(`/tournaments/${enc(id)}/bracket`),
  setActiveMatch: (id, active_match_id) => request(`/tournaments/${enc(id)}/active-match`, { method: 'POST', body: JSON.stringify({ active_match_id }) }),
  setOverlayState: (id, overlay_scene, overlay_round) => request(`/tournaments/${enc(id)}/overlay-state`, { method: 'POST', body: JSON.stringify({ overlay_scene, overlay_round }) }),

  // Players / Registration
  listPlayers: () => request('/players'),
  getPlayerStatistics: () => request('/players/statistics'),
  getPlayer: (id) => request(`/players/${enc(id)}`),
  updatePlayer: (id, data) => request('/players', { method: 'POST', body: JSON.stringify({ id, ...data }) }),
  renamePlayer: (oldId, newId) => request(`/players/${enc(oldId)}/change-id`, { method: 'POST', body: JSON.stringify({ newId }) }),
  deletePlayer: (id) => request(`/players/${enc(id)}`, { method: 'DELETE' }),
  mergePlayer: (id, targetId) => request(`/players/${enc(id)}/merge`, { method: 'POST', body: JSON.stringify({ targetId }) }),
  register: (tournamentId, player_id) => request(`/tournaments/${enc(tournamentId)}/register`, { method: 'POST', body: JSON.stringify({ player_id }) }),
  unregister: (tournamentId, player_id) => request(`/tournaments/${enc(tournamentId)}/register`, { method: 'DELETE', body: JSON.stringify({ player_id }) }),

  // Matches / Results
  submitResult: (tournamentId, matchId, score1, score2) =>
    request(`/tournaments/${enc(tournamentId)}/matches/${matchId}/result`, { method: 'POST', body: JSON.stringify({ score1, score2 }) }),
  submitWalkover: (tournamentId, matchId, winner_id) =>
    request(`/tournaments/${enc(tournamentId)}/matches/${matchId}/walkover`, { method: 'POST', body: JSON.stringify({ winner_id }) }),
  rollbackResult: (tournamentId, matchId) =>
    request(`/tournaments/${enc(tournamentId)}/matches/${matchId}/rollback`, { method: 'POST' }),

  // Votes
  getVotes: (id) => request(`/tournaments/${enc(id)}/votes`),
  submitVote: (tournamentId, player_id, proposed_time) =>
    request(`/tournaments/${enc(tournamentId)}/vote`, { method: 'POST', body: JSON.stringify({ player_id, proposed_time }) }),
  removeVote: (tournamentId, player_id, proposed_time) =>
    request(`/tournaments/${enc(tournamentId)}/vote`, { method: 'DELETE', body: JSON.stringify({ player_id, proposed_time }) }),
  submitCustomVote: (tournamentId, player_id, topic, value) =>
    request(`/tournaments/${enc(tournamentId)}/custom-vote`, { method: 'POST', body: JSON.stringify({ player_id, topic, value }) }),
  removeCustomVote: (tournamentId, player_id, topic, value) =>
    request(`/tournaments/${enc(tournamentId)}/custom-vote`, { method: 'DELETE', body: JSON.stringify({ player_id, topic, value }) }),

  // Replays
  verifyQQ: (qqGroup) =>
    request('/verify-qq', { method: 'POST', body: JSON.stringify({ qqGroup }) }),
  uploadReplays: (matchId, replays, qqGroup) =>
    request(`/matches/${matchId}/replays`, { method: 'POST', body: JSON.stringify({ replays, qqGroup }) }),
  uploadBatchReplays: (tournamentId, replays, qqGroup) =>
    request(`/tournaments/${enc(tournamentId)}/replays/batch`, { method: 'POST', body: JSON.stringify({ replays, qqGroup }) }),
  getReplays: (matchId) => request(`/matches/${matchId}/replays`),
  deleteReplay: (replayId) => request(`/replays/${replayId}`, { method: 'DELETE' }),

  // Wiki Generation
  getWikiScript: (tournamentId) => request(`/tournaments/${enc(tournamentId)}/wiki`),
  reparseReplays: (tournamentId) => request(`/tournaments/${enc(tournamentId)}/replays/reparse`, { method: 'POST' })
};
