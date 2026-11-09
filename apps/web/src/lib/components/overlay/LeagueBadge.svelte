<script>
  // Ladder league badge for the overlays: the league chevron with its
  // I / II / III mark (static/sc2-icons/league), from an event player's
  // ladder_tier. The mark is drawn white so its green / red do not read as
  // a win or a loss. `size` is the height in px.
  import { leagueIcon, tierIcon } from "#lib/sc2-icons.js";

  let { tier = null, size = 24 } = $props();
  let icon = $derived(leagueIcon(tier?.group));
  let mark = $derived(tierIcon(tier));
</script>

{#if icon}
  <span class="inline-flex shrink-0 items-center gap-1" style="height: {size}px;">
    <img src={icon} alt="" class="h-full w-auto drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]" />
    {#if mark}<img src={mark} alt="" class="w-auto brightness-0 invert" style="height: {Math.round(size * 0.62)}px;" />{/if}
  </span>
{/if}
