// Main flows: browsing an event, an admin reporting a score in the result
// dialog, a player signing up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, api, makeEvent, makePlayer, openPage } from './helpers.mjs';

const T = 15_000;

test('visitors browse a running event: bracket, players and live tabs', async () => {
  const players = [];
  for (let i = 0; i < 4; i += 1) players.push(await makePlayer('vis'));
  const id = await makeEvent({ players, start: true });
  const { browser, page, errors } = await openPage();
  try {
    await page.goto(`${BASE}/tournament/${id}`);
    // A running event opens on its bracket: every player is on a card.
    await page.getByRole('tab', { name: '对阵', selected: true }).waitFor({ timeout: T });
    for (const p of players) await page.getByText(p, { exact: true }).first().waitFor({ timeout: T });
    await page.getByRole('tab', { name: /选手/ }).click();
    await page.getByText(players[0], { exact: true }).first().waitFor({ timeout: T });
    await page.getByRole('tab', { name: '直播' }).click();
    await page.getByText(/OBS/).first().waitFor({ timeout: T });
    assert.deepEqual(errors, [], 'no uncaught errors in the page');
  } finally {
    await browser.close();
  }
});

test('an admin reports a score from the bracket', async () => {
  const players = [];
  for (let i = 0; i < 4; i += 1) players.push(await makePlayer('adm'));
  const id = await makeEvent({ players, start: true });
  const event = await api('GET', `/tournaments/${id}`);
  const match = event.matches.find((m) => m.player1_id && m.player2_id && m.status === 'pending');
  assert.ok(match, 'a playable first-round match');
  // Reporting needs a player identity too (the site asks for one first).
  const me = await makePlayer('op');
  const { browser, page, errors } = await openPage({ admin: true, player: me });
  try {
    await page.goto(`${BASE}/tournament/${id}#bracket`);
    const card = page.getByRole('button').filter({ hasText: match.player1_id }).filter({ hasText: match.player2_id }).first();
    await card.waitFor({ timeout: T });
    await card.click();
    const plus = page.getByRole('button', { name: `${match.player1_id} 加 1 分` });
    await plus.waitFor({ timeout: T });
    await plus.click();
    await plus.click();
    const submitted = page.waitForResponse((r) => r.url().includes(`/matches/${match.id}/`) && r.request().method() === 'POST', { timeout: T });
    await page.getByRole('button', { name: /提交比分\s+2\s*:\s*0/ }).click();
    const res = await submitted;
    assert.equal(res.status(), 200, `result request ${res.url()}: ${await res.text()}`);
    // The result is stored (the winner is set right after the score).
    let done = null;
    for (let i = 0; i < 30 && !done?.winner_id; i += 1) {
      await new Promise((r) => setTimeout(r, 500));
      done = (await api('GET', `/tournaments/${id}`)).matches.find((m) => m.id === match.id);
    }
    assert.equal(done.winner_id, match.player1_id, JSON.stringify(done));
    assert.equal(Number(done.score1), 2);
    assert.deepEqual(errors, [], 'no uncaught errors in the page');
  } catch (e) {
    await page.screenshot({ path: 'e2e-admin-report.png', fullPage: true }).catch(() => {});
    throw e;
  } finally {
    await browser.close();
  }
});

test('a player signs up for an event', async () => {
  const player = await makePlayer('reg');
  const id = await makeEvent();
  const { browser, page, errors } = await openPage({ player });
  try {
    await page.goto(`${BASE}/tournament/${id}`);
    await page.getByRole('button', { name: '一键快速报名' }).click({ timeout: T });
    await page.getByText('已在选手中').waitFor({ timeout: T });
    const event = await api('GET', `/tournaments/${id}`);
    assert.ok(event.players.some((p) => p.id === player), 'registered on the server');
    assert.deepEqual(errors, [], 'no uncaught errors in the page');
  } finally {
    await browser.close();
  }
});

test('a ladder limit stops unrated players signing up; admins can still add them', async () => {
  const player = await makePlayer('lim');
  const id = await makeEvent();
  await api('PATCH', `/tournaments/${id}`, { ladder_max_mmr: 3300, ladder_max_tier: null });
  // The server refuses the player's own sign-up.
  const self = await fetch(`${BASE}/api/tournaments/${id}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-player-id': player },
    body: JSON.stringify({ player_id: player }),
  });
  assert.equal(self.status, 403);
  assert.match(await self.text(), /还没有成绩/);
  const { browser, page, errors } = await openPage({ player });
  try {
    await page.goto(`${BASE}/tournament/${id}`);
    await page.getByText('还没有成绩').waitFor({ timeout: T });
    assert.ok(await page.getByRole('button', { name: '一键快速报名' }).isDisabled(), 'sign-up button disabled');
    const check = await api('GET', `/tournaments/${id}/ladder-eligibility?player_id=${player}`);
    assert.equal(check.limited, true);
    assert.match(check.problem, /还没有成绩/);
    // Admins are not limited.
    await api('POST', `/tournaments/${id}/register`, { player_id: player });
    const event = await api('GET', `/tournaments/${id}`);
    assert.ok(event.players.some((p) => p.id === player), 'added by the admin');
    assert.deepEqual(errors, [], 'no uncaught errors in the page');
  } catch (e) {
    await page.screenshot({ path: 'e2e-ladder-limit.png', fullPage: true }).catch(() => {});
    throw e;
  } finally {
    await browser.close();
  }
});

test('signing in points new visitors to their existing player record', async () => {
  const player = await makePlayer('Known');
  await makeEvent({ players: [player] });
  const { browser, page, errors } = await openPage();
  try {
    await page.goto(`${BASE}/`);
    await page.locator('#header-profile-button').click({ timeout: T });
    await page.locator('#player-id-input').fill(player.toLowerCase());
    await page.getByText('已有相似的选手 ID，是你吗？').waitFor({ timeout: T });
    await page.getByRole('button', { name: new RegExp(`^${player} ·`) }).click();
    assert.equal(await page.locator('#player-id-input').inputValue(), player);
    await page.getByText(`已有选手「${player}」的记录`).waitFor({ timeout: T });
    await page.getByText('参加过 1 场赛事').waitFor({ timeout: T });
    assert.deepEqual(errors, [], 'no uncaught errors in the page');
  } catch (e) {
    await page.screenshot({ path: 'e2e-sign-in-lookup.png', fullPage: true }).catch(() => {});
    throw e;
  } finally {
    await browser.close();
  }
});

test('an admin deletes an event after confirming in the page (no browser dialog)', async () => {
  const id = await makeEvent();
  const event = await api('GET', `/tournaments/${id}`);
  const { browser, page, errors } = await openPage({ admin: true });
  const nativeDialogs = [];
  page.on('dialog', (d) => {
    nativeDialogs.push(d.message());
    d.dismiss();
  });
  try {
    await page.goto(`${BASE}/`);
    await page.getByRole('button', { name: `删除赛事 ${event.name}`, exact: true }).click({ timeout: T });
    // Cancel first: nothing happens.
    await page.getByRole('dialog').getByRole('button', { name: '取消' }).click({ timeout: T });
    await page.getByRole('button', { name: `删除赛事 ${event.name}`, exact: true }).click({ timeout: T });
    await page.getByRole('dialog').getByRole('button', { name: '删除', exact: true }).click({ timeout: T });
    await page.getByRole('button', { name: `删除赛事 ${event.name}`, exact: true }).waitFor({ state: 'detached', timeout: T });
    const list = await api('GET', '/tournaments');
    assert.ok(!JSON.stringify(list).includes(`"${id}"`), 'deleted on the server');
    assert.deepEqual(nativeDialogs, [], 'no native confirm()');
    assert.deepEqual(errors, [], 'no uncaught errors in the page');
  } finally {
    await browser.close();
  }
});

test('phones: no sideways scrolling, navigation at the bottom', async () => {
  const id = await makeEvent();
  const { browser, page } = await openPage();
  try {
    await page.setViewportSize({ width: 390, height: 800 });
    for (const path of ['/', `/tournament/${id}`, '/players', '/stats', '/ladder', '/points', '/pools']) {
      await page.goto(`${BASE}${path}`);
      // Event pages keep a live connection open, so wait for the content instead of network idle.
      await page.locator('main').waitFor({ timeout: T });
      await page.waitForTimeout(1500);
      const width = await page.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(width <= 390, `${path} is ${width}px wide on a 390px phone`);
    }
    const nav = page.getByRole('navigation', { name: '主导航' }).last();
    const box = await nav.boundingBox();
    assert.ok(box && box.y + box.height >= 790, 'the tab bar sits at the bottom of the screen');
  } finally {
    await browser.close();
  }
});

test('event links carry a preview (title and description) for Discord / QQ', async () => {
  const id = await makeEvent();
  const event = await api('GET', `/tournaments/${id}`);
  const html = await (await fetch(`${BASE}/tournament/${id}`)).text();
  assert.ok(html.includes(`<title>${event.name} · Potato Cup</title>`), 'page title');
  assert.match(html, new RegExp(`<meta property="og:title" content="${event.name} · Potato Cup"`));
  assert.match(html, /<meta property="og:description" content="[^"]*单败淘汰/);
  // Other pages stay plain, and the app still loads.
  const lobby = await (await fetch(`${BASE}/`)).text();
  assert.ok(!lobby.includes('og:title'));
});

test('statistics: details open under the player row and close again', async () => {
  // Earlier tests completed a match, so someone has rated games.
  const a = await makePlayer('stat');
  const b = await makePlayer('stat');
  const id = await makeEvent({ players: [a, b], start: true });
  const event = await api('GET', `/tournaments/${id}`);
  const match = event.matches.find((m) => m.player1_id && m.player2_id);
  await api('POST', `/tournaments/${id}/matches/${match.id}/result`, { score1: 2, score2: 0 });
  const { browser, page, errors } = await openPage({ player: a });
  try {
    await page.goto(`${BASE}/stats`);
    await page.getByRole('button', { name: '我的数据' }).click({ timeout: T });
    const row = page.locator(`tr[data-row="${a}"]`);
    // The table (wide screens) holds the open details; the phone list is hidden.
    const details = page.locator('table').getByText(`ID: ${a}`);
    await details.waitFor({ timeout: T });
    assert.equal(await row.getAttribute('aria-expanded'), 'true');
    await row.click();
    await details.waitFor({ state: 'detached', timeout: T });
    assert.deepEqual(errors, [], 'no uncaught errors in the page');
  } catch (e) {
    await page.screenshot({ path: 'e2e-stats-expand.png', fullPage: true }).catch(() => {});
    throw e;
  } finally {
    await browser.close();
  }
});
