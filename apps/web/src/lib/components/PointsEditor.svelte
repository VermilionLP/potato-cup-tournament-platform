<script>
  // Points per placing for the Potato Cup leaderboard (积分榜): a preset
  // (weekly / monthly / finals) or custom rows, plus the season (year).
  import { POINTS_PRESETS, copyTable, pointsTableProblem } from "$lib/points.js";

  let { table = $bindable([]), season = $bindable(""), compact = false } = $props();

  const problem = $derived(pointsTableProblem(table, season));
  const presetId = $derived(
    POINTS_PRESETS.find((p) => JSON.stringify(p.table) === JSON.stringify((table || []).map((r) => ({ from: Number(r.from), to: Number(r.to), points: Number(r.points) }))))?.id || "",
  );

  function presetTitle(preset) {
    return preset.table.map((r) => `${r.from === r.to ? r.from : `${r.from}-${r.to}`}: ${r.points}`).join(" · ");
  }

  function setRow(i, field, value) {
    table = table.map((r, j) => (j === i ? { ...r, [field]: value } : r));
  }
  function addRow() {
    const last = table[table.length - 1];
    const from = last ? Number(last.to || last.from) + 1 : 1;
    table = [...table, { from, to: from, points: 0 }];
  }
  function removeRow(i) {
    table = table.filter((_, j) => j !== i);
  }

  const cell = "h-7 w-full rounded border border-border bg-background px-1.5 text-xs text-foreground focus:border-primary focus:outline-none";
</script>

<div class="space-y-2">
  <div class="flex flex-wrap items-center gap-1.5">
    <span class="text-[11px] text-muted-foreground">预设</span>
    {#each POINTS_PRESETS as preset (preset.id)}
      <button
        type="button"
        onclick={() => (table = copyTable(preset.table))}
        class="rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-colors cursor-pointer
          {presetId === preset.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground'}"
        title={presetTitle(preset)}
      >
        {preset.label}
      </button>
    {/each}
    <label class="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
      赛季
      <input
        aria-label="积分榜赛季"
        class="h-7 w-16 rounded border border-border bg-background px-1.5 text-xs font-mono text-foreground focus:border-primary focus:outline-none"
        inputmode="numeric"
        maxlength="4"
        bind:value={season}
      />
    </label>
  </div>

  <div class="rounded-lg border border-border/60 {compact ? '' : 'bg-background/30'}">
    <div class="grid grid-cols-[1fr_1fr_1fr_1.75rem] gap-1.5 border-b border-border/50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      <span>名次从</span><span>到</span><span>积分</span><span></span>
    </div>
    {#each table as row, i (i)}
      <div class="grid grid-cols-[1fr_1fr_1fr_1.75rem] items-center gap-1.5 px-2 py-1">
        <input aria-label="名次从" inputmode="numeric" class={cell} value={row.from} oninput={(e) => setRow(i, "from", e.currentTarget.value)} />
        <input aria-label="名次到" inputmode="numeric" class={cell} value={row.to} oninput={(e) => setRow(i, "to", e.currentTarget.value)} />
        <input aria-label="积分" inputmode="decimal" class="{cell} font-mono" value={row.points} oninput={(e) => setRow(i, "points", e.currentTarget.value)} />
        <button type="button" onclick={() => removeRow(i)} class="h-7 rounded text-muted-foreground hover:bg-red-500/10 hover:text-red-500 cursor-pointer" title="删除这一行" aria-label="删除这一行">×</button>
      </div>
    {/each}
    <button type="button" onclick={addRow} class="w-full border-t border-border/50 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground cursor-pointer">+ 添加一行</button>
  </div>
  {#if problem}
    <p class="text-[11px] text-amber-600 dark:text-amber-400">{problem}</p>
  {:else}
    <p class="text-[10px] text-muted-foreground">选手按最终名次获得所在行的积分，计入 {season} 赛季、本赛事比赛类型的积分榜。</p>
  {/if}
</div>
