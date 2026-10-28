<script>
  // Overlay "intro" scene: the matches of one stage, eight per page; pages
  // turn every 10 s on big fields.
  import { fade } from "svelte/transition";

  let { tournament, stage = null, matchOrder, who } = $props();

  let matches = $derived(stage?.matches || []);
  let page = $state(0);
  let pageCount = $derived(Math.max(1, Math.ceil(matches.length / 8)));
  let visible = $derived(matches.slice(page * 8, page * 8 + 8));

  $effect(() => {
    if (page >= pageCount) page = 0;
  });

  $effect(() => {
    if (pageCount <= 1) return;
    const timer = setInterval(() => {
      page = (page + 1) % pageCount;
    }, 10000);
    return () => clearInterval(timer);
  });

  const decided = (m) => m.status === "completed" || m.status === "walkover";
</script>

{#snippet playerRow(m, pid, score)}
  <div class="flex items-center justify-between gap-3">
    <div class="flex items-center gap-2 overflow-hidden">
      <span class="font-extrabold text-lg sm:text-xl tracking-tight leading-tight text-white font-sans">
        {who.name(pid)}
      </span>
    </div>
    <div
      class="font-orbitron font-extrabold text-xl sm:text-2xl px-2 py-0.5 rounded bg-slate-950/80 border-2 border-slate-800/80 min-w-10 text-center
        {decided(m) && m.winner_id === pid ? 'text-amber-400 border-amber-500/20' : 'text-slate-300'}"
    >
      {m.status === "walkover" ? (m.winner_id === pid ? "W" : "FF") : score}
    </div>
  </div>
{/snippet}

<div class="absolute inset-0 w-full h-full flex flex-col p-6 md:p-8 justify-between z-10" transition:fade={{ duration: 400 }}>
  <header class="flex justify-between items-end border-b-2 border-cyan-500/20 pb-2 mb-2">
    <div>
      <span class="text-cyan-400 text-xs font-mono font-bold tracking-widest uppercase block mb-1">
        WarThunder • Potato Cup • MATCHES OVERVIEW
      </span>
      <h1 class="text-4xl md:text-5xl font-extrabold tracking-tight leading-none text-white uppercase font-orbitron">
        {tournament.name}
      </h1>
    </div>
    <div class="text-right font-orbitron">
      <span class="text-slate-400 text-xs tracking-wider block font-sans">CURRENT STAGE</span>
      <span class="text-2xl font-black text-cyan-400 tracking-wider">
        {(stage?.label || "").toUpperCase()}
      </span>
      {#if pageCount > 1}
        <div class="text-[10px] font-mono tracking-wider text-slate-500 mt-1">
          SECTION {page + 1} / {pageCount}
        </div>
        <div class="flex justify-end gap-1 mt-2">
          {#each Array(pageCount) as _, i (i)}
            <button
              type="button"
              onclick={() => (page = i)}
              aria-label={`Show intro page ${i + 1}`}
              class="h-1.5 rounded-full transition-all {i === page ? 'w-7 bg-cyan-400' : 'w-2.5 bg-slate-700 hover:bg-slate-500'}"
            ></button>
          {/each}
        </div>
      {/if}
    </div>
  </header>

  <div class="flex-1 flex items-center justify-center py-3">
    {#if matches.length === 0}
      <div class="text-center py-12 px-6 rounded-2xl bg-slate-900/60 border border-slate-800">
        <p class="text-slate-400 text-base italic">No matches scheduled in this round.</p>
      </div>
    {:else}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 w-full max-w-7xl">
        {#each visible as m (m.id)}
          {@const live = m.id === tournament.active_match_id}
          <div
            class="match-card relative rounded-2xl border-2 transition-all flex flex-col justify-between overflow-hidden shadow-lg p-4 min-h-32.5
              {live
              ? 'border-amber-500 bg-linear-to-b from-amber-950/20 to-slate-900/90 shadow-amber-500/20 scale-102 ring-1 ring-amber-500/30'
              : m.status === 'completed'
                ? 'border-slate-800 bg-slate-950/60 opacity-75'
                : 'border-slate-700/50 bg-slate-900/50 hover:border-cyan-500/50'}"
          >
            {#if live}
              <div class="absolute top-0 right-0 bg-amber-500 text-black text-[9px] font-bold px-3 py-0.5 uppercase tracking-wider rounded-bl-lg animate-pulse font-orbitron">
                LIVE
              </div>
            {:else if decided(m)}
              <div class="absolute top-0 right-0 bg-emerald-500 text-black text-[9px] font-bold px-3 py-0.5 uppercase tracking-wider rounded-bl-lg font-orbitron">
                {m.status === "walkover" ? "WALKOVER" : "COMPLETED"}
              </div>
            {/if}

            <div class="text-[9px] font-mono text-slate-500 uppercase tracking-widest mb-2">
              #{matchOrder.get(m.id)} · MATCH {m.position}
            </div>

            <div class="space-y-2 my-1">
              {@render playerRow(m, m.player1_id, m.score1)}
              <div class="h-px bg-slate-800/40 relative flex justify-center items-center">
                <span class="absolute bg-slate-900 px-2 text-[9px] text-slate-500 font-mono tracking-widest">VS</span>
              </div>
              {@render playerRow(m, m.player2_id, m.score2)}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .scale-102 {
    transform: scale(1.025);
    box-shadow:
      0 20px 25px -5px rgba(245, 158, 11, 0.15),
      0 10px 10px -5px rgba(245, 158, 11, 0.04);
  }
</style>
