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
    const adminToken = sessionStorage.getItem('suck_admin_token');
    if (adminToken) {
      headers['x-admin-token'] = adminToken;
    }
  }

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const message =
      res.status === 401
        ? '需要管理员权限，请先点击右上角盾牌图标登录'
        : res.status === 403
          ? err.message || '没有权限执行此操作'
          : err.message || err.error || 'Request failed';
    const error = new Error(message);
    error.status = res.status;
    throw error;
  }
  return res.json();
}

const enc = encodeURIComponent;

export const API = {
  // Admin
  verifyAdmin: () => request('/admin/session'),

  // Tournaments
  listTournaments: () => request('/tournaments'),
  getTournament: (id) => request(`/tournaments/${enc(id)}`),
  createTournament: (data) => request('/tournaments', { method: 'POST', body: JSON.stringify(data) }),
  deleteTournament: (id) => request(`/tournaments/${enc(id)}`, { method: 'DELETE' }),
  updateStatus: (id, status, scheduled_time) => request(`/tournaments/${enc(id)}/status`, { method: 'POST', body: JSON.stringify({ status, scheduled_time }) }),
  updateTournament: (id, data) => request(`/tournaments/${enc(id)}`, { method: 'PATCH', body: JSON.stringify(data) }),
  setSeeds: (id, player_ids) => request(`/tournaments/${enc(id)}/seeds`, { method: 'POST', body: JSON.stringify({ player_ids }) }),
  autoSeeds: (id) => request(`/tournaments/${enc(id)}/seeds/auto`, { method: 'POST', body: JSON.stringify({}) }),
  randomizeSeeds: (id, opts = {}) => request(`/tournaments/${enc(id)}/seeds/randomize`, { method: 'POST', body: JSON.stringify(opts) }),
  generateBracket: (id) => request(`/tournaments/${enc(id)}/bracket`, { method: 'POST' }),
  getBracket: (id) => request(`/tournaments/${enc(id)}/bracket`),
  setActiveMatch: (id, active_match_id) => request(`/tournaments/${enc(id)}/active-match`, { method: 'POST', body: JSON.stringify({ active_match_id }) }),
  setOverlayState: (id, overlay_scene, overlay_round) => request(`/tournaments/${enc(id)}/overlay-state`, { method: 'POST', body: JSON.stringify({ overlay_scene, overlay_round }) }),

  // Ladder
  getLadder: ({ includeInactive = false, days } = {}) => {
    const params = new URLSearchParams();
    if (days) params.set('days', String(days));
    if (includeInactive) params.set('include_inactive', '1');
    const qs = params.toString();
    return request(`/ladder${qs ? `?${qs}` : ''}`);
  },
  getLadderPlayer: (id, { days } = {}) => {
    const params = new URLSearchParams();
    if (days) params.set('days', String(days));
    const qs = params.toString();
    return request(`/ladder/players/${enc(id)}${qs ? `?${qs}` : ''}`);
  },

  // Players / Registration
  listPlayers: () => request('/players'),
  getPlayerStatistics: () => request('/players/statistics'),
  getPlayTimes: () => request('/stats/play-times'),
  getPushPublicKey: () => request('/push/public-key'),
  subscribePush: (subscription) =>
    request('/push/subscribe', { method: 'POST', body: JSON.stringify(subscription) }),
  unsubscribePush: (endpoint) =>
    request('/push/unsubscribe', { method: 'DELETE', body: JSON.stringify({ endpoint }) }),
  getPlayer: (id) => request(`/players/${enc(id)}`),
  updatePlayer: (id, data) => request('/players', { method: 'POST', body: JSON.stringify({ id, ...data }) }),
  touchPlayer: (id) => request(`/players/${enc(id)}/touch`, { method: 'POST', body: JSON.stringify({}) }),
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
  deletePastVotes: (tournamentId) =>
    request(`/tournaments/${enc(tournamentId)}/votes/past`, { method: 'DELETE', body: JSON.stringify({}) }),
  submitCustomVote: (tournamentId, player_id, topic, value) =>
    request(`/tournaments/${enc(tournamentId)}/custom-vote`, { method: 'POST', body: JSON.stringify({ player_id, topic, value }) }),
  removeCustomVote: (tournamentId, player_id, topic, value) =>
    request(`/tournaments/${enc(tournamentId)}/custom-vote`, { method: 'DELETE', body: JSON.stringify({ player_id, topic, value }) }),

  // QQ group verification (player sign-in)
  verifyQQ: (qqGroup) =>
    request('/verify-qq', { method: 'POST', body: JSON.stringify({ qqGroup }) }),

  // Tournament-scoped account links (temporary / borrowed accounts)
  getTournamentAccounts: (tournamentId) => request(`/tournaments/${enc(tournamentId)}/accounts`),
  linkTournamentAccounts: (tournamentId, player_id, accounts) =>
    request(`/tournaments/${enc(tournamentId)}/accounts`, { method: 'POST', body: JSON.stringify({ player_id, accounts }) }),
  unlinkTournamentAccount: (tournamentId, account_key) =>
    request(`/tournaments/${enc(tournamentId)}/accounts`, { method: 'DELETE', body: JSON.stringify({ account_key }) }),

  // Global (permanent) player account links
  linkPlayerAccounts: (playerId, accounts) =>
    request(`/players/${enc(playerId)}/accounts`, { method: 'POST', body: JSON.stringify({ accounts }) }),
  unlinkPlayerAccount: (playerId, account_key, name) =>
    request(`/players/${enc(playerId)}/accounts`, { method: 'DELETE', body: JSON.stringify({ account_key, name }) }),
  cleanupEmptyAccounts: (player_ids) =>
    request('/players/cleanup-empty-accounts', { method: 'POST', body: JSON.stringify({ player_ids }) }),

  // Wiki Generation
  getWikiScript: (tournamentId) => request(`/tournaments/${enc(tournamentId)}/wiki`)
};
