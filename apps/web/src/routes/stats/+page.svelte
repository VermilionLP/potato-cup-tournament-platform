<script>
  // Statistics page, two tabs: player records over the events of a tier / kind
  // (GET /players/statistics, computed on the server). Clicking a player
  // opens their details under the row; and 名人堂 (HallOfFame). Parts are in
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

  // Tabs: player data (with the tier / kind filter) and 名人堂, kept in the hash.
  let tab = $state(typeof window !== "undefined" && window.location.hash === "#hall" ? "hall" : "players");
  function setTab(t) {
    tab = t;
    replaceState(t === "hall" ? "#hall" : window.location.pathname + window.location.search, {});
  }

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
    {#each [["players", "选手数据", UsersIcon], ["hall", "名人堂", CrownIcon]] as [id, label, Icon] (id)}
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
    <HallOfFame />
  {:else}
  <!-- Event tier / kind filter -->
  <StatsScopeFilter tier={statsTier} kind={statsKind} disabled={statsLoading} onchange={setScope} />

  {#if statsLoading}
    <PageSkeleton kind="stats" label="正在整理选手生涯战绩与趣味榜单..." />
  {:else}
    {#if statsData}
      <StatsOverview global={statsData.global} />

      <!-- Main statistics layout -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Left + Mid: player table and the selected player -->
        <div class="lg:col-span-2 space-y-6">
          <PlayerStatsTable players={statsData.players} bind:selected={selectedStatPlayer}>
            {#snippet detail(p)}
              <PlayerDetailCard player={p} />
            {/snippet}
          </PlayerStatsTable>
        </div>

        <!-- Right: Rankings & Boards -->
        <RankingBoards rankings={statsData.rankings} />
      </div>

      <BanPickStats tier={statsTier} kind={statsKind} />
    {/if}
  {/if}
  {/if}
</div>
