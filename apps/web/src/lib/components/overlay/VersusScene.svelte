<script>
  // Overlay "versus" scene: the live match's two players face to face before
  // the game. Each side: flag, team and name, ladder league and MMR, games
  // and win rate, the last five results, their record in this event and the
  // vehicles they played most in Ban / Pick; in the middle the logo, the
  // stage and their earlier meetings. Ladder data from /ladder/players/:id,
  // vehicles from /banpick/stats?player= (#lib/versus.js).
  import { fade, fly, scale } from "svelte/transition";
  import { API } from "#lib/api.js";
  import { formatWinRate } from "#lib/ladder.js";
  import { leagueIcon } from "#lib/sc2-icons.js";
  import { meetings, versusSide } from "#lib/versus.js";
  import Flag from "#lib/components/Flag.svelte";

  let { tournament, activeMatch = null, stageShort, who } = $props();

  let p1 = $derived(activeMatch?.player1_id || null);
  let p2 = $derived(activeMatch?.player2_id || null);
  let ladders = $state({});
  let vehicles = $state({});
  $effect(() => {
    for (const id of [p1, p2]) {
      if (!id || id in ladders) continue;
      ladders[id] = null;
      API.getLadderPlayer(id)
        .then((d) => (ladders[id] = d))
        .catch(() => {});
      API.getBanpickStats({ player: id })
        .then((d) => (vehicles[id] = d?.player?.vehicles || []))
        .catch(() => {});
    }
  });
  let teamOf = (id) => tournament?.players?.find((p) => p.id === id)?.team || "";
  let sides = $derived(
    [p1, p2].map((id) => (id ? { id, ...versusSide(ladders[id], tournament?.matches || [], id), vehicles: vehicles[id] || [] } : null)),
  );
  let met = $derived(meetings(ladders[p1], p2));
</script>

{#snippet side(s, slot)}
  {@const right = slot === "B"}
  <div
    class="relative flex h-full flex-1 flex-col justify-center gap-6 px-20 {right ? 'items-end text-right' : 'items-start'}"
    in:fly={{ x: right ? 500 : -500, duration: 700, delay: 150 }}
  >
    <div class="flex items-center gap-5 {right ? 'flex-row-reverse' : ''}">
      <div class="overflow-hidden rounded-xl border-2 border-white/20 shadow-2xl">
        <Flag code={who.flag(s.id)} size={96} />
      </div>
      {#if s.tier && leagueIcon(s.tier.group)}
        <img src={leagueIcon(s.tier.group)} alt="" class="h-24 w-24 object-contain drop-shadow-xl" />
      {/if}
    </div>
    <div>
      <div class="h-9 font-mono text-3xl font-bold text-slate-400">{teamOf(s.id) ? `[${teamOf(s.id)}]` : ""}</div>
      <div class="max-w-[640px] truncate text-8xl font-black leading-none tracking-tight text-white drop-shadow-lg">{who.name(s.id)}</div>
    </div>
    <div class="flex items-end gap-8 {right ? 'flex-row-reverse' : ''}">
      <div>
        <div class="font-mono text-sm font-bold tracking-[0.3em] text-slate-500">MMR</div>
        <div class="font-orbitron text-6xl font-black {right ? 'text-sky-400' : 'text-orange-400'}">{s.mmr ?? "—"}</div>
      </div>
      <div class="pb-1 text-2xl font-semibold text-slate-300">
        {#if s.tier}<div class="font-black text-white">{s.tier.name}</div>{/if}
        {s.games} 场 · 胜率 {s.winRate == null ? "—" : formatWinRate(s.winRate)}
      </div>
    </div>
    {#if s.form.length}
      <div class="flex gap-2 {right ? 'flex-row-reverse' : ''}">
        {#each s.form as g (g.id)}
          <span class="flex h-12 w-12 items-center justify-center rounded-lg text-2xl font-black text-white {g.won ? 'bg-emerald-500' : 'bg-rose-600'}">{g.won ? "W" : "L"}</span>
        {/each}
      </div>
    {/if}
    <div class="flex flex-wrap gap-3 text-2xl {right ? 'justify-end' : ''}">
      <span class="rounded-lg border border-white/15 bg-white/5 px-4 py-1.5 font-bold text-slate-200">本届 {s.event.won} 胜 {s.event.lost} 负</span>
      {#each s.vehicles.slice(0, 2) as v (v.name)}
        <span class="rounded-lg border border-orange-500/40 bg-orange-500/15 px-4 py-1.5 font-bold text-orange-200">{v.name}</span>
      {/each}
    </div>
  </div>
{/snippet}

<div class="absolute inset-0 z-10 overflow-hidden" transition:fade={{ duration: 400 }}>
  <!-- Two halves split by the logo's slash angle -->
  <div class="absolute inset-0" style="background: linear-gradient(105deg, #2a1206 0%, #120a06 46%, #0b0d12 46.2%, #0a1622 100%)"></div>
  <div class="absolute inset-y-[-10%] left-1/2 w-3 -translate-x-1/2 skew-x-[-21deg] bg-gradient-to-b from-orange-400 to-orange-600 shadow-[0_0_60px_rgba(255,106,0,0.6)]"></div>

  {#if !activeMatch || !p1 || !p2}
    <div class="relative flex h-full items-center justify-center">
      <p class="rounded-2xl border border-slate-800 bg-slate-900/70 px-10 py-6 text-2xl text-slate-400">No active match selected.</p>
    </div>
  {:else}
    <div class="relative flex h-full">
      {@render side(sides[0], "A")}
      {@render side(sides[1], "B")}
    </div>
    <!-- Middle: logo, stage, VS, meetings -->
    <div class="pointer-events-none absolute inset-x-0 top-12 flex flex-col items-center" in:fly={{ y: -80, duration: 600 }}>
      <img src="/overlay/potato-cup-logo.webp" alt="" class="w-[520px] drop-shadow-2xl" />
      <div class="mt-3 font-mono text-xl font-bold uppercase tracking-[0.3em] text-orange-300">{tournament?.name} · {stageShort(activeMatch)}</div>
    </div>
    <div class="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" in:scale={{ start: 2.2, duration: 500, delay: 500 }}>
      <div class="font-orbitron text-[180px] font-black italic leading-none text-white drop-shadow-[0_8px_30px_rgba(0,0,0,0.8)]">VS</div>
    </div>
    <div class="absolute inset-x-0 bottom-14 flex justify-center" in:fly={{ y: 80, duration: 600, delay: 700 }}>
      <div class="rounded-2xl border border-white/15 bg-black/60 px-10 py-4 text-center backdrop-blur">
        {#if met}
          <div class="font-mono text-sm font-bold tracking-[0.3em] text-slate-400">HEAD TO HEAD</div>
          <div class="font-orbitron text-5xl font-black text-white">
            <span class="text-orange-400">{met.won}</span> : <span class="text-sky-400">{met.lost}</span>
          </div>
          <div class="text-lg text-slate-400">上次交手 {met.last.event} · {who.name(met.last.won ? p1 : p2)} {met.last.score} 胜</div>
        {:else}
          <div class="text-2xl font-bold text-slate-300">首次交手</div>
        {/if}
      </div>
    </div>
  {/if}
</div>
