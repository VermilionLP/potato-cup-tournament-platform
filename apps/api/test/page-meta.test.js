import test from 'node:test';
import assert from 'node:assert/strict';
import { beijingTimeLabel, eventIdOfPath, eventMeta, injectMeta } from '../lib/page-meta.js';

test('event previews', () => {
  assert.equal(beijingTimeLabel('2026-11-07T22:00'), '2026/11/07 周六 22:00 北京时间');
  assert.equal(beijingTimeLabel(''), '');
  const meta = eventMeta({ name: 'Potato Cup Weekly #40', status: 'registration', scheduled_time: '2026-11-07T22:00', game_mode: 'rb', vehicle_pool: 'prop', format: 'single_elim', player_count: 4 });
  assert.equal(meta.title, 'Potato Cup Weekly #40 · Potato Cup');
  assert.equal(meta.description, '报名中 · 2026/11/07 周六 22:00 北京时间 · RB 螺旋桨 · 单败淘汰 · 4 名选手');
  assert.match(eventMeta({ name: 'x', format: 'swiss', playoff_format: 'double_elim' }).description, /瑞士轮 → 双败淘汰/);
});

test('tags are escaped and placed in the head', () => {
  const html = '<html><head><title>Potato Cup</title></head><body></body></html>';
  const out = injectMeta(html, { title: 'A <b>"x"</b>', description: 'd & e', url: 'https://s/t', image: 'https://s/i.png' });
  assert.match(out, /<title>A &lt;b&gt;&quot;x&quot;&lt;\/b&gt;<\/title>/);
  assert.match(out, /<meta property="og:description" content="d &amp; e" \/>/);
  assert.ok(out.indexOf('og:image') < out.indexOf('</head>'));
});

test('event paths', () => {
  assert.equal(eventIdOfPath('/tournament/potatocupweekly40'), 'potatocupweekly40');
  assert.equal(eventIdOfPath('/tournament/a%20b?x=1'), 'a b');
  assert.equal(eventIdOfPath('/tournament/t1/overlay'), null);
  assert.equal(eventIdOfPath('/players'), null);
});
