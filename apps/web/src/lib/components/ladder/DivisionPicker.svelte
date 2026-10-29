<script>
  // Ladder division: game mode × event type ("" = all), e.g. AB 螺旋桨.
  import { GAME_MODES, VEHICLE_POOLS } from "$lib/tournament.js";

  let { mode = "", pool = "", onchange } = $props();
</script>

<div class="flex flex-wrap items-center gap-2 pt-1">
  <div class="inline-flex rounded-lg border border-border bg-muted/30 p-0.5 text-[11px]" role="group" aria-label="模式">
    {#each [{ id: "", label: "全部模式" }, ...GAME_MODES.map((m) => ({ id: m.id, label: m.code }))] as opt (opt.id)}
      <button
        type="button"
        class="px-2.5 py-1 rounded-md transition-colors cursor-pointer {mode === opt.id
          ? 'bg-background text-foreground shadow-sm font-semibold'
          : 'text-muted-foreground hover:text-foreground'}"
        aria-pressed={mode === opt.id}
        onclick={() => onchange(opt.id, pool)}
      >
        {opt.label}
      </button>
    {/each}
  </div>
  <div class="inline-flex flex-wrap rounded-lg border border-border bg-muted/30 p-0.5 text-[11px]" role="group" aria-label="比赛类型">
    {#each [{ id: "", label: "全部类型" }, ...VEHICLE_POOLS.map((p) => ({ id: p.id, label: p.name }))] as opt (opt.id)}
      <button
        type="button"
        class="px-2.5 py-1 rounded-md transition-colors cursor-pointer {pool === opt.id
          ? 'bg-background text-foreground shadow-sm font-semibold'
          : 'text-muted-foreground hover:text-foreground'}"
        aria-pressed={pool === opt.id}
        onclick={() => onchange(mode, opt.id)}
      >
        {opt.label}
      </button>
    {/each}
  </div>
</div>
