<script>
  // Overlay double-elimination tree (layout in #lib/overlay-layout.js).
  import OverlayMatchCard from "./OverlayMatchCard.svelte";
  import { DT } from "#lib/overlay-layout.js";

  let { tournament, tree, selectedKey = null, who } = $props();

  // Fits next to the side panel (1792 − 420 − 32 wide, 1080 − 188 − 48 high).
  let scale = $derived(Math.min(1.3, 1320 / tree.width, 820 / tree.height));
</script>

<div class="flex-1 min-h-0 flex items-center justify-center overflow-hidden py-2">
  <div
    class="relative shrink-0"
    style="width: {tree.width}px; height: {tree.height}px; transform: scale({scale}); transform-origin: center center;"
  >
    <svg class="absolute inset-0 overflow-visible pointer-events-none" width={tree.width} height={tree.height}>
      {#each tree.paths as d, i (i)}
        <path {d} fill="none" stroke="rgba(175, 192, 216, 0.3)" stroke-width="2" />
      {/each}
    </svg>
    {#each tree.headers as h (h.key)}
      <div
        class="absolute flex h-7 items-center justify-center rounded-full font-num text-sm font-bold uppercase tracking-[0.12em]
          {h.key === selectedKey ? 'bg-cyan-400 text-[#03252E]' : 'bg-white/[0.06] text-[#AFC0D8]'}"
        style="left: {h.x}px; top: {h.y}px; width: {DT.columnWidth}px;"
      >{h.label}</div>
    {/each}
    {#each tree.items as it (it.match.id)}
      {@const m = it.match}
      <OverlayMatchCard
        match={m}
        {tournament}
        {who}
        bye={(m.status === "completed" || m.status === "walkover") && (!m.player1_id || !m.player2_id)}
        class="absolute"
        style="left: {it.x}px; top: {it.y - DT.cardHeight / 2}px; width: {DT.columnWidth}px; height: {DT.cardHeight}px;"
      />
    {/each}
  </div>
</div>
