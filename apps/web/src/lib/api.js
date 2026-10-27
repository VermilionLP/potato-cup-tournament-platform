import { readPlayerKeys } from './player-key.js';

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
      // Device key for this ID, unless the caller passes one (key import).
      const key = readPlayerKeys()[playerId];
      if (key && !headers['x-player-key']) headers['x-player-key'] = key;
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
    error.code = err.code;
    // The ID is bound to another device: the layout offers to import a key.
    if (err.code === 'PLAYER_KEY_REQUIRED' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('player-key-required'));
    }
    throw error;
  }
  return res.json();
}

const enc = encodeURIComponent;

export const API = {
  // Admin
  verifyAdmin: () => request('/admin/session'),

  // Potato Cup points leaderboard (积分榜); season '' = the latest
  getPointsLeaderboard: (season) => request(`/points-leaderboard${season ? `?season=${enc(season)}` : ''}`),
  getPointsSeasons: () => request('/points-seasons'),
  setCurrentSeason: (season) => request('/points-seasons/current', { method: 'PUT', body: JSON.stringify({ season }) }),
  endSeason: (season, force = false) => request(`/points-seasons/${enc(season)}/end`, { method: 'POST', body: JSON.stringify({ force }) }),
  reopenSeason: (season) => request(`/points-seasons/${enc(season)}/reopen`, { method: 'POST', body: JSON.stringify({}) }),

  // Vehicle pools (one per event type)
  getVehiclePools: () => request('/vehicle-pools'),
  saveVehiclePool: (id, vehicles) => request(`/vehicle-pools/${enc(id)}`, { method: 'PUT', body: JSON.stringify({ vehicles }) }),
  resetVehiclePool: (id) => request(`/vehicle-pools/${enc(id)}`, { method: 'DELETE' }),

  // Tournaments
  listTournaments: () => request('/tournaments'),
  getTournament: (id) => request(`/tournaments/${enc(id)}`),
  createTournament: (data) => request('/tournaments', { method: 'POST', body: JSON.stringify(data) }),
  deleteTournament: (id) => request(`/tournaments/${enc(id)}`, { method: 'DELETE' }),
  updateStatus: (id, status, scheduled_time) => request(`/tournaments/${enc(id)}/status`, { method: 'POST', body: JSON.stringify({ status, scheduled_time }) }),
  updateTournament: (id, data) => request(`/tournaments/${enc(id)}`, { method: 'PATCH', body: JSON.stringify(data) }),
  startPlayoffs: (id) => request(`/tournaments/${enc(id)}/playoffs`, { method: 'POST' }),
  withdrawPlayoffs: (id) => request(`/tournaments/${enc(id)}/playoffs`, { method: 'DELETE' }),
  setSwissRounds: (id, swiss_rounds) => request(`/tournaments/${enc(id)}/swiss-rounds`, { method: 'POST', body: JSON.stringify({ swiss_rounds }) }),
  setSeeds: (id, player_ids) => request(`/tournaments/${enc(id)}/seeds`, { method: 'POST', body: JSON.stringify({ player_ids }) }),
  autoSeeds: (id) => request(`/tournaments/${enc(id)}/seeds/auto`, { method: 'POST', body: JSON.stringify({}) }),
  randomizeSeeds: (id, opts = {}) => request(`/tournaments/${enc(id)}/seeds/randomize`, { method: 'POST', body: JSON.stringify(opts) }),
  generateBracket: (id) => request(`/tournaments/${enc(id)}/bracket`, { method: 'POST' }),
  getBracket: (id) => request(`/tournaments/${enc(id)}/bracket`),
  setActiveMatch: (id, active_match_id) => request(`/tournaments/${enc(id)}/active-match`, { method: 'POST', body: JSON.stringify({ active_match_id }) }),
  // overlay_stage ("wb:2", "sw:3"...) is left unchanged when omitted.
  setOverlayState: (id, overlay_scene, overlay_round, overlay_stage) => request(`/tournaments/${enc(id)}/overlay-state`, { method: 'POST', body: JSON.stringify({ overlay_scene, overlay_round, overlay_stage }) }),

  // Ladder
  // mode / pool pick a division (e.g. AB 螺旋桨); omitted = all games.
  getLadder: ({ includeInactive = false, days, window, mode, pool } = {}) => {
    const params = new URLSearchParams();
    if (days) params.set('days', String(days));
    if (window === 'year') params.set('window', 'year');
    if (mode) params.set('mode', mode);
    if (pool) params.set('pool', pool);
    if (includeInactive) params.set('include_inactive', '1');
    const qs = params.toString();
    return request(`/ladder${qs ? `?${qs}` : ''}`);
  },
  getLadderPlayer: (id, { days, window, mode, pool } = {}) => {
    const params = new URLSearchParams();
    if (days) params.set('days', String(days));
    if (window === 'year') params.set('window', 'year');
    if (mode) params.set('mode', mode);
    if (pool) params.set('pool', pool);
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
  // Device key: bind on first use / check a key (pass it to import one).
  claimPlayerKey: (id, key) =>
    request(`/players/${enc(id)}/key`, { method: 'POST', body: JSON.stringify({}), headers: key ? { 'x-player-key': key } : {} }),
  playerKeyStatus: (id) => request(`/players/${enc(id)}/key`),
  resetPlayerKey: (id) => request(`/players/${enc(id)}/key`, { method: 'DELETE' }),
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

  // Wiki Generation
  getWikiScript: (tournamentId) => request(`/tournaments/${enc(tournamentId)}/wiki`)
};
