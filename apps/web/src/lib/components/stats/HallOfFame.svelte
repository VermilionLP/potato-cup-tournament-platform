<script>
  // 名人堂 tab of the statistics page: records the player boards next to it
  // don't have (podiums, the longest winning run, the highest MMR), each
  // season's points leaders and every finished event's podium on a
  // timeline, newest first (GET /hall-of-fame, the points seasons).
  // Qualifiers are on the timeline but give no titles.
  import { Chip } from "#lib/components/ui/chip/index.js";
  import { EmptyState } from "#lib/components/ui/empty-state/index.js";
  import { TAG_BASE, TAG_TONE } from "#lib/tags.js";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import { API } from "#lib/api.js";
  import { POOL_TAG, TIER_TAG, VEHICLE_POOLS, tierTagText, vehiclePoolLabel } from "#lib/tournament.js";
  import PageSkeleton from "#lib/components/PageSkeleton.svelte";
  import Flag from "#lib/components/Flag.svelte";
  import LeaderBoard from "./LeaderBoard.svelte";
  import TrophyIcon from "@lucide/svelte/icons/trophy";
  import MedalIcon from "@lucide/svelte/icons/medal";
  import FlameIcon from "@lucide/svelte/icons/flame";
  import TrendingUpIcon from "@lucide/svelte/icons/trending-up";
  import AwardIcon from "@lucide/svelte/icons/award";
  import CrownIcon from "@lucide/svelte/icons/crown";

  let data = $state(null);
  let loading = $state(true);
  let pool = $state("");
  let seasonLeaders = $state([]);

  onMount(async () => {
    try {
      data = await API.getHallOfFame();
    } catch (e) {
      toast.error("加载名人堂失败: " + e.message);
    }
    loading = false;
    // Points leaders per season (a few small requests, after the page shows).
    try {
      const list = (await API.getPointsSeasons())?.seasons || [];
      const seasons = list.map((s) => (typeof s === "string" ? s : s?.season)).filter(Boolean);
      const boards = await Promise.all(seasons.map((s) => API.getPointsLeaderboard(s).catch(() => null)));
      seasonLeaders = seasons
        .map((season, i) => ({
          season,
          leaders: (boards[i]?.boards || []).map((b) => ({ pool: b.pool, top: b.players?.[0] })).filter((b) => b.top),
        }))
        .filter((s) => s.leaders.length);
    } catch {
      seasonLeaders = [];
    }
  });

  // Titles, events played and wins are on the player boards already.
  const BOARDS = [
    { key: "podiums", title: "登上领奖台", icon: MedalIcon, tone: "text-orange-600 dark:text-orange-400", unit: "次" },
    { key: "streak", title: "最长连胜", icon: FlameIcon, tone: "text-rose-600 dark:text-rose-400", unit: "连胜" },
    { key: "peak", title: "历史最高 MMR", icon: TrendingUpIcon, tone: "text-violet-600 dark:text-violet-400", unit: "" },
  ];
  const MEDAL = ["", "bg-amber-400 text-amber-950", "bg-slate-300 text-slate-900", "bg-orange-400/80 text-orange-950"];

  let events = $derived((data?.events || []).filter((e) => !pool || e.pool === pool));
  let pools = $derived(VEHICLE_POOLS.filter((p) => (data?.events || []).some((e) => e.pool === p.id)));
  // Timeline grouped by year.
  let years = $derived.by(() => {
    const out = [];
    for (const e of events) {
      const y = String(e.date || "").slice(0, 4) || "—";
      if (out.at(-1)?.year !== y) out.push({ year: y, events: [] });
      out.at(-1).events.push(e);
    }
    return out;
  });
  const day = (d) => (d ? String(d).slice(5, 10).replace("-", "/") : "");
  const placeText = (p) => (p.to > p.place ? `${p.place}-${p.to}` : `${p.place}`);
</script>

{#snippet heading(Icon, tone, title, hint)}
  <div>
    <h2 class="flex items-center gap-1.5 text-heading font-bold"><Icon class="h-4 w-4 {tone}" />{title}</h2>
    <p class="text-small text-muted-foreground">{hint}</p>
  </div>
{/snippet}

<div class="space-y-8">
  {#if loading}
    <PageSkeleton kind="stats" label="正在整理历届冠军..." />
  {:else if data}
    <!-- All-time records -->
    <section class="space-y-3">
      {@render heading(AwardIcon, "text-brand-ink", "历史纪录", "登上领奖台、最长连胜和历史最高 MMR")}
      <div class="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
        {#each BOARDS as b (b.key)}
          <LeaderBoard
            title={b.title}
            icon={b.icon}
            tone={b.tone}
            rows={(data.records[b.key] || []).map((r) => ({ id: r.id, name: r.name, flag: r.flag, value: r.value, unit: b.unit }))}
          />
        {/each}
      </div>
    </section>

    <!-- Season points leaders -->
    {#if seasonLeaders.length}
      <section class="space-y-3">
        {@render heading(CrownIcon, "text-amber-500", "赛季积分王", "每个赛季各类型积分榜的第一名")}
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {#each seasonLeaders as s (s.season)}
            <div class="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div class="mb-2 text-sm font-bold">{s.season} 赛季</div>
              {#each s.leaders as l (l.pool)}
                <a href="/player/{encodeURIComponent(l.top.id)}" class="flex items-center gap-2 rounded-md px-1 py-1.5 text-sm hover:bg-muted/50">
                  <span class="{TAG_BASE} {POOL_TAG[l.pool] || TAG_TONE.neutral} w-20 justify-center truncate">{vehiclePoolLabel(l.pool) || l.pool}</span>
                  <Flag code={l.top.flag} size={14} />
                  <span class="min-w-0 flex-1 truncate font-semibold">{l.top.display_name || l.top.id}</span>
                  <span class="num font-bold">{l.top.total} 分</span>
                </a>
              {/each}
            </div>
          {/each}
        </div>
      </section>
    {/if}

    <!-- Timeline -->
    <section class="space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        {@render heading(TrophyIcon, "text-amber-500", "历届赛事", "每场结束赛事的领奖台，最新的在最上面")}
        {#if pools.length > 1}
          <div class="flex flex-wrap gap-1">
            {#each [{ id: "", name: "全部" }, ...pools] as p (p.id)}
              <Chip selected={pool === p.id} onclick={() => (pool = p.id)}>{p.name}</Chip>
            {/each}
          </div>
        {/if}
      </div>
      {#each years as y (y.year)}
        <div class="relative pl-6">
          <div class="absolute bottom-0 left-2 top-6 w-px bg-border"></div>
          <div class="-ml-6 mb-2 flex items-center gap-2">
            <span class="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-small font-black text-primary-foreground">★</span>
            <span class="text-lg font-black tracking-tight">{y.year}</span>
          </div>
          <ol class="space-y-2">
            {#each y.events as e (e.id)}
              <li class="relative">
                <span class="absolute -left-[18px] top-4 h-2 w-2 rounded-full {e.qualifier ? 'bg-muted-foreground/40' : 'bg-amber-500'}"></span>
                <div class="flex flex-col gap-2 rounded-xl border border-border bg-card/60 p-3 sm:flex-row sm:items-center">
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-1.5 text-small">
                      <span class="num text-muted-foreground">{day(e.date)}</span>
                      {#if tierTagText({ tier: e.tier, event_kind: e.kind })}
                        <span class="{TAG_BASE} {TIER_TAG[e.tier] || TAG_TONE.neutral}">{tierTagText({ tier: e.tier, event_kind: e.kind })}</span>
                      {/if}
                      {#if e.pool}<span class="{TAG_BASE} {POOL_TAG[e.pool] || TAG_TONE.neutral}">{vehiclePoolLabel(e.pool) || e.pool}</span>{/if}
                      <span class="text-muted-foreground">{e.players} 人</span>
                    </div>
                    <a href="/tournament/{encodeURIComponent(e.id)}" class="mt-0.5 block truncate text-sm font-bold hover:text-brand-ink">{e.name}</a>
                  </div>
                  <div class="flex flex-wrap gap-1.5">
                    {#each e.podium.slice(0, 4) as p (p.id)}
                      <a href="/player/{encodeURIComponent(p.id)}" class="inline-flex items-center gap-1 rounded-full border border-border bg-background/70 py-0.5 pl-0.5 pr-2 text-xs hover:border-primary/50">
                        <span class="flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-small font-black {MEDAL[p.place] || 'bg-muted'}">{placeText(p)}</span>
                        <Flag code={p.flag} size={12} />
                        <span class="max-w-28 truncate {p.place === 1 ? 'font-black' : 'font-semibold'}">{p.name}</span>
                      </a>
                    {/each}
                  </div>
                </div>
              </li>
            {/each}
          </ol>
        </div>
      {:else}
        <EmptyState compact title="还没有结束的赛事" />
      {/each}
    </section>
  {/if}
</div>
