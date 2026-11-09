<script>
  // Ladder division: game mode × event type ("" = all), e.g. AB 螺旋桨.
  import { GAME_MODES, VEHICLE_POOLS } from "#lib/tournament.js";
  import { Chip } from "#lib/components/ui/chip/index.js";

  let { mode = "", pool = "", onchange } = $props();
</script>

<!-- Two rows of filter chips: mode, then event type. -->
<div class="space-y-2 pt-1">
  <div class="flex flex-wrap items-center gap-2" role="group" aria-label="模式">
    {#each [{ id: "", label: "全部模式" }, ...GAME_MODES.map((m) => ({ id: m.id, label: m.code }))] as opt (opt.id)}
      <Chip selected={mode === opt.id} onclick={() => onchange(opt.id, pool)}>{opt.label}</Chip>
    {/each}
  </div>
  <div class="flex flex-wrap items-center gap-2" role="group" aria-label="比赛类型">
    {#each [{ id: "", label: "全部类型" }, ...VEHICLE_POOLS.map((p) => ({ id: p.id, label: p.name }))] as opt (opt.id)}
      <Chip selected={pool === opt.id} onclick={() => onchange(mode, opt.id)}>{opt.label}</Chip>
    {/each}
  </div>
</div>
