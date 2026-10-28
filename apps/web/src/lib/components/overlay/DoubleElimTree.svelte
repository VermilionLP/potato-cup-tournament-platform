<script>
  // Overlay double-elimination tree (layout in $lib/overlay-layout.js).
  import Flag from "$lib/components/Flag.svelte";
  import { DT } from "$lib/overlay-layout.js";

  let { tournament, tree, selectedKey = null, who } = $props();

  let scale = $derived(Math.min(1.3, 1440 / tree.width, 820 / tree.height));
</script>

<div class="flex-1 min-h-0 flex items-center justify-center overflow-hidden py-2">
  <div
    class="relative shrink-0"
    style="width: {tree.width}px; height: {tree.height}px; transform: scale({scale}); transform-origin: center center;"
  >
    <svg class="absolute inset-0 overflow-visible pointer-events-none" width={tree.width} height={tree.height}>
      {#each tree.paths as d, i (i)}
        <path {d} fill="none" stroke="rgba(34, 211, 238, 0.35)" stroke-width="2" />
      {/each}
    </svg>
    {#each tree.headers as h (h.key)}
      <div
        class="absolute text-center text-sm font-extrabold font-orbitron tracking-wider uppercase border-b-2 pb-1
          {h.key === selectedKey ? 'text-amber-400 border-amber-500/40' : 'text-cyan-400 border-cyan-500/20'}"
        style="left: {h.x}px; top: {h.y}px; width: {DT.columnWidth}px;"
      >{h.label}</div>
    {/each}
    {#each tree.items as it (it.match.id)}
      {@const m = it.match}
      {@const done = m.status === "completed" || m.status === "walkover"}
      {@const live = m.id === tournament.active_match_id}
      {@const bye = done && (!m.player1_id || !m.player2_id)}
      <div
        class="absolute rounded-xl border-2 px-3.5 flex flex-col justify-center gap-0.5 shadow-xl
          {bye ? 'opacity-35 border-slate-800 bg-slate-950/50' : live ? 'border-amber-500 bg-amber-950/40' : done ? 'border-slate-800 bg-slate-950/80' : 'border-slate-700/60 bg-slate-900/80'}"
        style="left: {it.x}px; top: {it.y - DT.cardHeight / 2}px; width: {DT.columnWidth}px; height: {DT.cardHeight}px;"
      >
        {#each [[m.player1_id, m.score1], [m.player2_id, m.score2]] as [pid, score], slot (slot)}
          {@const won = done && m.winner_id && m.winner_id === pid}
          {@const lost = done && m.winner_id && pid && m.winner_id !== pid}
          <div class="flex items-center justify-between gap-2 text-base leading-tight {lost ? 'opacity-45' : ''}">
            <span class="flex min-w-0 items-center gap-2">
              {#if pid}<Flag code={who.flag(pid)} size={22} />{/if}
              <span class="truncate font-bold {!pid ? 'text-slate-600 italic' : won ? 'text-amber-300' : lost ? 'text-slate-400' : 'text-white'}"
                >{pid ? who.name(pid) : bye ? "—" : "TBD"}</span
              >
            </span>
            <span class="font-orbitron font-black text-sm shrink-0 {won ? 'text-amber-400' : 'text-slate-500'}">
              {#if bye}{:else if m.status === "walkover"}{won ? "W" : "FF"}{:else if done || live}{score ?? 0}{/if}
            </span>
          </div>
        {/each}
      </div>
    {/each}
  </div>
</div>
