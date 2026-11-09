<script>
  // Overlay "versus" scene, the matchup preview (it replaces the old
  // intermission and VS card): the live match, or the next playable one
  // between matches. Two player cards (flag, seed, league, name, last five
  // results, most played Ban / Pick vehicles), VS in the middle, the tale of
  // the tape (MMR, win rate, record in this event, events played) and their
  // head to head (series and games, the last five meetings). Ladder data
  // from /ladder/players/:id, vehicles from /banpick/stats?player=
  // (#lib/versus.js).
  import { fade, fly, scale } from "svelte/transition";
  import { API } from "#lib/api.js";
  import { matchStageLabels } from "#lib/overlay.js";
  import { eventRecord, eventsPlayed, headToHeadRecent } from "#lib/versus.js";
  import { recentForm } from "#lib/player-profile.js";
  import { tierEnglish } from "#lib/overlay.js";
  import Flag from "#lib/components/Flag.svelte";
  import OverlayTopBar from "./OverlayTopBar.svelte";
  import LeagueBadge from "./LeagueBadge.svelte";

  let { tournament, match = null, live = false, matches = [], realMatches = [], matchOrder, who } = $props();

  let p1 = $derived(match?.player1_id || null);
  let p2 = $derived(match?.player2_id || null);
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

  let label = $derived(match ? matchStageLabels(match, tournament?.matches || matches) : null);
  let no = $derived(match ? matchOrder.get(match.id) : null);
  let total = $derived(realMatches.length);
  let h2h = $derived(headToHeadRecent(ladders[p1], p2));

  // One side's numbers.
  const side = (id) => {
    const p = who.get(id);
    const l = ladders[id];
    return {
      id,
      mmr: p?.ladder_mmr ?? l?.mmr ?? null,
      tier: p?.ladder_tier || l?.tier || null,
      winRate: l?.win_rate ?? null,
      form: recentForm(l?.history || [], 5),
      record: eventRecord(tournament?.matches || [], id),
      events: eventsPlayed(l),
      vehicles: (vehicles[id] || []).slice(0, 2),
    };
  };
  let a = $derived(p1 ? side(p1) : null);
  let b = $derived(p2 ? side(p2) : null);

  // Tale of the tape: each row as two values with bars toward the middle.
  let tape = $derived.by(() => {
    if (!a || !b) return [];
    const games = (r) => r.record.won + r.record.lost;
    const rate = (r) => (r.winRate == null ? null : Math.round(r.winRate * 100));
    return [
      { label: "MMR", a: a.mmr, b: b.mmr, fa: a.mmr ?? "—", fb: b.mmr ?? "—" },
      { label: "WIN RATE", a: rate(a), b: rate(b), fa: rate(a) == null ? "—" : `${rate(a)}%`, fb: rate(b) == null ? "—" : `${rate(b)}%` },
      { label: "THIS EVENT", a: a.record.won, b: b.record.won, fa: games(a) ? `${a.record.won}–${a.record.lost}` : "—", fb: games(b) ? `${b.record.won}–${b.record.lost}` : "—" },
      { label: "EVENTS PLAYED", a: a.events, b: b.events, fa: a.events || "—", fb: b.events || "—" },
    ].map((r) => {
      const max = Math.max(Number(r.a) || 0, Number(r.b) || 0) || 1;
      return { ...r, wa: ((Number(r.a) || 0) / max) * 100, wb: ((Number(r.b) || 0) / max) * 100 };
    });
  });

  let steps = $derived([
    { label: "BREAK", state: live ? "done" : "active" },
    { label: "INTRO", state: live ? "active" : "todo" },
    { label: "BAN / PICK", state: "todo" },
    { label: "LIVE", state: "todo" },
  ]);
</script>

{#snippet card(s, slot)}
  {@const right = slot === "B"}
  <div
    class="relative flex h-full flex-col overflow-hidden rounded-[20px] border border-white/[0.07] bg-[rgba(24,40,70,0.92)] px-10 pb-8 pt-9 {right ? 'items-end text-right' : ''}"
    in:fly={{ x: right ? 400 : -400, duration: 700, delay: 150 }}
  >
    <div class="absolute inset-x-0 top-0 h-1.5 {right ? 'bg-side-b' : 'bg-side-a'}"></div>
    <div class="pointer-events-none absolute inset-0 {right ? 'bg-[linear-gradient(180deg,rgba(183,155,255,0.16),transparent_55%)]' : 'bg-[linear-gradient(180deg,rgba(245,184,61,0.16),transparent_55%)]'}"></div>
    <span class="pointer-events-none absolute -bottom-10 font-display text-[300px] font-extrabold leading-none text-white/[0.04] {right ? 'left-6' : 'right-6'}">{slot}</span>

    <div class="relative flex items-center gap-4 {right ? 'flex-row-reverse' : ''}">
      <span class="overflow-hidden rounded-md shadow-lg"><Flag code={who.flag(s.id)} size={52} /></span>
      <span class="font-num text-base font-bold tracking-[0.16em] {right ? 'text-side-b' : 'text-side-a'}">PLAYER {slot}</span>
      <span class="flex-1"></span>
      {#if who.seed(s.id)}<span class="rounded-full bg-white/[0.08] px-3 py-1 font-num text-base font-bold text-[#AFC0D8]">SEED #{who.seed(s.id)}</span>{/if}
      <span class="inline-flex items-center gap-2 rounded-full bg-white/[0.08] px-3 py-1 font-num text-base font-bold text-[#AFC0D8]"><LeagueBadge tier={s.tier} size={20} />{tierEnglish(s.tier)}</span>
    </div>
    <span class="relative mt-6 max-w-full truncate font-display text-[84px] font-extrabold leading-none">{who.name(s.id)}</span>
    <div class="relative my-6 h-px w-full bg-white/10"></div>
    <div class="relative flex w-full flex-col gap-4">
      <div class="flex items-center gap-4 {right ? 'flex-row-reverse' : ''}">
        <span class="w-[210px] shrink-0 font-num text-base font-bold tracking-[0.16em] text-[#7184A3]">LAST 5</span>
        <span class="flex gap-1.5 {right ? 'flex-row-reverse' : ''}">
          {#each s.form as g (g.id)}
            <span class="flex h-9 w-9 items-center justify-center rounded-lg text-lg font-black {g.won ? 'bg-green-500 text-[#052E14]' : 'bg-rose-500 text-[#3B0712]'}">{g.won ? "W" : "L"}</span>
          {:else}
            <span class="text-lg text-[#7184A3]">No rated games yet</span>
          {/each}
        </span>
      </div>
      <div class="flex items-center gap-4 {right ? 'flex-row-reverse' : ''}">
        <span class="w-[210px] shrink-0 whitespace-nowrap font-num text-base font-bold tracking-[0.16em] text-[#7184A3]">GO-TO VEHICLES</span>
        <span class="flex min-w-0 gap-2 {right ? 'flex-row-reverse' : ''}">
          {#each s.vehicles as v (v.name)}
            <span class="truncate rounded-lg bg-white/[0.06] px-3 py-1 text-xl font-bold">{v.name}</span>
          {:else}
            <span class="text-lg text-[#7184A3]">—</span>
          {/each}
        </span>
      </div>
    </div>
  </div>
{/snippet}

<div class="absolute inset-0 z-10" transition:fade={{ duration: 400 }}>
  <OverlayTopBar {tournament} {steps}>
    {#snippet right()}
      {#if no && total}
        <span class="font-num text-base font-bold tracking-[0.16em] text-[#AFC0D8]">MATCH</span>
        <span class="font-display text-[40px] font-extrabold leading-none">{no}<span class="text-[#AFC0D8]"> / {total}</span></span>
      {/if}
    {/snippet}
  </OverlayTopBar>

  {#if !match || !a || !b}
    <div class="absolute inset-x-16 bottom-16 top-[140px] flex items-center justify-center">
      <p class="rounded-2xl bg-[rgba(24,40,70,0.92)] px-10 py-6 text-2xl text-[#AFC0D8]">No match ready to preview.</p>
    </div>
  {:else}
    <!-- Match line -->
    <div class="absolute inset-x-16 top-[136px] flex h-10 items-center gap-6">
      <span class="h-px flex-1 bg-gradient-to-r from-transparent to-white/20"></span>
      <span class="font-num text-lg font-bold tracking-[0.18em] text-cyan-200">{live ? "NOW" : "NEXT MATCH"} · {String(label?.en || "").toUpperCase()}</span>
      <span class="h-px flex-1 bg-gradient-to-l from-transparent to-white/20"></span>
    </div>

    <!-- Players -->
    <div class="absolute inset-x-16 top-[196px] grid h-[420px] grid-cols-[minmax(0,1fr)_320px_minmax(0,1fr)]">
      {@render card(a, "A")}
      <div class="flex flex-col items-center justify-center gap-5" in:scale={{ start: 1.8, duration: 500, delay: 450 }}>
        <span class="flex h-[150px] w-[150px] items-center justify-center rounded-full border-2 border-cyan-400 bg-[#0A1630] shadow-[0_0_50px_rgba(34,211,238,0.35)] font-display text-[72px] font-extrabold italic leading-none">VS</span>
        {#if no && total}<span class="rounded-full bg-white/[0.06] px-4 py-1.5 font-num text-base font-bold tracking-[0.16em] text-[#AFC0D8]">MATCH {no} / {total}</span>{/if}
      </div>
      {@render card(b, "B")}
    </div>

    <!-- Tale of the tape -->
    <div class="absolute bottom-16 left-16 top-[648px] w-[960px] rounded-[20px] border border-white/[0.07] bg-[rgba(24,40,70,0.92)] px-8 py-6" in:fly={{ y: 60, duration: 600, delay: 600 }}>
      <span class="font-display text-[30px] font-extrabold leading-none">TALE OF THE TAPE</span>
      <div class="mt-5 flex flex-col gap-4">
        {#each tape as r (r.label)}
          <div class="grid grid-cols-[minmax(0,1fr)_96px_200px_96px_minmax(0,1fr)] items-center gap-4">
            <div class="flex h-2.5 justify-end overflow-hidden rounded-full bg-white/[0.06]"><div class="h-full rounded-full bg-side-a" style="width: {r.wa}%"></div></div>
            <span class="text-right font-display text-[34px] font-extrabold leading-none text-side-a tabular-nums">{r.fa}</span>
            <span class="text-center font-num text-base font-bold tracking-[0.16em] text-[#AFC0D8]">{r.label}</span>
            <span class="font-display text-[34px] font-extrabold leading-none text-side-b tabular-nums">{r.fb}</span>
            <div class="flex h-2.5 overflow-hidden rounded-full bg-white/[0.06]"><div class="h-full rounded-full bg-side-b" style="width: {r.wb}%"></div></div>
          </div>
        {/each}
      </div>
    </div>

    <!-- Head to head -->
    <div class="absolute bottom-16 left-[1056px] right-16 top-[648px] flex flex-col rounded-[20px] border border-white/[0.07] bg-[rgba(24,40,70,0.92)] px-8 py-6" in:fly={{ y: 60, duration: 600, delay: 700 }}>
      <div class="flex items-end justify-between gap-4">
        <div class="flex flex-col gap-1">
          <span class="font-display text-[30px] font-extrabold leading-none">HEAD TO HEAD</span>
          <span class="font-num text-base font-bold tracking-[0.14em] text-[#7184A3]">{h2h ? `ALL-TIME · ${h2h.won + h2h.lost} SERIES` : "FIRST MEETING"}</span>
        </div>
        {#if h2h}
          <div class="flex flex-col items-end">
            <span class="font-display text-[56px] font-extrabold leading-none tabular-nums"><span class="text-side-a">{h2h.won}</span><span class="text-[#7184A3]"> – </span><span class="text-side-b">{h2h.lost}</span></span>
            <span class="font-num text-base font-bold tracking-[0.12em] text-[#7184A3]">GAMES <span class="text-side-a">{h2h.mapsFor}</span> – <span class="text-side-b">{h2h.mapsAgainst}</span></span>
          </div>
        {/if}
      </div>
      {#if h2h}
        <div class="mt-3 flex flex-col">
          {#each h2h.recent as g, i (i)}
            <div class="grid h-10 grid-cols-[4px_minmax(0,1fr)_116px_112px] items-center gap-4 border-t border-white/[0.06]">
              <span class="h-6 rounded-full {g.won ? 'bg-side-a' : 'bg-side-b'}"></span>
              <span class="truncate text-lg font-bold" title={g.event}>{g.event}</span>
              <span class="font-num text-base font-bold tabular-nums text-[#7184A3]">{g.date}</span>
              <span class="grid grid-cols-[1fr_16px_1fr] items-center font-display text-[28px] font-extrabold leading-none tabular-nums">
                <span class="text-right {g.won ? 'text-side-a' : 'text-[#7184A3]'}">{g.for}</span>
                <span class="text-center text-[#7184A3]">:</span>
                <span class={g.won ? "text-[#7184A3]" : "text-side-b"}>{g.against}</span>
              </span>
            </div>
          {/each}
        </div>
      {:else}
        <p class="mt-6 text-2xl text-[#AFC0D8]">These two have not played each other yet.</p>
      {/if}
    </div>
  {/if}
</div>
