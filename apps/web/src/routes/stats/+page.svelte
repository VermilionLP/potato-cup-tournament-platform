<script>
  // Statistics page, three tabs: player records over the events of a tier /
  // kind (GET /players/statistics, computed on the server; clicking a player
  // opens their details under the row), 载具 (Ban / Pick statistics, same
  // filter) and 名人堂 (HallOfFame plus the career boards: titles,
  // runner-ups, win rate, matches, walkovers over every event). Parts are in
  // #lib/components/stats.
  import PageHeader from "#lib/components/PageHeader.svelte";
  import ChartIcon from "@lucide/svelte/icons/chart-column";
  import PageSkeleton from "#lib/components/PageSkeleton.svelte";
  import { onMount } from "svelte";
  import { replaceState } from "$app/navigation";
  import { toast } from "svelte-sonner";
  import { API } from "#lib/api.js";
  import StatsScopeFilter from "#lib/components/stats/StatsScopeFilter.svelte";
  import StatsOverview from "#lib/components/stats/StatsOverview.svelte";
  import PlayerStatsTable from "#lib/components/stats/PlayerStatsTable.svelte";
  import PlayerDetailCard from "#lib/components/stats/PlayerDetailCard.svelte";
  import RankingBoards from "#lib/components/stats/RankingBoards.svelte";
  import BanPickStats from "#lib/components/stats/BanPickStats.svelte";
  import HallOfFame from "#lib/components/stats/HallOfFame.svelte";
  import CrownIcon from "@lucide/svelte/icons/crown";
  import UsersIcon from "@lucide/svelte/icons/users";
  import CarIcon from "@lucide/svelte/icons/car-front";
  import TrophyIcon from "@lucide/svelte/icons/trophy";

  // Tabs, kept in the hash (#vehicles, #hall; none = player data).
  const TABS = [
    ["players", "选手数据", UsersIcon],
    ["vehicles", "载具", CarIcon],
    ["hall", "名人堂", CrownIcon],
  ];
  const fromHash = (h) => (h === "#hall" ? "hall" : h === "#vehicles" ? "vehicles" : "players");
  let tab = $state(typeof window !== "undefined" ? fromHash(window.location.hash) : "players");
  function setTab(t) {
    tab = t;
    replaceState(t === "players" ? window.location.pathname + window.location.search : `#${t}`, {});
  }

  // 名人堂's career boards cover every event, whatever the filter says.
  let careerRankings = $state(null);
  $effect(() => {
    if (tab !== "hall" || careerRankings) return;
    API.getPlayerStatistics({})
      .then((d) => (careerRankings = d?.rankings || null))
      .catch((e) => toast.error("加载生涯榜单失败: " + e.message));
  });

  let statsData = $state(null);
  let statsLoading = $state(true);
  let selectedStatPlayer = $state(null);
  // Only events of one tier / kind ("" = all, "none" = not set); the
  // server recomputes everything for them.
  let statsTier = $state("");
  let statsKind = $state("");
  function setScope(tier, kind) {
    if (tier === statsTier && kind === statsKind) return;
    statsTier = tier;
    statsKind = kind;
    loadStats();
  }

  async function loadStats() {
    statsLoading = true;
    const keep = selectedStatPlayer?.id;
    try {
      statsData = await API.getPlayerStatistics({ tier: statsTier, kind: statsKind });
      const kept = keep && statsData?.players?.find((p) => p.id === keep);
      // The open player stays open; nothing opens by itself.
      selectedStatPlayer = kept || null;
    } catch (e) {
      toast.error("加载统计数据失败: " + e.message);
    }
    statsLoading = false;
  }

  onMount(loadStats);
</script>

<svelte:head><title>数据统计 · Potato Cup</title></svelte:head>

<div class="space-y-6">
  <!-- Page header -->
  <PageHeader title="数据统计" icon={ChartIcon} description="选手生涯战绩、趣味榜单、载具统计和名人堂" />

  <div class="flex gap-1 border-b border-border" role="tablist">
    {#each TABS as [id, label, Icon] (id)}
      <button
        type="button"
        role="tab"
        aria-selected={tab === id}
        onclick={() => setTab(id)}
        class="-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold transition-colors cursor-pointer
          {tab === id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}"
      >
        <Icon class="h-4 w-4" />{label}
      </button>
    {/each}
  </div>

  {#if tab === "hall"}
    <!-- Career boards first (titles are what people look for), then the
         records and every finished event (HallOfFame). -->
    <section class="space-y-3">
      <div>
        <h2 class="flex items-center gap-1.5 text-heading font-bold"><TrophyIcon class="h-4 w-4 text-amber-500" />生涯榜单</h2>
        <p class="text-small text-muted-foreground">全部赛事的冠军、亚军、胜率、场数和弃权排行</p>
      </div>
      {#if careerRankings}
        <!-- Masonry columns: each board as tall as its list. -->
        <RankingBoards rankings={careerRankings} class="columns-1 gap-5 md:columns-2 xl:columns-3 [&>*]:mb-5 [&>*]:break-inside-avoid" />
      {:else}
        <PageSkeleton kind="stats" label="正在整理生涯榜单..." />
      {/if}
    </section>
    <HallOfFame />
  {:else if tab === "vehicles"}
    <StatsScopeFilter tier={statsTier} kind={statsKind} disabled={statsLoading} onchange={setScope} />
    <BanPickStats tier={statsTier} kind={statsKind} />
  {:else}
  <!-- Event tier / kind filter -->
  <StatsScopeFilter tier={statsTier} kind={statsKind} disabled={statsLoading} onchange={setScope} />

  {#if statsLoading}
    <PageSkeleton kind="stats" label="正在整理选手生涯战绩与趣味榜单..." />
  {:else}
    {#if statsData}
      <StatsOverview global={statsData.global} />

      <!-- Player table; the selected player's details open under the row -->
      <PlayerStatsTable players={statsData.players} bind:selected={selectedStatPlayer}>
        {#snippet detail(p)}
          <PlayerDetailCard player={p} />
        {/snippet}
      </PlayerStatsTable>
    {/if}
  {/if}
  {/if}
</div>
