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
        <div class="mb-2 font-num text-base font-bold uppercase tracking-[0.16em] text-cyan-200">{band.name}</div>
        <div class="flex gap-4 items-start">
          {#each band.columns as col (col.key)}
            <div class="w-58 shrink-0">
              <div
                class="mb-2 flex h-7 items-center justify-center rounded-full font-num text-sm font-bold uppercase tracking-[0.12em]
                  {col.key === selectedKey ? 'bg-cyan-400 text-[#03252E]' : 'bg-white/[0.06] text-[#AFC0D8]'}"
              >
                {col.tag}
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
