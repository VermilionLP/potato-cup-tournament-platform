import { browser } from '$app/environment';

import { PLAYER_KEYS, readPlayerKeys } from './player-key.js';

class UserState {
  id = $state('');
  qqGroup = $state('');
  adminToken = $state('');
  keys = $state({});
  // The ID is bound to another device and this one has no key for it.
  keyConflict = $state(false);

  constructor() {
    if (browser) {
      this.id = localStorage.getItem('suck_player_id') || '';
      this.qqGroup = localStorage.getItem('suck_qq_group') || '';
      this.adminToken = sessionStorage.getItem('suck_admin_token') || '';
      this.keys = readPlayerKeys();
    }
  }

  /** This device's key for the current ID ('' when none). */
  get key() {
    return this.keys[this.id] || '';
  }

  setKey(playerId, key) {
    const next = { ...this.keys };
    if (key) next[playerId] = key;
    else delete next[playerId];
    this.keys = next;
    if (playerId === this.id) this.keyConflict = false;
    if (browser) {
      try {
        localStorage.setItem(PLAYER_KEYS, JSON.stringify(next));
      } catch (_) {}
    }
  }

  /** After an ID rename, the key moves with it. */
  moveKey(fromId, toId) {
    const key = this.keys[fromId];
    if (!key) return;
    this.setKey(toId, key);
    this.setKey(fromId, '');
  }

  setId(newId) {
    this.id = newId;
    if (browser) {
      if (newId) {
        localStorage.setItem('suck_player_id', newId);
      } else {
        localStorage.removeItem('suck_player_id');
      }
    }
  }

  setQQGroup(newQQGroup) {
    this.qqGroup = newQQGroup;
    if (browser) {
      if (newQQGroup) {
        localStorage.setItem('suck_qq_group', newQQGroup);
      } else {
        localStorage.removeItem('suck_qq_group');
      }
    }
  }

  setAdminToken(token) {
    this.adminToken = token;
    if (browser) {
      if (token) {
        sessionStorage.setItem('suck_admin_token', token);
      } else {
        sessionStorage.removeItem('suck_admin_token');
      }
    }
  }
}

export const userState = new UserState();
