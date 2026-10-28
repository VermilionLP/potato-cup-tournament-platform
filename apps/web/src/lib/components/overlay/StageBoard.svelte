<script>
  // Overlay stage board (Swiss and group stages): one band per bracket, one
  // column per round, the shown stage highlighted.
  import Flag from "$lib/components/Flag.svelte";
  import { BOARD_CARD_H, BOARD_GAP, boardScale } from "$lib/overlay-layout.js";

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
                  {@const done = m.status === "completed" || m.status === "walkover"}
                  {@const live = m.id === tournament.active_match_id}
                  <div
                    class="rounded-lg border-2 px-3 flex flex-col justify-center gap-0.5
                      {live ? 'border-amber-500 bg-amber-950/30' : done ? 'border-slate-800 bg-slate-950/70' : 'border-slate-700/60 bg-slate-900/70'}"
                    style="height: {BOARD_CARD_H}px"
                  >
                    {#each [[m.player1_id, m.score1], [m.player2_id, m.score2]] as [pid, score], slot (slot)}
                      {@const won = done && m.winner_id && m.winner_id === pid}
                      {@const lost = done && m.winner_id && pid && m.winner_id !== pid}
                      <div class="flex items-center justify-between gap-2 text-sm {lost ? 'opacity-45' : ''}">
                        <span class="flex min-w-0 items-center gap-1.5">
                          {#if pid}<Flag code={who.flag(pid)} size={18} />{/if}
                          <span
                            class="truncate font-bold
                              {!pid ? 'text-slate-600 italic' : won ? 'text-amber-300' : done || !isAlive(pid) ? 'text-slate-500' : 'text-white'}"
                          >{who.name(pid)}</span>
                        </span>
                        <span class="font-orbitron font-black text-xs shrink-0 {won ? 'text-amber-400' : 'text-slate-400'}">
                          {#if m.status === "walkover"}{won ? "W" : "FF"}{:else if done || live}{score ?? 0}{/if}
                        </span>
                      </div>
                    {/each}
                  </div>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</div>
