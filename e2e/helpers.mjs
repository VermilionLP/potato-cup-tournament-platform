// Shared helpers: seeding through the API (admin token) and a Chinese-locale
// browser page, optionally signed in as admin or as a player.
import { chromium } from 'playwright';

export const BASE = (process.env.E2E_BASE || 'http://localhost:3100').replace(/\/+$/, '');
export const ADMIN = process.env.E2E_ADMIN_TOKEN || 'ci-admin-token';

export async function api(method, path, body, headers = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-admin-token': ADMIN, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

const uid = () => Math.random().toString(36).slice(2, 8);

/** A player with a contact (registering needs one). */
export async function makePlayer(prefix = 'e2e') {
  const id = `${prefix}-${uid()}`;
  await api('POST', '/players', { id, flag: 'cn', battle_tags: { qq: '123456' } });
  return id;
}

/** An event with `players` registered; started (bracket made) when `start`. */
export async function makeEvent({ players = [], start = false, format = 'single_elim' } = {}) {
  const id = `e2e${uid()}`;
  await api('POST', '/tournaments', {
    id,
    name: `E2E ${id}`,
    format,
    game_mode: 'rb',
    vehicle_pool: 'prop',
    player_capacity: 16,
    banpick_enabled: false,
  });
  // New events start with the time vote; open sign-ups.
  await api('POST', `/tournaments/${id}/status`, { status: 'registration' });
  for (const p of players) await api('POST', `/tournaments/${id}/register`, { player_id: p });
  if (start) await api('POST', `/tournaments/${id}/start`, { remove: [], forfeit: [] });
  return id;
}

/** A browser page in Chinese; `admin` signs in, `player` sets the player identity. */
export async function openPage({ admin = false, player = '' } = {}) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1280, height: 900 } });
  await context.addInitScript(
    ({ admin, token, player }) => {
      if (admin) sessionStorage.setItem('suck_admin_token', token);
      if (player) {
        localStorage.setItem('suck_player_id', player);
        localStorage.setItem('suck_qq_group', '1');
      }
      localStorage.setItem('potato-lang', 'zh');
    },
    { admin, token: ADMIN, player },
  );
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return { browser, page, errors };
}
