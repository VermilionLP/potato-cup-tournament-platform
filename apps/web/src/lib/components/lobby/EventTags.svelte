<script>
  // Event tags under an event's title: tier, mode · type · format, then the
  // detail and the event ID in muted text.
  import { TAG_BASE, TAG_TONE } from "#lib/tags.js";
  import { POOL_TAG, TIER_TAG, eventSummary, tierTagText } from "#lib/tournament.js";

  let { t } = $props();
  let info = $derived(eventSummary(t));
</script>

<div class="mt-1.5 flex flex-wrap items-center gap-1.5">
  {#if tierTagText(t)}
    <span class="{TAG_BASE} {TIER_TAG[t.tier] || TAG_TONE.neutral}" title="赛事等级">{tierTagText(t)}</span>
  {/if}
  <span class="{TAG_BASE} {TAG_TONE.neutral} font-num" title={info.modeTitle}>{info.mode}</span>
  {#if info.pool}
    <span class="{TAG_BASE} {POOL_TAG[t.vehicle_pool] || TAG_TONE.neutral}">{info.pool}</span>
  {/if}
  <span class="{TAG_BASE} {TAG_TONE.neutral}">{info.format}</span>
  {#if info.detail}
    <span class="text-small text-muted-foreground">{info.detail}</span>
  {/if}
  <span class="num text-small text-muted-foreground/70" title="赛事 ID">#{t.id}</span>
</div>
