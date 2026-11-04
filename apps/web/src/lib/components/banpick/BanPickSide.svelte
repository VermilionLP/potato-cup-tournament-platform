<script>
  // One player in Ban / Pick: slot (A / B), name and their bans; while it is
  // their turn to ban, a 空过 (skip) button.
  import Flag from "$lib/components/Flag.svelte";
  import { ban, bansOf } from "$lib/banpick.js";

  let { slot, player, active = false, bp = $bindable() } = $props();
  const rules = $derived(bp.rules);
  const own = $derived(bansOf(bp, slot));

  function banLabel(entry) {
    if (!entry.group) return "空过";
    return entry.vehicle ? `${entry.group} · ${entry.vehicle}` : entry.group;
  }
</script>
<div
  class="flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-colors
    {active
    ? slot === 'A'
      ? 'border-rose-500/60 bg-rose-500/10'
      : 'border-sky-500/60 bg-sky-500/10'
    : 'border-border bg-background/40'}
    {slot === 'B' ? 'flex-row-reverse text-right' : ''}"
>
  <span
    class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-black text-white
      {slot === 'A' ? 'bg-rose-500' : 'bg-sky-500'}">{slot}</span
  >
  <div class="min-w-0 flex-1">
    <div class="flex items-center gap-1 {slot === 'B' ? 'justify-end' : ''}">
      <Flag code={player.flag} size={12} />
      <span class="truncate text-xs font-bold text-foreground">{player.name}</span>
    </div>
    <div class="truncate text-[10px] {own.some((b) => b.group) ? 'font-semibold text-destructive' : 'text-muted-foreground'}">
      禁用：{own.length ? own.map(banLabel).join("、") : rules.bansPerPlayer ? "—" : "无"}
    </div>
  </div>
  {#if active}
    <button
      type="button"
      onclick={() => (bp = ban(bp, null))}
      class="shrink-0 rounded-md border border-dashed border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:border-foreground hover:text-foreground cursor-pointer"
      title="本轮不禁用任何大组"
    >
      空过
    </button>
  {/if}
</div>
