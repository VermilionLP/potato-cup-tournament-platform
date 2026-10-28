<script>
  // Event tags under an event's title: tier, mode · type · format, then the
  // detail and the event ID in muted text.
  import { POOL_TAG, TIER_TAG, eventSummary, tierTagText } from "$lib/tournament.js";

  let { t } = $props();
  let info = $derived(eventSummary(t));
</script>

<div class="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] leading-none">
  {#if tierTagText(t)}
    <span class="rounded-md border px-1.5 py-1 font-bold {TIER_TAG[t.tier] || 'border-border bg-muted/60 text-muted-foreground'}" title="赛事等级">{tierTagText(t)}</span>
  {/if}
  <span class="rounded-md border border-border bg-muted/60 px-1.5 py-1 font-mono font-bold text-foreground/80" title={info.modeTitle}>{info.mode}</span>
  {#if info.pool}
    <span class="rounded-md border px-1.5 py-1 font-semibold {POOL_TAG[t.vehicle_pool] || 'border-border bg-muted/60 text-muted-foreground'}">{info.pool}</span>
  {/if}
  <span class="rounded-md border border-border bg-muted/60 px-1.5 py-1 font-semibold text-muted-foreground">{info.format}</span>
  {#if info.detail}
    <span class="text-muted-foreground">{info.detail}</span>
  {/if}
  <span class="font-mono text-[10px] text-muted-foreground/50" title="赛事 ID">#{t.id}</span>
</div>
