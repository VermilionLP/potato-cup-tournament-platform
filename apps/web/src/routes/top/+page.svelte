<script>
  // 年度 Top20 (排行 tab): after a season, its 20 best players revealed one a
  // day from #20 up to #1 (GET /seasons/:season/top; apps/api/lib/season-top.js).
  // Places still to come show only when they'll be revealed; revealed ones
  // show the player's season in numbers and their recap image. Admins edit
  // the list and the start time (TopAdmin, loaded on demand).
  import { onMount, onDestroy } from "svelte";
  import { toast } from "svelte-sonner";
  import { page } from "$app/state";
  import { replaceState } from "$app/navigation";
  import { API } from "#lib/api.js";
  import { userState } from "#lib/user.svelte.js";
  import { lazy } from "#lib/lazy.js";
  import { countdown, formatInZone } from "#lib/datetime.js";
  import { revealDate } from "#lib/season-top.js";
  import PageHeader from "#lib/components/PageHeader.svelte";
  import RankingTabs from "#lib/components/rankings/RankingTabs.svelte";
  import PageSkeleton from "#lib/components/PageSkeleton.svelte";
  import Flag from "#lib/components/Flag.svelte";
  import { EmptyState } from "#lib/components/ui/empty-state/index.js";
  import { FilterBar, FilterGroup } from "#lib/components/ui/filter-group/index.js";
  import SwordsIcon from "@lucide/svelte/icons/swords";
  import CrownIcon from "@lucide/svelte/icons/crown";
  import LockIcon from "@lucide/svelte/icons/lock";
  import HourglassIcon from "@lucide/svelte/icons/hourglass";
  import ImageIcon from "@lucide/svelte/icons/image";
  import PartyPopperIcon from "@lucide/svelte/icons/party-popper";

  const loadAdmin = lazy(() => import("#lib/components/rankings/TopAdmin.svelte"));
  const loadRecapDialog = lazy(() => import("#lib/components/players/SeasonRecapDialog.svelte"));

  let isAdmin = $derived(!!userState.adminToken);
  let seasons = $state([]);
  let season = $state("");
  let data = $state(null);
  let loading = $state(true);
  let now = $state(Date.now());
  let recapFor = $state("");
  let recapOpen = $state(false);

  async function load() {
    if (!season) return;
    try {
      data = await API.getSeasonTop(season);
    } catch (e) {
      toast.error("加载年度 Top20 失败: " + e.message);
    } finally {
      loading = false;
    }
  }

  onMount(async () => {
    try {
      const res = await API.getPointsSeasons();
      seasons = (res?.seasons || []).map((s) => (typeof s === "string" ? s : s?.season)).filter(Boolean);
      const asked = page.url.searchParams.get("season");
      // The newest season with a Top 20 started is the likely one; else the newest.
      season = asked && seasons.includes(asked) ? asked : seasons[0] || String(new Date().getFullYear());
    } catch {
      season = String(new Date().getFullYear());
    }
    await load();
  });

  // Tick for the countdown; reload when the next place is due.
  const timer = setInterval(() => {
    now = Date.now();
    const due = data?.next?.at ? new Date(data.next.at).getTime() : null;
    const begins = !data?.started && data?.start_at ? new Date(data.start_at).getTime() : null;
    if ((due && now >= due + 2000) || (begins && now >= begins + 2000)) load();
  }, 1000);
  onDestroy(() => clearInterval(timer));

  async function pickSeason(s) {
    if (s === season) return;
    season = s;
    loading = true;
    data = null;
    const url = new URL(page.url.href);
    url.searchParams.set("season", s);
    replaceState(url, {});
    await load();
  }

  function openRecap(id) {
    recapFor = id;
    recapOpen = true;
  }

  // #1 first: places to come (locked), then the revealed ones.
  let revealed = $derived([...(data?.revealed || [])].sort((a, b) => a.rank - b.rank));
  let locked = $derived.by(() => {
    if (!data?.size) return [];
    const out = [];
    for (let rank = 1; rank <= data.size - (data.revealed?.length || 0); rank += 1) {
      out.push({ rank, at: revealDate(data.start_at, rank, data.size) });
    }
    return out;
  });
  let nextAt = $derived(data?.next ? new Date(data.next.at) : data?.start_at && !data?.started ? new Date(data.start_at) : null);
  let left = $derived(nextAt ? countdown(nextAt, new Date(now)) : null);

  const MEDAL = { 1: "bg-amber-400 text-amber-950", 2: "bg-slate-300 text-slate-900", 3: "bg-orange-400/80 text-orange-950" };
  const RING = { 1: "border-amber-400/60 bg-amber-400/5", 2: "border-slate-300/60 bg-slate-300/5", 3: "border-orange-400/50 bg-orange-400/5" };
  const pct = (v) => (v == null ? "—" : `${Math.round(v * 100)}%`);
  const shortName = (name) => String(name || "").replace(/^(FamilyX\s+)?Potato Cup\s+/i, "");
  const placeText = (b) => (b.to > b.place ? `${b.place}-${b.to}` : `${b.place}`);
  const when = (d) => (d ? formatInZone(d) : "");
</script>

<svelte:head><title>年度 Top20 · 排行 · Potato Cup</title></svelte:head>

<div class="space-y-6">
  <div class="space-y-3">
    <PageHeader title="排行" icon={SwordsIcon} description="年度 Top20：赛季结束后从第 20 名开始，每天揭晓一位选手，直到第 1 名">
      {#snippet more()}
        <p>名单由系统按本赛季各类型年度积分之和排出，管理员可以调整。每天同一时间揭晓一位，QQ 群机器人同步公布。还没揭晓的名次只显示揭晓时间。</p>
      {/snippet}
    </PageHeader>
    <RankingTabs />
    {#if seasons.length > 1}
      <FilterBar>
        <FilterGroup label="赛季" value={season} onpick={pickSeason} options={seasons.map((s) => ({ id: s, label: `${s} 赛季` }))} />
      </FilterBar>
    {/if}
  </div>

  {#if loading && !data}
    <PageSkeleton kind="table" label="加载中..." rows={8} />
  {:else if data}
    {#if isAdmin}
      {#await loadAdmin() then m}
        <m.default {season} {data} onchanged={load} />
      {/await}
    {/if}

    {#if !data.size || !data.start_at}
      <EmptyState title="{season} 年度 Top20 还没有公布" hint="赛季结束后会排出 20 位选手，从第 20 名开始每天揭晓一位。" />
    {:else}
      <!-- What's next -->
      <div class="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
        {#if data.done}
          <PartyPopperIcon class="h-6 w-6 text-amber-500" />
          <div>
            <div class="text-sm font-bold">{season} 年度 Top20 全部揭晓！</div>
            <div class="text-small text-muted-foreground">恭喜 {revealed[0]?.recap?.player?.name || revealed[0]?.id} 获得年度第 1 名</div>
          </div>
        {:else if left}
          <HourglassIcon class="h-6 w-6 text-brand-ink" />
          <div class="min-w-0 flex-1">
            <div class="text-sm font-bold">{data.started ? `下一位：第 ${data.next.rank} 名` : `${season} 年度 Top20 即将开始揭晓`}</div>
            <div class="text-small text-muted-foreground">{when(nextAt)} 揭晓</div>
          </div>
          <div class="num text-xl font-black tabular-nums text-brand-ink">{left.phase === "before" ? left.text : "揭晓中…"}</div>
        {/if}
      </div>

      <ol class="space-y-2">
        {#each locked as l (l.rank)}
          <li class="flex items-center gap-3 rounded-lg border border-dashed border-border/80 bg-muted/10 px-3 py-2 text-sm text-muted-foreground">
            <span class="num flex h-7 w-9 shrink-0 items-center justify-center rounded-md bg-muted/60 font-black">{l.rank}</span>
            <LockIcon class="h-3.5 w-3.5 shrink-0" />
            <span class="flex-1">第 {l.rank} 名</span>
            <span class="text-small">{when(l.at)} 揭晓</span>
          </li>
        {/each}
        {#each revealed as r (r.rank)}
          {@const s = r.recap}
          <li class="rounded-xl border p-3 sm:p-4 {RING[r.rank] || 'border-border bg-card'}">
            <div class="flex flex-wrap items-center gap-3">
              <span class="num flex h-10 w-12 shrink-0 items-center justify-center rounded-lg text-lg font-black {MEDAL[r.rank] || 'bg-muted text-foreground'}">
                {#if r.rank === 1}<CrownIcon class="mr-0.5 h-4 w-4" />{/if}{r.rank}
              </span>
              <a href="/player/{encodeURIComponent(r.id)}" class="flex min-w-0 flex-1 items-center gap-2 hover:text-brand-ink">
                <Flag code={s?.player?.flag} size={18} />
                <span class="truncate text-base font-black sm:text-lg">{s?.player?.name || r.id}</span>
              </a>
              {#if s?.points}
                <span class="num shrink-0 text-sm font-bold text-amber-600 dark:text-amber-400">{s.points.total} 分</span>
              {/if}
              <button type="button" onclick={() => openRecap(r.id)} class="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-small font-semibold hover:border-primary/50 hover:text-brand-ink cursor-pointer">
                <ImageIcon class="h-3.5 w-3.5" />赛季回顾
              </button>
            </div>
            {#if s}
              <div class="num mt-2 flex flex-wrap gap-x-4 gap-y-1 text-small text-muted-foreground">
                <span>参赛 {s.events} 场</span>
                <span>{s.wins} 胜 {s.losses} 负 · 胜率 {pct(s.win_rate)}</span>
                {#if s.titles}<span class="font-semibold text-amber-600 dark:text-amber-400">冠军 {s.titles} 次</span>{/if}
                {#if s.best && !s.titles}<span>最佳成绩：第 {placeText(s.best)} 名 · {shortName(s.best.event?.name)}</span>{/if}
                {#if s.best_streak >= 3}<span>最长 {s.best_streak} 连胜</span>{/if}
                {#if s.peak_mmr}<span>最高 MMR {s.peak_mmr}</span>{/if}
              </div>
            {/if}
          </li>
        {/each}
      </ol>
    {/if}
  {/if}
</div>

{#if recapOpen}
  {#await loadRecapDialog() then m}
    <m.default playerId={recapFor} {season} bind:open={recapOpen} />
  {/await}
{/if}
