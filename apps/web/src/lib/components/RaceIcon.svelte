<script>
  import { raceIcon, raceName } from "$lib/sc2-icons.js";

  let { race = "", size = 13 } = $props();
</script>

{#if raceIcon(race)}
  <img
    src={raceIcon(race)}
    alt={raceName(race)}
    title={raceName(race)}
    class="inline-block shrink-0 object-contain"
    style="width: {size}px; height: {size}px"
  />
{/if}
