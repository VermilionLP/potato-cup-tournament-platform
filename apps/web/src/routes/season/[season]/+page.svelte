<script>
  // 赛季总览 of one season (SeasonOverview).
  import { page } from "$app/state";
  import SeasonOverview from "#lib/components/season/SeasonOverview.svelte";

  let season = $derived(page.params.season || "");
</script>

<svelte:head><title>{season} 赛季 · Potato Cup</title></svelte:head>

<SeasonOverview {season} />
