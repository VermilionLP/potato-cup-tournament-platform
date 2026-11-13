// The running part of wt-autoscene, shared by the command line
// (wt-autoscene.mjs) and the panel (panel.mjs): polls War Thunder's local
// web map API, reports the channel's game state to the site (on each change
// and every HEARTBEAT_MS) and optionally switches OBS scenes. Start, stop,
// pause; a status snapshot and log lines go to the callbacks.
//
// Config (see config.mjs toEngineConfig): { site, token, event, channel,
// game, interval, stable, endDelay, minBattle, obs, obsPassword, obsBattle,
// obsEnded, obsHangar, record, dryRun } with numbers as numbers.

import { appendFileSync } from 'node:fs';
import { detectState, nextScene, obsAuth, reportState, stateTracker } from './detect.mjs';

export const STATE_NAMES = { offline: '游戏未运行', hangar: '机库', battle: '战斗中', ended: '战斗结束' };
export const REPORT_NAMES = { battle: '战斗中', hangar: '机库', ended: '本局结束' };
// The site counts the script gone after 75 s without news.
export const HEARTBEAT_MS = 10_000;
const OBS_RETRY_MS = 5_000;

/** What keeps a config from running; [] when it can. */
export function configProblems(c) {
  const p = [];
  const siteOn = Boolean(c.site && c.event);
  if (c.site && !/^https?:\/\/[^/]/.test(c.site)) p.push('网站地址要以 https:// 开头');
  if (c.site && !c.event && !c.obs) p.push('请填写赛事 ID');
  if (!siteOn && !c.obs && !c.record) p.push('至少需要网站地址和赛事 ID（切网站大屏），或 OBS 地址（切 OBS），或记录文件');
  if (siteOn && !c.token && !c.dryRun) p.push('缺少管理员令牌');
  if (!Number.isInteger(c.channel) || c.channel < 1 || c.channel > 9) p.push('直播频道必须是 1-9');
  if (!/^https?:\/\/[^/]/.test(c.game || '')) p.push('游戏接口地址要以 http:// 开头');
  if (c.obs && !/^wss?:\/\/[^/]/.test(c.obs)) p.push('OBS 地址要以 ws:// 开头');
  if (!(c.endDelay >= 0 && c.endDelay <= 600)) p.push('结算等待要在 0-600 秒之间');
  if (!(c.minBattle >= 0 && c.minBattle <= 3600)) p.push('最短战斗要在 0-3600 秒之间');
  if (!(c.interval >= 200 && c.interval <= 10_000)) p.push('读取间隔要在 200-10000 毫秒之间');
  if (!(Number.isInteger(c.stable) && c.stable >= 1 && c.stable <= 10)) p.push('确认次数要在 1-10 之间');
  return p;
}

/**
 * An obs-websocket v5 connection: resolves once identified with
 * { request(type, data), close(), onClose } or rejects with a message for
 * people. `onClose(code)` is called when an identified connection drops.
 */
export function obsConnect(url, password = '', timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    let ws;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      reject(new Error(`OBS 地址不对（${e.message}）`));
      return;
    }
    const waiting = new Map();
    let id = 0;
    let ready = false;
    let done = false;
    const conn = {
      onClose: null,
      request(requestType, requestData = {}) {
        return new Promise((res, rej) => {
          const requestId = String(++id);
          waiting.set(requestId, { res, rej });
          try {
            ws.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
          } catch (e) {
            waiting.delete(requestId);
            rej(e);
            return;
          }
          setTimeout(() => waiting.delete(requestId) && rej(new Error('OBS 没有回应')), 5000);
        });
      },
      close() {
        done = true;
        try {
          ws.close();
        } catch {
          // already closed
        }
      },
    };
    const timer = setTimeout(() => lost(-1), timeoutMs);
    // A refused connection fires only "error", a dropped one "close": once.
    function lost(code) {
      clearTimeout(timer);
      for (const w of waiting.values()) w.rej(new Error('OBS 连接断开'));
      waiting.clear();
      if (ready) {
        if (!done) {
          done = true;
          conn.onClose?.(code);
        }
        return;
      }
      if (done) return;
      done = true;
      try {
        ws.close();
      } catch {
        // nothing
      }
      reject(new Error(
        code === 4009 ? 'OBS 密码不对（OBS → 工具 → WebSocket 服务器设置）'
          : code === -1 ? 'OBS 没有回应（超时）'
            : '连不上 OBS：请确认 OBS 已打开，并在“工具 → WebSocket 服务器设置”里启用了服务器',
      ));
    }
    ws.onmessage = async (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.op === 0) {
        const auth = msg.d?.authentication;
        const d = { rpcVersion: 1 };
        if (auth) d.authentication = await obsAuth(password, auth.salt, auth.challenge);
        ws.send(JSON.stringify({ op: 1, d }));
      } else if (msg.op === 2) {
        ready = true;
        clearTimeout(timer);
        resolve(conn);
      } else if (msg.op === 7) {
        const w = waiting.get(msg.d?.requestId);
        if (!w) return;
        waiting.delete(msg.d.requestId);
        const st = msg.d.requestStatus || {};
        if (st.result) w.res(msg.d.responseData || {});
        else w.rej(new Error(st.comment || `OBS 错误 ${st.code}`));
      }
    };
    ws.onclose = (ev) => lost(ev.code);
    ws.onerror = () => setTimeout(() => lost(0), 100);
  });
}

/** Scene names of an OBS (for the panel's pickers). */
export async function obsSceneList(url, password) {
  const conn = await obsConnect(url, password);
  try {
    const res = await conn.request('GetSceneList');
    return (res.scenes || []).map((s) => s.sceneName).reverse();
  } finally {
    conn.close();
  }
}

/** One read of the game API: { ok, state } or { ok: false, error }. */
export async function probeGame(game) {
  try {
    const get = async (path) => {
      const res = await fetch(game.replace(/\/+$/, '') + path, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) throw new Error(`${path} ${res.status}`);
      return res.json();
    };
    const [mapInfo, mission] = await Promise.all([get('/map_info.json'), get('/mission.json').catch(() => null)]);
    return { ok: true, state: detectState({ reachable: true, mapInfo, mission }) };
  } catch (e) {
    return { ok: false, error: String(e.cause?.code || e.name || e.message) };
  }
}

const idleStatus = () => ({
  running: false,
  paused: false,
  startedAt: null,
  dryRun: false,
  event: '',
  channel: 1,
  game: { reachable: null, state: null, error: '' },
  battleSince: null, // the current battle's start (ms)
  lastBattleMs: null,
  endAt: null, // a pending "ended" report fires then (ms)
  reported: null, // what the site (and OBS) was last told
  reportedAt: null,
  site: { on: false, ok: null, at: null, error: '' },
  obs: { on: false, connected: false, error: '', scene: null },
  record: { on: false, path: '', error: '' },
});

/**
 * The engine: { start(config), stop(), setPaused(bool), status() }.
 * onLog({ at, msg }) for each log line, onChange(status) on every change.
 */
export function createEngine({ onLog = () => {}, onChange = () => {} } = {}) {
  let status = idleStatus();
  let run = null;
  const log = (msg) => onLog({ at: Date.now(), msg });
  const emit = () => onChange(snapshot());
  const snapshot = () => structuredClone(status);

  function start(cfg) {
    const problems = configProblems(cfg);
    if (problems.length) throw new Error(problems.join('；'));
    if (run) stop({ quiet: true });
    const siteOn = Boolean(cfg.site && cfg.event);
    status = {
      ...idleStatus(),
      running: true,
      startedAt: Date.now(),
      dryRun: Boolean(cfg.dryRun),
      event: cfg.event || '',
      channel: cfg.channel,
      site: { on: siteOn, ok: null, at: null, error: '' },
      obs: { on: Boolean(cfg.obs), connected: false, error: '', scene: null },
      record: { on: Boolean(cfg.record), path: cfg.record || '', error: '' },
    };
    run = startRun(cfg, siteOn);
    emit();
  }

  function stop({ quiet = false } = {}) {
    if (!run) return;
    run.stop();
    run = null;
    status = { ...status, running: false, endAt: null, battleSince: null, obs: { ...status.obs, connected: false } };
    if (!quiet) log('已停止');
    emit();
  }

  async function setPaused(paused) {
    if (!run) throw new Error('还没有开始运行');
    await run.setPaused(Boolean(paused));
  }

  function startRun(cfg, siteOn) {
    let stopped = false;
    const timers = new Set();
    const later = (fn, ms) => {
      const t = setTimeout(() => {
        timers.delete(t);
        if (!stopped) fn();
      }, ms);
      timers.add(t);
      return t;
    };
    const cancel = (t) => {
      clearTimeout(t);
      timers.delete(t);
    };
    const base = (cfg.site || '').replace(/\/+$/, '');
    const game = cfg.game.replace(/\/+$/, '');

    // ------------------------------------------------------------ game API

    let lastRecorded = '';
    let lastReadError = '';
    let everReached = false;

    async function getJson(path) {
      const res = await fetch(game + path, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) throw new Error(`${path} ${res.status}`);
      return res.json();
    }

    // One line per change, without the per-frame map grid. Write errors are
    // reported, never mistaken for the game being offline.
    function record(entry) {
      if (!cfg.record || status.record.error) return;
      const line = JSON.stringify(entry);
      if (line === lastRecorded) return;
      lastRecorded = line;
      try {
        appendFileSync(cfg.record, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n');
      } catch (e) {
        status.record.error = e.message;
        log(`写入记录文件失败（${e.message}），之后不再记录`);
        emit();
      }
    }

    async function readGame() {
      let snap;
      try {
        const [mapInfo, mission] = await Promise.all([getJson('/map_info.json'), getJson('/mission.json').catch(() => null)]);
        snap = { reachable: true, mapInfo, mission };
        if (!everReached || lastReadError) log('已读到游戏接口');
        lastReadError = '';
        everReached = true;
      } catch (e) {
        const reason = String(e.cause?.code || e.name || e.message);
        if (reason !== lastReadError) {
          lastReadError = reason;
          // Loading or leaving a battle: the client stops answering for a few seconds.
          if (everReached) log('游戏接口暂时无响应（加载或退出战斗时正常）');
          else log(`读不到游戏接口 ${game}（${reason}）：游戏没开、还在启动，或接口被防火墙拦截`);
        }
        record({ state: 'offline', error: reason });
        return { reachable: false, error: reason };
      }
      const { grid_steps, grid_zero, grid_size, map_min, map_max, ...info } = snap.mapInfo || {};
      record({ state: detectState(snap), map_info: info, mission: snap.mission });
      return snap;
    }

    // ------------------------------------------------------------ site

    async function siteRequest(path, init = {}) {
      const res = await fetch(`${base}/api${path}`, {
        ...init,
        headers: { 'content-type': 'application/json', 'x-admin-token': cfg.token, ...(init.headers || {}) },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        let msg = body;
        try {
          msg = JSON.parse(body).message || body;
        } catch {
          // text
        }
        throw new Error(res.status === 401 || res.status === 403 ? '管理员令牌不对' : res.status === 404 ? '网站上没有这个赛事' : `${res.status} ${msg}`.slice(0, 200));
      }
      return res.json();
    }

    const siteOk = () => {
      const was = status.site.error;
      status.site = { ...status.site, ok: true, at: Date.now(), error: '' };
      if (was) log('网站连接恢复');
    };
    const siteFailed = (e) => {
      if (status.site.error !== e.message) log(`连接网站失败: ${e.message}`);
      status.site = { ...status.site, ok: false, error: e.message };
      emit();
    };

    // Tells the site the channel's game state; the answer says whether
    // automation is paused (from the site's console or here).
    async function reportGame(state, { quiet = false } = {}) {
      if (!siteOn || !state) return;
      if (cfg.dryRun) {
        if (!quiet) log(`[试运行] 网站频道 ${cfg.channel}: ${REPORT_NAMES[state]}`);
        return;
      }
      const res = await siteRequest(`/tournaments/${encodeURIComponent(cfg.event)}/game-state`, {
        method: 'POST',
        body: JSON.stringify({ channel: cfg.channel, state }),
      });
      if (stopped) return;
      siteOk();
      if (!quiet) log(`网站频道 ${cfg.channel}: ${REPORT_NAMES[state]}`);
      if (Boolean(res.paused) !== status.paused) {
        status.paused = Boolean(res.paused);
        log(status.paused ? '网站控制台暂停了自动切换' : '网站控制台恢复了自动切换');
      }
      emit();
    }

    async function setPaused(next) {
      status.paused = next;
      emit();
      log(next ? '已暂停自动切换：大屏和 OBS 不再跟随游戏' : '已恢复自动切换');
      if (siteOn && !cfg.dryRun) {
        await siteRequest(`/tournaments/${encodeURIComponent(cfg.event)}/autoscene`, {
          method: 'POST',
          body: JSON.stringify({ channel: cfg.channel, paused: next }),
        }).then(siteOk, (e) => log(`通知网站暂停状态失败: ${e.message}`));
        emit();
      }
      // Back on: catch OBS up with the game.
      if (!next && shownState) setObsScene(obsSceneOf(shownState)).catch(() => {});
    }

    const heartbeat = setInterval(() => {
      if (status.reported && !stopped) reportGame(status.reported, { quiet: true }).catch(siteFailed);
    }, HEARTBEAT_MS);

    // ------------------------------------------------------------ OBS

    let obs = null;
    let lastObsScene = null;

    async function connectObs() {
      if (!cfg.obs || stopped) return;
      try {
        const conn = await obsConnect(cfg.obs, cfg.obsPassword);
        if (stopped) {
          conn.close();
          return;
        }
        obs = conn;
        lastObsScene = null;
        status.obs = { ...status.obs, connected: true, error: '' };
        log('已连接 OBS');
        emit();
        conn.onClose = () => {
          obs = null;
          if (stopped) return;
          status.obs = { ...status.obs, connected: false, error: '连接断开' };
          log('OBS 连接断开，5 秒后重连');
          emit();
          later(connectObs, OBS_RETRY_MS);
        };
        // Connected late (OBS opened after this): catch up with the game.
        if (shownState) setObsScene(obsSceneOf(shownState)).catch(() => {});
      } catch (e) {
        if (stopped) return;
        if (status.obs.error !== e.message) log(`${e.message}；之后每 5 秒自动重试`);
        status.obs = { ...status.obs, connected: false, error: e.message };
        emit();
        later(connectObs, OBS_RETRY_MS);
      }
    }

    async function setObsScene(name) {
      if (!cfg.obs || !name || status.paused) return;
      if (cfg.dryRun) {
        log(`[试运行] OBS → ${name}`);
        return;
      }
      if (!obs) {
        // Still connecting: it catches up once connected.
        if (status.obs.error) log('OBS 未连接，跳过切换');
        return;
      }
      if (name === lastObsScene) return;
      lastObsScene = name;
      try {
        await obs.request('SetCurrentProgramScene', { sceneName: name });
        status.obs.scene = name;
        log(`OBS → ${name}`);
        emit();
      } catch (e) {
        lastObsScene = null;
        log(`OBS 切换到「${name}」失败: ${e.message}`);
      }
    }

    // ------------------------------------------------------------ loop

    const track = stateTracker(cfg.stable);
    let pending = null;
    let shownState = null; // last scene applied
    let battleStart = null;
    let battleMs = null;
    let lastActive = null; // last state that was not "offline"
    const obsSceneOf = (state) => ({ battle: cfg.obsBattle, ended: cfg.obsEnded, hangar: cfg.obsHangar })[state];

    async function apply(scene) {
      pending = null;
      status.endAt = null;
      shownState = scene;
      const state = reportState(scene, battleMs, cfg.minBattle * 1000);
      if (scene === 'ended' && state === 'hangar') log(`战斗只持续了 ${Math.round(battleMs / 1000)} 秒，不算比赛结束`);
      status.reported = state;
      status.reportedAt = Date.now();
      emit();
      // Paused: the site still hears the state (its console shows it, the
      // overlay does not follow); OBS is left alone.
      await Promise.all([
        reportGame(state).catch(siteFailed),
        setObsScene(obsSceneOf(state === 'hangar' && scene === 'ended' ? 'hangar' : scene)),
      ]);
    }

    async function tick() {
      try {
        await step();
      } catch (e) {
        log(`出错了: ${e.message}`);
      } finally {
        if (!stopped) later(tick, cfg.interval);
      }
    }

    async function step() {
      const snap = await readGame();
      if (stopped) return;
      const now = detectState(snap);
      const gameWas = JSON.stringify(status.game);
      status.game = { reachable: snap.reachable, state: status.game.state, error: snap.reachable ? '' : snap.error || '' };
      const change = track(now);
      if (change) {
        status.game.state = change.to;
        log(`游戏: ${STATE_NAMES[change.from] || '启动'} → ${STATE_NAMES[change.to]}`);
        if (change.to === 'battle' && !battleStart) {
          battleStart = Date.now();
          status.battleSince = battleStart;
        }
        if (lastActive === 'battle' && change.to === 'hangar' && battleStart) {
          battleMs = Date.now() - battleStart;
          status.lastBattleMs = battleMs;
          battleStart = null;
          status.battleSince = null;
        }
        const next = nextScene(lastActive, change.to);
        if (change.to !== 'offline') lastActive = change.to;
        if (next) {
          if (pending) cancel(pending);
          pending = null;
          status.endAt = null;
          if (next.delayed) {
            // Let viewers see the result first; back in a battle by then = nothing happened.
            log(`离开战斗，${cfg.endDelay} 秒后报告`);
            status.endAt = Date.now() + cfg.endDelay * 1000;
            pending = later(() => apply(next.scene), cfg.endDelay * 1000);
            emit();
          } else {
            await apply(next.scene);
          }
        }
        emit();
      } else if (JSON.stringify(status.game) !== gameWas) {
        emit();
      }
    }

    connectObs();
    log(`开始读取 ${game}` + (siteOn ? `，赛事 ${cfg.event} 频道 ${cfg.channel}` : '') + (cfg.record ? `，记录到 ${cfg.record}` : '') + (cfg.dryRun ? '（试运行）' : ''));
    tick();

    return {
      setPaused,
      stop() {
        stopped = true;
        clearInterval(heartbeat);
        for (const t of timers) clearTimeout(t);
        timers.clear();
        obs?.close();
        obs = null;
      },
    };
  }

  return { start, stop, setPaused, status: snapshot, get running() { return Boolean(run); } };
}
