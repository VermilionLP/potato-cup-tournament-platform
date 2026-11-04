<script>
  // Ban / Pick after the bans: the drawn group and vehicle with a short
  // slot-machine roll, and the draw / remove / back buttons the rules allow.
  import {
    availableGroups,
    availableVehicles,
    backToGroups,
    confirmGroup,
    drawGroup,
    drawVehicle,
    removeGroup,
    removeVehicle,
    rerollsLeft,
  } from "#lib/banpick.js";

  let { bp = $bindable(), grouped = [], rolling = $bindable(false) } = $props();
  let rollingLabel = $state("");

  const rules = $derived(bp.rules);
  const groupsLeft = $derived(availableGroups(bp, grouped));
  const vehiclesLeft = $derived(bp.group ? availableVehicles(bp, grouped, bp.group) : []);
  const left = $derived(rerollsLeft(bp));
  // With a removal limit, a drawn result can only be swapped by removing it.
  const freeGroupRedraw = $derived(rules.groupRerolls === null);
  const freeVehicleRedraw = $derived(rules.vehicleRerolls === null);
  const canGoBack = $derived(rules.groupRerolls === null && rules.vehicleRerolls === null);

  // Short slot-machine effect before showing a random result.
  async function roll(options, apply) {
    if (rolling || !options.length) return;
    rolling = true;
    const end = Date.now() + 900;
    while (Date.now() < end) {
      rollingLabel = options[Math.floor(Math.random() * options.length)];
      await new Promise((r) => setTimeout(r, 60));
    }
    bp = apply(bp);
    rolling = false;
  }

  const removalsLabel = (n) => (n === null ? "" : `（剩 ${n} 次）`);
</script>

<div
  class="flex flex-col gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 sm:flex-row sm:items-center"
>
  <div class="grid flex-1 grid-cols-2 gap-3">
    <div class="min-w-0">
      <div class="text-[10px] text-muted-foreground">大组</div>
      <div class="truncate text-base font-black text-foreground {rolling && bp.phase === 'drawGroup' ? 'opacity-60' : ''}">
        {rolling && bp.phase === "drawGroup" ? rollingLabel : bp.group || "待抽取"}
      </div>
    </div>
    <div class="min-w-0">
      <div class="text-[10px] text-muted-foreground">载具</div>
      <div
        class="truncate text-base font-black {bp.vehicle ? 'text-primary' : 'text-foreground'}
          {rolling && bp.phase === 'drawVehicle' ? 'opacity-60' : ''}"
      >
        {#if rolling && bp.phase === "drawVehicle"}
          {rollingLabel}
        {:else if bp.vehicle}
          {bp.vehicle}
        {:else if !rules.drawVehicle}
          {bp.group ? "组内任选" : "—"}
        {:else}
          {bp.phase === "drawVehicle" ? "待抽取" : "—"}
        {/if}
      </div>
    </div>
  </div>
  <div class="flex flex-wrap gap-1.5">
    {#if bp.phase === "done"}
      <span class="rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">已确认</span>
    {:else if bp.phase === "drawGroup"}
      {#if !bp.group || freeGroupRedraw}
        <button
          type="button"
          disabled={rolling || !groupsLeft.length}
          onclick={() => roll(groupsLeft, (s) => drawGroup(s, grouped))}
          class="rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground hover:bg-primary/85 disabled:opacity-50 cursor-pointer"
        >
          {bp.group ? "重新抽取" : "抽取大组"}
        </button>
      {/if}
      {#if bp.group}
        <button
          type="button"
          disabled={rolling || left.groups === 0}
          onclick={() => (bp = removeGroup(bp))}
          class="rounded-full border border-border px-3 py-1 text-xs hover:bg-muted disabled:opacity-50 cursor-pointer"
        >
          移出该组{removalsLabel(left.groups)}
        </button>
        {#if rules.drawVehicle}
          <button
            type="button"
            disabled={rolling}
            onclick={() => (bp = confirmGroup(bp))}
            class="rounded-full border border-primary/50 px-3 py-1 text-xs font-bold text-primary hover:bg-primary/10 disabled:opacity-50 cursor-pointer"
          >
            使用该组
          </button>
        {/if}
      {/if}
    {:else}
      {#if !bp.vehicle || freeVehicleRedraw}
        <button
          type="button"
          disabled={rolling || !vehiclesLeft.length}
          onclick={() => roll(vehiclesLeft, (s) => drawVehicle(s, grouped))}
          class="rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground hover:bg-primary/85 disabled:opacity-50 cursor-pointer"
        >
          {bp.vehicle ? "重新抽取" : "抽取载具"}
        </button>
      {/if}
      {#if bp.vehicle}
        <button
          type="button"
          disabled={rolling || left.vehicles === 0}
          onclick={() => (bp = removeVehicle(bp))}
          class="rounded-full border border-border px-3 py-1 text-xs hover:bg-muted disabled:opacity-50 cursor-pointer"
        >
          移出该载具{removalsLabel(left.vehicles)}
        </button>
      {/if}
      {#if canGoBack}
        <button
          type="button"
          disabled={rolling}
          onclick={() => (bp = backToGroups(bp))}
          class="rounded-full border border-border px-3 py-1 text-xs hover:bg-muted disabled:opacity-50 cursor-pointer"
        >
          返回大组
        </button>
      {/if}
    {/if}
  </div>
</div>
{#if bp.phase === "drawGroup" && !groupsLeft.length}
  <p class="text-center text-[11px] text-destructive">没有可抽的大组了，可以点"重置"重新开始。</p>
{:else if bp.phase === "drawVehicle" && !vehiclesLeft.length}
  <p class="text-center text-[11px] text-destructive">该组载具已全部移出，{canGoBack ? "请返回大组重新抽取" : "可以点\"重置\"重新开始"}。</p>
{/if}
