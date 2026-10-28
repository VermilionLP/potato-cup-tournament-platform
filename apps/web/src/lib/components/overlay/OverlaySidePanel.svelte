<script>
  // Side panel of the overlay's bracket scene: next match, progress and
  // (Swiss) standings.
  import { fade } from "svelte/transition";
  import Flag from "$lib/components/Flag.svelte";

  let {
    nextMatch = null,
    activeMatch = null,
    nextTag = "",
    progress,
    focusGroup = null,
    standings = [],
    stageLabel,
    matchOrder,
    who,
  } = $props();
</script>

{#snippet nextPlayer(pid)}
  <div class="flex items-center justify-between gap-2">
    <div class="flex items-center gap-2 min-w-0">
      <span class="text-[9px] font-mono text-slate-500 shrink-0">#{who.seed(pid) ?? "-"}</span>
      <span class="text-sm font-black text-white truncate">{who.name(pid)}</span>
    </div>
  </div>
{/snippet}

<aside class="w-80 shrink-0 flex flex-col justify-center gap-4 py-4">
  <div class="rounded-2xl border border-cyan-500/25 bg-slate-950/80 p-5 shadow-2xl backdrop-blur">
    <div class="flex items-center justify-between mb-3">
      <span class="text-[10px] font-mono font-bold tracking-[0.2em] text-cyan-400 uppercase">NEXT MATCH</span>
      <span class="text-[9px] font-mono text-slate-500">{nextTag}</span>
    </div>
    {#if nextMatch}
      <div class="space-y-2">
        {@render nextPlayer(nextMatch.player1_id)}
        <div class="flex items-center gap-2">
          <div class="h-px flex-1 bg-slate-800"></div>
          <span class="text-[8px] font-black tracking-[0.2em] text-slate-600 font-orbitron">VS</span>
          <div class="h-px flex-1 bg-slate-800"></div>
        </div>
        {@render nextPlayer(nextMatch.player2_id)}
      </div>
      <div class="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[9px] font-mono text-slate-500 uppercase">
        <span>{stageLabel(nextMatch)}</span>
        <span>#{matchOrder.get(nextMatch.id)}</span>
      </div>
    {:else if activeMatch}
      <div class="text-sm font-black text-amber-400">LIVE</div>
      <div class="text-xs text-slate-400 mt-1">
        {who.name(activeMatch.player1_id)} vs
        {who.name(activeMatch.player2_id)}
      </div>
    {:else}
      <div class="text-sm text-slate-500 italic">No playable match right now.</div>
    {/if}
  </div>

  <div class="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-5">
    <div class="text-[10px] font-mono font-bold tracking-[0.2em] text-slate-500 uppercase">{progress.title}</div>
    <div class="text-3xl font-black text-white font-orbitron mt-1">{progress.value}</div>
    <div class="text-[10px] font-mono text-slate-500 mt-2">{progress.done} / {progress.total} MATCHES</div>
    <div class="h-1 bg-slate-800 rounded-full mt-2 overflow-hidden">
      <div class="h-full bg-cyan-400" style="width: {progress.percent}%"></div>
    </div>
  </div>

  {#if focusGroup}
    <div class="rounded-2xl border border-amber-500/40 bg-slate-950/80 p-4 shadow-2xl backdrop-blur">
      <div class="flex items-center justify-between mb-2">
        <span class="text-[10px] font-mono font-bold tracking-[0.2em] text-cyan-400 uppercase">STANDINGS</span>
        <span class="text-xs font-black font-orbitron tracking-wider text-amber-400">GROUP {focusGroup.label}</span>
      </div>
      {#key focusGroup.label}
        <div class="space-y-1" in:fade={{ duration: 300 }}>
          {#each focusGroup.rows as row, i (row.player_id)}
            {@const through = focusGroup.perGroup && (row.rank ?? i + 1) <= focusGroup.perGroup}
            <div class="flex items-center gap-2 rounded px-1 py-0.5 text-xs {through ? 'bg-cyan-500/10' : ''}">
              <span class="w-5 text-right font-mono {through ? 'text-cyan-400' : 'text-slate-500'}">{row.rank ?? i + 1}</span>
              <Flag code={who.flag(row.player_id)} size={16} />
              <span class="flex-1 truncate font-bold text-white">{who.name(row.player_id)}</span>
              <span class="font-orbitron text-cyan-400 shrink-0">{row.wins ?? 0}-{row.losses ?? 0}</span>
            </div>
          {/each}
        </div>
      {/key}
    </div>
  {:else if standings.length}
    <div class="rounded-2xl border border-cyan-500/25 bg-slate-950/80 p-4 shadow-2xl backdrop-blur">
      <div class="text-[10px] font-mono font-bold tracking-[0.2em] text-cyan-400 uppercase mb-2">STANDINGS</div>
      <div class="space-y-1">
        {#each standings as row, i (row.player_id + (row.group_label || ""))}
          <div class="flex items-center gap-2 text-xs">
            <span class="w-6 text-right font-mono text-slate-500">{row.group_label ? `${row.group_label}${row.rank}` : row.rank ?? i + 1}</span>
            <Flag code={who.flag(row.player_id)} size={16} />
            <span class="flex-1 truncate font-bold text-white">{who.name(row.player_id)}</span>
            <span class="font-orbitron text-cyan-400 shrink-0">{row.wins ?? 0}-{row.losses ?? 0}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</aside>
