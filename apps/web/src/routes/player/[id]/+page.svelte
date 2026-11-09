<script>
  // Player page: the player card (PlayerCard: profile, league, MMR
  // sparkline, recent form, favourite vehicles), titles and placings, MMR curve, records per event
  // type and game mode, this season's points and head-to-head records. All
  // from existing endpoints (/players/:id, /players/statistics,
  // /ladder/players/:id, /points-leaderboard); maths in #lib/player-profile.js.
  import { EmptyState } from "#lib/components/ui/empty-state/index.js";
  import PageSkeleton from "#lib/components/PageSkeleton.svelte";
  import { page } from "$app/state";
  import { API } from "#lib/api.js";
  import { TIER_TAG, tierBreakdown } from "#lib/tournament.js";
  import { placeClass, placeText } from "#lib/stats-view.js";
  import { eventRows, headToHead, modeRows, opponentsOf, pointsRows, poolRows } from "#lib/player-profile.js";
  import * as Card from "#lib/components/ui/card/index.js";
  import PlayerCard from "#lib/components/players/PlayerCard.svelte";
  import DivisionPicker from "#lib/components/ladder/DivisionPicker.svelte";
  import MmrChart from "#lib/components/ladder/mmr-chart.svelte";
  import TrophyIcon from "@lucide/svelte/icons/trophy";
  import MedalIcon from "@lucide/svelte/icons/medal";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";

  let id = $derived(page.params.id);

  let profile = $state(null);
  let stats = $state(null); // this player's row of /players/statistics
  let points = $state([]);
  let ladder = $state(null); // /ladder/players/:id of the chosen division
  let ladderAll = $state(null); // all divisions, for opponents and head-to-head
  let loading = $state(true);
  let notFound = $state(false);
  let division = $state({ mode: "", pool: "" });
  let chartMode = $state("time");
  let opponentId = $state("");

  async function loadAll(playerId) {
    loading = true;
    notFound = false;
    profile = stats = ladder = ladderAll = null;
    points = [];
    opponentId = "";
    division = { mode: "", pool: "" };
    try {
      profile = await API.getPlayer(playerId);
    } catch {
      notFound = true;
      loading = false;
      return;
    }
    const [statistics, overall, board] = await Promise.all([
      API.getPlayerStatistics().catch(() => null),
      API.getLadderPlayer(playerId).catch(() => null),
      API.getPointsLeaderboard("").catch(() => null),
    ]);
    if (playerId !== id) return;
    stats = statistics?.players?.find((p) => p.id === playerId) || null;
    ladder = ladderAll = overall;
    points = pointsRows(board?.boards || [], playerId);
    loading = false;
  }

  $effect(() => {
    if (id) loadAll(id);
  });

  async function changeDivision(mode, pool) {
    division = { mode, pool };
    ladder = !mode && !pool ? ladderAll : await API.getLadderPlayer(id, { mode, pool }).catch(() => null);
  }

  let opponents = $derived(opponentsOf(ladderAll?.history || []));
  let h2h = $derived(opponentId ? headToHead(ladderAll?.history || [], opponentId) : null);
  let events = $derived(eventRows(stats?.tournaments || []));
  let pools = $derived(poolRows(stats?.pools));
  let modes = $derived(modeRows(stats?.modes));
  let name = $derived(profile?.display_name || profile?.id || id);
  const pct = (v) => `${Math.round((v || 0) * 100)}%`;
</script>

<svelte:head><title>{name} · Potato Cup</title></svelte:head>

{#if loading && !notFound}
  <PageSkeleton kind="profile" label="正在加载选手资料..." />
{:else if notFound}
  <div class="text-center py-16 border border-border bg-card/30 rounded-2xl max-w-xl mx-auto space-y-3">
    <h2 class="text-lg font-bold">找不到选手 {id}</h2>
    <a href="/players" class="text-xs text-brand-ink hover:underline inline-flex items-center gap-1"><ArrowLeftIcon class="w-3.5 h-3.5" /> 返回选手列表</a>
  </div>
{:else}
  <div class="space-y-6">
    <PlayerCard {profile} ladder={ladderAll} {name} />

    <!-- Summary -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div class="rounded-xl border border-border bg-card/40 p-3">
        <div class="text-small text-muted-foreground flex items-center gap-1"><TrophyIcon class="w-3.5 h-3.5 text-amber-500" /> 冠军</div>
        <div class="text-2xl font-black text-amber-500">{stats?.championships ?? 0}</div>
        <div class="flex flex-wrap gap-0.5">
          {#each tierBreakdown(stats?.championships_by_tier) as t (t.id)}
            <span class="rounded border px-1 text-small font-bold {TIER_TAG[t.id] || 'border-border text-muted-foreground'}">{t.id === "none" ? "未分级" : t.id} ×{t.count}</span>
          {/each}
        </div>
      </div>
      <div class="rounded-xl border border-border bg-card/40 p-3">
        <div class="text-small text-muted-foreground flex items-center gap-1"><MedalIcon class="w-3.5 h-3.5 text-slate-400" /> 亚军</div>
        <div class="text-2xl font-black text-slate-400">{stats?.runner_ups ?? 0}</div>
        <div class="text-small text-muted-foreground">最佳 {stats?.best_place ? placeText(stats.best_place) : "—"}</div>
      </div>
      <div class="rounded-xl border border-border bg-card/40 p-3">
        <div class="text-small text-muted-foreground">参赛 / 对局</div>
        <div class="text-2xl font-black">{stats?.tournaments_played ?? 0} <span class="text-sm font-semibold text-muted-foreground">/ {stats?.matches_played ?? 0}</span></div>
        <div class="text-small text-muted-foreground">{stats?.matches_won ?? 0} 胜 {stats?.matches_lost ?? 0} 负 · 胜率 {pct(stats?.match_win_rate)}</div>
      </div>
      <div class="rounded-xl border border-border bg-card/40 p-3">
        <div class="text-small text-muted-foreground">小局</div>
        <div class="text-2xl font-black">{pct(stats?.map_win_rate)}</div>
        <div class="text-small text-muted-foreground">{stats?.maps_won ?? 0} : {stats?.maps_lost ?? 0}{stats?.walkover_losses ? ` · 弃权 ${stats.walkover_losses}` : ""}</div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="lg:col-span-2 space-y-6">
        <!-- MMR -->
        <Card.Root class="border-border bg-card/40">
          <Card.Header class="p-5 pb-2 space-y-2">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <Card.Title class="text-sm font-bold">天梯 MMR 曲线</Card.Title>
              <div class="inline-flex rounded-lg border border-border bg-muted/30 p-0.5 text-small">
                {#each [["time", "按时间"], ["game", "按场次"]] as [value, label] (value)}
                  <button type="button" onclick={() => (chartMode = value)} class="px-2 py-0.5 rounded-md cursor-pointer {chartMode === value ? 'bg-background shadow-sm font-semibold' : 'text-muted-foreground'}">{label}</button>
                {/each}
              </div>
            </div>
            <DivisionPicker mode={division.mode} pool={division.pool} onchange={changeDivision} />
          </Card.Header>
          <Card.Content class="p-5 pt-2">
            {#if ladder?.history?.length}
              <div class="text-xs text-muted-foreground mb-2">当前 <span class="num font-bold text-foreground">{ladder.mmr}</span> · {ladder.games} 场</div>
              <MmrChart history={ladder.history} mode={chartMode} />
            {:else}
              <EmptyState compact title="这个分组还没有天梯比赛" />
            {/if}
          </Card.Content>
        </Card.Root>

        <!-- Events -->
        <Card.Root class="border-border bg-card/40">
          <Card.Header class="p-5 pb-2"><Card.Title class="text-sm font-bold">参赛历史</Card.Title></Card.Header>
          <Card.Content class="p-5 pt-0">
            <div class="divide-y divide-border/50">
              {#each events as e (e.id)}
                <a href="/tournament/{encodeURIComponent(e.id)}" class="flex items-center justify-between gap-3 py-2 text-xs hover:text-brand-ink">
                  <span class="truncate">{e.name}{e.qualifier ? "（预选赛）" : ""}</span>
                  {#if e.place}
                    <span class="shrink-0 rounded px-1.5 py-0.5 text-small font-bold {placeClass(e.place)}">{placeText(e.place)}</span>
                  {:else}
                    <span class="shrink-0 text-small text-muted-foreground">进行中</span>
                  {/if}
                </a>
              {:else}
                <EmptyState compact title="还没有参赛记录" />
              {/each}
            </div>
          </Card.Content>
        </Card.Root>
      </div>

      <div class="space-y-6">
        <!-- Points -->
        <Card.Root class="border-border bg-card/40">
          <Card.Header class="p-5 pb-2"><Card.Title class="text-sm font-bold">本赛季积分</Card.Title></Card.Header>
          <Card.Content class="p-5 pt-0 space-y-1.5">
            {#each points as r (r.pool)}
              <a href="/points" class="flex items-center justify-between text-xs rounded-lg border border-border/60 bg-background/40 px-3 py-1.5 hover:border-primary/40">
                <span class="font-semibold">{r.name}</span>
                <span><span class="num font-black">{r.total}</span> 分 · 第 {r.rank} / {r.of} 名</span>
              </a>
            {:else}
              <p class="text-xs text-muted-foreground italic py-2">本赛季还没有积分</p>
            {/each}
          </Card.Content>
        </Card.Root>

        <!-- Records by event type / mode -->
        <Card.Root class="border-border bg-card/40">
          <Card.Header class="p-5 pb-2"><Card.Title class="text-sm font-bold">分类战绩</Card.Title></Card.Header>
          <Card.Content class="p-5 pt-0 space-y-3">
            {#each [["比赛类型", pools], ["游戏模式", modes]] as [title, rows] (title)}
              {#if rows.length}
                <div class="space-y-1">
                  <div class="text-small text-muted-foreground">{title}</div>
                  {#each rows as r (r.id)}
                    <div class="flex items-center justify-between text-xs">
                      <span class="font-semibold">{r.name}</span>
                      <span class="text-muted-foreground">{r.tournaments} 场赛事 · {r.won} 胜 {r.lost} 负 · <span class="text-foreground num">{pct(r.rate)}</span></span>
                    </div>
                  {/each}
                </div>
              {/if}
            {/each}
            {#if stats?.nemesis || stats?.favorite}
              <div class="text-small text-muted-foreground space-y-0.5 pt-1 border-t border-border/50">
                {#if stats.nemesis}<div>苦主：<a class="text-foreground hover:text-brand-ink" href="/player/{encodeURIComponent(stats.nemesis.id)}">{stats.nemesis.display_name}</a>（输 {stats.nemesis.count} 场）</div>{/if}
                {#if stats.favorite}<div>常胜对手：<a class="text-foreground hover:text-brand-ink" href="/player/{encodeURIComponent(stats.favorite.id)}">{stats.favorite.display_name}</a>（赢 {stats.favorite.count} 场）</div>{/if}
              </div>
            {/if}
          </Card.Content>
        </Card.Root>

        <!-- Head to head -->
        <Card.Root class="border-border bg-card/40">
          <Card.Header class="p-5 pb-2"><Card.Title class="text-sm font-bold">交手记录</Card.Title></Card.Header>
          <Card.Content class="p-5 pt-0 space-y-3">
            {#if opponents.length}
              <select bind:value={opponentId} class="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs">
                <option value="">选择对手…</option>
                {#each opponents as o (o.id)}
                  <option value={o.id}>{o.name}（{o.won} 胜 {o.lost} 负）</option>
                {/each}
              </select>
              {#if h2h}
                <div class="text-center">
                  <div class="text-2xl font-black num">{h2h.won} : {h2h.lost}</div>
                  <div class="text-small text-muted-foreground">小局 {h2h.mapsFor} : {h2h.mapsAgainst} · 胜率 {pct(h2h.rate)}</div>
                </div>
                <div class="divide-y divide-border/50 max-h-64 overflow-y-auto">
                  {#each h2h.games as g (g.game_id)}
                    <a href="/tournament/{encodeURIComponent(g.tournament_id)}" class="flex items-center justify-between gap-2 py-1.5 text-small hover:text-brand-ink">
                      <span class="truncate">{g.tournament_name}</span>
                      <span class="shrink-0 num font-bold {g.won ? 'text-emerald-500' : 'text-destructive'}">{g.score_for} : {g.score_against}</span>
                    </a>
                  {/each}
                </div>
                <a href="/player/{encodeURIComponent(opponentId)}" class="block text-center text-small text-brand-ink hover:underline">查看对手主页</a>
              {/if}
            {:else}
              <EmptyState compact title="还没有计入天梯的对局" />
            {/if}
          </Card.Content>
        </Card.Root>
      </div>
    </div>
  </div>
{/if}
