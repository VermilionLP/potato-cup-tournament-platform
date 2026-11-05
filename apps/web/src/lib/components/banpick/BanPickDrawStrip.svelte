<script>
  // Ban / Pick after the bans: the drawn group and vehicle with a short
  // slot-machine roll, and the draw / remove / back buttons the rules allow
  // (and the viewer may use: `can`). Once a group is drawn its vehicles show
  // as garage slots with wiki pictures (the roll highlights them); the drawn
  // vehicle shows as a big slot. `run(action)` carries an action out (on the
  // server for a match); a draw someone else made (a new `lastEntry`) rolls
  // here too, so everyone watching sees it land.
  import { untrack } from "svelte";
  import { availableGroups, availableVehicles, rerollsLeft } from "#lib/banpick.js";
  import VehicleSlot from "./VehicleSlot.svelte";

  let { bp, grouped = [], run, can = () => true, busy = false, lastEntry = null, rolling = $bindable(false) } = $props();
  let rollingLabel = $state("");
  let rollingPhase = $state("");

  const rules = $derived(bp.rules);
  const groupsLeft = $derived(availableGroups(bp, grouped));
  const vehiclesLeft = $derived(bp.group ? availableVehicles(bp, grouped, bp.group) : []);
  const left = $derived(rerollsLeft(bp));
  // With a removal limit, a drawn result can only be swapped by removing it.
  const freeGroupRedraw = $derived(rules.groupRerolls === null);
  const freeVehicleRedraw = $derived(rules.vehicleRerolls === null);
  const canGoBack = $derived(rules.groupRerolls === null && rules.vehicleRerolls === null);
  // Spectators (and players once it is confirmed) get no buttons.
  const actor = $derived(can("drawGroup"));

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // Slot-machine effect: random names for at least 900 ms and until `done` settles.
  async function spin(options, phase, done) {
    let settled = false;
    done.then(
      () => (settled = true),
      () => (settled = true),
    );
    rolling = true;
    rollingPhase = phase;
    const end = Date.now() + 900;
    while (!settled || Date.now() < end) {
      rollingLabel = options[Math.floor(Math.random() * options.length)];
      await sleep(60);
    }
    rolling = false;
  }

  let own = false;
  async function roll(options, action) {
    if (rolling || busy || !options.length) return;
    own = true;
    const done = run(action);
    try {
      await spin(options, action === "drawGroup" ? "drawGroup" : "drawVehicle", done);
      await done;
    } catch {
      // the page shows the error
    } finally {
      own = false;
    }
  }

  // Someone else's draw (server mode): roll to it.
  let seenEntry = untrack(() => lastEntry?.n ?? 0);
  $effect(() => {
    const e = lastEntry;
    untrack(() => {
      if (!e || e.n <= seenEntry) return;
      seenEntry = e.n;
      if (own || rolling || (e.action !== "drawGroup" && e.action !== "drawVehicle")) return;
      const options = e.action === "drawGroup" ? groupsLeft : vehiclesLeft;
      if (options.length > 1) spin(options, e.action, sleep(0));
    });
  });

  const removalsLabel = (n) => (n === null ? "" : `（剩 ${n} 次）`);

  // The drawn (or rolling) group and its vehicles, for the pictures.
  let shownGroup = $derived(rolling && rollingPhase === "drawGroup" ? rollingLabel : bp.group);
  let groupVehiclesShown = $derived(grouped.find((g) => g.group === bp.group)?.vehicles || []);
  let shownVehicle = $derived(
    rolling && rollingPhase === "drawVehicle" ? groupVehiclesShown.find((v) => v.name === rollingLabel) : groupVehiclesShown.find((v) => v.name === bp.vehicle),
  );
  const slotState = (v) =>
    rolling && rollingPhase === "drawVehicle" && v.name === rollingLabel
      ? "rolling"
      : v.name === bp.vehicle && !(rolling && rollingPhase === "drawVehicle")
        ? "chosen"
        : bp.removedVehicles.includes(v.name)
          ? "out"
          : "";
</script>

<div
  class="flex flex-col gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 sm:flex-row sm:items-center"
>
  <div class="grid flex-1 grid-cols-2 gap-3">
    <div class="min-w-0">
      <div class="text-[10px] text-muted-foreground">大组</div>
      <div class="flex min-w-0 items-center gap-1.5 text-base font-black text-foreground {rolling && rollingPhase === 'drawGroup' ? 'opacity-60' : ''}">
        <span class="truncate">{shownGroup || "待抽取"}</span>
      </div>
    </div>
    <div class="min-w-0">
      <div class="text-[10px] text-muted-foreground">载具</div>
      <div
        class="truncate text-base font-black {bp.vehicle ? 'text-primary' : 'text-foreground'}
          {rolling && rollingPhase === 'drawVehicle' ? 'opacity-60' : ''}"
      >
        {#if shownVehicle}
          <div class="mt-0.5 w-full max-w-[13rem]"><VehicleSlot vehicle={shownVehicle} size="lg" state={rolling ? "rolling" : "chosen"} /></div>
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
    {:else if !actor}
      <span class="rounded-full border border-border px-3 py-1 text-[11px] text-muted-foreground">观战中</span>
    {:else if bp.phase === "drawGroup"}
      {#if !bp.group || freeGroupRedraw}
        <button
          type="button"
          disabled={busy || rolling || !groupsLeft.length}
          onclick={() => roll(groupsLeft, "drawGroup")}
          class="rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground hover:bg-primary/85 disabled:opacity-50 cursor-pointer"
        >
          {bp.group ? "重新抽取" : "抽取大组"}
        </button>
      {/if}
      {#if bp.group}
        <button
          type="button"
          disabled={busy || rolling || left.groups === 0}
          onclick={() => run("removeGroup")}
          class="rounded-full border border-border px-3 py-1 text-xs hover:bg-muted disabled:opacity-50 cursor-pointer"
        >
          移出该组{removalsLabel(left.groups)}
        </button>
        {#if rules.drawVehicle}
          <button
            type="button"
            disabled={busy || rolling}
            onclick={() => run("confirmGroup")}
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
          disabled={busy || rolling || !vehiclesLeft.length}
          onclick={() => roll(vehiclesLeft, "drawVehicle")}
          class="rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground hover:bg-primary/85 disabled:opacity-50 cursor-pointer"
        >
          {bp.vehicle ? "重新抽取" : "抽取载具"}
        </button>
      {/if}
      {#if bp.vehicle}
        <button
          type="button"
          disabled={busy || rolling || left.vehicles === 0}
          onclick={() => run("removeVehicle")}
          class="rounded-full border border-border px-3 py-1 text-xs hover:bg-muted disabled:opacity-50 cursor-pointer"
        >
          移出该载具{removalsLabel(left.vehicles)}
        </button>
      {/if}
      {#if canGoBack}
        <button
          type="button"
          disabled={busy || rolling}
          onclick={() => run("backToGroups")}
          class="rounded-full border border-border px-3 py-1 text-xs hover:bg-muted disabled:opacity-50 cursor-pointer"
        >
          返回大组
        </button>
      {/if}
    {/if}
  </div>
</div>
{#if bp.group && groupVehiclesShown.length && (bp.phase === "drawVehicle" || !rules.drawVehicle)}
  <div class="space-y-1">
    <div class="text-[10px] text-muted-foreground">
      {rules.drawVehicle ? `${bp.group} 组的载具` : `${bp.group} 组内任选一辆`}
    </div>
    <div class="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4">
      {#each groupVehiclesShown as v (v.name)}
        <VehicleSlot vehicle={v} size="sm" state={slotState(v)} />
      {/each}
    </div>
  </div>
{/if}
{#if bp.phase === "drawGroup" && !groupsLeft.length}
  <p class="text-center text-[11px] text-destructive">没有可抽的大组了，可以点"重置"重新开始。</p>
{:else if bp.phase === "drawVehicle" && !vehiclesLeft.length}
  <p class="text-center text-[11px] text-destructive">该组载具已全部移出，{canGoBack ? "请返回大组重新抽取" : "可以点\"重置\"重新开始"}。</p>
{/if}
