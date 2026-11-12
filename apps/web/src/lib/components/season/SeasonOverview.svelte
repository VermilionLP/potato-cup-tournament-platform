<script>
  // 赛季总览 (/season, /season/:season): one season at a glance (GET
  // /season-summary, apps/api/lib/season-summary.js): its numbers, how far
  // the Top 20 is, each points board's top 3, the season's leaders and
  // every champion, newest first. `season` "" = the current season.
  import { goto } from "$app/navigation";
  import { toast } from "svelte-sonner";
  import { API } from "#lib/api.js";
  import { TAG_BASE, TAG_TONE } from "#lib/tags.js";
  import { POOL_TAG, TIER_TAG, tierTagText, vehiclePoolLabel } from "#lib/tournament.js";
  import PageHeader from "#lib/components/PageHeader.svelte";
  import PageSkeleton from "#lib/components/PageSkeleton.svelte";
  import Flag from "#lib/components/Flag.svelte";
  import LeaderBoard from "#lib/components/stats/LeaderBoard.svelte";
  import { EmptyState } from "#lib/components/ui/empty-state/index.js";
  import { FilterBar, FilterGroup } from "#lib/components/ui/filter-group/index.js";
  import CalendarRangeIcon from "@lucide/svelte/icons/calendar-range";
  import CrownIcon from "@lucide/svelte/icons/crown";
  import AwardIcon from "@lucide/svelte/icons/award";
  import TrophyIcon from "@lucide/svelte/icons/trophy";
  import SwordsIcon from "@lucide/svelte/icons/swords";
  import TrendingUpIcon from "@lucide/svelte/icons/trending-up";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";

  let { season = "" } = $props();

  let data = $state(null);
  let loading = $state(true);
  $effect(() => {
    const s = season;
    loading = true;
    API.getSeasonSummary(s)
      .then((d) => {
        if (s === season) data = d;
      })
      .catch((e) => toast.error("加载赛季总览失败: " + e.message))
      .finally(() => (loading = false));
  });

  const MEDAL = ["", "bg-amber-400 text-amber-950", "bg-slate-300 text-slate-900", "bg-orange-400/80 text-orange-950"];
  const day = (d) => (d ? String(d).slice(5, 10).replace("-", "/") : "");
  let championCount = $derived(new Set((data?.champions || []).map((c) => c.winner.id)).size);
  let tiles = $derived(
    data
      ? [
          ["赛事", data.events],
          ["参赛选手", data.players],
          ["比赛场次", data.matches],
          ["不同的冠军", championCount],
        ]
      : [],
  );
  let topText = $derived.by(() => {
    const t = data?.top;
    if (!t) return "还没有公布";
    if (t.done) return "全部揭晓";
    if (!t.started) return "即将开始揭晓";
    return `已揭晓 ${t.revealed} / ${t.size} 名`;
  });
</script>

{#snippet heading(Icon, tone, title, hint, href = "", link = "")}
  <div class="flex flex-wrap items-end justify-between gap-2">
    <div>
      <h2 class="flex items-center gap-1.5 text-heading font-bold"><Icon class="h-4 w-4 {tone}" />{title}</h2>
      {#if hint}<p class="text-small text-muted-foreground">{hint}</p>{/if}
    </div>
    {#if href}<a {href} class="inline-flex items-center gap-0.5 text-small font-semibold text-muted-foreground hover:text-brand-ink">{link}<ChevronRightIcon class="h-3.5 w-3.5" /></a>{/if}
  </div>
{/snippet}

<div class="space-y-6">
  <div class="space-y-3">
    <PageHeader title={data ? `${data.season} 赛季` : "赛季总览"} icon={CalendarRangeIcon} description="这个赛季的冠军、积分榜、年度 Top20 和赛季之最" />
    {#if data?.seasons?.length > 1}
      <FilterBar>
        <FilterGroup label="赛季" value={data.season} onpick={(s) => goto(`/season/${encodeURIComponent(s)}`)} options={data.seasons.map((s) => ({ id: s, label: `${s} 赛季` }))} />
      </FilterBar>
    {/if}
  </div>

  {#if loading && !data}
    <PageSkeleton kind="stats" label="正在整理赛季数据..." />
  {:else if data}
    {#if !data.events}
      <EmptyState title="{data.season} 赛季还没有结束的赛事" />
    {:else}
      <!-- Numbers -->
      <dl class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {#each tiles as [label, value] (label)}
          <div class="rounded-xl border border-border bg-card p-4 shadow-sm">
            <dt class="text-small text-muted-foreground">{label}</dt>
            <dd class="num text-2xl font-black">{value}</dd>
          </div>
        {/each}
      </dl>

      <div class="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <!-- Top 20 -->
        <a href="/top?season={encodeURIComponent(data.season)}" class="group rounded-xl border border-amber-400/40 bg-amber-400/5 p-4 shadow-sm hover:border-amber-400/70">
          <div class="flex items-center gap-1.5 text-sm font-bold"><CrownIcon class="h-4 w-4 text-amber-500" />年度 Top20<ChevronRightIcon class="ml-auto h-4 w-4 text-muted-foreground group-hover:text-brand-ink" /></div>
          <p class="mt-2 text-lg font-black">{topText}</p>
          {#if data.top?.first}
            <p class="mt-1 flex items-center gap-1.5 text-sm"><span class="text-muted-foreground">年度第 1 名</span><Flag code={data.top.first.flag} size={14} /><span class="font-bold" data-no-i18n>{data.top.first.name}</span></p>
          {:else if data.top?.next}
            <p class="mt-1 text-small text-muted-foreground">下一位：第 {data.top.next.rank} 名</p>
          {:else if !data.top}
            <p class="mt-1 text-small text-muted-foreground">赛季结束后，从第 20 名开始每天揭晓一位。</p>
          {/if}
        </a>

        <!-- Points boards -->
        <div class="rounded-xl border border-border bg-card p-4 shadow-sm lg:col-span-2">
          <a href="/points?season={encodeURIComponent(data.season)}" class="group flex items-center gap-1.5 text-sm font-bold"><AwardIcon class="h-4 w-4 text-brand-ink" />年度积分榜前三<ChevronRightIcon class="ml-auto h-4 w-4 text-muted-foreground group-hover:text-brand-ink" /></a>
          {#if data.boards.length}
            <div class="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {#each data.boards as b (b.pool)}
                <div>
                  <span class="{TAG_BASE} {POOL_TAG[b.pool] || TAG_TONE.neutral}">{vehiclePoolLabel(b.pool) || b.pool || "全部"}</span>
                  <ol class="mt-1.5 space-y-1">
                    {#each b.top as p (p.id)}
                      <li>
                        <a href="/player/{encodeURIComponent(p.id)}" class="flex items-center gap-2 rounded-md px-1 py-0.5 text-sm hover:bg-muted/50">
                          <span class="num flex h-5 w-5 items-center justify-center rounded-full text-small font-black {MEDAL[p.rank] || 'bg-muted'}">{p.rank}</span>
                          <Flag code={p.flag} size={13} />
                          <span class="min-w-0 flex-1 truncate font-semibold" data-no-i18n>{p.name}</span>
                          <span class="num text-xs font-bold">{p.total} 分</span>
                        </a>
                      </li>
                    {/each}
                  </ol>
                </div>
              {/each}
            </div>
          {:else}
            <p class="mt-2 text-small text-muted-foreground">这个赛季的赛事还没有设置积分。</p>
          {/if}
        </div>
      </div>

      <!-- Season leaders -->
      <section class="space-y-3">
        {@render heading(TrendingUpIcon, "text-violet-600 dark:text-violet-400", "赛季之最", "这个赛季的冠军数、胜场和胜率（至少 10 场）")}
        <div class="grid grid-cols-1 items-start gap-4 md:grid-cols-3">
          <LeaderBoard title="冠军最多" icon={TrophyIcon} tone="text-amber-500" rows={data.leaders.titles.map((r) => ({ ...r, unit: "次" }))} empty="暂无冠军" />
          <LeaderBoard title="胜场最多" icon={SwordsIcon} tone="text-blue-600 dark:text-blue-400" rows={data.leaders.wins.map((r) => ({ ...r, unit: "胜", note: `${r.matches} 场` }))} empty="暂无比赛" />
          <LeaderBoard title="胜率最高" icon={TrendingUpIcon} tone="text-emerald-600 dark:text-emerald-400" rows={data.leaders.winRate.map((r) => ({ ...r, value: `${Math.round(r.value * 100)}%`, note: `${r.wins} / ${r.matches}` }))} empty="还没有选手打满 10 场" />
        </div>
      </section>

      <!-- Champions -->
      <section class="space-y-3">
        {@render heading(TrophyIcon, "text-amber-500", "本赛季冠军", "每场结束赛事的冠军和亚军，最新的在最上面（预选赛不算）", "/hall", "名人堂")}
        <ol class="divide-y divide-border/60 rounded-xl border border-border bg-card shadow-sm">
          {#each data.champions as c (c.event.id)}
            <li class="flex flex-col gap-1.5 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-3">
              <div class="flex min-w-0 flex-1 items-center gap-2">
                <span class="num w-11 shrink-0 text-small text-muted-foreground">{day(c.event.date)}</span>
                {#if tierTagText({ tier: c.event.tier, event_kind: c.event.kind })}
                  <span class="{TAG_BASE} {TIER_TAG[c.event.tier] || TAG_TONE.neutral} shrink-0">{tierTagText({ tier: c.event.tier, event_kind: c.event.kind })}</span>
                {/if}
                <a href="/tournament/{encodeURIComponent(c.event.id)}" class="min-w-0 truncate text-sm font-bold hover:text-brand-ink" data-no-i18n>{c.event.name}</a>
              </div>
              <div class="flex items-center gap-3 pl-13 text-sm sm:pl-0">
                <a href="/player/{encodeURIComponent(c.winner.id)}" class="inline-flex items-center gap-1 font-black hover:text-brand-ink">
                  <TrophyIcon class="h-3.5 w-3.5 text-amber-500" /><Flag code={c.winner.flag} size={13} /><span data-no-i18n>{c.winner.name}</span>
                </a>
                {#if c.runner_up}
                  <a href="/player/{encodeURIComponent(c.runner_up.id)}" class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-brand-ink">
                    <Flag code={c.runner_up.flag} size={12} /><span data-no-i18n>{c.runner_up.name}</span>
                  </a>
                {/if}
              </div>
            </li>
          {:else}
            <li class="px-4 py-6 text-center text-small text-muted-foreground">暂无冠军</li>
          {/each}
        </ol>
      </section>
    {/if}
  {/if}
</div>
