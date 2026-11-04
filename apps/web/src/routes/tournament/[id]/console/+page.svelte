<script>
  // Match-day console (admins): one screen with the live channels, results
  // to settle (disputes, walkover claims), scores waiting for confirmation,
  // matches ready to play and waiting ones, and check-in before the start.
  // Board maths in #lib/match-day.js; reporting goes through MatchReport.
  import { onMount, untrack } from "svelte";
  import { toast } from "svelte-sonner";
  import { page } from "$app/state";
  import { API } from "#lib/api.js";
  import { userState } from "#lib/user.svelte.js";
  import { buildMatchOrder } from "#lib/bracket.js";
  import { eventStatusLabel, playerNamer, roundLabeler, bracketMatchesOf } from "#lib/event-view.js";
  import { matchDayBoard } from "#lib/match-day.js";
  import { formatReport } from "#lib/match-card.js";
  import { channelOptions, savedChannel, saveChannel, withChannel } from "#lib/live-channels.js";
  import { liveSync } from "#lib/live-sync.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import Flag from "#lib/components/Flag.svelte";
  import ContactBadges from "#lib/components/players/ContactBadges.svelte";
  import MatchReport from "#lib/components/tournament/MatchReport.svelte";
  import StartCheckinDialog from "#lib/components/tournament/StartCheckinDialog.svelte";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import RadioIcon from "@lucide/svelte/icons/radio";

  let tid = $derived(page.params.id);
  let tournament = $state(null);
  let loading = $state(true);
  let isAdmin = $derived(!!userState.adminToken);
  let channel = $state(1);
  let now = $state(Date.now());
  let matchReport = $state(null);
  let startDialog = $state(null);

  let bracketMatches = $derived(bracketMatchesOf(tournament));
  let order = $derived(buildMatchOrder(tournament?.matches || []));
  let playerName = $derived(playerNamer(tournament, bracketMatches));
  let roundLabel = $derived(roundLabeler(tournament, bracketMatches));
  let board = $derived(matchDayBoard(tournament, order, now));
  let live = $derived(withChannel(tournament, channel));
  let channels = $derived(channelOptions(tournament, channel));
  let playerOf = (id) => tournament?.players?.find((p) => p.id === id) || { id, display_name: id };

  async function load() {
    try {
      tournament = await API.getTournament(tid);
    } catch (e) {
      toast.error("加载赛事失败: " + e.message);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    const clock = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(clock);
  });

  $effect(() => {
    if (!tid) return;
    const id = tid;
    channel = savedChannel(id);
    load();
    return liveSync(id, {
      current: () => untrack(() => tournament),
      apply: (next) => {
        if (id === tid) tournament = next;
      },
    });
  });

  function ensureAdmin() {
    if (isAdmin) return true;
    toast.error("此操作需要管理员权限，请先点击右上角盾牌图标登录");
    return false;
  }

  function changeChannel(c) {
    channel = c;
    saveChannel(tid, c);
  }

  async function goLive(match) {
    if (!ensureAdmin()) return;
    const isActive = live?.active_match_id === match.id;
    try {
      await API.setActiveMatch(tid, isActive ? null : match.id, channel);
      toast.success(isActive ? `已取消频道 ${channel} 的直播` : `频道 ${channel} 开始直播这场`);
      await load();
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function checkIn(playerId) {
    if (!ensureAdmin()) return;
    try {
      await API.checkIn(tid, playerId);
      toast.success(`已替 ${playerId} 签到`);
      await load();
    } catch (e) {
      toast.error(e.message);
    }
  }
</script>

<svelte:head><title>比赛日控制台{tournament?.name ? ` · ${tournament.name}` : ""} · Potato Cup</title></svelte:head>

{#snippet versus(m)}
  <span class="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 min-w-0">
    {#each [m.player1_id, m.player2_id] as pid, i (i)}
      {#if i === 1}<span class="text-muted-foreground text-[10px]">vs</span>{/if}
      {#if pid}
        <span class="inline-flex items-center gap-1 font-semibold">
          <Flag code={playerOf(pid).flag} size={13} />
          {playerName(pid)}
        </span>
      {:else}
        <span class="italic text-muted-foreground">待定</span>
      {/if}
    {/each}
  </span>
{/snippet}

{#snippet matchRow(m, actions)}
  <div class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-xs">
    <div class="min-w-0 space-y-0.5">
      <div class="text-[10px] text-muted-foreground">#{order.get(m.id) ?? "?"} · {roundLabel(m)}</div>
      {@render versus(m)}
    </div>
    <div class="flex flex-wrap items-center gap-1.5">{@render actions(m)}</div>
  </div>
{/snippet}

{#snippet section(title, count, tone, body)}
  <section class="rounded-xl border bg-card/40 p-4 space-y-2 {tone}">
    <h2 class="text-sm font-bold flex items-center justify-between">
      <span>{title}</span>
      <span class="text-xs font-mono text-muted-foreground">{count}</span>
    </h2>
    {@render body()}
  </section>
{/snippet}

{#if loading}
  <div class="py-20 text-center text-sm text-muted-foreground">正在加载...</div>
{:else if !tournament}
  <div class="py-16 text-center text-sm">赛事不存在</div>
{:else if !isAdmin}
  <div class="py-16 text-center space-y-2">
    <p class="text-sm font-semibold">比赛日控制台只对管理员开放</p>
    <a href="/tournament/{encodeURIComponent(tid)}" class="text-xs text-primary hover:underline">返回赛事页</a>
  </div>
{:else}
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
      <div class="space-y-0.5">
        <a href="/tournament/{encodeURIComponent(tid)}" class="text-[11px] text-muted-foreground hover:text-primary inline-flex items-center gap-1"><ArrowLeftIcon class="w-3 h-3" /> 赛事页</a>
        <h1 class="text-lg font-black">{tournament.name} · 比赛日控制台</h1>
        <div class="text-xs text-muted-foreground">
          {eventStatusLabel(tournament.status)}
          {#if board.total}· 已完成 {board.done} / {board.total} 场{/if}
          {#if tournament.checkin?.enabled && tournament.status === "registration"}· 已签到 {board.checkedIn} / {board.players}{/if}
        </div>
      </div>
      <div class="flex items-center gap-2 text-xs">
        <span class="text-muted-foreground">我的直播频道</span>
        <select value={channel} onchange={(e) => changeChannel(Number(e.currentTarget.value))} class="rounded-md border border-border bg-background px-2 py-1">
          {#each channels as c (c)}
            <option value={c}>频道 {c}</option>
          {/each}
        </select>
        {#if tournament.status === "registration" && tournament.checkin?.enabled}
          <Button size="sm" onclick={() => startDialog?.start()} class="font-bold">结束报名并开赛</Button>
        {/if}
      </div>
    </div>

    <!-- Summary -->
    <div class="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
      {#each [["直播中", board.live.length, "text-sky-500"], ["待处理", board.disputed.length, board.disputed.length ? "text-destructive" : ""], ["待确认", board.toConfirm.length, ""], ["可开打", board.ready.length, board.ready.length ? "text-primary" : ""], ["等待中", board.waiting.length, ""]] as [label, n, cls] (label)}
        <div class="rounded-lg border border-border bg-card/40 py-2">
          <div class="text-xl font-black {cls}">{n}</div>
          <div class="text-[11px] text-muted-foreground">{label}</div>
        </div>
      {/each}
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div class="space-y-4">
        {#snippet disputedBody()}
          {#each board.disputed as m (m.id)}
            {#snippet acts(m)}
              <Button size="sm" variant="outline" onclick={() => matchReport?.openDetails(m)} class="h-7 text-xs border-destructive/40 text-destructive">处理</Button>
            {/snippet}
            <div class="space-y-1">
              {@render matchRow(m, acts)}
              <div class="px-3 text-[11px] text-muted-foreground">
                {playerName(m.pending_report.by)} 提交：{formatReport(m, m.pending_report, playerName)}
                {#if m.pending_report.counter}· {playerName(m.pending_report.counter.by)} 提交：{formatReport(m, m.pending_report.counter, playerName)}{/if}
              </div>
            </div>
          {:else}
            <p class="text-xs text-muted-foreground italic">没有需要处理的结果</p>
          {/each}
        {/snippet}
        {@render section("需要管理员处理（争议、弃权申报）", board.disputed.length, board.disputed.length ? "border-destructive/40" : "border-border", disputedBody)}

        {#snippet readyBody()}
          {#each board.ready as m (m.id)}
            {#snippet acts(m)}
              <Button size="sm" variant="outline" onclick={() => goLive(m)} class="h-7 text-xs">频道 {channel} 直播</Button>
              <Button size="sm" onclick={() => matchReport?.openDetails(m)} class="h-7 text-xs">填报</Button>
            {/snippet}
            <div class="space-y-1">
              {@render matchRow(m, acts)}
              <div class="flex flex-wrap gap-1 px-3">
                <ContactBadges tags={playerOf(m.player1_id).battle_tags} compact empty="" />
                <ContactBadges tags={playerOf(m.player2_id).battle_tags} compact empty="" />
              </div>
            </div>
          {:else}
            <p class="text-xs text-muted-foreground italic">没有可以开打的比赛</p>
          {/each}
        {/snippet}
        {@render section("可以开打", board.ready.length, "border-border", readyBody)}
      </div>

      <div class="space-y-4">
        {#snippet liveBody()}
          {#each board.live as x (x.channel)}
            {#snippet acts(m)}
              <span class="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-bold text-sky-500 inline-flex items-center gap-1"><RadioIcon class="w-3 h-3" />频道 {x.channel}</span>
              <Button size="sm" onclick={() => matchReport?.openDetails(m)} class="h-7 text-xs">填报</Button>
            {/snippet}
            {@render matchRow(x.match, acts)}
          {:else}
            <p class="text-xs text-muted-foreground italic">没有正在直播的比赛</p>
          {/each}
        {/snippet}
        {@render section("直播中", board.live.length, "border-sky-500/30", liveBody)}

        {#snippet confirmBody()}
          {#each board.toConfirm as x (x.match.id)}
            {#snippet acts(m)}
              <span class="text-[10px] text-muted-foreground">{x.minutes ? `约 ${x.minutes} 分钟后自动生效` : "即将自动生效"}</span>
              <Button size="sm" variant="outline" onclick={() => matchReport?.confirmReport(m)} class="h-7 text-xs">直接确认</Button>
            {/snippet}
            <div class="space-y-1">
              {@render matchRow(x.match, acts)}
              <div class="px-3 text-[11px] text-muted-foreground">{playerName(x.match.pending_report.by)} 提交：{formatReport(x.match, x.match.pending_report, playerName)}</div>
            </div>
          {:else}
            <p class="text-xs text-muted-foreground italic">没有待确认的比分</p>
          {/each}
        {/snippet}
        {@render section("等待对手确认", board.toConfirm.length, "border-border", confirmBody)}

        {#snippet waitingBody()}
          {#each board.waiting as m (m.id)}
            {#snippet acts(m)}<span class="text-[10px] text-muted-foreground">等上一场</span>{/snippet}
            {@render matchRow(m, acts)}
          {:else}
            <p class="text-xs text-muted-foreground italic">没有等待中的比赛</p>
          {/each}
        {/snippet}
        {@render section("等待对手（上一场未完）", board.waiting.length, "border-border", waitingBody)}

        {#if tournament.status === "registration" && tournament.checkin?.enabled}
          {#snippet absentBody()}
            <div class="flex flex-wrap gap-1.5">
              {#each board.absent as p (p.id)}
                <button type="button" onclick={() => checkIn(p.id)} title="替该选手签到" class="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:border-primary cursor-pointer">
                  <Flag code={p.flag} size={13} />{p.display_name}
                </button>
              {:else}
                <p class="text-xs text-muted-foreground italic">所有选手都已签到</p>
              {/each}
            </div>
          {/snippet}
          {@render section("还没签到", board.absent.length, "border-amber-500/30", absentBody)}
        {/if}
      </div>
    </div>
  </div>

  <MatchReport
    bind:this={matchReport}
    {tournament}
    {tid}
    {isAdmin}
    banpickEnabled={false}
    bpTemplate={null}
    {playerName}
    matchRoundLabel={roundLabel}
    {live}
    liveChannel={channel}
    handoff={null}
    {ensureAdmin}
    needsIdentity={() => false}
    onreload={load}
  />
  <StartCheckinDialog bind:this={startDialog} {tid} {tournament} onstarted={() => load()} />
{/if}
