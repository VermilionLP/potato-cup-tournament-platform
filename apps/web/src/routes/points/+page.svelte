<script>
  import SwordsIcon from "@lucide/svelte/icons/swords";
  import { EmptyState } from "#lib/components/ui/empty-state/index.js";
  // Potato Cup points leaderboard (积分榜): per season (year) and event type,
  // the points players earned in finished events with a points table. The
  // board is PointsBoard; admins also get SeasonAdmin (loaded on demand).
  import { FilterBar, FilterGroup } from "#lib/components/ui/filter-group/index.js";
  import PageHeader from "#lib/components/PageHeader.svelte";
  import RankingTabs from "#lib/components/rankings/RankingTabs.svelte";
  import PageSkeleton from "#lib/components/PageSkeleton.svelte";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import { page } from "$app/state";
  import { replaceState } from "$app/navigation";
  import { API } from "#lib/api.js";
  import { userState } from "#lib/user.svelte.js";
  import { VEHICLE_POOLS } from "#lib/tournament.js";
  import { lazy } from "#lib/lazy.js";
  import PointsBoard from "#lib/components/points/PointsBoard.svelte";
  import { Input } from "#lib/components/ui/input/index.js";
  import SearchIcon from "@lucide/svelte/icons/search";

  const loadSeasonAdmin = lazy(() => import("#lib/components/points/SeasonAdmin.svelte"));

  let isAdmin = $derived(!!userState.adminToken);
  let data = $state(null);
  let savingInvite = $state("");
  let isEnded = $derived(Boolean(data?.ended_at));
  let loading = $state(true);
  let pool = $state("");
  let query = $state("");

  let board = $derived(data?.boards?.find((b) => b.pool === pool) || data?.boards?.[0] || null);
  let shownPlayers = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const players = board?.players || [];
    if (!q) return players;
    return players.filter((p) => p.id.toLowerCase().includes(q) || (p.team || "").toLowerCase().includes(q));
  });

  // "Weekly #36" from "Potato Cup Weekly #36", "2026 June Cup - Europe" etc.
  const shortName = (name) => String(name || "").replace(/^(FamilyX\s+)?Potato Cup\s+/i, "");

  function syncUrl() {
    const url = new URL(page.url.href);
    for (const [key, value] of [["season", data?.season || ""], ["pool", board?.pool || ""]]) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    replaceState(url, {});
  }

  async function load(season) {
    loading = true;
    try {
      data = await API.getPointsLeaderboard(season);
      if (!data.boards.some((b) => b.pool === pool)) pool = data.boards[0]?.pool || "";
    } catch (e) {
      toast.error("加载积分榜失败: " + e.message);
    } finally {
      loading = false;
    }
  }

  onMount(async () => {
    const params = page.url.searchParams;
    pool = params.get("pool") || "";
    await load(params.get("season") || "");
  });

  async function pickSeason(season) {
    if (season === data?.season) return;
    await load(season);
    syncUrl();
  }

  // Admins choose which events' champions get a direct Winter Finals invite.
  async function toggleInvite(ev) {
    savingInvite = ev.id;
    try {
      await API.updateTournament(ev.id, { points_invite: !ev.invite });
      await load(data?.season || "");
      toast.success(ev.invite ? `已取消 ${shortName(ev.name)} 的直邀名额` : `${shortName(ev.name)} 的冠军将直接获得名额`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      savingInvite = "";
    }
  }

  function pickPool(id) {
    pool = id;
    syncUrl();
  }
</script>

<svelte:head><title>年度积分榜 · 排行 · Potato Cup</title></svelte:head>

<div class="space-y-5">
  <PageHeader title="排行" icon={SwordsIcon} description="年度积分榜：周赛和大型赛事按最终名次给分，每个赛季按比赛类型分别排名">
    {#snippet more()}
      <p>计入积分榜的周赛和大型赛事按最终名次给分，每个赛季按比赛类型分别排名。冬季总决赛每个类型 16 人：管理员指定的直邀赛事冠军直接晋级（冠军已有资格时顺延给亚军），其余名额按积分排名。积分在赛事设置中定义，赛事结束后计入。</p>
    {/snippet}
  </PageHeader>
  <RankingTabs />

  {#if loading && !data}
    <PageSkeleton kind="table" label="加载中..." rows={10} />
  {:else if !data?.seasons?.length}
    <EmptyState title="还没有计入积分榜的赛事" hint="创建赛事时在「年度积分榜」里设置积分，赛事结束后就会出现在这里。" />
  {:else}
    <FilterBar>
      <FilterGroup
        label="赛季"
        value={data.season}
        onpick={pickSeason}
        options={data.seasons.map((season) => ({ id: season, label: `${season} 赛季${season === data.current ? " · 进行中" : ""}` }))}
      />
      {#if data.boards.length}
        <FilterGroup
          label="类型"
          value={board?.pool}
          onpick={pickPool}
          options={VEHICLE_POOLS.filter((p) => data.boards.some((b) => b.pool === p.id)).map((p) => ({ id: p.id, label: p.name }))}
        />
      {/if}
      {#snippet end()}
        <div class="relative sm:w-56">
          <SearchIcon class="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input bind:value={query} placeholder="搜索选手 / 战队" class="h-8 pl-8 text-xs" />
        </div>
      {/snippet}
    </FilterBar>

    <!-- An ended season says when; admins set the current season and end / reopen one. -->
    {#if isEnded}
      <p class="text-small text-muted-foreground">
        {data.season} 赛季已结束 · {new Date(data.ended_at).toLocaleDateString("zh-CN")} · 积分和名单已锁定
      </p>
    {/if}
    {#if isAdmin}
      {#await loadSeasonAdmin() then m}
        <m.default {data} onchanged={load} />
      {/await}
    {/if}

    {#if !board}
      <EmptyState title="{data.season} 赛季还没有已结束的积分赛" hint="第一场计分的赛事结束后，积分会自动计入这里。" />
    {:else}
      <PointsBoard
        {board}
        season={data.season}
        players={shownPlayers}
        {isAdmin}
        {isEnded}
        {savingInvite}
        {shortName}
        ontoggleinvite={toggleInvite}
      />
    {/if}
  {/if}
</div>
