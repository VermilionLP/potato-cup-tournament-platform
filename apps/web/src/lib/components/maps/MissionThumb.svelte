<script>
  // A 比赛地图's picture (16:9). Without one: a dark panel with the place's
  // name along the bottom, in the style of the game's location cards.
  import { levelName } from "@potato-cup/shared/mission-blk.js";

  let { mission, class: className = "", eager = false } = $props();

  const label = $derived((mission.location || levelName(mission.summary?.level) || mission.name || "").replace(/_/g, " "));
</script>

<div class="relative aspect-video overflow-hidden bg-[#1b2433] {className}">
  {#if mission.image_url}
    <img src={mission.image_url} alt={label} class="absolute inset-0 size-full object-cover" loading={eager ? "eager" : "lazy"} decoding="async" />
  {:else}
    <div class="absolute inset-0 bg-[radial-gradient(120%_90%_at_70%_10%,#3d5a80_0%,#1b2433_60%,#0f141d_100%)]"></div>
    <div class="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/45 to-transparent"></div>
    <span class="absolute bottom-[9%] left-[6.5%] right-[6%] truncate font-display text-xl font-semibold uppercase leading-none tracking-wide text-white" data-no-i18n>{label}</span>
  {/if}
</div>
