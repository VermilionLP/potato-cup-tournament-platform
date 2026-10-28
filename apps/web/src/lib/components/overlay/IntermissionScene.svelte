<script>
  // Overlay "intermission" scene: the next six playable matches.
  import { fade } from "svelte/transition";

  let { matches = [], matchOrder, stageShort, who } = $props();
</script>

<div class="absolute inset-0 w-full h-full flex flex-col p-6 md:p-8 justify-between z-10" transition:fade={{ duration: 400 }}>
  <header class="flex justify-between items-end border-b-2 border-cyan-500/20 pb-2 mb-2 font-orbitron">
    <div>
      <span class="text-cyan-400 text-xs font-mono font-bold tracking-widest uppercase block mb-1">
        WarThunder • Potato Cup • INTERMISSION
      </span>
      <h1 class="text-4xl md:text-5xl font-extrabold tracking-wider leading-none text-white uppercase">COMING UP NEXT</h1>
    </div>
    <div class="text-right">
      <span class="text-slate-400 text-xs tracking-wider block font-sans">STATUS</span>
      <span class="text-2xl font-black text-cyan-400 tracking-wider">{matches.length} PLAYABLE MATCHES</span>
    </div>
  </header>

  <div class="flex-1 flex items-center justify-center py-3">
    {#if matches.length === 0}
      <div class="text-center py-12 px-8 rounded-2xl bg-slate-900/60 border border-slate-800/80 max-w-lg">
        <h2 class="text-lg font-bold text-white mb-2">No Playable Matches</h2>
      </div>
    {:else}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full max-w-6xl">
        {#each matches.slice(0, 6) as m (m.id)}
          <div
            class="relative rounded-2xl border-2 border-slate-800 bg-slate-900/60 p-4 flex flex-col justify-between overflow-hidden shadow-lg group hover:border-cyan-500/30 transition-all duration-300 min-h-27.5"
          >
            <div class="flex justify-between items-center text-[9px] font-mono text-slate-500 tracking-wider mb-2">
              <span>#{matchOrder.get(m.id)} · MATCH {m.position}</span>
              <span class="text-cyan-400 font-bold px-2 py-0.5 rounded bg-cyan-950/20 border border-cyan-800/20 uppercase">
                {stageShort(m)}
              </span>
            </div>
            <div class="flex items-center justify-between gap-4 py-1">
              <div class="flex-1 flex flex-col items-center text-center overflow-hidden">
                <span class="font-extrabold text-lg sm:text-xl text-white tracking-tight leading-tight truncate w-full font-sans">
                  {who.name(m.player1_id)}
                </span>
              </div>
              <div class="flex flex-col items-center justify-center shrink-0">
                <div class="w-8 h-8 rounded-full border-2 border-cyan-500/20 bg-slate-950 flex items-center justify-center text-[10px] font-bold text-cyan-400 font-orbitron">
                  VS
                </div>
              </div>
              <div class="flex-1 flex flex-col items-center text-center overflow-hidden">
                <span class="font-extrabold text-lg sm:text-xl text-white tracking-tight leading-tight truncate w-full font-sans">
                  {who.name(m.player2_id)}
                </span>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
