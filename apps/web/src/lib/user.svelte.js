import { browser } from '$app/environment';

class UserState {
  id = $state('');
  qqGroup = $state('');
  adminToken = $state('');

  constructor() {
    if (browser) {
      this.id = localStorage.getItem('suck_player_id') || '';
      this.qqGroup = localStorage.getItem('suck_qq_group') || '';
      this.adminToken = sessionStorage.getItem('suck_admin_token') || '';
    }
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
