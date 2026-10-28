<script>
  // Overlay single-elimination tree: one column per round, each match
  // between the two that feed it, with connectors to the next round.
  import { isBye, isDecided, treePositions, treeSpecs } from "$lib/overlay-layout.js";

  let { tournament, rounds = [], stageLabel, isAlive, who } = $props();

  let specs = $derived(treeSpecs(rounds[0]?.matches.length || 0));
  let layout = $derived(treePositions(rounds, specs));
  // Very tall 17..31 fields have no sections; scale the whole tree to fit.
  let scale = $derived(layout.totalHeight > 860 ? 860 / layout.totalHeight : 1);
</script>

{#snippet playerRow(m, pid, score)}
  <div class="flex-1 flex items-center justify-between gap-4 min-h-0">
    <span class="text-[9px] font-mono text-slate-600 shrink-0 w-5 text-right">{who.seed(pid) ?? "-"}</span>
    <span class="truncate flex-1 font-sans {specs.textClass} {isAlive(pid) ? 'text-slate-100 font-black' : 'text-slate-500 font-normal opacity-50'}">
      {who.name(pid)}
    </span>
    {#if isDecided(m)}
      <span
        class="font-orbitron rounded bg-slate-900/90 shrink-0 text-center {specs.scoreClass}
          {isAlive(pid) ? 'text-cyan-400 font-black' : 'text-slate-600 font-normal opacity-40'}"
      >
        {m.status === "walkover" ? (m.winner_id === pid ? "W" : "FF") : score}
      </span>
    {/if}
  </div>
{/snippet}

<div class="flex-1 flex items-center justify-start overflow-x-auto py-4 px-2 min-h-0 select-none scroll-container">
  <div
    class="flex justify-center items-stretch min-w-max mx-auto h-full py-1 {specs.colGap}"
    style="transform: scale({scale}); transform-origin: top center;"
  >
    {#each rounds as r, colIdx (r.round)}
      <div class="shrink-0 flex flex-col justify-center h-full {specs.cardWidth}">
        <div class="text-base md:text-lg text-cyan-400 font-extrabold text-center border-b-2 border-cyan-500/20 pb-2 mb-4 font-orbitron tracking-widest shrink-0 uppercase">
          {stageLabel(r.matches[0] || { bracket: "main", round: r.round }).toUpperCase()}
        </div>

        <!-- Cards are absolutely positioned so they line up across rounds. -->
        <div class="relative w-full" style="height: {layout.totalHeight}px">
          {#each r.matches as m, idx (m.id)}
            {@const pos = layout.positions[m.id] || { top: 0, height: 144 }}
            {@const live = m.id === tournament.active_match_id}
            <div class="absolute left-0 w-full" style="top: {pos.top}px; height: {pos.height}px;">
              {#if isBye(m)}
                <!-- Byes keep their place but are not drawn. -->
                <div class="w-full h-full opacity-0 pointer-events-none"></div>
              {:else}
                <div
                  class="w-full h-full rounded-xl border-2 flex flex-col relative shadow-2xl transition-all duration-300 {specs.paddingClass}
                    {live
                    ? 'border-amber-500 bg-slate-950 shadow-[0_0_25px_rgba(245,158,11,0.35)] ring-2 ring-amber-500/35 scale-102'
                    : isDecided(m)
                      ? 'border-slate-800 bg-slate-950'
                      : m.player1_id && m.player2_id
                        ? 'border-cyan-500/50 bg-slate-950 shadow-[0_0_20px_rgba(6,182,212,0.2)] hover:border-cyan-400'
                        : 'border-slate-800/60 bg-slate-950'}"
                >
                  {@render playerRow(m, m.player1_id, m.score1)}
                  <div class="w-full flex items-center gap-2 shrink-0">
                    <div class="h-px flex-1 bg-slate-800"></div>
                    <span class="text-[8px] font-black tracking-[0.2em] text-slate-600 font-orbitron">VS</span>
                    <div class="h-px flex-1 bg-slate-800"></div>
                  </div>
                  {@render playerRow(m, m.player2_id, m.score2)}
                </div>
              {/if}

              <!-- Connectors from this pair to the next round. -->
              {#if colIdx < rounds.length - 1 && idx % 2 === 0 && r.matches[idx + 1]}
                {@const sibling = r.matches[idx + 1]}
                {@const vHeight = layout.centers[sibling.id] - layout.centers[m.id]}
                {@const top = specs.H / 2}
                {@const lineA = m.winner_id && isAlive(m.winner_id) ? "active" : "inactive"}
                {@const lineB = sibling.winner_id && isAlive(sibling.winner_id) ? "active" : "inactive"}
                {#if !isBye(m)}
                  <div class="absolute -translate-y-1/2 z-0 line-horizontal-{lineA}" style="right: -{specs.connMid}px; width: {specs.connWidth}px; top: {top}px;"></div>
                  <div class="absolute w-0.5 z-0 line-vertical-{lineA}" style="right: -{specs.connMid}px; top: {top}px; height: {vHeight / 2 - specs.slotOffset}px;"></div>
                  <div
                    class="absolute z-0 line-horizontal-{lineA}"
                    style="right: -{specs.connGap}px; width: {specs.connWidth}px; top: calc({top}px + {vHeight / 2 - specs.slotOffset}px); transform: translateY(-50%);"
                  ></div>
                {/if}
                {#if !isBye(sibling)}
                  <div
                    class="absolute z-0 line-horizontal-{lineB}"
                    style="right: -{specs.connMid}px; width: {specs.connWidth}px; top: {top}px; transform: translateY(calc(-50% + {vHeight}px));"
                  ></div>
                  <div
                    class="absolute w-0.5 z-0 line-vertical-{lineB}"
                    style="right: -{specs.connMid}px; top: calc({top}px + {vHeight / 2 + specs.slotOffset}px); height: {vHeight / 2 - specs.slotOffset}px;"
                  ></div>
                  <div
                    class="absolute z-0 line-horizontal-{lineB}"
                    style="right: -{specs.connGap}px; width: {specs.connWidth}px; top: calc({top}px + {vHeight / 2 + specs.slotOffset}px); transform: translateY(-50%);"
                  ></div>
                {/if}
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  /* Connector classes are built dynamically (line-horizontal-active...),
     so they are global to survive Svelte's unused-selector pruning. */
  :global(.line-horizontal-active) {
    background: rgba(6, 182, 212, 0.95);
    box-shadow: 0 0 8px rgba(6, 182, 212, 0.8);
    height: 3px !important;
  }

  :global(.line-horizontal-inactive) {
    background: #475569;
    height: 1.5px !important;
  }

  :global(.line-vertical-active) {
    background: rgba(6, 182, 212, 0.95);
    box-shadow: 0 0 8px rgba(6, 182, 212, 0.8);
    width: 3px !important;
  }

  :global(.line-vertical-inactive) {
    background: #475569;
    width: 1.5px !important;
  }

  .scale-102 {
    transform: scale(1.025);
    box-shadow:
      0 20px 25px -5px rgba(245, 158, 11, 0.15),
      0 10px 10px -5px rgba(245, 158, 11, 0.04);
  }

  .scroll-container::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }
  .scroll-container::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.4);
  }
  .scroll-container::-webkit-scrollbar-thumb {
    background: rgba(6, 182, 212, 0.3);
    border-radius: 4px;
  }
  .scroll-container::-webkit-scrollbar-thumb:hover {
    background: rgba(6, 182, 212, 0.5);
  }
</style>
