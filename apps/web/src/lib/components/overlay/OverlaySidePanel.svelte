<script>
  // Side panel of the overlay's bracket scene: the live match, the next one,
  // and the latest results (or, in Swiss and group stages, the standings).
  import { fade } from "svelte/transition";
  import Flag from "#lib/components/Flag.svelte";

  let {
    tournament,
    nextMatch = null,
    activeMatch = null,
    nextTag = "",
    focusGroup = null,
    standings = [],
    matches = [],
    stageLabel,
    matchOrder,
    who,
  } = $props();

  const decided = (m) => m.status === "completed" || m.status === "walkover";
  let latest = $derived(
    matches
      .filter((m) => decided(m) && m.player1_id && m.player2_id)
      .sort((a, b) => String(b.updated_at || b.played_at || "").localeCompare(String(a.updated_at || a.played_at || "")) || (matchOrder.get(b.id) ?? 0) - (matchOrder.get(a.id) ?? 0))
      .slice(0, 4),
  );
  const score = (m, slot) => (m.status === "walkover" ? (m.winner_id === (slot === 1 ? m.player1_id : m.player2_id) ? "W" : "FF") : slot === 1 ? (m.live_score1 ?? m.score1 ?? "") : (m.live_score2 ?? m.score2 ?? ""));
</script>

{#snippet title(text, extra = "")}
  <div class="mb-2 flex items-center justify-between">
    <span class="font-num text-base font-bold tracking-[0.16em] text-cyan-400">{text}</span>
    {#if extra}<span class="font-num text-base font-bold tracking-[0.12em] text-[#7184A3]">{extra}</span>{/if}
  </div>
{/snippet}

{#snippet row(m, pid, slot, showScore)}
  {@const lost = decided(m) && m.winner_id && m.winner_id !== pid}
  <div class="flex h-9 items-center gap-2.5 {lost ? 'opacity-45' : ''}">
    {#if pid}<Flag code={who.flag(pid)} size={22} />{/if}
    <span class="min-w-0 flex-1 truncate text-[22px] font-bold">{who.name(pid)}</span>
    {#if showScore}<span class="font-display text-[28px] font-extrabold leading-none {lost ? 'text-[#7184A3]' : 'text-cyan-400'}">{score(m, slot)}</span>{/if}
  </div>
{/snippet}

<aside class="flex w-[420px] shrink-0 flex-col gap-5">
  {#if activeMatch}
    <div class="rounded-2xl border-2 border-cyan-400 bg-[rgba(24,40,70,0.92)] px-5 py-4 shadow-[0_0_40px_rgba(34,211,238,0.2)]">
      {@render title("● NOW LIVE", stageLabel(activeMatch).toUpperCase())}
      {@render row(activeMatch, activeMatch.player1_id, 1, activeMatch.live_score1 != null)}
      <div class="my-1 h-px bg-white/10"></div>
      {@render row(activeMatch, activeMatch.player2_id, 2, activeMatch.live_score1 != null)}
    </div>
  {/if}

  <div class="rounded-2xl border border-white/[0.07] bg-[rgba(24,40,70,0.92)] px-5 py-4">
    {@render title("UP NEXT", nextMatch ? `#${matchOrder.get(nextMatch.id) ?? ""} · ${stageLabel(nextMatch).toUpperCase()}` : nextTag)}
    {#if nextMatch}
      {@render row(nextMatch, nextMatch.player1_id, 1, false)}
      <div class="my-1 h-px bg-white/10"></div>
      {@render row(nextMatch, nextMatch.player2_id, 2, false)}
    {:else}
      <p class="text-lg text-[#7184A3]">No match ready to play.</p>
    {/if}
  </div>

  {#if focusGroup}
    <div class="min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/[0.07] bg-[rgba(24,40,70,0.92)] px-5 py-4">
      {@render title("STANDINGS", `GROUP ${focusGroup.label}`)}
      {#key focusGroup.label}
        <div class="flex flex-col" in:fade={{ duration: 300 }}>
          {#each focusGroup.rows as r, i (r.player_id)}
            {@const through = focusGroup.perGroup && (r.rank ?? i + 1) <= focusGroup.perGroup}
            <div class="flex h-9 items-center gap-2.5 border-t border-white/[0.06] {through ? 'text-white' : 'text-[#AFC0D8]'}">
              <span class="w-6 text-right font-num text-lg font-bold {through ? 'text-cyan-400' : 'text-[#7184A3]'}">{r.rank ?? i + 1}</span>
              <Flag code={who.flag(r.player_id)} size={20} />
              <span class="min-w-0 flex-1 truncate text-lg font-bold">{who.name(r.player_id)}</span>
              <span class="font-num text-lg font-bold tabular-nums">{r.wins ?? 0}–{r.losses ?? 0}</span>
            </div>
          {/each}
        </div>
      {/key}
    </div>
  {:else if standings.length}
    <div class="min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/[0.07] bg-[rgba(24,40,70,0.92)] px-5 py-4">
      {@render title("STANDINGS")}
      {#each standings.slice(0, 10) as r, i (r.player_id + (r.group_label || ""))}
        <div class="flex h-9 items-center gap-2.5 border-t border-white/[0.06]">
          <span class="w-8 text-right font-num text-lg font-bold text-[#7184A3]">{r.group_label ? `${r.group_label}${r.rank}` : (r.rank ?? i + 1)}</span>
          <Flag code={who.flag(r.player_id)} size={20} />
          <span class="min-w-0 flex-1 truncate text-lg font-bold">{who.name(r.player_id)}</span>
          <span class="font-num text-lg font-bold tabular-nums">{r.wins ?? 0}–{r.losses ?? 0}</span>
        </div>
      {/each}
    </div>
  {:else}
    <div class="min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/[0.07] bg-[rgba(24,40,70,0.92)] px-5 py-4">
      {@render title("LATEST RESULTS")}
      {#each latest as m (m.id)}
        <div class="border-t border-white/[0.06] py-1.5">
          <div class="flex items-center gap-2.5">
            <span class="min-w-0 flex-1 truncate text-lg font-bold {m.winner_id === m.player1_id ? '' : 'text-[#7184A3]'}">{who.name(m.player1_id)}</span>
            <span class="shrink-0 font-display text-2xl font-extrabold text-cyan-400 tabular-nums">{score(m, 1)} : {score(m, 2)}</span>
            <span class="min-w-0 flex-1 truncate text-right text-lg font-bold {m.winner_id === m.player2_id ? '' : 'text-[#7184A3]'}">{who.name(m.player2_id)}</span>
          </div>
        </div>
      {:else}
        <p class="text-lg text-[#7184A3]">No results yet.</p>
      {/each}
    </div>
  {/if}
</aside>
