<script>
  // Statistics filter: event tier and kind ("" = all, "none" = not set).
  // The page reloads the statistics for the choice.
  import { EVENT_KINDS, EVENT_TIERS } from "$lib/tournament.js";

  let { tier = "", kind = "", disabled = false, onchange } = $props();
  const tierChips = [{ id: "", name: "全部等级" }, ...EVENT_TIERS, { id: "none", name: "未分级" }];
  const kindChips = [{ id: "", name: "全部性质" }, ...EVENT_KINDS];
</script>

<div class="space-y-1.5">
  {#each [{ chips: tierChips, value: tier, set: (id) => onchange?.(id, kind) }, { chips: kindChips, value: kind, set: (id) => onchange?.(tier, id) }] as row, r (r)}
    <div class="flex flex-wrap items-center gap-1.5">
      {#each row.chips as chip (chip.id)}
        <button
          type="button"
          onclick={() => row.set(chip.id)}
          aria-pressed={row.value === chip.id}
          {disabled}
          class="rounded-full border px-3 py-1 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-60
            {row.value === chip.id
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground'}"
        >
          {chip.name}
        </button>
      {/each}
    </div>
  {/each}
</div>
