<script>
  // Ban / Pick vehicle groups: while banning, a group (or one of its
  // vehicles) is clicked to ban it; bans, removals and the drawn result
  // are marked.
  import { ban, bannedBy, isGroupBanned } from "#lib/banpick.js";

  let { bp = $bindable(), grouped = [], banning = false } = $props();

  function vehicleInfo(v) {
    return [v.nation, v.br != null ? `BR ${v.br}` : null, v.type].filter(Boolean).join(" · ");
  }
</script>

<div class="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
  {#each grouped as g (g.group)}
    {@const banner = bannedBy(bp, g.group)}
    {@const removed = bp.removedGroups.includes(g.group)}
    {@const drawn = bp.group === g.group}
    {@const pickable = banning && !isGroupBanned(bp, g.group)}
    <div
      class="rounded-md border px-1.5 py-1 transition-colors
        {banner
        ? banner === 'A'
          ? 'border-rose-500/50 bg-rose-500/10'
          : 'border-sky-500/50 bg-sky-500/10'
        : drawn
          ? 'border-primary bg-primary/10 ring-1 ring-primary/50'
          : removed
            ? 'border-border bg-muted/40 opacity-45'
            : 'border-border bg-background/50'}
        {pickable ? 'hover:border-foreground/40' : ''}"
    >
      <button
        type="button"
        disabled={!pickable}
        onclick={() => (bp = ban(bp, g.group))}
        class="flex w-full items-center justify-between gap-1 text-left {pickable ? 'cursor-pointer' : 'cursor-default'}"
      >
        <span class="truncate text-[11px] font-bold text-foreground {removed ? 'line-through' : ''}">{g.group}</span>
        {#if banner}
          <span
            class="shrink-0 rounded px-1 text-[9px] font-black text-white {banner === 'A' ? 'bg-rose-500' : 'bg-sky-500'}"
            >{banner} 禁</span
          >
        {:else}
          <span class="shrink-0 text-[9px] text-muted-foreground">{g.vehicles.length}</span>
        {/if}
      </button>
      <div class="mt-0.5 flex flex-wrap gap-0.5">
        {#each g.vehicles as v (v.name)}
          {@const out = bp.removedVehicles.includes(v.name)}
          {@const chosen = bp.vehicle === v.name}
          <button
            type="button"
            disabled={!pickable}
            onclick={() => (bp = ban(bp, g.group, v.name))}
            title={vehicleInfo(v)}
            class="rounded px-1 py-px text-[9.5px] leading-tight
              {chosen
              ? 'bg-primary font-bold text-primary-foreground'
              : out
                ? 'text-muted-foreground/60 line-through'
                : 'bg-muted/60 text-foreground/80'}
              {pickable ? 'hover:bg-foreground/10 cursor-pointer' : 'cursor-default'}"
          >
            {v.name}
          </button>
        {/each}
      </div>
    </div>
  {/each}
</div>
