<script>
  // One match card of the overlay's brackets and boards (single and double
  // elimination trees, Swiss / group boards), so every format looks alike:
  // flag and name per row with a VS line between them, names bold white
  // and scores in cyan, the loser (or a player already out) dimmed with
  // their flag; scores once the match is live or played, W / FF for
  // walkovers; a glowing cyan border while live. Navy cards (cyan style). `size`: sm (stage boards), md (trees), lg (8-player single
  // elimination, where the cards are big). The parent sets the box size.
  import Flag from "#lib/components/Flag.svelte";

  let { match: m, tournament, who, isAlive = null, size = "md", bye = false, class: extra = "", style = "" } = $props();

  const SIZES = {
    sm: { box: "rounded-lg px-3 py-0.5", row: "text-base gap-2", name: "gap-1.5", flag: 18, score: "text-lg min-w-[1.5rem]", vs: "text-[9px]" },
    md: { box: "rounded-xl px-3.5 py-1", row: "text-lg leading-tight gap-2", name: "gap-2", flag: 22, score: "text-2xl min-w-[1.9rem]", vs: "text-[10px]" },
    lg: { box: "rounded-xl px-5 py-3", row: "text-3xl leading-tight gap-3", name: "gap-3", flag: 36, score: "text-4xl min-w-[3.5rem]", vs: "text-xs" },
  };
  let s = $derived(SIZES[size] || SIZES.md);
  let done = $derived(m.status === "completed" || m.status === "walkover");
  let live = $derived(m.id === tournament?.active_match_id);
</script>

<div
  class="flex flex-col justify-center {s.box}
    {bye ? 'border border-dashed border-white/15 opacity-35' : live ? 'border-2 border-cyan-400 bg-[rgba(24,40,70,0.95)] shadow-[0_0_24px_rgba(34,211,238,0.45)]' : 'border border-white/[0.08] bg-[rgba(24,40,70,0.92)]'}
    {extra}"
  {style}
>
  {#each [[m.player1_id, done ? m.score1 : (m.live_score1 ?? m.score1)], [m.player2_id, done ? m.score2 : (m.live_score2 ?? m.score2)]] as [pid, score], slot (slot)}
    {@const lost = done && m.winner_id && pid && m.winner_id !== pid}
    {@const dim = lost || (!done && pid && isAlive && !isAlive(pid))}
    {#if slot === 1}
      <!-- 2px and a lighter slate: the trees are scaled down to fit the
           screen, which made a 1px slate-800 line vanish. -->
      <div class="w-full flex items-center gap-2 shrink-0">
        <div class="h-[2px] flex-1 rounded-full bg-white/[0.14]"></div>
        <span class="{s.vs} font-num font-bold tracking-[0.2em] text-[#7184A3]">VS</span>
        <div class="h-[2px] flex-1 rounded-full bg-white/[0.14]"></div>
      </div>
    {/if}
    <div class="flex-1 min-h-0 flex items-center justify-between {s.row}">
      <span class="flex min-w-0 items-center {s.name}">
        {#if pid}<span class="shrink-0 flex {dim ? 'opacity-40' : ''}"><Flag code={who.flag(pid)} size={s.flag} /></span>{/if}
        <span
          class="truncate
            {!pid ? 'text-[#7184A3] italic font-bold' : dim ? 'text-[#7184A3] font-semibold' : 'text-white font-extrabold'}"
        >{pid ? who.name(pid) : bye ? "—" : "TBD"}</span>
      </span>
      {#if !bye && (m.status === "walkover" || done || m.live_score1 != null)}
        <span
          class="font-display shrink-0 text-right leading-none tabular-nums {s.score}
            {dim ? 'text-[#7184A3] font-bold' : 'text-cyan-400 font-extrabold'}"
        >
          {m.status === "walkover" ? (m.winner_id === pid ? "W" : "FF") : (score ?? 0)}
        </span>
      {/if}
    </div>
  {/each}
</div>
