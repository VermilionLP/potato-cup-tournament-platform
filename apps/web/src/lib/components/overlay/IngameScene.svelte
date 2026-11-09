<script>
  // Overlay "ingame" scene (HUD), over the game capture: a thin results
  // ticker at the top and the live match card in the top-right corner, in
  // the cyan style. Quiet by default: when a live score changes, that
  // side's score lights up for 3 s.
  import { fade, fly } from "svelte/transition";
  import { untrack } from "svelte";
  import { matchStageLabels } from "#lib/overlay.js";

  let { tournament, tickerRounds = [], activeMatch = null, matches = [], who } = $props();

  let tickerWidth = $state(0);
  // Constant speed: the content is repeated three times, one copy scrolls by.
  let tickerDuration = $derived(!tickerWidth || !tickerRounds.length ? 50 : tickerWidth / 3 / 60);
  let tag = $derived(activeMatch ? matchStageLabels(activeMatch, tournament?.matches || matches).tag : "");

  let s1 = $derived(activeMatch?.live_score1 ?? null);
  let s2 = $derived(activeMatch?.live_score2 ?? null);
  // Flash the side whose score just went up.
  let flash = $state({ 1: false, 2: false });
  let last = { id: null, 1: null, 2: null };
  $effect(() => {
    const id = activeMatch?.id ?? null;
    const now = { 1: s1, 2: s2 };
    untrack(() => {
      for (const slot of [1, 2]) {
        if (last.id === id && now[slot] != null && last[slot] != null && now[slot] > last[slot]) {
          flash[slot] = true;
          setTimeout(() => (flash[slot] = false), 3000);
        }
      }
      last = { id, 1: now[1], 2: now[2] };
    });
  });
  // The confirmed Ban / Pick result; a group without a vehicle draw is "any".
  let bpState = $derived(activeMatch?.banpick?.state?.phase === "done" ? activeMatch.banpick.state : null);
  let vehicle = $derived(bpState ? bpState.vehicle || (bpState.group ? `${bpState.group} · ANY` : "") : "");
  const score = (m, slot) => (slot === 1 ? m.score1 : m.score2);
</script>

<div class="absolute inset-0 z-10" transition:fade={{ duration: 400 }}>
  <!-- Results ticker: thin, see-through, 1240 wide -->
  <div class="absolute left-1/2 top-6 h-11 w-[1240px] -translate-x-1/2 overflow-hidden rounded-lg bg-[rgba(2,6,23,0.78)] backdrop-blur-md" transition:fly={{ y: -80, duration: 700, delay: 200 }}>
    <div class="absolute inset-y-0 left-0 w-[3px] bg-cyan-500"></div>
    <div class="absolute inset-y-0 left-4 right-4 overflow-hidden">
      <div class="ticker absolute inset-y-0 flex items-center whitespace-nowrap" bind:clientWidth={tickerWidth} style="animation-duration: {tickerDuration}s">
        {#if tickerRounds.length === 0}
          <span class="font-num text-base font-bold tracking-[0.16em] text-cyan-400">RESULTS · NO MATCHES PLAYED YET</span>
        {:else}
          {#each Array(3) as _, copy (copy)}
            {#each tickerRounds as tr (tr.key)}
              <span class="mr-5 font-num text-base font-bold tracking-[0.16em] text-cyan-400">{tr.short}</span>
              {#each tr.matches as m, i (m.id)}
                <span class="text-lg font-semibold text-[#E6E9EE]">{who.name(m.player1_id)}</span>
                <b class="mx-2 font-num text-lg text-cyan-400">{m.status === "walkover" ? (m.winner_id === m.player1_id ? "W : FF" : "FF : W") : `${score(m, 1)} : ${score(m, 2)}`}</b>
                <span class="text-lg font-semibold text-[#E6E9EE]">{who.name(m.player2_id)}</span>
                <span class="mx-4 text-white/25">/</span>
              {/each}
            {/each}
          {/each}
        {/if}
      </div>
    </div>
  </div>

  <!-- Live match card, top right -->
  {#if activeMatch}
    <div
      class="absolute right-6 top-[92px] w-[360px] overflow-hidden rounded-[10px] border border-cyan-400/25 bg-[rgba(2,6,23,0.78)] shadow-[0_0_24px_rgba(6,182,212,0.18),0_8px_30px_rgba(0,0,0,0.25)] backdrop-blur-md"
      transition:fly={{ x: 400, duration: 700 }}
    >
      <div class="h-0.5 bg-cyan-500"></div>
      <div class="flex h-9 items-center justify-between gap-3 px-3">
        <span class="inline-flex items-center gap-1.5 font-num text-base font-bold tracking-[0.14em] text-cyan-400">
          <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500"></span>LIVE · {tag}
        </span>
        <span class="truncate font-display text-base font-semibold uppercase tracking-[0.04em] text-[#AFC0D8]">{tournament?.name}</span>
      </div>
      {#each [1, 2] as slot (slot)}
        {@const pid = slot === 1 ? activeMatch.player1_id : activeMatch.player2_id}
        {@const sc = slot === 1 ? s1 : s2}
        <div class="flex h-11 items-center gap-2.5 px-3 {slot === 2 ? 'border-t border-white/[0.08]' : ''}">
          <span class="h-[22px] w-[3px] rounded-sm {slot === 1 ? 'bg-side-a' : 'bg-side-b'}"></span>
          <span class="min-w-0 flex-1 truncate text-[22px] font-bold">{who.name(pid)}</span>
          {#if sc != null}
            <span
              class="flex h-8 min-w-[34px] items-center justify-center rounded-md px-1.5 font-display text-[26px] font-extrabold transition-colors duration-500
                {flash[slot] ? 'bg-cyan-400 text-[#020617]' : 'text-cyan-400'}">{sc}</span
            >
          {/if}
        </div>
      {/each}
      {#if vehicle}
        <div class="flex h-[38px] items-center justify-center gap-2.5 bg-cyan-500/10 text-lg font-semibold text-[#E2E8F0]">
          <span class="font-num text-base font-bold tracking-[0.14em] text-cyan-400">VEHICLE</span><span class="truncate">{vehicle}</span>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .ticker {
    width: max-content;
    will-change: transform;
    animation: marquee 35s linear infinite;
  }
  @keyframes marquee {
    from {
      transform: translate3d(0, 0, 0);
    }
    to {
      /* Scroll by exactly one copy (1/3 of the repeated content). */
      transform: translate3d(-33.3333%, 0, 0);
    }
  }
</style>
