<script>
  // Ban / Pick vehicle groups, kept compact as text: while banning, a group
  // (or one of its vehicles) is clicked to ban it; bans, removals and the
  // drawn result are marked. Pointing at
  // (or tapping) a vehicle shows its wiki slot picture in the preview bar
  // above, so the grid stays the same size.
  import { bannedBy, isGroupBanned } from "#lib/banpick.js";
  import VehicleSlot from "./VehicleSlot.svelte";

  // `banning`: the viewer may ban now; onban(group, vehicle) bans.
  let { bp, grouped = [], banning = false, onban } = $props();

  let preview = $state(null);

  function vehicleInfo(v) {
    return [v.nation, v.br != null ? `BR ${v.br}` : null, v.type].filter(Boolean).join(" · ");
  }
</script>

<!-- Preview of the vehicle pointed at -->
<div class="flex h-12 items-center gap-2.5 rounded-lg border border-dashed border-border bg-muted/20 px-2">
  {#if preview}
    <div class="w-44 shrink-0"><VehicleSlot vehicle={preview} size="sm" /></div>
    <div class="min-w-0 text-[11px] leading-tight">
      <div class="truncate font-bold text-foreground">{preview.name}</div>
      <div class="truncate text-muted-foreground">{vehicleInfo(preview)}</div>
    </div>
  {:else}
    <span class="text-[11px] text-muted-foreground">把鼠标移到（或点按）载具名上查看图片</span>
  {/if}
</div>

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
        onclick={() => onban(g.group, null)}
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
          <!-- Not `disabled`: disabled buttons get no pointer events, and the preview needs them. -->
          <button
            type="button"
            aria-disabled={!pickable}
            onpointerenter={() => (preview = v)}
            onfocus={() => (preview = v)}
            onclick={() => {
              preview = v;
              if (pickable) onban(g.group, v.name);
            }}
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
