<script>
  // Overlay board for Swiss in several groups: one group at a time (chosen
  // by pickFocusGroup), its last rounds as columns.
  import { fade } from "svelte/transition";
  import Flag from "$lib/components/Flag.svelte";
  import { GROUP_COL_W, focusGroupRounds, groupBoardScale } from "$lib/overlay-layout.js";

  let { tournament, group, groupCount = 1, groupIndex = 0, shownKey = null, who } = $props();

  let rounds = $derived(focusGroupRounds(group));
  let scale = $derived(groupBoardScale(rounds));
</script>

{#snippet swissMatch(m)}
  {@const done = m.status === "completed" || m.status === "walkover"}
  {@const live = m.id === tournament.active_match_id}
  <div
    class="rounded-lg border-2 px-3 py-2 grid grid-cols-[1fr_auto_1fr] items-center gap-3
      {live ? 'border-amber-500 bg-amber-950/30' : done ? 'border-slate-800 bg-slate-950/70' : 'border-slate-700/60 bg-slate-900/70'}"
  >
    {#each [m.player1_id, m.player2_id] as pid, slot (slot)}
      {@const won = done && m.winner_id && m.winner_id === pid}
      {@const lost = done && m.winner_id && pid && m.winner_id !== pid}
      {#if slot === 1}
        <span class="font-orbitron font-black text-sm text-center text-slate-400 whitespace-nowrap">
          {#if m.status === "walkover"}{m.winner_id === m.player1_id ? "W : FF" : "FF : W"}{:else if done || live}<span
              class={m.winner_id === m.player1_id ? "text-amber-400" : ""}>{m.score1 ?? 0}</span
            > : <span class={m.winner_id === m.player2_id ? "text-amber-400" : ""}>{m.score2 ?? 0}</span>{:else}VS{/if}
        </span>
      {/if}
      <span class="flex min-w-0 items-center gap-1.5 {slot === 1 ? 'justify-end' : ''} {lost ? 'opacity-45' : ''}">
        {#if slot === 0 && pid}<Flag code={who.flag(pid)} size={20} />{/if}
        <span class="truncate font-bold text-base {!pid ? 'text-slate-600 italic' : won ? 'text-amber-300' : lost ? 'text-slate-400' : 'text-white'}"
          >{pid ? who.name(pid) : "BYE"}</span
        >
        {#if slot === 1 && pid}<Flag code={who.flag(pid)} size={20} />{/if}
      </span>
    {/each}
  </div>
{/snippet}

<div class="flex-1 min-h-0 flex items-center justify-center overflow-hidden py-2">
  {#key group.label}
    <div
      class="rounded-2xl border-2 border-amber-500/50 bg-slate-950/80 p-5 shadow-2xl shrink-0"
      style="transform: scale({scale}); transform-origin: center center;"
      in:fade={{ duration: 400 }}
    >
      <div class="flex items-baseline justify-between border-b-2 border-cyan-500/20 pb-2 mb-4">
        <span class="text-2xl font-black font-orbitron tracking-wider text-white">GROUP {group.label}</span>
        <span class="text-xs font-mono font-bold tracking-[0.25em] text-slate-500">{groupIndex + 1} / {groupCount}</span>
      </div>
      <div class="flex gap-5 items-start">
        {#each rounds as r (r.key)}
          <div class="shrink-0" style="width: {GROUP_COL_W}px">
            <div
              class="text-sm font-extrabold text-center pb-1 mb-3 border-b-2 tracking-wider
                {r.key === shownKey ? 'text-amber-400 border-amber-500/40' : 'text-cyan-400 border-cyan-500/20'}"
            >{r.label}</div>
            <div class="flex flex-col gap-2.5">
              {#each r.matches as m (m.id)}
                {@render swissMatch(m)}
              {:else}
                <div class="text-xs italic text-slate-500 text-center">本轮无对局</div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/key}
</div>
