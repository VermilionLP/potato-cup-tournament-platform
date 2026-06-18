import { browser } from '$app/environment';

class UserState {
  id = $state('');
  qqGroup = $state('');

  constructor() {
    if (browser) {
      this.id = localStorage.getItem('suck_player_id') || '';
      this.qqGroup = localStorage.getItem('suck_qq_group') || '';
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
}

export const userState = new UserState();
