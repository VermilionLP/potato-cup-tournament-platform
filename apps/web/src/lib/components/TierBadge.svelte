<script>
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { tierBadgeClass } from "$lib/ladder.js";
  import { leagueIcon } from "$lib/sc2-icons.js";

  let { tier = null, className = "" } = $props();
</script>

<Badge
  variant="outline"
  class="gap-1 text-[9px] px-1.5 py-0 tracking-wider {tierBadgeClass(tier?.group)} {className}"
>
  {#if leagueIcon(tier?.group)}
    <img
      src={leagueIcon(tier?.group)}
      alt=""
      class="w-3 h-3 shrink-0 object-contain"
      aria-hidden="true"
    />
  {/if}
  <span>{tier?.name || "未定级"}</span>
</Badge>
