<script>
  // Top of the player page: a "player card" with the flag, team and name,
  // contacts, the ladder league icon and MMR with a sparkline of the last 30
  // games, the last 5 results (W / L) and the vehicles played most in Ban /
  // Pick (GET /banpick/stats?player=). Maths in #lib/player-profile.js.
  import { API } from "#lib/api.js";
  import { formatWinRate, tierBadgeClass } from "#lib/ladder.js";
  import { leagueIcon } from "#lib/sc2-icons.js";
  import { wikiUrl } from "#lib/players.js";
  import { mmrSparkline, recentForm } from "#lib/player-profile.js";
  import Flag from "#lib/components/Flag.svelte";
  import ContactBadges from "./ContactBadges.svelte";

  let { profile, ladder = null, name } = $props();

  let form = $derived(recentForm(ladder?.history || [], 5));
  let spark = $derived(mmrSparkline(ladder?.history || [], { n: 30, width: 168, height: 44 }));
  let bp = $state(null);
  $effect(() => {
    const id = profile?.id;
    bp = null;
    if (!id) return;
    API.getBanpickStats({ player: id })
      .then((d) => (bp = d?.player || null))
      .catch(() => {});
  });
  const pct = (v) => `${Math.round((v || 0) * 100)}%`;
</script>

<section class="relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
  <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/15 via-transparent to-secondary/10"></div>
  <div class="relative grid gap-5 p-5 sm:p-6 md:grid-cols-[1fr_auto]">
    <!-- Who -->
    <div class="flex min-w-0 items-start gap-4">
      <div class="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-background/70 shadow-inner">
        <Flag code={profile.flag} size={44} />
      </div>
      <div class="min-w-0 space-y-2">
        <h1 class="flex min-w-0 items-baseline gap-2 text-2xl font-black tracking-tight sm:text-3xl">
          {#if profile.team}<span class="shrink-0 num text-base text-muted-foreground">[{profile.team}]</span>{/if}
          <span class="truncate">{name}</span>
        </h1>
        <div class="flex flex-wrap items-center gap-1.5">
          <ContactBadges tags={profile.battle_tags} compact empty="未填写联系方式" />
          {#if profile.link}
            <a href={wikiUrl(profile.link)} target="_blank" rel="noopener" class="text-small text-brand-ink hover:underline">Liquipedia</a>
          {/if}
        </div>
        {#if form.length}
          <div class="flex flex-wrap items-center gap-1 pt-1">
            <span class="mr-1 text-label font-bold uppercase tracking-wider text-muted-foreground">近 {form.length} 场</span>
            {#each form as g (g.id)}
              <span
                title="{g.won ? '胜' : '负'} {g.score} · {g.opponent}{g.event ? ` · ${g.event}` : ''}"
                class="flex h-6 w-6 items-center justify-center rounded-md text-small font-black text-white {g.won ? 'bg-emerald-500' : 'bg-rose-500'}"
              >
                {g.won ? "W" : "L"}
              </span>
            {/each}
          </div>
        {/if}
        {#if bp?.vehicles?.length}
          <div class="flex flex-wrap items-center gap-1 pt-0.5 text-small">
            <span class="mr-1 text-label font-bold uppercase tracking-wider text-muted-foreground">常用载具</span>
            {#each bp.vehicles.slice(0, 3) as v (v.name)}
              <span class="rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-semibold text-amber-700 dark:text-amber-300" title={v.decided ? `${v.played} 场 · ${v.wins} 胜` : `${v.played} 场`}>
                {v.name} <span class="font-normal opacity-70">×{v.played}</span>
              </span>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <!-- Ladder -->
    {#if ladder}
      <div class="flex items-center gap-4 rounded-xl border border-border/70 bg-background/50 p-3 md:self-center">
        <div class="flex flex-col items-center gap-1">
          {#if leagueIcon(ladder.tier?.group)}
            <img src={leagueIcon(ladder.tier?.group)} alt="" class="h-11 w-11 object-contain drop-shadow" />
          {/if}
          <span class="rounded border px-1.5 py-0.5 text-small font-bold {tierBadgeClass(ladder.tier?.group)}">{ladder.tier?.name || "未定级"}</span>
        </div>
        <div class="space-y-1">
          <div class="text-label font-bold uppercase tracking-wider text-muted-foreground">综合天梯</div>
          <div class="num text-3xl font-black leading-none tabular-nums">{ladder.mmr}</div>
          <div class="text-small text-muted-foreground">{ladder.games} 场 · 胜率 {formatWinRate(ladder.win_rate)}</div>
          {#if spark}
            <svg viewBox="0 0 168 44" class="h-11 w-[168px]" aria-label="最近 30 场 MMR 走势 {spark.min}–{spark.max}">
              <polyline points={spark.points} fill="none" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" class={spark.up ? "stroke-emerald-500" : "stroke-rose-500"} />
            </svg>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</section>
