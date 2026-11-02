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
