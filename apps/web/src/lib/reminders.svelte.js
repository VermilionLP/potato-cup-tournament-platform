// Live in-page reminders: while a page of the site is open, what needs the
// player (their match, ban turn, a score to confirm, check-in, the start)
// is polled every 30 s and shown in the banner under the header; a new one
// plays a short sound and, in a background tab, makes the tab title blink.
// The header's reminder centre (ReminderCenter.svelte) sets the options.

import { API } from "./api.js";
import { freshItems, itemText } from "./reminders.js";

const POLL_MS = 30_000;
const PREFS = "suck_reminder_prefs";
const SEEN = "suck_reminders_seen";
const DISMISSED = "suck_reminders_dismissed";

const read = (store, key, fallback) => {
  try {
    const v = JSON.parse(store.getItem(key));
    return v ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (store, key, value) => {
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    // private mode: kept for this page only
  }
};

class Reminders {
  items = $state([]);
  dismissed = $state([]);
  banner = $state(true);
  sound = $state(true);
  playerId = "";
  #seen = new Set();
  #timer = null;
  #flash = null;

  /** Items still to show in the banner. */
  get visible() {
    return this.items.filter((i) => !this.dismissed.includes(i.key));
  }

  start(playerId) {
    if (typeof window === "undefined") return () => {};
    const prefs = read(localStorage, PREFS, {});
    this.banner = prefs.banner !== false;
    this.sound = prefs.sound !== false;
    this.#seen = new Set(read(sessionStorage, SEEN, []));
    this.dismissed = read(sessionStorage, DISMISSED, []);
    this.playerId = playerId;
    this.items = [];
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        this.#stopFlash();
        this.poll();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    if (playerId) {
      this.poll();
      this.#timer = setInterval(() => this.poll(), POLL_MS);
    }
    return () => {
      clearInterval(this.#timer);
      this.#timer = null;
      this.#stopFlash();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }

  async poll() {
    const id = this.playerId;
    if (!id) return;
    let items;
    try {
      ({ items } = await API.getReminders(id));
    } catch {
      return;
    }
    if (id !== this.playerId) return;
    this.items = items || [];
    const fresh = freshItems(this.items, this.#seen);
    if (!fresh.length) return;
    for (const i of fresh) this.#seen.add(i.key);
    write(sessionStorage, SEEN, [...this.#seen].slice(-200));
    if (this.sound) playChime();
    if (this.banner && document.visibilityState !== "visible") this.#startFlash(itemText(fresh[0]).title);
  }

  dismiss(key) {
    this.dismissed = [...this.dismissed, key].slice(-200);
    write(sessionStorage, DISMISSED, this.dismissed);
  }

  setPrefs(prefs) {
    if ("banner" in prefs) this.banner = Boolean(prefs.banner);
    if ("sound" in prefs) this.sound = Boolean(prefs.sound);
    write(localStorage, PREFS, { banner: this.banner, sound: this.sound });
  }

  // Background tab: the title alternates with the reminder until the tab
  // is looked at.
  #startFlash(text) {
    this.#stopFlash();
    const original = document.title;
    let on = false;
    const timer = setInterval(() => {
      on = !on;
      document.title = on ? `● ${text}` : original;
    }, 1000);
    this.#flash = { timer, original };
  }

  #stopFlash() {
    if (!this.#flash) return;
    clearInterval(this.#flash.timer);
    document.title = this.#flash.original;
    this.#flash = null;
  }
}

export const reminders = new Reminders();

let audio = null;
/** Two soft rising tones (no audio file). Browsers may block it before the first click. */
export function playChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audio ??= new Ctx();
    if (audio.state === "suspended") audio.resume().catch(() => {});
    const t = audio.currentTime;
    [880, 1318.5].forEach((freq, i) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const at = t + i * 0.16;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.18, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
      osc.connect(gain).connect(audio.destination);
      osc.start(at);
      osc.stop(at + 0.4);
    });
  } catch {
    // no sound
  }
}
