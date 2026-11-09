<script>
  // Overlay "banpick" scene: the live match's Ban / Pick as the server keeps
  // it (matches.banpick, POST .../banpick), in three stages that move into
  // each other:
  //   1. ban + group draw — every group fills the screen (bans, the drawn
  //      group, removed ones, vehicles left), the steps so far below;
  //   2. vehicle draw — the groups shrink into a column on the left (the
  //      drawn group and the bans) and the group's vehicles take the stage;
  //   3. locked in — everything else leaves and the vehicle (or, for a
  //      template that ends at the group, the group) is shown in detail:
  //      its specifications from the War Thunder wiki (#lib/vehicle-specs.js)
  //      in four cards, or the group's vehicles and the bans without them.
  // A new draw rolls through the options for a moment before it lands.
  import { untrack } from "svelte";
  import { fade } from "svelte/transition";
  import { availableGroups, availableVehicles, bansOf, effectiveLog, groupVehicles, initialBanPick } from "#lib/banpick.js";
  import { matchStageLabels, tierEnglish } from "#lib/overlay.js";
  import { slotImage, slotImageDirect } from "#lib/wt-units.js";
  import { loadVehicleSpecs, specCards } from "#lib/vehicle-specs.js";
  import Flag from "#lib/components/Flag.svelte";
  import OverlayTopBar from "./OverlayTopBar.svelte";
  import LeagueBadge from "./LeagueBadge.svelte";

  let { tournament, activeMatch = null, pool = null, stageMatches = [], who } = $props();

  let grouped = $derived(groupVehicles(pool?.vehicles || []));
  let record = $derived(activeMatch?.banpick?.state ? activeMatch.banpick : null);
  let bp = $derived(record?.state || initialBanPick(pool?.rules));
  let rules = $derived(bp.rules);
  let log = $derived(effectiveLog(record?.log || []));
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

  // Stage: 1 groups, 2 vehicles, 3 locked in. The reveal waits for a roll
  // to land.
  let stage = $derived(bp.phase === "done" && !rolling ? 3 : bp.phase === "drawVehicle" || (bp.phase === "done" && rolling) ? 2 : 1);
  let turn = $derived(bp.phase === "ban" ? (bp.bans.length % 2 === 0 ? "A" : "B") : null);
  let groupEntry = $derived(grouped.find((g) => g.group === bp.group) || null);
  let groupsLeft = $derived(availableGroups(bp, grouped).length);
  let shownVehicleName = $derived(rolling && rollingPhase === "drawVehicle" ? rollingLabel : bp.vehicle);
  let lockedVehicle = $derived(groupEntry?.vehicles.find((v) => v.name === bp.vehicle) || null);
  // The locked vehicle's specifications. The group's vehicles are asked for
  // while the vehicle is being drawn, so the reveal has them at once.
  const unitOf = (v) => v?.wiki || v?.unit || null;
  let specs = $state(null);
  $effect(() => {
    const unit = unitOf(lockedVehicle);
    specs = null;
    if (!unit) return;
    let current = true;
    loadVehicleSpecs(unit).then((s) => current && (specs = s));
    return () => (current = false);
  });
  $effect(() => {
    if (stage !== 2) return;
    for (const v of groupEntry?.vehicles || []) loadVehicleSpecs(unitOf(v));
  });
  let cards = $derived(specCards(specs, String(tournament?.game_mode || "").toLowerCase()));

  // Who pressed the draw buttons.
  const sideOf = (action) => [...log].reverse().find((e) => e.action === action)?.side || null;
  let groupDrawer = $derived(sideOf("drawGroup"));
  let vehicleDrawer = $derived(sideOf("drawVehicle"));
  const playerOf = (side) => (side === "A" ? activeMatch?.player1_id : side === "B" ? activeMatch?.player2_id : null);

  function groupState(g) {
    const ban = bp.bans.find((b) => b.group === g.group);
    if (ban) return ban.by === "A" ? "banA" : "banB";
    if (bp.removedGroups.includes(g.group)) return "out";
    if (rolling && rollingPhase === "drawGroup") return rollingLabel === g.group ? "rolling" : "free";
    if (bp.group === g.group) return "picked";
    return "free";
  }
  function vehicleState(v) {
    if (bp.removedVehicles.includes(v.name)) return "out";
    if (rolling && rollingPhase === "drawVehicle") return rollingLabel === v.name ? "rolling" : "free";
    if (bp.vehicle === v.name) return "picked";
    return "free";
  }
  const left = (g) => g.vehicles.filter((v) => !bp.removedVehicles.includes(v.name)).length;
  const br = (v) => (v?.br == null ? "" : Number(v.br).toFixed(1));
  let gridCols = $derived(grouped.length > 18 ? 8 : 6);
  let gridRows = $derived(Math.max(1, Math.ceil(grouped.length / gridCols)));
  let vehicleCols = $derived(Math.min(5, Math.max(1, groupEntry?.vehicles.length || 1)));

  // The steps so far, newest last (last six).
  const STEP = { ban: "BAN", pass: "PASS", drawGroup: "DRAW", removeGroup: "REMOVE", confirmGroup: "LOCK GROUP", drawVehicle: "DRAW", removeVehicle: "REMOVE", confirm: "CONFIRM", backToGroups: "BACK" };
  let sequence = $derived(
    log
      .map((e, i) => ({ n: i + 1, side: e.side || null, step: STEP[e.action] || e.action.toUpperCase(), what: e.action === "pass" ? "—" : e.vehicle || e.group || "", action: e.action }))
      .slice(-6),
  );
  let vehicleSteps = $derived(log.filter((e) => e.action === "drawVehicle" || e.action === "removeVehicle").slice(-3));

  let steps = $derived([
    { label: "BAN", state: bp.phase === "ban" ? "active" : "done" },
    { label: "GROUP", state: bp.phase === "drawGroup" ? "active" : bp.phase === "ban" ? "todo" : "done" },
    ...(rules.drawVehicle ? [{ label: "VEHICLE", state: stage === 2 ? "active" : stage === 3 ? "done" : "todo" }] : []),
    { label: "LOCKED", state: stage === 3 ? "active" : "todo" },
  ]);
  let tag = $derived(activeMatch ? matchStageLabels(activeMatch, tournament?.matches || stageMatches).tag : "");
  let stepNote = $derived(
    bp.phase === "ban" ? `${turn} BANNING` : bp.phase === "drawGroup" ? "GROUP DRAW" : bp.phase === "drawVehicle" ? "VEHICLE DRAW" : "LOCKED IN",
  );

  function fallback(e, unit) {
    const img = e.currentTarget;
    if (img.dataset.tried !== "1" && unit) {
      img.dataset.tried = "1";
      img.src = slotImageDirect(unit);
    } else img.style.visibility = "hidden";
  }
  const EASE = "cubic-bezier(.65,0,.25,1)";
</script>

{#snippet strip(slot, pid)}
  {@const right = slot === "B"}
  {@const p = who.get(pid)}
  {@const bans = bansOf(bp, slot)}
  {@const active = turn === slot}
  <div
    class="relative flex h-[104px] w-[760px] items-center gap-5 overflow-hidden rounded-2xl border bg-[rgba(24,40,70,0.92)] px-6 transition-shadow duration-500
      {right ? 'flex-row-reverse' : ''}
      {active ? (right ? 'border-side-b shadow-[0_0_30px_rgba(183,155,255,0.35)]' : 'border-side-a shadow-[0_0_30px_rgba(245,184,61,0.35)]') : 'border-white/[0.07]'}"
  >
    <div class="absolute inset-y-0 w-[5px] {right ? 'right-0 bg-side-b' : 'left-0 bg-side-a'}"></div>
    <span class="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl font-display text-[34px] font-extrabold {right ? 'bg-side-b text-[#22124A]' : 'bg-side-a text-[#2A1C02]'}">{slot}</span>
    <div class="flex min-w-0 flex-col gap-1.5 {right ? 'items-end text-right' : ''}">
      <span class="flex min-w-0 items-center gap-2.5 {right ? 'flex-row-reverse' : ''}">
        {#if pid}<Flag code={who.flag(pid)} size={26} />{/if}
        <span class="truncate text-[32px] font-black leading-tight">{who.name(pid)}</span>
      </span>
      <span class="inline-flex items-center gap-2 whitespace-nowrap font-num text-base font-bold text-[#AFC0D8] {right ? 'flex-row-reverse' : ''}">
        <LeagueBadge tier={p?.ladder_tier} size={18} />{tierEnglish(p?.ladder_tier)} · MMR {p?.ladder_mmr ?? "—"}
        {#if active}<span class="animate-pulse text-cyan-400">· BANNING…</span>{/if}
      </span>
    </div>
    <span class="flex-1"></span>
    <div class="flex shrink-0 gap-2.5 {right ? 'flex-row-reverse' : ''}">
      {#each bans as b, i (i)}
        {#if b.group}
          <span class="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-[10px] border px-3.5 {right ? 'border-side-b/40 bg-side-b/15' : 'border-side-a/40 bg-side-a/15'}">
            <span class="font-num text-base font-bold tracking-[0.12em] text-[#AFC0D8]">BAN</span>
            <span class="font-display text-[26px] font-extrabold line-through decoration-2 {right ? 'text-[#E4DBFF]' : 'text-[#FCE3A6]'}">{b.group}</span>
          </span>
        {:else}
          <span class="inline-flex h-11 items-center rounded-[10px] border border-dashed border-white/25 px-4 font-display text-2xl font-extrabold text-[#7184A3]">PASS</span>
        {/if}
      {/each}
      {#each Array(Math.max(0, rules.bansPerPlayer - bans.length)) as _, i (i)}
        <span class="inline-flex h-11 w-16 items-center justify-center rounded-[10px] border border-dashed border-white/20 font-display text-2xl font-extrabold text-[#7184A3]">?</span>
      {/each}
    </div>
  </div>
{/snippet}

{#snippet sideChip(side)}
  <span class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md font-display text-lg font-extrabold text-[#10131A] {side === 'A' ? 'bg-side-a' : side === 'B' ? 'bg-side-b' : 'bg-white/30'}">{side || "·"}</span>
{/snippet}

{#snippet vehicleImage(v, cls)}
  {#if v?.unit}
    {#key v.name}
      <img src={slotImage(v.unit)} alt="" class={cls} onerror={(e) => fallback(e, v.unit)} />
    {/key}
  {/if}
{/snippet}

<div class="absolute inset-0 z-10 overflow-hidden" transition:fade={{ duration: 400 }}>
  <OverlayTopBar {tournament} {steps}>
    {#snippet right()}
      {#if tag}<span class="font-num text-base font-bold tracking-[0.16em] text-[#AFC0D8]">{tag}</span>{/if}
      <span class="font-display text-[32px] font-extrabold leading-none">BAN / PICK</span>
    {/snippet}
  </OverlayTopBar>

  {#if !activeMatch}
    <div class="absolute inset-x-16 bottom-16 top-[140px] flex items-center justify-center">
      <p class="rounded-2xl bg-[rgba(24,40,70,0.92)] px-10 py-6 text-2xl text-[#AFC0D8]">No live match selected.</p>
    </div>
  {:else}
    <!-- Players (leave for the reveal) -->
    <div class="absolute inset-x-16 top-[140px] flex h-[104px] items-center justify-between transition-all duration-[600ms] {stage === 3 ? '-translate-y-6 opacity-0' : ''}">
      {@render strip("A", activeMatch.player1_id)}
      <div class="flex flex-col items-center gap-1.5">
        <span class="font-display text-[56px] font-extrabold italic leading-none">VS</span>
        <span class="font-num text-base font-bold tracking-[0.16em] text-cyan-200">{stepNote}</span>
      </div>
      {@render strip("B", activeMatch.player2_id)}
    </div>

    <!-- 1 · Groups: the whole stage, then a column on the left -->
    <div
      class="absolute bottom-16 left-16 top-[276px] overflow-hidden rounded-[20px] border border-white/[0.07] bg-[rgba(24,40,70,0.92)]"
      style="width: {stage === 1 ? 1792 : 440}px; transform: {stage === 3 ? 'translateX(-560px)' : 'none'}; opacity: {stage === 3 ? 0 : 1}; transition: width 800ms {EASE}, transform 700ms {EASE}, opacity 600ms;"
    >
      <!-- Full grid -->
      <div class="absolute inset-y-0 left-0 flex w-[1792px] flex-col gap-4 px-8 py-7 transition-opacity duration-300 {stage === 1 ? 'opacity-100' : 'pointer-events-none opacity-0'}">
        <div class="flex items-center gap-5">
          <span class="font-display text-[44px] font-extrabold leading-none">GROUP DRAW</span>
          <span class="ml-3 flex items-center gap-5 text-base text-[#C3CAD4]">
            <span class="inline-flex items-center gap-2"><span class="h-3.5 w-3.5 rounded bg-side-a"></span>A BAN</span>
            <span class="inline-flex items-center gap-2"><span class="h-3.5 w-3.5 rounded bg-side-b"></span>B BAN</span>
            <span class="inline-flex items-center gap-2"><span class="h-3.5 w-3.5 rounded bg-cyan-400"></span>THIS MATCH</span>
            <span class="inline-flex items-center gap-2"><span class="h-3.5 w-3.5 rounded border border-dashed border-white/40"></span>REMOVED</span>
            <span class="inline-flex items-center gap-2"><span class="h-3.5 w-3.5 rounded bg-white/30"></span>AVAILABLE</span>
          </span>
          <span class="flex-1"></span>
          <span class="font-display text-[44px] font-extrabold leading-none">{groupsLeft}<span class="text-[#AFC0D8]"> / {grouped.length}</span></span>
          <span class="font-num text-base font-bold tracking-[0.16em] text-[#AFC0D8]">LEFT</span>
        </div>
        <div class="grid min-h-0 flex-1 gap-4" style="grid-template-columns: repeat({gridCols}, minmax(0, 1fr)); grid-template-rows: repeat({gridRows}, minmax(0, 1fr));">
          {#each grouped as g (g.group)}
            {@const st = groupState(g)}
            <div
              class="relative flex min-w-0 flex-col justify-between overflow-hidden rounded-2xl p-5 transition-all duration-150
                {st === 'banA'
                ? 'border border-side-a/40 bg-side-a/[0.08]'
                : st === 'banB'
                  ? 'border border-side-b/40 bg-side-b/[0.08]'
                  : st === 'out'
                    ? 'border border-dashed border-white/20'
                    : st === 'picked'
                      ? 'pulse border border-cyan-400 bg-cyan-400'
                      : st === 'rolling'
                        ? 'scale-[1.03] border border-cyan-200 bg-cyan-400/30'
                        : 'border border-white/[0.12] bg-white/5'}"
            >
              {#if st === "picked"}<span class="pointer-events-none absolute -right-2 -top-7 font-display text-[150px] font-extrabold leading-none text-black/10">★</span>{/if}
              <span
                class="relative truncate text-[30px] font-black
                  {st === 'banA' ? 'text-[#FCE3A6] line-through opacity-75' : st === 'banB' ? 'text-[#E4DBFF] line-through opacity-75' : st === 'out' ? 'text-[#7184A3] line-through' : st === 'picked' ? 'text-[#03252E]' : ''}"
              >{g.group}</span>
              <span class="relative flex items-center justify-between gap-2">
                {#if st === "banA" || st === "banB"}
                  <span class="inline-flex h-8 items-center rounded-lg px-3 font-num text-[17px] font-extrabold {st === 'banA' ? 'bg-side-a text-[#2A1C02]' : 'bg-side-b text-[#22124A]'}">{st === "banA" ? "A" : "B"} BAN</span>
                {:else if st === "picked"}
                  <span class="font-num text-[17px] font-extrabold tracking-[0.06em] text-[#03252E]">★ THIS MATCH</span>
                {:else if st === "out"}
                  <span class="font-num text-[17px] font-extrabold tracking-[0.06em] text-[#7184A3]">REMOVED</span>
                {:else}
                  <span class="flex min-w-0 gap-1.5 overflow-hidden">{#each Array(Math.min(left(g), 4)) as _, i (i)}<span class="h-3 w-3 shrink-0 rounded-[3px] bg-[#AFC0D8]"></span>{/each}</span>
                  <span class="shrink-0 whitespace-nowrap font-num text-[17px] font-extrabold tracking-[0.06em] text-[#AFC0D8]">{left(g)} LEFT</span>
                {/if}
              </span>
            </div>
          {/each}
        </div>
        <div class="flex flex-col gap-2.5">
          <span class="font-num text-base font-bold tracking-[0.16em] text-[#AFC0D8]">SEQUENCE</span>
          <div class="flex h-16 gap-2.5">
            {#each sequence as q, i (q.n)}
              <div class="flex min-w-0 flex-1 items-center gap-3 rounded-[10px] border px-3.5 {i === sequence.length - 1 ? 'border-cyan-400 bg-cyan-400/[0.14]' : 'border-white/[0.08] bg-white/[0.04]'}">
                {@render sideChip(q.side)}
                <span class="flex min-w-0 flex-col">
                  <span class="font-num text-base font-bold tracking-[0.1em] text-[#AFC0D8]">{q.n} · {q.step}</span>
                  <span class="truncate text-[19px] font-extrabold">{q.what}</span>
                </span>
              </div>
            {:else}
              <span class="self-center text-lg text-[#7184A3]">Waiting for the first ban…</span>
            {/each}
          </div>
        </div>
      </div>

      <!-- Compact column -->
      <div class="absolute inset-y-0 left-0 flex w-[440px] flex-col gap-4 px-7 py-7 transition-opacity duration-[400ms] {stage === 2 ? 'opacity-100 delay-[450ms]' : 'pointer-events-none opacity-0'}">
        <div class="flex items-baseline justify-between">
          <span class="font-display text-[34px] font-extrabold leading-none">GROUP</span>
          <span class="font-num text-base font-bold tracking-[0.12em] text-[#AFC0D8]">{groupsLeft} / {grouped.length} LEFT</span>
        </div>
        <div class="relative flex h-44 flex-col justify-between overflow-hidden rounded-2xl bg-cyan-400 p-5 shadow-[0_0_0_4px_rgba(34,211,238,0.25),0_0_40px_rgba(34,211,238,0.45)]">
          <span class="pointer-events-none absolute -right-2 -top-7 font-display text-[150px] font-extrabold leading-none text-black/10">★</span>
          <span class="relative truncate font-display text-[56px] font-extrabold leading-none text-[#03252E]">{bp.group || "—"}</span>
          <span class="relative font-num text-[17px] font-extrabold tracking-[0.08em] text-[#03252E]">★ THIS MATCH · {groupEntry?.vehicles.length || 0} VEHICLES</span>
        </div>
        <span class="mt-1.5 font-num text-base font-bold tracking-[0.16em] text-[#AFC0D8]">BANNED</span>
        <div class="flex flex-col gap-2.5">
          {#each bp.bans as b, i (i)}
            <div class="flex h-14 items-center gap-3.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4">
              {@render sideChip(b.by)}
              <span class="truncate text-[22px] font-extrabold {b.group ? (b.by === 'A' ? 'text-[#FCE3A6] line-through' : 'text-[#E4DBFF] line-through') : 'text-[#7184A3]'}">{b.group || "PASS"}</span>
            </div>
          {:else}
            <span class="text-lg text-[#7184A3]">No bans</span>
          {/each}
        </div>
      </div>
    </div>

    <!-- 2 · Vehicles: slides in from the right -->
    {#if rules.drawVehicle}
      <div
        class="absolute bottom-16 left-[536px] top-[276px] flex w-[1320px] flex-col overflow-hidden rounded-[20px] border-2 border-cyan-400 bg-[radial-gradient(ellipse_at_50%_30%,#2A4A75_0%,#13254A_70%)] shadow-[0_0_60px_rgba(34,211,238,0.2)]"
        style="transform: {stage === 1 ? 'translateX(1460px)' : stage === 3 ? 'scale(0.94)' : 'none'}; opacity: {stage === 2 ? 1 : 0}; transition: transform 800ms {EASE}, opacity 600ms;"
      >
        <div class="flex h-16 shrink-0 items-center gap-4 border-b border-white/[0.06] bg-black/25 px-8">
          <span class="font-num text-[17px] font-bold tracking-[0.16em] text-cyan-200">VEHICLE DRAW</span>
          <span class="font-display text-[32px] font-extrabold">{bp.group || ""}</span>
          <span class="flex-1"></span>
          {#if vehicleDrawer}
            <span class="inline-flex items-center gap-2.5 text-lg font-bold"><span class="h-2.5 w-2.5 rounded-[3px] {vehicleDrawer === 'A' ? 'bg-side-a' : 'bg-side-b'}"></span>DRAWN BY {who.name(playerOf(vehicleDrawer))}</span>
          {/if}
        </div>
        <div class="flex min-h-0 flex-1 flex-col gap-6 p-8">
          <div class="grid min-h-0 flex-1 gap-5" style="grid-template-columns: repeat({vehicleCols}, minmax(0, 1fr));">
            {#each groupEntry?.vehicles || [] as v (v.name)}
              {@const st = vehicleState(v)}
              <div
                class="relative flex min-h-0 flex-col gap-3.5 overflow-hidden rounded-[18px] p-4 transition-all duration-150
                  {st === 'out'
                  ? 'border border-dashed border-white/20'
                  : st === 'picked'
                    ? 'pulse border-2 border-cyan-400 bg-cyan-400/[0.14]'
                    : st === 'rolling'
                      ? 'scale-[1.03] border-2 border-cyan-200 bg-cyan-400/25'
                      : 'border border-white/10 bg-white/[0.04]'}"
              >
                <div class="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-b from-[#3a4552] to-[#1d242c] {st === 'out' ? 'opacity-40 grayscale' : ''}">
                  {@render vehicleImage(v, "h-full w-full object-contain")}
                </div>
                <span class="truncate font-display text-[36px] font-extrabold leading-none {st === 'out' ? 'text-[#7184A3] line-through' : ''}">{v.name}</span>
                <span class="flex items-center justify-between font-num text-[17px] font-bold tracking-[0.08em]">
                  <span class="text-[#AFC0D8]">BR {br(v)}</span>
                  <span class={st === "out" ? "text-[#7184A3]" : "text-cyan-400"}>{st === "out" ? "REMOVED" : st === "picked" ? "★ PICKED" : ""}</span>
                </span>
              </div>
            {/each}
          </div>
          <div class="flex items-center gap-3.5 font-num text-[17px] font-bold tracking-[0.1em] text-[#AFC0D8]">
            {#each vehicleSteps as e, i (i)}
              {#if i > 0}<span class="text-cyan-400">→</span>{/if}
              <span>{e.action === "drawVehicle" ? "DRAW" : "REMOVE"} <b class={e.action === "drawVehicle" ? "text-cyan-200" : "text-white"}>{e.vehicle}</b></span>
            {:else}
              <span>Waiting for the vehicle draw…</span>
            {/each}
          </div>
        </div>
      </div>
    {/if}

    <!-- 3 · Locked in -->
    <div
      class="absolute bottom-16 left-16 right-16 top-36 grid grid-cols-[920px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] gap-12"
      style="opacity: {stage === 3 ? 1 : 0}; transform: {stage === 3 ? 'none' : 'translateY(40px) scale(0.98)'}; transition: opacity 700ms cubic-bezier(.2,.8,.2,1) {stage === 3 ? 350 : 0}ms, transform 900ms cubic-bezier(.2,.8,.2,1) {stage === 3 ? 350 : 0}ms; pointer-events: none;"
    >
      <div class="relative flex items-center justify-center overflow-hidden rounded-3xl border-2 border-cyan-400 bg-[radial-gradient(ellipse_at_50%_40%,#2A4A75_0%,#13254A_75%)] shadow-[0_0_80px_rgba(34,211,238,0.28)]">
        {#if lockedVehicle}
          {@render vehicleImage(lockedVehicle, "relative h-[78%] w-[88%] object-contain drop-shadow-[0_20px_40px_rgba(0,0,0,0.5)]")}
        {:else}
          <span class="font-display text-[120px] font-extrabold leading-none text-white/[0.08]">{bp.group || ""}</span>
        {/if}
        {#if stage === 3}<div class="sweep pointer-events-none absolute -inset-y-[20%] left-0 w-40"></div>{/if}
        <span class="absolute left-7 top-6 inline-flex h-10 items-center rounded-full bg-cyan-400 px-4 font-num text-[17px] font-extrabold tracking-[0.12em] text-[#03252E]">★ LOCKED IN</span>
        <!-- The two players, across the bottom of the image -->
        <div class="absolute inset-x-0 bottom-0 flex h-24 items-center gap-4 bg-[linear-gradient(180deg,rgba(10,22,48,0)_0%,rgba(10,22,48,0.92)_55%)] px-7 text-[26px] font-black">
          <span class="inline-flex h-9 w-9 items-center justify-center rounded-[9px] bg-side-a font-display text-2xl text-[#2A1C02]">A</span><span class="truncate">{who.name(activeMatch.player1_id)}</span>
          <span class="h-px flex-1 bg-white/[0.12]"></span>
          <span class="font-display text-[32px] italic text-cyan-200">VS</span>
          <span class="h-px flex-1 bg-white/[0.12]"></span>
          <span class="truncate">{who.name(activeMatch.player2_id)}</span><span class="inline-flex h-9 w-9 items-center justify-center rounded-[9px] bg-side-b font-display text-2xl text-[#22124A]">B</span>
        </div>
      </div>
      <div class="flex min-h-0 min-w-0 flex-col {cards.length ? 'gap-3' : 'gap-6 py-1'}">
        <div class="flex flex-col {cards.length ? 'gap-2' : 'gap-2.5'}">
          <span class="font-num text-lg font-bold tracking-[0.18em] text-cyan-200">THIS MATCH'S {lockedVehicle ? "VEHICLE" : "GROUP"}</span>
          <span class="truncate font-display font-extrabold leading-[0.9] {cards.length ? 'text-[80px]' : 'text-[104px]'}">{lockedVehicle?.name || bp.group || ""}</span>
          <span class="text-2xl text-[#C3CAD4]">{lockedVehicle ? [lockedVehicle.nation, lockedVehicle.type, specs?.rank && `Rank ${specs.rank}`].filter(Boolean).join(" · ") : "Any vehicle of the group"}</span>
        </div>
        <div class="flex items-end gap-9">
          {#if lockedVehicle?.br != null}
            <div class="flex flex-col gap-1"><span class="font-num text-base font-bold tracking-[0.16em] text-[#AFC0D8]">BATTLE RATING</span><span class="font-display font-extrabold leading-[0.85] text-cyan-400 {cards.length ? 'text-[64px]' : 'text-[88px]'}">{br(lockedVehicle)}</span></div>
          {/if}
          <div class="flex flex-col gap-1 pb-2"><span class="font-num text-base font-bold tracking-[0.16em] text-[#AFC0D8]">GROUP</span><span class="font-display text-[40px] font-extrabold leading-none">{bp.group || ""}</span></div>
          {#if groupDrawer || vehicleDrawer}
            <div class="flex flex-col gap-1 pb-2"><span class="font-num text-base font-bold tracking-[0.16em] text-[#AFC0D8]">DRAWN BY</span><span class="truncate text-[28px] font-extrabold leading-tight">{who.name(playerOf(vehicleDrawer || groupDrawer))}</span></div>
          {/if}
        </div>
        {#if cards.length}
          <!-- Vehicle data in four cards: performance, engine, armament, flaps & limits -->
          <div class="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-3" in:fade={{ duration: 500 }}>
            {#each cards as c (c.title)}
              <div class="flex min-w-0 flex-col gap-0.5 overflow-hidden rounded-[14px] border border-white/[0.07] bg-[rgba(24,40,70,0.7)] px-4 py-3.5">
                <span class="mb-0.5 font-num text-base font-bold tracking-[0.16em] text-cyan-400">{c.title}</span>
                {#each c.rows as r, i (i)}
                  <div class="flex min-w-0 items-baseline justify-between gap-3 border-t border-white/[0.06] py-1">
                    <span class="flex min-w-0 flex-col">
                      <span class="truncate text-lg font-bold leading-snug {r.name || r.sub ? '' : 'text-[#AFC0D8]'}">{r.label}</span>
                      {#if r.sub}<span class="truncate font-num text-[15px] font-bold leading-tight {r.accent ? 'text-cyan-200' : 'text-[#7184A3]'}">{r.sub}</span>{/if}
                    </span>
                    <span class="shrink-0 whitespace-nowrap text-right font-num text-xl font-bold tabular-nums">{r.value}</span>
                  </div>
                {/each}
              </div>
            {/each}
          </div>
        {:else}
          <!-- The group's vehicles and the bans -->
          <div class="flex min-h-0 flex-col gap-2 rounded-2xl border border-white/[0.07] bg-[rgba(24,40,70,0.7)] px-5 py-4">
            <span class="font-num text-base font-bold tracking-[0.16em] text-cyan-400">IN THIS GROUP</span>
            {#each groupEntry?.vehicles || [] as v (v.name)}
              {@const st = vehicleState(v)}
              <div class="flex items-baseline justify-between gap-3 border-t border-white/[0.06] py-1.5">
                <span class="truncate text-xl font-bold {st === 'out' ? 'text-[#7184A3] line-through' : st === 'picked' ? 'text-cyan-200' : ''}">{st === "picked" ? "★ " : ""}{v.name}</span>
                <span class="shrink-0 font-num text-xl font-bold tabular-nums {st === 'out' ? 'text-[#7184A3]' : ''}">{v.br != null ? `BR ${br(v)}` : ""}</span>
              </div>
            {/each}
          </div>
          <div class="flex flex-wrap items-center gap-2.5">
            <span class="font-num text-base font-bold tracking-[0.16em] text-[#AFC0D8]">BANNED</span>
            {#each bp.bans.filter((b) => b.group) as b, i (i)}
              <span class="inline-flex items-center gap-2 rounded-lg bg-white/[0.05] px-3 py-1 text-lg font-bold line-through {b.by === 'A' ? 'text-[#FCE3A6]' : 'text-[#E4DBFF]'}">{b.group}</span>
            {:else}
              <span class="text-lg text-[#7184A3]">None</span>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .pulse {
    animation: bpPulse 1.6s ease-in-out infinite;
  }
  @keyframes bpPulse {
    0%,
    100% {
      box-shadow:
        0 0 0 4px rgba(34, 211, 238, 0.25),
        0 0 40px rgba(34, 211, 238, 0.45);
    }
    50% {
      box-shadow:
        0 0 0 8px rgba(34, 211, 238, 0.18),
        0 0 70px rgba(34, 211, 238, 0.6);
    }
  }
  .sweep {
    background: linear-gradient(90deg, transparent, rgba(165, 243, 252, 0.25), transparent);
    animation: bpSweep 2.4s ease-in-out infinite;
  }
  @keyframes bpSweep {
    from {
      transform: translateX(-120%) skewX(-21deg);
    }
    to {
      transform: translateX(700%) skewX(-21deg);
    }
  }
</style>
