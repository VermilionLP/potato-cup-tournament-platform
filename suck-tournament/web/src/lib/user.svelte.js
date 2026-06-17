import { browser } from '$app/environment';

class UserState {
  id = $state('');

  constructor() {
    if (browser) {
      this.id = localStorage.getItem('suck_player_id') || '';
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
}

export const userState = new UserState();
