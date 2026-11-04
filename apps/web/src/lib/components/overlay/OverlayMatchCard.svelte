<script>
  // One match card of the overlay's brackets and boards (single and double
  // elimination trees, Swiss / group boards), so every format looks alike:
  // flag and name per row with a VS line between them, names bold white
  // and scores in cyan boxes, the loser (or a player already out) dimmed;
  // scores once the match is live or played, W / FF for walkovers; amber
  // border while live. `size`: sm (stage boards), md (trees), lg (8-player single
  // elimination, where the cards are big). The parent sets the box size.
  import Flag from "#lib/components/Flag.svelte";

  let { match: m, tournament, who, isAlive = null, size = "md", bye = false, class: extra = "", style = "" } = $props();

  const SIZES = {
    sm: { box: "rounded-lg px-3 py-0.5", row: "text-sm gap-2", name: "gap-1.5", flag: 18, score: "text-xs px-1.5 min-w-[1.5rem]", vs: "text-[7px]" },
    md: { box: "rounded-xl px-3.5 py-1", row: "text-base leading-tight gap-2", name: "gap-2", flag: 22, score: "text-sm px-2 py-0.5 min-w-[1.9rem]", vs: "text-[8px]" },
    lg: { box: "rounded-xl px-5 py-3", row: "text-3xl leading-tight gap-3", name: "gap-3", flag: 36, score: "text-2xl px-3 py-1 min-w-[3.5rem]", vs: "text-[9px]" },
  };
  let s = $derived(SIZES[size] || SIZES.md);
  let done = $derived(m.status === "completed" || m.status === "walkover");
  let live = $derived(m.id === tournament?.active_match_id);
</script>

<div
  class="border-2 flex flex-col justify-center shadow-xl {s.box}
    {bye ? 'opacity-35 border-slate-800 bg-slate-950/50' : live ? 'border-amber-500 bg-amber-950/40' : done ? 'border-slate-800 bg-slate-950/80' : 'border-slate-700/60 bg-slate-900/80'}
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
        <div class="h-[2px] flex-1 rounded-full bg-slate-600/70"></div>
        <span class="{s.vs} font-black tracking-[0.2em] text-slate-500 font-orbitron">VS</span>
        <div class="h-[2px] flex-1 rounded-full bg-slate-600/70"></div>
      </div>
    {/if}
    <div class="flex-1 min-h-0 flex items-center justify-between {s.row}">
      <span class="flex min-w-0 items-center {s.name}">
        {#if pid}<span class="shrink-0 flex {dim ? 'opacity-50' : ''}"><Flag code={who.flag(pid)} size={s.flag} /></span>{/if}
        <span
          class="truncate
            {!pid ? 'text-slate-600 italic font-bold' : dim ? 'text-slate-500 font-normal opacity-50' : 'text-slate-100 font-black'}"
        >{pid ? who.name(pid) : bye ? "—" : "TBD"}</span>
      </span>
      {#if !bye && (m.status === "walkover" || done || live || m.live_score1 != null)}
        <span
          class="font-orbitron rounded bg-slate-900/90 shrink-0 text-center {s.score}
            {dim ? 'text-slate-600 font-normal opacity-40' : 'text-cyan-400 font-black'}"
        >
          {m.status === "walkover" ? (m.winner_id === pid ? "W" : "FF") : (score ?? 0)}
        </span>
      {/if}
    </div>
  {/each}
</div>
