<script>
  // The ladder limit choice (none / MMR cap / league cap) with the MMR field;
  // used by the create wizard and the event header (LadderLimitTag).
  import { LIMIT_TIERS } from "$lib/ladder-limit.js";

  let { choice = $bindable(""), mmr = $bindable(3300), disabled = false, compact = false, onchoice } = $props();
</script>

<span class="inline-flex flex-wrap items-center gap-1.5">
  <select
    aria-label="天梯限制"
    title="天梯限制"
    value={choice}
    {disabled}
    onchange={(e) => {
      choice = e.currentTarget.value;
      onchoice?.(choice);
    }}
    class="{compact ? 'h-6 text-xs' : 'h-8 text-xs'} rounded-md border border-border bg-background px-1.5 font-semibold text-foreground cursor-pointer disabled:opacity-60"
  >
    <option value="">不限天梯</option>
    <option value="mmr">天梯分上限…</option>
    {#each LIMIT_TIERS as tier (tier.group)}
      <option value={tier.group}>{tier.name}及以下</option>
    {/each}
  </select>
  {#if choice === "mmr"}
    <input
      type="number"
      min="1000"
      max="9999"
      step="50"
      aria-label="天梯分上限"
      bind:value={mmr}
      {disabled}
      class="{compact ? 'h-6' : 'h-8'} w-20 rounded-md border border-border bg-background px-1.5 text-xs tabular-nums text-foreground"
    />
  {/if}
</span>
