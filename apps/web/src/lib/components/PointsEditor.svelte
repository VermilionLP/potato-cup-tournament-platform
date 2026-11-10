<script>
  // Points and prizes per placing (积分榜 and 金鹰币): the kind of event
  // (周赛 / 大型赛事, which also loads its default table), the rows, the season
  // (year) and whether the champion gets a direct Winter Finals invite.
  import { POINTS_PRESETS, copyTable, placeColor, placeRangeLabel, pointsTableProblem, prizeTotal } from "#lib/points.js";
  import CoinsIcon from "@lucide/svelte/icons/coins";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import TrophyIcon from "@lucide/svelte/icons/trophy";
  import XIcon from "@lucide/svelte/icons/x";

  let { table = $bindable([]), season = $bindable(""), kind = $bindable("weekly"), invite = $bindable(false), compact = false } = $props();

  const problem = $derived(pointsTableProblem(table, season));
  function pickKind(preset) {
    kind = preset.id;
    table = copyTable(preset.table);
    // Monthly champions are invited by default; can be changed below.
    invite = preset.id === "monthly";
  }

  function presetTitle(preset) {
    return preset.table.map((r) => `${r.from === r.to ? r.from : `${r.from}-${r.to}`}: ${r.points}${r.prize ? ` + ${r.prize} 金鹰币` : ""}`).join(" · ");
  }

  function setRow(i, field, value) {
    table = table.map((r, j) => (j === i ? { ...r, [field]: value } : r));
  }
  function addRow() {
    const last = table[table.length - 1];
    const from = last ? Number(last.to || last.from) + 1 : 1;
    table = [...table, { from, to: from, points: 0, prize: "" }];
  }
  function removeRow(i) {
    table = table.filter((_, j) => j !== i);
  }

  // Row badge: medal colour of the first place in the row (#lib/points.js placeColor).
  const placeOf = (row) => ({ from: Number(row.from) || 0, to: Number(row.to) || Number(row.from) || 0 });
  let pool = $derived(prizeTotal(table));

  const field = "field-compact h-8 tabular-nums";
</script>

<div class="space-y-3">
  <!-- Kind (loads its default table) and season -->
  <div class="flex flex-wrap items-center gap-2">
    <div class="inline-flex rounded-lg border border-border bg-muted/40 p-0.5" role="group" aria-label="积分赛类型">
      {#each POINTS_PRESETS as preset (preset.id)}
        <button
          type="button"
          onclick={() => pickKind(preset)}
          aria-pressed={kind === preset.id}
          class="rounded-md px-3 py-1 text-xs font-semibold transition-colors cursor-pointer
            {kind === preset.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}"
          title={presetTitle(preset)}
        >
          {preset.label}
        </button>
      {/each}
    </div>
    <label class="ml-auto flex shrink-0 items-center gap-2 whitespace-nowrap text-xs text-muted-foreground">
      赛季
      <input
        aria-label="积分榜赛季"
        class="field w-20 text-center num"
        inputmode="numeric"
        maxlength="4"
        bind:value={season}
      />
    </label>
  </div>

  <!-- Placings: range, points, prize -->
  <div class="overflow-hidden rounded-xl border border-border {compact ? 'bg-background/40' : 'bg-background/60'}">
    <div class="grid grid-cols-[5.5rem_1fr_1fr_1.5rem] sm:grid-cols-[1.75rem_6rem_1fr_1.25fr_1.75rem] items-center gap-1.5 sm:gap-2 border-b border-border bg-muted/40 px-2.5 sm:px-3 py-2 text-label font-semibold uppercase tracking-wider text-muted-foreground">
      <span class="hidden sm:block"></span><span>名次</span><span>积分</span><span>金鹰币</span><span></span>
    </div>
    <div class="divide-y divide-border/50">
      {#each table as row, i (i)}
        {@const color = placeColor(placeOf(row))}
        <div class="group grid grid-cols-[5.5rem_1fr_1fr_1.5rem] sm:grid-cols-[1.75rem_6rem_1fr_1.25fr_1.75rem] items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-2 transition-colors hover:bg-muted/20">
          <span
            class="hidden sm:flex h-7 w-7 items-center justify-center rounded-full text-small font-black text-white shadow-sm"
            style="background-color: {color || '#71717a'}"
            title={placeRangeLabel(placeOf(row))}
          >
            {placeOf(row).from || "?"}
          </span>
          <div class="flex items-center gap-1">
            <input aria-label="名次从" inputmode="numeric" class="{field} w-9 sm:w-10 px-1 text-center" value={row.from} oninput={(e) => setRow(i, "from", e.currentTarget.value)} />
            <span class="text-muted-foreground">–</span>
            <input aria-label="名次到" inputmode="numeric" class="{field} w-9 sm:w-10 px-1 text-center" value={row.to} oninput={(e) => setRow(i, "to", e.currentTarget.value)} />
          </div>
          <div class="relative">
            <input aria-label="积分" inputmode="decimal" class="{field} w-full pl-2 pr-2 sm:pr-7 num" value={row.points} oninput={(e) => setRow(i, "points", e.currentTarget.value)} />
            <span class="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 text-small text-muted-foreground sm:block">分</span>
          </div>
          <div class="relative">
            <CoinsIcon class="pointer-events-none absolute left-2 top-1/2 hidden h-3.5 w-3.5 -translate-y-1/2 sm:block {row.prize ? 'text-amber-500' : 'text-muted-foreground/50'}" />
            <input
              aria-label="金鹰币奖金"
              inputmode="numeric"
              placeholder="无"
              class="{field} w-full pl-2 sm:pl-7 pr-2 num {row.prize ? 'text-amber-700 dark:text-amber-300' : ''}"
              value={row.prize ?? ""}
              oninput={(e) => setRow(i, "prize", e.currentTarget.value)}
            />
          </div>
          <button
            type="button"
            onclick={() => removeRow(i)}
            class="flex h-7 w-6 sm:w-7 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive cursor-pointer"
            title="删除这一行"
            aria-label="删除这一行"
          >
            <XIcon class="h-3.5 w-3.5" />
          </button>
        </div>
      {/each}
    </div>
    <div class="flex items-center justify-between gap-2 border-t border-border bg-muted/20 px-3 py-1.5">
      <button type="button" onclick={addRow} class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-brand-ink hover:bg-primary/10 cursor-pointer">
        <PlusIcon class="h-3.5 w-3.5" />
        添加一行
      </button>
      {#if pool}
        <span class="text-small text-muted-foreground">奖金池 <span class="num font-bold text-amber-600 dark:text-amber-400">{pool.toLocaleString("zh-CN")}</span> 金鹰币</span>
      {/if}
    </div>
  </div>

  <!-- Winter Finals invite -->
  <label
    class="flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 transition-colors
      {invite ? 'border-amber-500/40 bg-amber-500/10' : 'border-border hover:bg-muted/30'}"
  >
    <input type="checkbox" bind:checked={invite} class="mt-0.5 accent-amber-500" />
    <TrophyIcon class="mt-0.5 h-4 w-4 shrink-0 {invite ? 'text-amber-500' : 'text-muted-foreground'}" />
    <span class="text-xs">
      <span class="font-semibold text-foreground">冠军直邀冬季总决赛</span>
      <span class="block text-small text-muted-foreground">冠军直接获得冬季总决赛名额；冠军已有资格时顺延给亚军。</span>
    </span>
  </label>
  {#if problem}
    <p class="text-small text-amber-600 dark:text-amber-400">{problem}</p>
  {:else}
    <p class="text-small text-muted-foreground">
      选手按最终名次获得所在行的积分，计入 {season} 赛季、本赛事比赛类型的积分榜。
    </p>
  {/if}
</div>
