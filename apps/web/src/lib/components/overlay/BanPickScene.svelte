<script>
  // Overlay "banpick" scene: the live match's Ban / Pick as the server keeps
  // it (matches.banpick, POST .../banpick). Players and their bans on the
  // sides, the drawn group and vehicle (big garage-slot picture) in the
  // middle, every group along the bottom. A new draw rolls through the
  // options for a moment before it lands, like on the match page.
  import { untrack } from "svelte";
  import { fade, fly, scale } from "svelte/transition";
  import { availableGroups, availableVehicles, bansOf, groupVehicles, initialBanPick, resultLabel } from "#lib/banpick.js";
  import { slotImage, slotImageDirect } from "#lib/wt-units.js";
  import Flag from "#lib/components/Flag.svelte";

  let { tournament, activeMatch = null, pool = null, stageShort, who } = $props();

  let grouped = $derived(groupVehicles(pool?.vehicles || []));
  let record = $derived(activeMatch?.banpick?.state ? activeMatch.banpick : null);
  let bp = $derived(record?.state || initialBanPick(pool?.rules));
  let rules = $derived(bp.rules);
  let lastEntry = $derived(record?.log?.at(-1) || null);

  // Rolling to a new draw.
  let rolling = $state(false);
  let rollingPhase = $state("");
  let rollingLabel = $state("");
  let seen = untrack(() => lastEntry?.n ?? 0);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  $effect(() => {
    const e = lastEntry;
    untrack(async () => {
      if (!e || e.n <= seen) return;
      seen = e.n;
      if (e.action !== "drawGroup" && e.action !== "drawVehicle") return;
      const options = e.action === "drawGroup" ? availableGroups(bp, grouped) : availableVehicles(bp, grouped, bp.group);
      if (options.length < 2) return;
      rolling = true;
      rollingPhase = e.action;
      const end = Date.now() + 1600;
      let wait = 50;
      while (Date.now() < end) {
        rollingLabel = options[Math.floor(Math.random() * options.length)];
        await sleep(wait);
        wait = Math.min(180, wait * 1.08);
      }
      rolling = false;
    });
  });

  let shownGroup = $derived(rolling && rollingPhase === "drawGroup" ? rollingLabel : bp.group);
  let vehicleName = $derived(rolling && rollingPhase === "drawVehicle" ? rollingLabel : bp.vehicle);
  let groupEntry = $derived(grouped.find((g) => g.group === bp.group) || null);
  let shownVehicle = $derived(groupEntry?.vehicles.find((v) => v.name === vehicleName) || null);

  const PHASES = { ban: "BAN PHASE", drawGroup: "GROUP DRAW", drawVehicle: "VEHICLE DRAW", done: "LOCKED IN" };
  const turn = $derived(bp.phase === "ban" ? (bp.bans.length % 2 === 0 ? "A" : "B") : null);
  const banLabel = (b) => (b.group ? b.group : "PASS");
  const br = (v) => (v?.br == null ? "" : Number(v.br).toFixed(1));

  function fallback(e, unit) {
    const img = e.currentTarget;
    if (img.dataset.tried !== "1" && unit) {
      img.dataset.tried = "1";
      img.src = slotImageDirect(unit);
    } else img.style.visibility = "hidden";
  }
  function groupState(g) {
    const ban = bp.bans.find((b) => b.group === g.group);
    if (ban) return ban.by === "A" ? "banA" : "banB";
    if (bp.removedGroups.includes(g.group)) return "out";
    if (bp.group === g.group && !rolling) return "drawn";
    if (rolling && rollingPhase === "drawGroup" && rollingLabel === g.group) return "rolling";
    return "";
  }
</script>

{#snippet side(slot, playerId)}
  {@const bans = bansOf(bp, slot)}
  {@const active = turn === slot}
  <div
    class="flex w-[380px] flex-col gap-4 rounded-2xl border-2 bg-slate-950/85 p-6 shadow-2xl transition-all duration-500
      {slot === 'A' ? 'items-start' : 'items-end text-right'}
      {active ? (slot === 'A' ? 'border-rose-500 shadow-rose-500/30' : 'border-sky-500 shadow-sky-500/30') : 'border-slate-800'}"
  >
    <div class="flex items-center gap-3 {slot === 'B' ? 'flex-row-reverse' : ''}">
      <span class="flex h-12 w-12 items-center justify-center rounded-xl font-orbitron text-2xl font-black text-white {slot === 'A' ? 'bg-rose-500' : 'bg-sky-500'}">{slot}</span>
      <div class="min-w-0">
        <div class="flex items-center gap-2 {slot === 'B' ? 'justify-end' : ''}">
          {#if who.flag(playerId)}<Flag code={who.flag(playerId)} size={22} />{/if}
          <span class="max-w-[250px] truncate text-3xl font-black tracking-tight text-white">{who.name(playerId)}</span>
        </div>
        {#if active}
          <span class="font-mono text-sm font-bold tracking-widest {slot === 'A' ? 'text-rose-400' : 'text-sky-400'} animate-pulse">BANNING…</span>
        {/if}
      </div>
    </div>
    <div class="w-full">
      <span class="block font-mono text-xs font-bold tracking-widest text-slate-500">BANS</span>
      <div class="mt-2 flex flex-wrap gap-2 {slot === 'B' ? 'justify-end' : ''}">
        {#each bans as b, i (i)}
          <span
            in:scale={{ duration: 400, start: 1.6 }}
            class="rounded-lg border-2 px-3 py-1 text-xl font-black {b.group
              ? slot === 'A'
                ? 'border-rose-500/70 bg-rose-500/15 text-rose-300 line-through decoration-2'
                : 'border-sky-500/70 bg-sky-500/15 text-sky-300 line-through decoration-2'
              : 'border-slate-700 text-slate-500'}">{banLabel(b)}</span
          >
        {/each}
        {#each Array(Math.max(0, rules.bansPerPlayer - bans.length)) as _, i (i)}
          <span class="rounded-lg border-2 border-dashed border-slate-700 px-5 py-1 text-xl font-black text-slate-700">?</span>
        {/each}
      </div>
    </div>
  </div>
{/snippet}

<div class="absolute inset-0 z-10 flex flex-col p-10" transition:fade={{ duration: 400 }}>
  <header class="flex items-end justify-between border-b-2 border-cyan-500/20 pb-3 font-orbitron">
    <div>
      <span class="block font-mono text-sm font-bold uppercase tracking-widest text-cyan-400">
        {tournament?.name}{activeMatch ? ` • ${stageShort(activeMatch)}` : ""}
      </span>
      <h1 class="text-6xl font-extrabold uppercase leading-none tracking-wider text-white">BAN / PICK</h1>
    </div>
    <div class="text-right">
      <span class="block font-sans text-sm tracking-wider text-slate-400">{pool?.name || ""}</span>
      <span class="text-3xl font-black tracking-wider {bp.phase === 'done' ? 'text-amber-400' : 'text-cyan-400'}">{PHASES[bp.phase] || ""}</span>
    </div>
  </header>

  {#if !activeMatch}
    <div class="flex flex-1 items-center justify-center">
      <p class="rounded-2xl border border-slate-800 bg-slate-900/60 px-10 py-6 text-2xl text-slate-400">No active match selected.</p>
    </div>
  {:else}
    <div class="flex flex-1 items-center justify-between gap-8 py-6">
      {@render side("A", activeMatch.player1_id)}

      <!-- Result -->
      <div class="flex min-w-0 flex-1 flex-col items-center gap-5">
        <div class="text-center">
          <span class="block font-mono text-sm font-bold tracking-widest text-slate-500">GROUP</span>
          <span class="block font-orbitron text-7xl font-black tracking-wide {shownGroup ? (rolling && rollingPhase === 'drawGroup' ? 'text-slate-300' : 'text-white') : 'text-slate-700'}">
            {shownGroup || "—"}
          </span>
        </div>
        <div
          class="relative h-[260px] w-[620px] overflow-hidden rounded-xl border-4 bg-gradient-to-b from-[#3a4552] to-[#1d242c] shadow-2xl transition-all duration-300
            {bp.phase === 'done' && !rolling ? 'border-amber-400 shadow-amber-400/40' : rolling ? 'border-sky-300' : shownVehicle ? 'border-cyan-400/70' : 'border-slate-700'}"
        >
          {#if shownVehicle}
            {#key shownVehicle.name}
              {#if shownVehicle.unit}
                <img
                  src={slotImage(shownVehicle.unit)}
                  alt=""
                  class="absolute bottom-0 left-0 h-full w-[80%] object-contain object-left-bottom"
                  onerror={(e) => fallback(e, shownVehicle.unit)}
                  in:fade={{ duration: rolling ? 0 : 300 }}
                />
              {/if}
            {/key}
            <span class="absolute right-5 top-4 max-w-[70%] truncate text-right text-4xl font-black text-white drop-shadow-lg">{shownVehicle.name}</span>
            {#if shownVehicle.br != null}
              <span class="absolute bottom-4 right-5 font-orbitron text-3xl font-black text-slate-200 drop-shadow">{br(shownVehicle.br)}</span>
            {/if}
          {:else}
            <div class="flex h-full items-center justify-center text-3xl font-black tracking-widest text-slate-600">
              {!rules.drawVehicle && bp.group ? "组内任选" : bp.phase === "drawVehicle" ? "VEHICLE ?" : "—"}
            </div>
          {/if}
        </div>
        {#if bp.phase === "done" && !rolling}
          <span in:fly={{ y: 20, duration: 500 }} class="rounded-full bg-amber-400 px-6 py-1.5 text-2xl font-black text-black">本场载具：{resultLabel(bp)}</span>
        {/if}
      </div>

      {@render side("B", activeMatch.player2_id)}
    </div>

    <!-- Every group -->
    <div class="flex flex-wrap justify-center gap-2">
      {#each grouped as g (g.group)}
        {@const st = groupState(g)}
        <span
          class="rounded-lg border-2 px-3 py-1 text-lg font-bold transition-all duration-200
            {st === 'banA'
            ? 'border-rose-500/60 bg-rose-500/15 text-rose-300 line-through'
            : st === 'banB'
              ? 'border-sky-500/60 bg-sky-500/15 text-sky-300 line-through'
              : st === 'out'
                ? 'border-slate-800 text-slate-600 line-through'
                : st === 'drawn'
                  ? 'border-amber-400 bg-amber-400/20 text-amber-200 shadow-[0_0_18px_rgba(251,191,36,0.5)]'
                  : st === 'rolling'
                    ? 'scale-110 border-sky-300 bg-sky-300/20 text-white'
                    : 'border-slate-700 bg-slate-900/70 text-slate-200'}"
        >
          {g.group}
        </span>
      {/each}
    </div>
  {/if}
</div>
