<script>
  // Overlay stage board (Swiss and group stages): one band per bracket, one
  // column per round, the shown stage highlighted.
  import OverlayMatchCard from "./OverlayMatchCard.svelte";
  import { BOARD_CARD_H, BOARD_GAP, boardScale } from "#lib/overlay-layout.js";

  let { tournament, bands = [], selectedKey = null, isAlive, who } = $props();

  let scale = $derived(boardScale(bands));
</script>

<div class="flex-1 min-h-0 flex items-center justify-center overflow-hidden py-2">
  <div class="flex flex-col gap-4" style="transform: scale({scale}); transform-origin: center center;">
    {#each bands as band (band.bracket)}
      <div>
        <div class="text-[11px] font-mono font-bold tracking-[0.3em] text-cyan-400/80 uppercase mb-2">{band.name}</div>
        <div class="flex gap-4 items-start">
          {#each band.columns as col (col.key)}
            <div class="w-58 shrink-0">
              <div
                class="text-sm font-extrabold text-center pb-1 mb-2 border-b-2 font-orbitron tracking-wider uppercase
                  {col.key === selectedKey ? 'text-amber-400 border-amber-500/40' : 'text-cyan-400 border-cyan-500/20'}"
              >
                {col.label}
              </div>
              <div class="flex flex-col" style="gap: {BOARD_GAP}px">
                {#each col.matches as m (m.id)}
                  <OverlayMatchCard match={m} {tournament} {who} {isAlive} size="sm" style="height: {BOARD_CARD_H}px" />
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</div>
