<script>
  // Statistics page: player records over the events of a tier / kind
  // (GET /players/statistics, computed on the server). Parts are in
  // $lib/components/stats.
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import { API } from "$lib/api.js";
  import StatsScopeFilter from "$lib/components/stats/StatsScopeFilter.svelte";
  import StatsOverview from "$lib/components/stats/StatsOverview.svelte";
  import PlayerStatsTable from "$lib/components/stats/PlayerStatsTable.svelte";
  import PlayerDetailCard from "$lib/components/stats/PlayerDetailCard.svelte";
  import RankingBoards from "$lib/components/stats/RankingBoards.svelte";

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
      if (kept) {
        selectedStatPlayer = kept;
      } else if (statsData?.players?.length > 0) {
        const sorted = [...statsData.players].sort((a, b) => {
          if (a.matches_played < 2 && b.matches_played >= 2) return 1;
          if (b.matches_played < 2 && a.matches_played >= 2) return -1;
          return b.match_win_rate - a.match_win_rate;
        });
        selectedStatPlayer = sorted[0];
      } else {
        selectedStatPlayer = null;
      }
    } catch (e) {
      toast.error("加载统计数据失败: " + e.message);
    }
    statsLoading = false;
  }

  onMount(loadStats);
</script>

<div class="space-y-6">
  <!-- Page header -->
  <div class="flex items-center justify-between border-b border-border/60 pb-5">
    <div>
      <h1 class="text-3xl font-extrabold tracking-tight bg-linear-to-r from-foreground via-foreground/90 to-primary bg-clip-text text-transparent">
        数据统计
      </h1>
      <p class="text-xs text-muted-foreground mt-1">
        分析赛事选手表现，挖掘趣味数据与胜率统计
      </p>
    </div>
  </div>

  <!-- Event tier / kind filter -->
  <StatsScopeFilter tier={statsTier} kind={statsKind} disabled={statsLoading} onchange={setScope} />

  {#if statsLoading}
    <div class="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground bg-card/20 border border-border border-dashed rounded-xl">
      <div class="w-7 h-7 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
      <p class="text-sm font-semibold">正在整理选手生涯战绩与趣味榜单...</p>
    </div>
  {:else}
    {#if statsData}
      <StatsOverview global={statsData.global} />

      <!-- Main statistics layout -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Left + Mid: player table and the selected player -->
        <div class="lg:col-span-2 space-y-6">
          <PlayerStatsTable players={statsData.players} bind:selected={selectedStatPlayer} />
          {#if selectedStatPlayer}
            <PlayerDetailCard player={selectedStatPlayer} />
          {/if}
        </div>

        <!-- Right: Rankings & Boards -->
        <RankingBoards rankings={statsData.rankings} />
      </div>
    {/if}
  {/if}
</div>
