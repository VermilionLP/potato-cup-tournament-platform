<script>
  import Flag from "$lib/components/Flag.svelte";
  import {
    availableGroups,
    availableVehicles,
    backToGroups,
    ban,
    confirmGroup,
    drawGroup,
    drawVehicle,
    groupVehicles,
    initialBanPick,
    isGroupBanned,
    removeGroup,
    removeVehicle,
  } from "$lib/banpick.js";

  let {
    vehicles = [],
    poolName = "",
    player1 = { name: "A", flag: "" },
    player2 = { name: "B", flag: "" },
    // Owned by the page so its header can confirm the result and so reopening
    // the same match keeps the Ban/Pick progress.
    bp = $bindable(initialBanPick()),
  } = $props();
  let rolling = $state(false);
  let rollingLabel = $state("");

  const grouped = $derived(groupVehicles(vehicles));
  const groupsLeft = $derived(availableGroups(bp, grouped));
  const vehiclesLeft = $derived(
    bp.group ? availableVehicles(bp, grouped, bp.group) : [],
  );
  const steps = [
    { id: "banA", label: "A 禁用" },
    { id: "banB", label: "B 禁用" },
    { id: "drawGroup", label: "抽大组" },
    { id: "drawVehicle", label: "抽载具" },
  ];
  const stepIndex = $derived(
    bp.phase === "done" ? steps.length : steps.findIndex((s) => s.id === bp.phase),
  );
  const vehicleCount = $derived(grouped.reduce((n, g) => n + g.vehicles.length, 0));
  const banning = $derived(bp.phase === "banA" || bp.phase === "banB");

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

  function banLabel(entry) {
    if (!entry) return "—";
    if (!entry.group) return "空过";
    return entry.vehicle ? `${entry.group} · ${entry.vehicle}` : entry.group;
  }

  function vehicleInfo(v) {
    return [v.nation, v.br != null ? `BR ${v.br}` : null, v.type].filter(Boolean).join(" · ");
  }
</script>

{#snippet side(slot, player, entry, active)}
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
      <div class="truncate text-[10px] {entry?.group ? 'font-semibold text-destructive' : 'text-muted-foreground'}">
        禁用：{banLabel(entry)}
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
{/snippet}

<div class="space-y-3">
  <!-- Players and their bans, with the step indicator in between -->
  <div class="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
    {@render side("A", player1, bp.banA, bp.phase === "banA")}
    <ol class="flex shrink-0 items-center justify-center gap-1 px-1">
      {#each steps as step, i (step.id)}
        <li
          class="rounded-full px-2 py-0.5 text-[10px] font-semibold
            {i === stepIndex
            ? 'bg-primary text-primary-foreground'
            : i < stepIndex
              ? 'bg-primary/15 text-primary'
              : 'bg-muted text-muted-foreground'}"
        >
          {step.label}
        </li>
      {/each}
    </ol>
    {@render side("B", player2, bp.banB, bp.phase === "banB")}
  </div>

  <!-- Draw strip -->
  {#if !banning}
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
          <button
            type="button"
            disabled={rolling || !groupsLeft.length}
            onclick={() => roll(groupsLeft, (s) => drawGroup(s, grouped))}
            class="rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground hover:bg-primary/85 disabled:opacity-50 cursor-pointer"
          >
            {bp.group ? "重新抽取" : "抽取大组"}
          </button>
          {#if bp.group}
            <button
              type="button"
              disabled={rolling}
              onclick={() => (bp = removeGroup(bp))}
              class="rounded-full border border-border px-3 py-1 text-xs hover:bg-muted disabled:opacity-50 cursor-pointer"
            >
              移出该组
            </button>
            <button
              type="button"
              disabled={rolling}
              onclick={() => (bp = confirmGroup(bp))}
              class="rounded-full border border-primary/50 px-3 py-1 text-xs font-bold text-primary hover:bg-primary/10 disabled:opacity-50 cursor-pointer"
            >
              使用该组
            </button>
          {/if}
        {:else}
          <button
            type="button"
            disabled={rolling || !vehiclesLeft.length}
            onclick={() => roll(vehiclesLeft, (s) => drawVehicle(s, grouped))}
            class="rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground hover:bg-primary/85 disabled:opacity-50 cursor-pointer"
          >
            {bp.vehicle ? "重新抽取" : "抽取载具"}
          </button>
          {#if bp.vehicle}
            <button
              type="button"
              disabled={rolling}
              onclick={() => (bp = removeVehicle(bp))}
              class="rounded-full border border-border px-3 py-1 text-xs hover:bg-muted disabled:opacity-50 cursor-pointer"
            >
              移出该载具
            </button>
          {/if}
          <button
            type="button"
            disabled={rolling}
            onclick={() => (bp = backToGroups(bp))}
            class="rounded-full border border-border px-3 py-1 text-xs hover:bg-muted disabled:opacity-50 cursor-pointer"
          >
            返回大组
          </button>
        {/if}
      </div>
    </div>
    {#if bp.phase === "drawGroup" && !groupsLeft.length}
      <p class="text-center text-[11px] text-destructive">没有可抽的大组了，可以点"重置"重新开始。</p>
    {:else if bp.phase === "drawVehicle" && !vehiclesLeft.length}
      <p class="text-center text-[11px] text-destructive">该组载具已全部移出，请返回大组重新抽取。</p>
    {/if}
  {/if}

  <!-- Vehicle groups -->
  <div class="flex items-center justify-between text-[10px] text-muted-foreground">
    <span>
      {poolName ? `${poolName} · ` : ""}{grouped.length} 个大组 · {vehicleCount} 架
      {#if banning}· 点击大组名或载具即可禁用整组{/if}
    </span>
    <button
      type="button"
      disabled={rolling}
      onclick={() => (bp = initialBanPick())}
      class="rounded px-1.5 py-0.5 hover:bg-muted hover:text-foreground cursor-pointer"
    >
      重置
    </button>
  </div>
  <div class="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
    {#each grouped as g (g.group)}
      {@const bannedBy = bp.banA?.group === g.group ? "A" : bp.banB?.group === g.group ? "B" : null}
      {@const removed = bp.removedGroups.includes(g.group)}
      {@const drawn = bp.group === g.group}
      {@const pickable = banning && !isGroupBanned(bp, g.group)}
      <div
        class="rounded-md border px-1.5 py-1 transition-colors
          {bannedBy
          ? bannedBy === 'A'
            ? 'border-rose-500/50 bg-rose-500/10'
            : 'border-sky-500/50 bg-sky-500/10'
          : drawn
            ? 'border-primary bg-primary/10 ring-1 ring-primary/50'
            : removed
              ? 'border-border bg-muted/40 opacity-45'
              : 'border-border bg-background/50'}
          {pickable ? 'hover:border-foreground/40' : ''}"
      >
        <button
          type="button"
          disabled={!pickable}
          onclick={() => (bp = ban(bp, g.group))}
          class="flex w-full items-center justify-between gap-1 text-left {pickable ? 'cursor-pointer' : 'cursor-default'}"
        >
          <span class="truncate text-[11px] font-bold text-foreground {removed ? 'line-through' : ''}">{g.group}</span>
          {#if bannedBy}
            <span
              class="shrink-0 rounded px-1 text-[9px] font-black text-white {bannedBy === 'A' ? 'bg-rose-500' : 'bg-sky-500'}"
              >{bannedBy} 禁</span
            >
          {:else}
            <span class="shrink-0 text-[9px] text-muted-foreground">{g.vehicles.length}</span>
          {/if}
        </button>
        <div class="mt-0.5 flex flex-wrap gap-0.5">
          {#each g.vehicles as v (v.name)}
            {@const out = bp.removedVehicles.includes(v.name)}
            {@const chosen = bp.vehicle === v.name}
            <button
              type="button"
              disabled={!pickable}
              onclick={() => (bp = ban(bp, g.group, v.name))}
              title={vehicleInfo(v)}
              class="rounded px-1 py-px text-[9.5px] leading-tight
                {chosen
                ? 'bg-primary font-bold text-primary-foreground'
                : out
                  ? 'text-muted-foreground/60 line-through'
                  : 'bg-muted/60 text-foreground/80'}
                {pickable ? 'hover:bg-foreground/10 cursor-pointer' : 'cursor-default'}"
            >
              {v.name}
            </button>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</div>
