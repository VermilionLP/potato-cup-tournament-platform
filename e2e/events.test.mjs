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
    await page.getByRole('button', { name: /提交最终比分\s+2\s*:\s*0/ }).click();
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
    for (const path of ['/', `/tournament/${id}`, '/players', '/stats', '/ladder', '/points', '/pools', '/hall']) {
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

test('admins merge a likely duplicate player from the player list', async () => {
  const main = await makePlayer('Twin');
  const copy = main.toLowerCase();
  await api('POST', '/players', { id: copy, flag: 'cn', battle_tags: { qq: '123456' } });
  await makeEvent({ players: [main] });
  const pairs = (await api('GET', '/players/duplicates')).pairs;
  assert.ok(pairs.some((p) => p.from.id === copy && p.into.id === main), 'suggested: the copy into the main record');
  const { browser, page, errors } = await openPage({ admin: true });
  try {
    await page.goto(`${BASE}/players`);
    await page.getByRole('button', { name: /疑似重复的选手/ }).click({ timeout: T });
    await page.getByRole('button', { name: `合并到 ${main}` }).first().click();
    await page.getByRole('button', { name: '合并', exact: true }).click({ timeout: T });
    await page.getByText(`已将 ${copy} 合并到 ${main}`).waitFor({ timeout: T });
    const left = (await api('GET', '/players')).map((p) => p.id);
    assert.ok(left.includes(main) && !left.includes(copy), 'the copy is gone');
    assert.deepEqual(errors, [], 'no uncaught errors in the page');
  } catch (e) {
    await page.screenshot({ path: 'e2e-duplicates.png', fullPage: true }).catch(() => {});
    throw e;
  } finally {
    await browser.close();
  }
});

test('live updates: a result elsewhere shows up as a small delta, not a full reload', async () => {
  const players = [];
  for (let i = 0; i < 4; i += 1) players.push(await makePlayer('live'));
  const id = await makeEvent({ players, start: true });
  const { browser, page, errors } = await openPage();
  try {
    const requests = [];
    page.on('request', (r) => requests.push(new URL(r.url()).pathname));
    await page.goto(`${BASE}/tournament/${id}`);
    await page.getByRole('tab', { name: '对阵', selected: true }).waitFor({ timeout: T });
    await page.waitForTimeout(1000); // the live stream connects
    const before = requests.filter((p) => p === `/api/tournaments/${id}`).length;
    const event = await api('GET', `/tournaments/${id}`);
    const match = event.matches.find((m) => m.player1_id && m.player2_id);
    await api('POST', `/tournaments/${id}/matches/${match.id}/result`, { score1: 2, score2: 1 });
    // The winner's crown / score appears without reloading the page.
    for (let i = 0; i < 50 && !requests.includes(`/api/tournaments/${id}/live`); i += 1) await page.waitForTimeout(200);
    assert.ok(requests.includes(`/api/tournaments/${id}/live`), 'fetched the delta');
    await page.waitForTimeout(800);
    assert.equal(requests.filter((p) => p === `/api/tournaments/${id}`).length, before, 'no full reload');
    // The match card (both players' names) now shows the 2 and the 1.
    const card = page.locator('[data-match-card]', { hasText: match.player1_id }).filter({ hasText: match.player2_id }).last();
    const text = await card.innerText();
    assert.ok(/(^|\n)\s*2\s*(\n|$)/.test(text) && /(^|\n)\s*1\s*(\n|$)/.test(text), `score on the card: ${JSON.stringify(text)}`);
    assert.deepEqual(errors, [], 'no uncaught errors in the page');
  } catch (e) {
    await page.screenshot({ path: 'e2e-live-delta.png', fullPage: true }).catch(() => {});
    throw e;
  } finally {
    await browser.close();
  }
});

test('admins create an event from the wizard in one step (the rest has defaults)', async () => {
  const name = `E2E Wizard ${Math.random().toString(36).slice(2, 7)}`;
  const admin = await makePlayer('wiz');
  const { browser, page, errors } = await openPage({ admin: true, player: admin });
  try {
    await page.goto(`${BASE}/`);
    await page.getByRole('button', { name: '创建赛事' }).first().click({ timeout: T });
    const dialog = page.getByRole('dialog');
    await dialog.getByText('基本信息').first().waitFor({ timeout: T });
    await page.screenshot({ path: 'e2e-shot-wizard-basics.png' });
    // Every step can be visited; the step list shows what each is set to.
    await dialog.getByRole('button', { name: /^2\s*赛制/ }).click();
    await page.screenshot({ path: 'e2e-shot-wizard-format.png' });
    await dialog.getByRole('button', { name: /规则/ }).first().click();
    await page.screenshot({ path: 'e2e-shot-wizard-rules.png' });
    // Without a name the first problem opens its step.
    await dialog.getByRole('button', { name: '创建赛事' }).click();
    await page.locator('#create-name-input').fill(name);
    await dialog.getByRole('button', { name: '创建赛事' }).click();
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    let event = null;
    for (let i = 0; i < 30 && !event; i += 1) {
      event = await api('GET', `/tournaments/${id}`).catch(() => null);
      if (!event) await page.waitForTimeout(200);
    }
    assert.ok(event, 'the event exists');
    assert.equal(event.format, 'single_elim');
    assert.equal(event.banpick_enabled, true);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: '创建赛事' }).first().click();
    await page.getByRole('dialog').getByText('基本信息').first().waitFor({ timeout: T });
    await page.screenshot({ path: 'e2e-shot-wizard-phone.png' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= 390), true, 'no sideways scrolling');
    assert.deepEqual(errors, [], 'no uncaught errors in the page');
  } catch (e) {
    await page.screenshot({ path: 'e2e-wizard.png', fullPage: true }).catch(() => {});
    throw e;
  } finally {
    await browser.close();
  }
});

test('admins change event settings in the settings dialog; the header shows tags only', async () => {
  const id = await makeEvent();
  const { browser, page, errors } = await openPage({ admin: true });
  try {
    await page.goto(`${BASE}/tournament/${id}`);
    await page.getByRole('button', { name: '设置', exact: true }).click({ timeout: T });
    const dialog = page.getByRole('dialog');
    await dialog.getByText('赛事设置').waitFor({ timeout: T });
    await page.screenshot({ path: 'e2e-shot-event-settings.png' });
    await dialog.getByLabel('比赛模式').selectOption('sb');
    for (let i = 0; i < 25; i += 1) {
      if ((await api('GET', `/tournaments/${id}`)).game_mode === 'sb') break;
      await page.waitForTimeout(200);
    }
    assert.equal((await api('GET', `/tournaments/${id}`)).game_mode, 'sb');
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden', timeout: T });
    assert.equal(await page.locator('select[aria-label="比赛模式"], select').filter({ hasText: 'RB' }).count(), 0, 'no selects left in the header');
    await page.screenshot({ path: 'e2e-shot-event-header.png' });
    assert.deepEqual(errors, [], 'no uncaught errors in the page');
  } catch (e) {
    await page.screenshot({ path: 'e2e-settings.png', fullPage: true }).catch(() => {});
    throw e;
  } finally {
    await browser.close();
  }
});

test('admins change the format before the start; the preview follows; not after the start', async () => {
  const players = [];
  for (let i = 0; i < 4; i += 1) players.push(await makePlayer('fm'));
  const id = await makeEvent({ players });
  const { browser, page, errors } = await openPage({ admin: true });
  try {
    await page.goto(`${BASE}/tournament/${id}#bracket`);
    await page.getByRole('button', { name: '设置', exact: true }).click({ timeout: T });
    const dialog = page.getByRole('dialog');
    await dialog.getByText('赛制', { exact: true }).waitFor({ timeout: T });
    await dialog.getByRole('button', { name: /双败淘汰/ }).click();
    await dialog.getByRole('button', { name: '保存赛制' }).click();
    for (let i = 0; i < 25; i += 1) {
      if ((await api('GET', `/tournaments/${id}`)).format === 'double_elim') break;
      await page.waitForTimeout(200);
    }
    const t = await api('GET', `/tournaments/${id}`);
    assert.equal(t.format, 'double_elim');
    assert.equal(t.grand_final_reset, true);
    await page.keyboard.press('Escape');
    // The preview is now a double-elimination bracket.
    await page.getByText('败者组').first().waitFor({ timeout: T });
    // After the start the format is locked, in the API and in the dialog.
    await api('POST', `/tournaments/${id}/start`, { remove: [], forfeit: [] });
    await assert.rejects(api('PATCH', `/tournaments/${id}`, { format: 'single_elim' }), /400/);
    await page.reload();
    await page.getByRole('button', { name: '设置', exact: true }).click({ timeout: T });
    await page.getByRole('dialog').getByText('赛事已开始，赛制不能再修改', { exact: false }).waitFor({ timeout: T });
    assert.deepEqual(errors, [], 'no uncaught errors in the page');
  } catch (e) {
    await page.screenshot({ path: 'e2e-format.png', fullPage: true }).catch(() => {});
    throw e;
  } finally {
    await browser.close();
  }
});

test('the 说明 tab: the steps with the current one marked, the format, and the admins\' notes', async () => {
  const players = [];
  for (let i = 0; i < 4; i += 1) players.push(await makePlayer('gd'));
  const id = await makeEvent({ players, format: 'swiss' });
  const { browser, page, errors } = await openPage({ admin: true });
  try {
    // Admins write the notes in the settings dialog.
    await page.goto(`${BASE}/tournament/${id}`);
    await page.getByRole('button', { name: '设置', exact: true }).click({ timeout: T });
    const dialog = page.getByRole('dialog');
    await dialog.getByText('补充说明', { exact: true }).waitFor({ timeout: T });
    await dialog.locator('#event-settings-notes textarea').fill('每场 BO3，先赢两局晋级');
    await dialog.getByRole('button', { name: '保存说明' }).click();
    for (let i = 0; i < 25; i += 1) {
      if ((await api('GET', `/tournaments/${id}`)).description) break;
      await page.waitForTimeout(200);
    }
    assert.equal((await api('GET', `/tournaments/${id}`)).description, '每场 BO3，先赢两局晋级');
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden', timeout: T });

    await page.getByRole('tab', { name: '说明' }).click({ timeout: T });
    await page.getByText('管理员说明').waitFor({ timeout: T });
    await page.getByText('每场 BO3，先赢两局晋级').waitFor({ timeout: T });
    await page.getByText('赛制：瑞士轮').waitFor({ timeout: T });
    // Registration: the sign-up step is the current one.
    const current = page.locator('li', { has: page.getByText('现在', { exact: true }) });
    assert.match(await current.first().innerText(), /报名/);
    await page.screenshot({ path: 'e2e-shot-guide.png', fullPage: true });
    // A step's button switches tabs.
    await page.getByRole('button', { name: '查看对阵' }).click();
    await page.waitForURL(/#bracket/, { timeout: T });

    // After the start the current step is playing the matches.
    await api('POST', `/tournaments/${id}/start`, { remove: [], forfeit: [] });
    await page.goto(`${BASE}/tournament/${id}#guide`);
    await page.reload();
    await page.getByText('参赛流程').waitFor({ timeout: T });
    assert.match(await page.locator('li', { has: page.getByText('现在', { exact: true }) }).first().innerText(), /填报比分/);
    assert.deepEqual(errors, [], 'no uncaught errors in the page');
  } catch (e) {
    await page.screenshot({ path: 'e2e-guide.png', fullPage: true }).catch(() => {});
    throw e;
  } finally {
    await browser.close();
  }
});

test('a live score during the match: shown on the bracket, cleared by the result', async () => {
  const players = [];
  for (let i = 0; i < 4; i += 1) players.push(await makePlayer('lsc'));
  const id = await makeEvent({ players, start: true });
  const event = await api('GET', `/tournaments/${id}`);
  const match = event.matches.find((m) => m.player1_id && m.player2_id && m.status === 'pending');
  const me = await makePlayer('lop');
  const { browser, page, errors } = await openPage({ admin: true, player: me });
  try {
    await page.goto(`${BASE}/tournament/${id}#bracket`);
    const card = page.getByRole('button').filter({ hasText: match.player1_id }).filter({ hasText: match.player2_id }).first();
    await card.click({ timeout: T });
    await page.getByRole('button', { name: `${match.player1_id} 加 1 分` }).click({ timeout: T });
    await page.screenshot({ path: 'e2e-shot-result-dialog.png' });
    await page.getByRole('button', { name: /保存实时比分\s+1\s*:\s*0/ }).click();
    let m = null;
    for (let i = 0; i < 25 && m?.live_score1 == null; i += 1) {
      await page.waitForTimeout(200);
      m = (await api('GET', `/tournaments/${id}`)).matches.find((x) => x.id === match.id);
    }
    assert.equal(m.live_score1, 1);
    assert.equal(m.live_score2, 0);
    assert.equal(m.status, 'pending', 'no result yet');
    assert.equal(m.winner_id, null);
    // The dialog stays open and says so; the card shows 实时 once closed.
    await page.getByText(/实时比分 1 : 0/).first().waitFor({ timeout: T });
    await page.keyboard.press('Escape');
    await card.getByText('实时').waitFor({ timeout: T });
    // A ladder rating or advancement is not touched by a live score; the result clears it.
    await api('POST', `/tournaments/${id}/matches/${match.id}/result`, { score1: 2, score2: 0 });
    m = (await api('GET', `/tournaments/${id}`)).matches.find((x) => x.id === match.id);
    assert.equal(m.status, 'completed');
    assert.equal(m.live_score1, null, 'cleared by the result');
    assert.deepEqual(errors, [], 'no uncaught errors in the page');
  } catch (e) {
    await page.screenshot({ path: 'e2e-live-score.png', fullPage: true }).catch(() => {});
    throw e;
  } finally {
    await browser.close();
  }
});

test('Ban / Pick runs on the server: turns, undo, a draw seen by the other player, the overlay scene', async () => {
  const vehicles = [];
  for (const g of ['GA', 'GB', 'GC']) for (let i = 1; i <= 2; i += 1) vehicles.push({ name: `${g}-${i}`, group: g, nation: 'USA', br: 5, type: 'fighter' });
  const pool = await api('POST', '/vehicle-pools', { name: 'E2E BP', event_type: 'prop', game_modes: [], rules: { bansPerPlayer: 1 }, sort_order: 900, vehicles });
  const players = [];
  for (let i = 0; i < 4; i += 1) players.push(await makePlayer('bp'));
  const id = await makeEvent({ players, start: true, template: pool.id });
  const match = (await api('GET', `/tournaments/${id}`)).matches.find((m) => m.player1_id && m.player2_id && m.status === 'pending');
  const asPlayer = async (pid, body) => {
    const res = await fetch(`${BASE}/api/tournaments/${id}/matches/${match.id}/banpick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-player-id': pid },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };
  // Live with nothing done yet: the overlay (auto) shows the Ban / Pick first.
  await api('POST', `/tournaments/${id}/active-match`, { active_match_id: match.id, channel: 1 });
  const { browser, page, errors } = await openPage({ player: match.player2_id });
  const overlay = await browser.newPage();
  await overlay.goto(`${BASE}/tournament/${id}/overlay`);
  await overlay.getByText('BANNING').first().waitFor({ timeout: T });
  // B can't ban on A's turn; A bans, undoes, bans again; B passes.
  assert.equal((await asPlayer(match.player2_id, { action: 'ban', group: 'GA' })).status, 403);
  assert.equal((await asPlayer(match.player1_id, { action: 'ban', group: 'GA' })).status, 200);
  assert.equal((await asPlayer(match.player1_id, { action: 'undo' })).status, 200);
  assert.equal((await asPlayer(match.player1_id, { action: 'ban', group: 'GB' })).status, 200);
  const stale = await asPlayer(match.player2_id, { action: 'pass', rev: 1 });
  assert.equal(stale.status, 409, 'an old revision is refused');
  const passed = await asPlayer(match.player2_id, { action: 'pass' });
  assert.equal(passed.body.banpick.state.phase, 'drawGroup');
  assert.deepEqual(passed.body.banpick.log.map((e) => [e.action, Boolean(e.undone)]), [['ban', true], ['undo', false], ['ban', false], ['pass', false]]);

  try {
    await overlay.getByText('GROUP DRAW').first().waitFor({ timeout: T });
    await page.goto(`${BASE}/tournament/${id}#bracket`);
    const card = page.getByRole('button').filter({ hasText: match.player1_id }).filter({ hasText: match.player2_id }).first();
    await card.getByRole('button', { name: 'BP' }).click({ timeout: T });
    await page.getByText(/禁用 GB/).first().waitFor({ timeout: T });
    await page.getByRole('button', { name: '抽取大组' }).click();
    let bp = null;
    for (let i = 0; i < 30 && !bp?.state?.group; i += 1) {
      await page.waitForTimeout(200);
      bp = (await api('GET', `/tournaments/${id}`)).matches.find((x) => x.id === match.id).banpick;
    }
    assert.ok(['GA', 'GC'].includes(bp.state.group), `drew ${bp?.state?.group}`);
    assert.equal(bp.log.at(-1).by, match.player2_id);
    await page.getByText(`抽到大组 ${bp.state.group}`).first().waitFor({ timeout: T });
    // An admin picking the scene by hand works too.
    await api('POST', `/tournaments/${id}/overlay-state`, { channel: 1, overlay_scene: 'banpick' });
    await overlay.getByText('GROUP DRAW').first().waitFor({ timeout: T });
    // Confirmed: auto mode shows the locked-in vehicle for 20 s, then the
    // in-game HUD, which shows the vehicle.
    await api('POST', `/tournaments/${id}/overlay-state`, { channel: 1, overlay_scene: 'auto' });
    await api('POST', `/tournaments/${id}/matches/${match.id}/banpick`, { action: 'confirmGroup' });
    await api('POST', `/tournaments/${id}/matches/${match.id}/banpick`, { action: 'drawVehicle' });
    await api('POST', `/tournaments/${id}/matches/${match.id}/banpick`, { action: 'confirm' });
    await overlay.getByText("THIS MATCH'S VEHICLE").first().waitFor({ timeout: T });
    await overlay.getByText("RESULTS").first().waitFor({ timeout: T + 25_000 });
    await overlay.getByText(/G[AC]-\d/).first().waitFor({ timeout: T });
    await page.screenshot({ path: 'e2e-shot-banpick.png' });
    await overlay.screenshot({ path: 'e2e-shot-banpick-overlay.png' });
    assert.deepEqual(errors, [], 'no uncaught errors in the page');
  } catch (e) {
    await page.screenshot({ path: 'e2e-banpick.png', fullPage: true }).catch(() => {});
    throw e;
  } finally {
    await browser.close();
    await api('DELETE', `/vehicle-pools/${pool.id}`).catch(() => {});
  }
});
