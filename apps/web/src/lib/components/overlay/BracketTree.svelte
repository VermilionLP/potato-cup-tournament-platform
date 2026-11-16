<script>
  // Overlay bracket tree, single or double elimination, always whole (layout
  // in #lib/overlay-layout.js: layoutSingleTree / layoutDoubleTree), scaled
  // to the room HybridScene gives it (treePlacement). A connector glows when
  // the player who went through it is still in the event.
  import OverlayMatchCard from "./OverlayMatchCard.svelte";
  import { DT } from "#lib/overlay-layout.js";

  let { tournament, tree, scale = 1, selectedKey = null, isAlive = null, who } = $props();

  const decided = (m) => m.status === "completed" || m.status === "walkover";
  const glowing = (m) => Boolean(isAlive && decided(m) && m.winner_id && isAlive(m.winner_id));
</script>

<div class="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
  <div class="relative shrink-0" style="width: {tree.width * scale}px; height: {tree.height * scale}px;">
    <div
      class="absolute left-0 top-0"
      style="width: {tree.width}px; height: {tree.height}px; transform: scale({scale}); transform-origin: top left;"
    >
      <svg class="pointer-events-none absolute inset-0 overflow-visible" width={tree.width} height={tree.height}>
        {#each tree.paths as p, i (i)}
          {#if !glowing(p.from)}
            <path d={p.d} fill="none" stroke="rgba(175, 192, 216, 0.3)" stroke-width="2" />
          {/if}
        {/each}
        <!-- Live paths on top. -->
        {#each tree.paths as p, i (i)}
          {#if glowing(p.from)}
            <path d={p.d} fill="none" stroke="rgba(34, 211, 238, 0.9)" stroke-width="3" style="filter: drop-shadow(0 0 6px rgba(34, 211, 238, 0.6));" />
          {/if}
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
          {isAlive}
          bye={(m.status === "completed" || m.status === "walkover") && (!m.player1_id || !m.player2_id)}
          class="absolute"
          style="left: {it.x}px; top: {it.y - DT.cardHeight / 2}px; width: {DT.columnWidth}px; height: {DT.cardHeight}px;"
        />
      {/each}
    </div>
  </div>
</div>
