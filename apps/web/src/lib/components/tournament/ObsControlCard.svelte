<script>
  // OBS / stream controls for one live channel: stream mode, the live match,
  // the overlay scene and stage, and the browser-source links for OBS.
  // Consoles on the same channel share one overlay; different channels
  // (several streams / referees) are independent. `tournament` is the event
  // as the channel sees it (withChannel).
  import { toast } from "svelte-sonner";
  import { API } from "#lib/api.js";
  import { copyText } from "#lib/clipboard.js";
  import { channelUrl, countdownState, formatCountdown } from "#lib/live-channels.js";
  import * as Card from "#lib/components/ui/card/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import SettingsIcon from "@lucide/svelte/icons/settings";
  import RadioIcon from "@lucide/svelte/icons/radio";
  import CopyIcon from "@lucide/svelte/icons/copy";
  import TimerIcon from "@lucide/svelte/icons/timer";
  import GamepadIcon from "@lucide/svelte/icons/gamepad-2";
  import { untrack } from "svelte";
  import { gameStatus } from "#lib/game-scene.js";

  let {
    tournament,
    tid,
    channel = 1,
    channelChoices = [1],
    elsewhere = new Map(),
    isAdmin = false,
    streamMode = false,
    matchOrder,
    roundLabel,
    playerName,
    overlayMatches = [],
    overlayStageList = [],
    overlayShownStage = null,
    onstreamstart,
    onstreamend,
    onclearhud,
    onchannel,
    onopenmatch,
  } = $props();

  // Stage for the intro-scene link ("" = the current stage).
  let introStage = $state("");
  const base = () => `${window.location.origin}/tournament/${tid}/overlay`;
  let autoUrl = $derived(channelUrl(base(), channel));
  let sceneLinks = $derived([
    {
      key: "intro",
      title: "1. 开场对阵 (Intro / 比赛列表)",
      url: channelUrl(`${base()}?scene=intro${introStage ? `&stage=${introStage}` : ""}`, channel),
      copied: "已复制开场对阵链接",
    },
    { key: "hybrid", title: "2. 对阵图 (树状对阵图 + 侧栏)", url: channelUrl(`${base()}?scene=hybrid`, channel), copied: "已复制对阵图链接" },
    { key: "ingame", title: "3. 游戏内 HUD (右上角选手+滚动比分)", url: channelUrl(`${base()}?scene=ingame`, channel), copied: "已复制游戏内 HUD 链接" },
    { key: "versus", title: "4. 对位预告 (直播对局或下一场的双方资料)", url: channelUrl(`${base()}?scene=versus`, channel), copied: "已复制对位预告链接" },
    { key: "banpick", title: "5. Ban / Pick (直播对局的禁用与抽取)", url: channelUrl(`${base()}?scene=banpick`, channel), copied: "已复制 Ban / Pick 链接" },
  ]);

  function copy(url, message, e) {
    copyText(url, { near: e?.currentTarget }).then((ok) => (ok ? toast.success(message) : toast.error("复制失败，请手动选中链接复制")));
  }

  async function setActive(value) {
    try {
      await API.setActiveMatch(tid, value ? parseInt(value) : null, channel);
      if (!value) onclearhud?.();
      toast.success(value ? "当前直播对局已更新" : "已清除直播对局");
    } catch (err) {
      toast.error((value ? "更新直播对局失败: " : "") + err.message);
    }
  }

  async function setScene(value) {
    try {
      await API.setOverlayState(tid, value, tournament.overlay_round || Math.max(...(overlayMatches?.map((m) => m.round) || [1])), undefined, channel);
      onclearhud?.();
      toast.success("大屏显示场景已切换为: " + value.toUpperCase());
    } catch (err) {
      toast.error("切换大屏场景失败: " + err.message);
    }
  }

  async function setStage(key) {
    const stage = overlayStageList.find((st) => st.key === key);
    if (!stage) return;
    try {
      await API.setOverlayState(tid, tournament.overlay_scene || "intro", stage.round, stage.key, channel);
      toast.success("大屏展示轮次已更改为: " + stage.label);
    } catch (err) {
      toast.error("更改大屏轮次失败: " + err.message);
    }
  }

  // Match start countdown: the overlays show it on every scene but the HUD
  // and switch to the HUD when it runs out. Counted on the server's clock.
  let clockOffset = $state(0);
  $effect(() => {
    const at = Date.parse(tournament?.synced_at || "");
    if (Number.isFinite(at)) clockOffset = at - Date.now();
  });
  let now = $state(Date.now());
  $effect(() => {
    if (!tournament?.countdown_end) return;
    now = Date.now();
    const timer = setInterval(() => (now = Date.now()), 500);
    return () => clearInterval(timer);
  });
  let countdown = $derived(countdownState(tournament?.countdown_end, now, clockOffset));
  let countdownMinutes = $state(5);
  let countdownTime = $state("");

  async function startCountdown(body, label) {
    try {
      await API.setCountdown(tid, body, channel);
      toast.success(label);
    } catch (err) {
      toast.error("设置倒计时失败: " + err.message);
    }
  }
  function startMinutes(minutes) {
    const m = Number(minutes);
    if (!(m > 0)) return toast.error("请输入大于 0 的分钟数");
    startCountdown({ seconds: Math.round(m * 60) }, `倒计时已开始: ${m} 分钟`);
  }
  // A clock time today (tomorrow when it has passed), on this computer's clock.
  function startAt(value) {
    const [h, m] = String(value).split(":").map(Number);
    if (!Number.isInteger(h) || !Number.isInteger(m)) return toast.error("请选择开始时间");
    const end = new Date();
    end.setHours(h, m, 0, 0);
    if (end.getTime() <= Date.now()) end.setDate(end.getDate() + 1);
    startCountdown({ end: new Date(end.getTime() + clockOffset).toISOString() }, `倒计时到 ${value}`);
  }
  const clearCountdown = () => startCountdown({ clear: true }, "已清除倒计时");

  let liveMatch = $derived(tournament.matches?.find((m) => m.id === tournament.active_match_id));

  // The auto-scene script (tools/wt-autoscene) on the streaming PC: whether
  // it checks in, what the game is doing, pause / resume.
  let gameClock = $state(Date.now());
  $effect(() => {
    const timer = setInterval(() => (gameClock = Date.now()), 5000);
    return () => clearInterval(timer);
  });
  let game = $derived(tournament?.game || null);
  let script = $derived(gameStatus(game, gameClock + clockOffset));
  const GAME_TEXT = { battle: "战斗中", hangar: "在机库", ended: "本局结束（已回到机库）" };
  const offlineText = (ms) =>
    ms < 60_000 ? `离线 · ${Math.max(1, Math.round(ms / 1000))} 秒前还在线` : ms < 3_600_000 ? `离线 · ${Math.round(ms / 60_000)} 分钟前还在线` : "离线";
  async function setPaused(paused) {
    try {
      await API.setAutoscenePaused(tid, paused, channel);
      toast.success(paused ? "已暂停自动切换：大屏按这里选的场景显示" : "已恢复自动切换");
    } catch (err) {
      toast.error("操作失败: " + err.message);
    }
  }
  // A battle of the live match ended: remind whoever is at the console to
  // enter the score.
  let lastGame = null;
  $effect(() => {
    const key = game ? `${game.state}:${game.changed_at}` : null;
    untrack(() => {
      const ended = lastGame && key !== lastGame && game?.state === "ended" && script.live && isAdmin;
      lastGame = key;
      const m = ended && liveMatch && game.match_id === liveMatch.id && liveMatch.status === "pending" ? liveMatch : null;
      if (m) {
        toast.warning("本局结束，请填写比分", {
          description: `${playerName(m.player1_id)} vs ${playerName(m.player2_id)}`,
          duration: 30_000,
          action: onopenmatch ? { label: "录入比分", onClick: () => onopenmatch(m) } : undefined,
        });
      }
    });
  });
  // The auto-scene program (tools/wt-autoscene), rebuilt on every change by .github/workflows/autoscene-exe.yml.
  const AUTOSCENE_DOWNLOAD = "https://github.com/VermilionLP/potato-cup-tournament-platform/releases/download/autoscene/PotatoCup-AutoScene.exe";
</script>

<Card.Root class="border-border bg-card/40">
  <Card.Header class="p-5 pb-3">
    <Card.Title class="text-sm font-bold flex items-center gap-2">
      <SettingsIcon class="w-4 h-4 text-brand-ink" />
      <span>OBS 直播大屏控制</span>
    </Card.Title>
  </Card.Header>
  <Card.Content class="p-5 pt-0 space-y-4 text-xs">
    {#if isAdmin}
      <div class="space-y-1.5">
        <div class="flex items-center justify-between gap-2">
          <span class="font-semibold text-muted-foreground shrink-0">直播频道:</span>
          <select
            class="field-compact font-bold cursor-pointer"
            value={String(channel)}
            onchange={(e) => onchannel?.(Number(e.currentTarget.value))}
          >
            {#each channelChoices as c (c)}
              <option value={String(c)}>频道 {c}</option>
            {/each}
          </select>
        </div>
        <p class="text-small text-muted-foreground leading-normal">
          每个频道有自己的直播对局和大屏，下面的操作只影响当前频道。多路直播要共用一块大屏就选同一个频道，要各自独立就选不同频道。
        </p>
      </div>

      <div class="flex items-center justify-between gap-3 rounded-xl border p-3 {streamMode ? 'border-red-500/40 bg-red-500/10' : 'border-border bg-background/40'}">
        <div class="flex items-center gap-2.5">
          <RadioIcon class="w-4 h-4 shrink-0 {streamMode ? 'text-red-500 animate-pulse' : 'text-muted-foreground'}" />
          <div>
            <div class="text-small font-bold">{streamMode ? "直播状态已激活" : "直播状态未激活"}</div>
            <div class="text-small text-muted-foreground leading-normal">
              激活后本页会强制选择下一场对局并自动切换大屏；仅影响本机，不影响其他访问者。
            </div>
          </div>
        </div>
        <Button
          size="sm"
          variant={streamMode ? "destructive" : "default"}
          class="h-7 text-xs cursor-pointer shrink-0"
          onclick={streamMode ? onstreamend : onstreamstart}
        >
          {streamMode ? "结束直播" : "我要直播"}
        </Button>
      </div>

      <div class="space-y-2">
        <span class="font-semibold text-muted-foreground block">当前直播对局:</span>
        {#if tournament?.matches?.length > 0}
          <select
            class="field-compact w-full"
            value={tournament.active_match_id || ""}
            onchange={(e) => setActive(e.currentTarget.value)}
          >
            <option value="">-- 未选择对局 --</option>
            {#each tournament.matches.filter((m) => m.player1_id && m.player2_id) as m (m.id)}
              {@const other = elsewhere.get(m.id)}
              <option value={m.id} disabled={Boolean(other)}>
                #{matchOrder.get(m.id)} 场次 {m.position} ({roundLabel(m)}): {playerName(m.player1_id)} vs {playerName(m.player2_id)} [{m.status === "completed" ? "完赛" : m.status === "walkover" ? "弃权" : "待赛"}]{other ? ` · 频道 ${other} 直播中` : ""}
              </option>
            {/each}
          </select>
          {#if liveMatch}
            <div class="p-2 rounded bg-primary/5 border border-primary/20 text-small text-brand-ink flex items-center justify-between">
              <span class="font-medium">直播中: {playerName(liveMatch.player1_id)} vs {playerName(liveMatch.player2_id)}</span>
              <button onclick={() => setActive(null)} class="hover:text-destructive font-bold text-xs shrink-0 cursor-pointer">清除</button>
            </div>
          {/if}
        {:else}
          <p class="text-muted-foreground text-small">暂无对局，请先生成 Bracket</p>
        {/if}
      </div>

      <div class="border-t border-border/40 pt-3 space-y-3">
        <span class="font-semibold text-muted-foreground block">直播大屏控制 (Overlay Control):</span>
        <div class="flex flex-col gap-2.5 bg-primary/5 p-3 rounded-xl border border-primary/20">
          <div class="flex items-center justify-between gap-2">
            <span class="font-bold text-brand-ink block text-small shrink-0">当前显示大屏:</span>
            <select
              class="field-compact border-primary/30 text-brand-ink font-bold cursor-pointer"
              value={tournament.overlay_scene || "auto"}
              onchange={(e) => setScene(e.currentTarget.value)}
            >
              <option value="auto">Auto (智能自动模式)</option>
              <option value="intro">Intro (开场对阵轮次列表)</option>
              <option value="hybrid">Hybrid (场间树状对阵图)</option>
              <option value="ingame">HUD (游戏内选手面板)</option>
              <option value="versus">对位预告 (直播对局或下一场)</option>
              <option value="banpick">Ban / Pick (直播对局的禁用与抽取)</option>
            </select>
          </div>

          <div class="flex flex-col gap-2 pt-2 border-t border-primary/10">
            <div class="flex items-center justify-between gap-2">
              <span class="flex items-center gap-1.5 text-small font-bold text-brand-ink shrink-0"><TimerIcon class="w-3.5 h-3.5" />比赛开始倒计时:</span>
              {#if countdown && !countdown.over}
                <span class="num text-sm font-bold text-brand-ink">{formatCountdown(countdown.remaining)}</span>
              {:else if countdown?.over}
                <span class="text-small font-bold text-red-600">已结束 · 大屏显示 HUD</span>
              {:else}
                <span class="text-small text-muted-foreground">未开始</span>
              {/if}
            </div>
            {#if countdown}
              <div class="flex items-center justify-between gap-2">
                <span class="text-small text-muted-foreground leading-normal">
                  {countdown.over ? "清除倒计时或切换场景后，大屏回到上面选的场景。" : "除 HUD 外的大屏右上角显示倒计时，最后 10 秒全屏显示，结束后自动切到 HUD。"}
                </span>
                <Button size="sm" variant="outline" class="h-7 text-xs cursor-pointer shrink-0" onclick={clearCountdown}>
                  {countdown.over ? "清除" : "取消倒计时"}
                </Button>
              </div>
            {/if}
            <div class="flex flex-wrap items-center gap-1.5">
              {#each [1, 3, 5, 10] as m (m)}
                <Button size="sm" variant="outline" class="h-7 px-2.5 text-xs cursor-pointer" onclick={() => startMinutes(m)}>{m} 分钟</Button>
              {/each}
            </div>
            <div class="flex flex-wrap items-center gap-1.5">
              <input type="number" min="1" max="1440" step="1" class="field-compact w-16 num" bind:value={countdownMinutes} aria-label="倒计时分钟数" />
              <span class="text-small text-muted-foreground">分钟</span>
              <Button size="sm" class="h-7 px-2.5 text-xs cursor-pointer" onclick={() => startMinutes(countdownMinutes)}>开始</Button>
              <span class="mx-1 h-4 w-px bg-border"></span>
              <span class="text-small text-muted-foreground">或到</span>
              <input type="time" class="field-compact num" bind:value={countdownTime} aria-label="比赛开始时间" />
              <Button size="sm" variant="outline" class="h-7 px-2.5 text-xs cursor-pointer" onclick={() => startAt(countdownTime)}>设定</Button>
            </div>
          </div>

          <div class="flex flex-col gap-1.5 pt-2 border-t border-primary/10">
            <div class="flex items-center justify-between gap-2">
              <span class="flex items-center gap-1.5 text-small font-bold text-brand-ink shrink-0"><GamepadIcon class="w-3.5 h-3.5" />自动切换脚本:</span>
              {#if !script.seen}
                <span class="text-small text-muted-foreground">未连接</span>
              {:else if script.stale}
                <span class="text-small font-bold text-amber-600 dark:text-amber-400">{offlineText(script.age)}</span>
              {:else}
                <span class="flex items-center gap-1.5 text-small font-bold {script.paused ? 'text-muted-foreground' : 'text-emerald-600 dark:text-emerald-400'}">
                  <span class="h-1.5 w-1.5 rounded-full {script.paused ? 'bg-muted-foreground' : 'bg-emerald-500 animate-pulse'}"></span>
                  <span>{script.paused ? "已暂停" : "在线"}</span><span>{GAME_TEXT[game.state] || "等待游戏"}</span>
                </span>
              {/if}
            </div>
            {#if script.seen}
              <div class="flex items-center justify-between gap-2">
                <span class="text-small text-muted-foreground leading-normal">
                  {script.paused ? "暂停中：大屏只按上面选的场景显示。" : "进入战斗切到 HUD，战斗结束切到对阵图；在上面选场景会接管到下一次状态变化。"}
                </span>
                <Button size="sm" variant="outline" class="h-7 text-xs cursor-pointer shrink-0" onclick={() => setPaused(!script.paused)}>
                  {script.paused ? "恢复自动" : "暂停自动"}
                </Button>
              </div>
            {:else}
              <span class="text-small text-muted-foreground leading-normal">
                在直播电脑上运行自动切换程序（在它的面板里填好网站地址、管理员令牌、赛事和频道），进入战斗和战斗结束时大屏会自动切换。
                <a href={AUTOSCENE_DOWNLOAD} target="_blank" rel="noopener noreferrer" class="font-semibold text-brand-ink underline underline-offset-2 hover:no-underline">下载程序（Windows）</a>
              </span>
            {/if}
          </div>

          {#if tournament.overlay_scene === "intro"}
            <div class="flex items-center justify-between gap-2 pt-2 border-t border-primary/10">
              <span class="text-small font-semibold text-muted-foreground shrink-0">展示轮次:</span>
              <select
                class="field-compact cursor-pointer"
                value={overlayShownStage?.key || ""}
                onchange={(e) => setStage(e.currentTarget.value)}
              >
                {#each overlayStageList as st (st.key)}
                  <option value={st.key}>{st.label}</option>
                {/each}
              </select>
            </div>
          {/if}
        </div>
      </div>
    {/if}

    <div class="border-t border-border/40 pt-3 space-y-3">
      <span class="font-semibold text-muted-foreground block">
        {channel === 1 ? "OBS 浏览器源链接:" : `OBS 浏览器源链接（频道 ${channel}）:`}
      </span>

      <div class="space-y-2.5">
        <div class="space-y-1.5 p-2.5 rounded-xl border border-primary/20 bg-primary/5">
          <span class="font-bold text-brand-ink block text-small">✨ 推荐：全自动智能切换直播源 (Unified Auto)</span>
          <span class="text-small text-muted-foreground block leading-normal mb-1">
            放入 OBS 浏览器源即可（放在游戏画面采集上面，OBS 里只用这一个场景，大屏自己带转场），跟随上面「当前显示大屏」的选择。选 Auto 时：直播对局开启了 Ban/Pick 时显示 Ban/Pick 画面，确认结果后展示抽中的载具 20 秒，再切到游戏 HUD（透明底，已保存实时比分时立即切换；运行自动切换脚本时先显示对位预告，进入战斗才切 HUD）；无直播对局时显示场间对阵大屏（深色底）。
          </span>
          <div class="flex items-center gap-1.5">
            <input
              type="text"
              readonly
              class="field-compact flex-1 border-primary/25 select-all cursor-default text-brand-ink num"
              value={autoUrl}
            />
            <Button
              size="icon-xs"
              class="h-7 w-7 cursor-pointer shrink-0 bg-primary text-black hover:bg-primary/90"
              onclick={(e) => copy(autoUrl, "已复制全自动智能直播源链接", e)}
            >
              <CopyIcon class="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        <div class="h-px bg-border/40 my-2"></div>
        <span class="text-small font-bold text-muted-foreground block">特定单场景链接 (如有需要手动配置):</span>

        {#each sceneLinks as link (link.key)}
          <div class="space-y-1">
            <div class="flex justify-between items-center">
              <span class="font-medium">{link.title}</span>
              {#if link.key === "intro"}
                <div class="flex items-center gap-1">
                  <span class="text-small text-muted-foreground">轮次:</span>
                  <select class="field-compact h-6 px-1" bind:value={introStage}>
                    <option value="">当前轮次（自动）</option>
                    {#each overlayStageList as st (st.key)}
                      <option value={st.key}>{st.label}</option>
                    {/each}
                  </select>
                </div>
              {/if}
            </div>
            <div class="flex items-center gap-1.5">
              <input
                type="text"
                readonly
                class="field-compact flex-1 bg-muted/30 select-all cursor-default"
                value={link.url}
              />
              <Button size="icon-xs" variant="outline" class="h-7 w-7 cursor-pointer shrink-0" onclick={(e) => copy(link.url, link.copied, e)}>
                <CopyIcon class="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        {/each}
      </div>
    </div>
  </Card.Content>
</Card.Root>
