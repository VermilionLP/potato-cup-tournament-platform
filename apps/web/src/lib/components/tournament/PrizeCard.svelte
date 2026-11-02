<script>
  // "奖金与积分": Golden Eagles (金鹰币) and points per placing, from the
  // event's points table ($lib/points.js).
  import { placeName, prizeTotal } from "$lib/points.js";

  let { tournament } = $props();
  let rows = $derived(tournament?.points_table || []);
  let total = $derived(prizeTotal(rows));
</script>

{#if rows.length}
  <section class="rounded-xl border border-border bg-card/40 p-4 space-y-2">
    <h2 class="flex items-baseline justify-between text-sm font-bold">
      <span>奖金与积分</span>
      {#if total}<span class="text-[11px] font-semibold text-amber-600 dark:text-amber-400">奖金池 {total} 金鹰币</span>{/if}
    </h2>
    <div class="divide-y divide-border/50 text-xs">
      {#each rows as r (r.from)}
        <div class="flex items-center justify-between py-1.5">
          <span class="font-semibold">{placeName(r)}</span>
          <span class="flex items-center gap-3">
            {#if r.prize}<span class="font-mono font-bold text-amber-600 dark:text-amber-400">{r.prize} 金鹰币</span>{/if}
            <span class="font-mono text-muted-foreground">{r.points} 积分</span>
          </span>
        </div>
      {/each}
    </div>
  </section>
{/if}
