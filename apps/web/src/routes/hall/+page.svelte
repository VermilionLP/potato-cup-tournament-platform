<script>
  // 名人堂 (排行 tab): the career boards over every event (titles,
  // runner-ups, win rate, matches, walkovers; RankingBoards), then the
  // records, each season's points leaders and every finished event's
  // podium (HallOfFame). It used to be a tab of the statistics page;
  // /stats#hall lands here.
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import { API } from "#lib/api.js";
  import PageHeader from "#lib/components/PageHeader.svelte";
  import PageSkeleton from "#lib/components/PageSkeleton.svelte";
  import RankingTabs from "#lib/components/rankings/RankingTabs.svelte";
  import RankingBoards from "#lib/components/stats/RankingBoards.svelte";
  import HallOfFame from "#lib/components/stats/HallOfFame.svelte";
  import SwordsIcon from "@lucide/svelte/icons/swords";
  import TrophyIcon from "@lucide/svelte/icons/trophy";

  let careerRankings = $state(null);
  onMount(async () => {
    try {
      careerRankings = (await API.getPlayerStatistics({}))?.rankings || null;
    } catch (e) {
      toast.error("加载生涯榜单失败: " + e.message);
    }
  });
</script>

<svelte:head><title>名人堂 · 排行 · Potato Cup</title></svelte:head>

<div class="space-y-6">
  <div class="space-y-3">
    <PageHeader title="排行" icon={SwordsIcon} description="名人堂：生涯榜单、历史纪录、各赛季积分王和历届赛事的领奖台" />
    <RankingTabs />
  </div>

  <section class="space-y-3">
    <div>
      <h2 class="flex items-center gap-1.5 text-heading font-bold"><TrophyIcon class="h-4 w-4 text-amber-500" />生涯榜单</h2>
      <p class="text-small text-muted-foreground">全部赛事的冠军、亚军、胜率、场数和弃权排行</p>
    </div>
    {#if careerRankings}
      <RankingBoards rankings={careerRankings} />
    {:else}
      <PageSkeleton kind="stats" label="正在整理生涯榜单..." />
    {/if}
  </section>
  <HallOfFame />
</div>
