<script>
  // Overlay "ingame" scene: a results ticker at the top and the live match
  // in the top-right corner, over the game capture.
  import { fade, fly } from "svelte/transition";

  let { tournament, tickerRounds = [], activeMatch = null, stageShort, who } = $props();

  let tickerWidth = $state(0);
  // Constant speed: the content is repeated three times, one copy scrolls by.
  let tickerDuration = $derived(!tickerWidth || !tickerRounds.length ? 50 : tickerWidth / 3 / 50);
</script>

<div class="absolute inset-0 w-full h-full flex flex-col justify-between p-4 z-10" transition:fade={{ duration: 400 }}>
  <!-- Results ticker, top centre -->
  <div class="absolute top-13 left-1/2 -translate-x-1/2 z-20 w-full max-w-[45%]" transition:fly={{ y: -120, duration: 800, delay: 300 }}>
    <div class="ticker-wrap flex items-center bg-slate-950/95 border-2 border-cyan-500/30 rounded-lg py-1.5 px-3 shadow-2xl backdrop-blur-md overflow-hidden">
      <div class="shrink-0 font-orbitron font-extrabold text-[13px] bg-cyan-500 text-black px-2.5 py-0.5 rounded uppercase tracking-wider mr-3 shadow flex items-center gap-1">
        <span class="w-1.5 h-1.5 rounded-full bg-black animate-pulse"></span>
        <span>RESULTS</span>
      </div>
      <div class="relative flex-1 overflow-hidden h-6">
        <div class="ticker animate-marquee" bind:clientWidth={tickerWidth} style="animation-duration: {tickerDuration}s">
          {#if tickerRounds.length === 0}
            <div class="ticker-item text-xs text-slate-400 italic">No matches concluded yet.</div>
          {:else}
            <!-- Repeated for seamless wrapping -->
            {#each Array(3) as _, copy (copy)}
              {#each tickerRounds as tr (tr.key)}
                <span class="ticker-item text-sm sm:text-base font-extrabold tracking-wide font-sans inline-flex items-center gap-2 mr-6">
                  <span class="font-orbitron font-black text-[11px] bg-cyan-950/80 border border-cyan-500/30 text-cyan-400 px-2 py-0.5 rounded uppercase tracking-wider">
                    {tr.short}
                  </span>
                  <span class="inline-flex items-center gap-3">
                    {#each tr.matches as m, mIdx (m.id)}
                      <span class="inline-flex items-center">
                        <span class="text-white">{who.name(m.player1_id)}</span>
                        <span class="font-orbitron font-black text-cyan-400 bg-slate-900 border border-slate-800 rounded px-1.5 mx-1.5 py-0.2 text-xs sm:text-sm">
                          {m.status === "walkover" ? (m.winner_id === m.player1_id ? "W : FF" : "FF : W") : `${m.score1} : ${m.score2}`}
                        </span>
                        <span class="text-white">{who.name(m.player2_id)}</span>
                        {#if mIdx < tr.matches.length - 1}
                          <span class="text-cyan-500/25 px-2 font-bold">/</span>
                        {/if}
                      </span>
                    {/each}
                  </span>
                  <span class="text-slate-600 pl-4 font-light font-mono">|</span>
                </span>
              {/each}
            {/each}
          {/if}
        </div>
      </div>
    </div>
  </div>

  <!-- Live match, top right -->
  <div class="absolute top-22.5 right-4 z-10 flex flex-col items-end gap-2" transition:fly={{ x: 400, duration: 800 }}>
    {#if !activeMatch}
      <div class="bg-slate-950/80 border border-slate-800 rounded-lg p-3.5 backdrop-blur-md text-right shadow-lg">
        <span class="text-[9px] font-mono text-cyan-400 font-bold uppercase tracking-widest block mb-1">POTATO CUP LIVE</span>
        <p class="text-slate-400 text-xs italic">No active match selected.</p>
      </div>
    {:else}
      <div class="bg-slate-950/98 border-2 border-cyan-500/50 rounded-xl overflow-hidden shadow-[0_0_30px_rgba(6,182,212,0.35)] flex flex-col min-w-80 max-w-sm backdrop-blur-md">
        <div class="bg-cyan-950/60 px-4 py-1 border-b border-cyan-500/25 flex justify-between items-center text-xs sm:text-sm font-mono text-cyan-400 font-bold tracking-widest uppercase">
          <span>{tournament.name}</span>
          <span class="text-amber-400">{stageShort(activeMatch)}</span>
        </div>
        <div class="py-1.5 px-5 flex flex-col gap-0 font-sans">
          <div class="flex items-center justify-center py-0.5">
            <span class="text-slate-100 font-black text-center text-xl sm:text-2xl leading-tight tracking-tight truncate w-full" title={who.name(activeMatch.player1_id)}>
              {who.name(activeMatch.player1_id)}
            </span>
          </div>
          <div class="h-px bg-cyan-500/20 flex items-center justify-center relative my-0.5">
            <span class="absolute bg-slate-950 px-2 text-[9px] text-cyan-400 font-black font-mono tracking-widest">VS</span>
          </div>
          <div class="flex items-center justify-center py-0.5">
            <span class="text-slate-100 font-black text-center text-xl sm:text-2xl leading-tight tracking-tight truncate w-full" title={who.name(activeMatch.player2_id)}>
              {who.name(activeMatch.player2_id)}
            </span>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .ticker-wrap {
    box-shadow:
      0 10px 25px -5px rgba(0, 0, 0, 0.6),
      inset 0 1px 0 0 rgba(255, 255, 255, 0.05);
  }

  .ticker {
    display: inline-flex;
    align-items: center;
    white-space: nowrap;
    position: absolute;
    width: max-content;
    will-change: transform;
  }

  .animate-marquee {
    animation: marquee 35s linear infinite;
  }

  .ticker-item {
    display: inline-flex;
    align-items: center;
    padding-right: 2rem;
    color: #cbd5e1;
  }

  @keyframes marquee {
    0% {
      transform: translate3d(0, 0, 0);
    }
    100% {
      /* Scroll by exactly one copy (1/3 of the repeated content) */
      transform: translate3d(-33.3333%, 0, 0);
    }
  }
</style>
