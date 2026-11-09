<script>
  // Overlay board for Swiss in several groups: one group at a time (chosen
  // by pickFocusGroup), its last rounds as columns.
  import { fade } from "svelte/transition";
  import Flag from "#lib/components/Flag.svelte";
  import { GROUP_COL_W, focusGroupRounds, groupBoardScale } from "#lib/overlay-layout.js";

  let { tournament, group, groupCount = 1, groupIndex = 0, shownKey = null, who } = $props();

  let rounds = $derived(focusGroupRounds(group));
  let scale = $derived(groupBoardScale(rounds));
</script>

{#snippet swissMatch(m)}
  {@const done = m.status === "completed" || m.status === "walkover"}
  {@const live = m.id === tournament.active_match_id}
  <div
    class="rounded-lg border-2 px-3 py-2 grid grid-cols-[1fr_auto_1fr] items-center gap-3
      {live ? 'border-cyan-400 bg-[rgba(24,40,70,0.95)] shadow-[0_0_20px_rgba(34,211,238,0.4)]' : 'border-white/[0.08] bg-[rgba(24,40,70,0.92)]'}"
  >
    {#each [m.player1_id, m.player2_id] as pid, slot (slot)}
      {@const lost = done && m.winner_id && pid && m.winner_id !== pid}
      {#if slot === 1}
        <span class="font-display text-xl font-extrabold text-center text-[#7184A3] whitespace-nowrap tabular-nums">
          {#if m.status === "walkover"}{m.winner_id === m.player1_id ? "W : FF" : "FF : W"}{:else if done || live}<span
              class={done && m.winner_id && m.winner_id !== m.player1_id ? "text-[#7184A3]" : "text-cyan-400"}>{m.score1 ?? 0}</span
            > : <span class={done && m.winner_id && m.winner_id !== m.player2_id ? "text-[#7184A3]" : "text-cyan-400"}>{m.score2 ?? 0}</span>{:else}VS{/if}
        </span>
      {/if}
      <span class="flex min-w-0 items-center gap-1.5 {slot === 1 ? 'justify-end' : ''}">
        {#if slot === 0 && pid}<Flag code={who.flag(pid)} size={20} />{/if}
        <span class="truncate text-lg {!pid ? 'text-[#7184A3] italic font-bold' : lost ? 'text-[#7184A3] font-semibold' : 'text-white font-extrabold'}"
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
      class="rounded-[20px] border border-white/[0.07] bg-[rgba(10,22,48,0.6)] p-5 shrink-0"
      style="transform: scale({scale}); transform-origin: center center;"
      in:fade={{ duration: 400 }}
    >
      <div class="mb-4 flex items-baseline justify-between">
        <span class="font-display text-[40px] font-extrabold leading-none">GROUP {group.label}</span>
        <span class="font-num text-base font-bold tracking-[0.16em] text-[#AFC0D8]">{groupIndex + 1} / {groupCount}</span>
      </div>
      <div class="flex gap-5 items-start">
        {#each rounds as r (r.key)}
          <div class="shrink-0" style="width: {GROUP_COL_W}px">
            <div
              class="mb-3 flex h-8 items-center justify-center rounded-full font-num text-base font-bold uppercase tracking-[0.12em]
                {r.key === shownKey ? 'bg-cyan-400 text-[#03252E]' : 'bg-white/[0.06] text-[#AFC0D8]'}"
            >{r.tag}</div>
            <div class="flex flex-col gap-2.5">
              {#each r.matches as m (m.id)}
                {@render swissMatch(m)}
              {:else}
                <div class="text-center text-base italic text-[#7184A3]">No matches</div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/key}
</div>
