<script>
  // Overlay "intro" scene (opening matchups): the matches of one stage, eight
  // per page (2 × 4; pages turn every 10 s on big fields). Each card: both
  // players with flag, seed, MMR and league, the ladder win chance as a
  // gold / purple bar, and how much MMR each side would win or lose
  // (#lib/ladder-sim.js, the server's Elo rule). The closest unplayed match
  // is marked FEATURED.
  import { fade } from "svelte/transition";
  import { simulateMatch } from "#lib/ladder-sim.js";
  import { eventTagsEnglish, startClock } from "#lib/overlay.js";
  import Flag from "#lib/components/Flag.svelte";
  import OverlayTopBar from "./OverlayTopBar.svelte";
  import LeagueBadge from "./LeagueBadge.svelte";

  let { tournament, stage = null, stages = [], matchOrder, who } = $props();

  let matches = $derived(stage?.matches || []);
  let page = $state(0);
  let pageCount = $derived(Math.max(1, Math.ceil(matches.length / 8)));
  let visible = $derived(matches.slice(page * 8, page * 8 + 8));
  $effect(() => {
    if (page >= pageCount) page = 0;
  });
  $effect(() => {
    if (pageCount <= 1) return;
    const timer = setInterval(() => (page = (page + 1) % pageCount), 10000);
    return () => clearInterval(timer);
  });

  const decided = (m) => m.status === "completed" || m.status === "walkover";
  // Win chance and MMR at stake, for matches with both players.
  const sim = (m) => (m.player1_id && m.player2_id ? simulateMatch(who.get(m.player1_id), who.get(m.player2_id), { eventKind: tournament?.event_kind }) : null);
  let sims = $derived(new Map(matches.map((m) => [m.id, sim(m)])));
  let featured = $derived.by(() => {
    let best = null;
    for (const m of matches) {
      const s = sims.get(m.id);
      if (!s || decided(m)) continue;
      if (!best || Math.abs(s.winChanceA - 0.5) < Math.abs(sims.get(best).winChanceA - 0.5)) best = m.id;
    }
    return best;
  });

  // Top bar: this stage, then the next two.
  let steps = $derived.by(() => {
    const i = stages.findIndex((s) => s.key === stage?.key);
    const next = i >= 0 ? stages.slice(i + 1, i + 3) : [];
    return [{ label: "OPENING", state: "active" }, ...(stage ? [{ label: stage.tag, state: "idle" }] : []), ...next.map((s) => ({ label: s.tag, state: "todo" }))];
  });
  let tags = $derived(eventTagsEnglish(tournament));
  let clock = $derived(startClock(tournament?.scheduled_time));
  const pct = (x) => Math.round(x * 100);
  const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "±0");
</script>

{#snippet player(m, pid, slot)}
  {@const p = who.get(pid)}
  {@const lost = decided(m) && m.winner_id && pid && m.winner_id !== pid}
  <div class="flex min-w-0 flex-1 items-center gap-3 {slot === 2 ? 'flex-row-reverse text-right' : ''} {lost ? 'opacity-45' : ''}">
    {#if pid}<span class="shrink-0"><Flag code={who.flag(pid)} size={32} /></span>{/if}
    <div class="flex min-w-0 flex-col {slot === 2 ? 'items-end' : ''}">
      <span class="truncate text-[28px] font-extrabold leading-tight {pid ? '' : 'italic text-[#7184A3]'}">{pid ? who.name(pid) : "TBD"}</span>
      {#if pid}
        <span class="flex items-center gap-1.5 whitespace-nowrap font-num text-base font-bold text-[#AFC0D8] {slot === 2 ? 'flex-row-reverse' : ''}">
          {#if who.seed(pid)}<span>#{who.seed(pid)}</span><span class="text-white/25">·</span>{/if}
          <span>{p?.ladder_mmr ?? "—"}</span>
          <LeagueBadge tier={p?.ladder_tier} size={18} />
        </span>
      {/if}
    </div>
  </div>
{/snippet}

<div class="absolute inset-0 z-10" transition:fade={{ duration: 400 }}>
  <OverlayTopBar {tournament} {steps}>
    {#snippet right()}
      {#if clock}
        <span class="font-num text-base font-bold tracking-[0.16em] text-[#AFC0D8]">STARTS</span>
        <span class="font-display text-[40px] font-extrabold leading-none">{clock}</span>
      {/if}
    {/snippet}
  </OverlayTopBar>

  <!-- Title row -->
  <div class="absolute left-16 right-16 top-36 flex items-end gap-6">
    <div class="flex min-w-0 flex-col gap-2">
      <span class="font-num text-base font-bold tracking-[0.16em] text-cyan-200">TODAY'S BRACKET{tags.length ? ` · ${tags.join(" · ")}` : ""}</span>
      <span class="truncate font-display text-[96px] font-extrabold uppercase leading-[0.9]">{stage?.en || "Bracket"}</span>
    </div>
    <span class="flex-1"></span>
    {#each [["PLAYERS", tournament?.players?.length || 0], ["MATCHES", matches.length], ...(pageCount > 1 ? [["PAGE", `${page + 1} / ${pageCount}`]] : [])] as [label, value] (label)}
      <div class="flex shrink-0 flex-col gap-1 rounded-xl bg-[rgba(24,40,70,0.92)] px-6 py-4">
        <span class="font-num text-base font-bold tracking-[0.16em] text-[#AFC0D8]">{label}</span>
        <span class="font-display text-[44px] font-extrabold leading-none">{value}</span>
      </div>
    {/each}
  </div>

  <!-- Matches: 2 × 4 -->
  {#if matches.length === 0}
    <div class="absolute inset-x-16 bottom-16 top-[328px] flex items-center justify-center">
      <p class="rounded-2xl bg-[rgba(24,40,70,0.92)] px-10 py-6 text-2xl text-[#AFC0D8]">No matches in this stage yet.</p>
    </div>
  {:else}
    {#key page}
      <div class="absolute inset-x-16 bottom-16 top-[328px] grid grid-cols-2 grid-rows-4 gap-x-8 gap-y-4" in:fade={{ duration: 400 }}>
        {#each visible as m (m.id)}
          {@const s = sims.get(m.id)}
          {@const hot = m.id === featured}
          {@const live = m.id === tournament?.active_match_id}
          <div class="flex overflow-hidden rounded-xl bg-[rgba(24,40,70,0.92)] {hot || live ? 'border-2 border-cyan-400' : 'border border-white/[0.06]'}">
            <div class="flex w-[72px] shrink-0 items-center justify-center border-r border-white/[0.08] bg-white/[0.04] font-display text-[40px] font-extrabold text-[#AFC0D8]">{matchOrder.get(m.id) ?? ""}</div>
            <div class="flex min-w-0 flex-1 flex-col justify-center gap-2.5 px-6">
              <div class="flex items-center gap-4">
                {@render player(m, m.player1_id, 1)}
                {#if decided(m)}
                  <span class="shrink-0 font-display text-[30px] font-extrabold text-cyan-400">{m.status === "walkover" ? "W/O" : `${m.score1} : ${m.score2}`}</span>
                {:else}
                  <span class="shrink-0 font-display text-[28px] font-extrabold italic text-[#7184A3]">VS</span>
                {/if}
                {@render player(m, m.player2_id, 2)}
              </div>
              {#if s}
                <div class="flex items-center gap-3">
                  <span class="w-12 font-num text-base font-bold text-side-a">{pct(s.winChanceA)}%</span>
                  <div class="flex h-2 flex-1 overflow-hidden rounded-full bg-side-b"><div class="h-full bg-side-a" style="width: {pct(s.winChanceA)}%"></div></div>
                  <span class="w-12 text-right font-num text-base font-bold text-side-b">{100 - pct(s.winChanceA)}%</span>
                  {#if live}
                    <span class="inline-flex items-center gap-1.5 rounded-full bg-red-500 px-2.5 py-0.5 text-base font-extrabold text-white"><span class="h-1.5 w-1.5 animate-pulse rounded-full bg-white"></span>LIVE</span>
                  {:else if hot}
                    <span class="rounded-full bg-cyan-400 px-2.5 py-0.5 text-base font-extrabold text-[#03252E]">FEATURED</span>
                  {/if}
                </div>
                {#if !decided(m)}
                <div class="flex items-center justify-between whitespace-nowrap font-num text-base font-bold leading-none tabular-nums">
                  <span class="flex items-baseline gap-2"><span class="tracking-[0.12em] text-[#7184A3]">WIN</span><span class="min-w-9 text-green-500">{signed(s.ifAWins.a.delta)}</span><span class="tracking-[0.12em] text-[#7184A3]">LOSS</span><span class="text-rose-500">{signed(s.ifBWins.a.delta)}</span></span>
                  <span class="tracking-[0.16em] text-[#7184A3]">MMR</span>
                  <span class="flex items-baseline gap-2"><span class="text-rose-500">{signed(s.ifAWins.b.delta)}</span><span class="tracking-[0.12em] text-[#7184A3]">LOSS</span><span class="min-w-9 text-right text-green-500">{signed(s.ifBWins.b.delta)}</span><span class="tracking-[0.12em] text-[#7184A3]">WIN</span></span>
                </div>
                {/if}
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/key}
  {/if}
</div>
