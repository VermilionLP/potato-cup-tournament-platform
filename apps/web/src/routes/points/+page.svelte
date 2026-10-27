<script>
  // Potato Cup points leaderboard (积分榜): per season (year) and event type,
  // the points players earned in finished events with a points table.
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import { page } from "$app/stores";
  import { replaceState } from "$app/navigation";
  import { API } from "$lib/api.js";
  import { userState } from "$lib/user.svelte.js";
  import { VEHICLE_POOLS, vehiclePoolLabel } from "$lib/tournament.js";
  import Flag from "$lib/components/Flag.svelte";
  import { Input } from "$lib/components/ui/input/index.js";
  import AwardIcon from "@lucide/svelte/icons/award";
  import SearchIcon from "@lucide/svelte/icons/search";

  let data = $state(null);
  let loading = $state(true);
  let pool = $state("");
  let query = $state("");

  let board = $derived(data?.boards?.find((b) => b.pool === pool) || data?.boards?.[0] || null);
  let shownPlayers = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const players = board?.players || [];
    if (!q) return players;
    return players.filter((p) => p.id.toLowerCase().includes(q) || (p.team || "").toLowerCase().includes(q));
  });

  // "Weekly #36" from "Potato Cup Weekly #36", "2026 June Cup - Europe" etc.
  const shortName = (name) => String(name || "").replace(/^(FamilyX\s+)?Potato Cup\s+/i, "");

  function syncUrl() {
    const url = new URL($page.url);
    for (const [key, value] of [["season", data?.season || ""], ["pool", board?.pool || ""]]) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    replaceState(url, {});
  }

  async function load(season) {
    loading = true;
    try {
      data = await API.getPointsLeaderboard(season);
      if (!data.boards.some((b) => b.pool === pool)) pool = data.boards[0]?.pool || "";
    } catch (e) {
      toast.error("加载积分榜失败: " + e.message);
    } finally {
      loading = false;
    }
  }

  onMount(async () => {
    const params = $page.url.searchParams;
    pool = params.get("pool") || "";
    await load(params.get("season") || "");
  });

  async function pickSeason(season) {
    if (season === data?.season) return;
    await load(season);
    syncUrl();
  }

  function pickPool(id) {
    pool = id;
    syncUrl();
  }
</script>

<div class="space-y-5">
  <div class="space-y-1">
    <h1 class="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
      <AwardIcon class="h-6 w-6 text-primary" />
      土豆杯积分榜
    </h1>
    <p class="text-xs text-muted-foreground">
      计入积分榜的周赛和月赛按最终名次给分，每个赛季按比赛类型分别排名。冬季总决赛每个类型 16 人：4 场月赛的冠军直接晋级（冠军已有资格时顺延给亚军），其余 12 个名额按积分排名。积分在赛事设置中定义，赛事结束后计入。
    </p>
  </div>

  {#if loading && !data}
    <p class="py-16 text-center text-xs text-muted-foreground">加载中...</p>
  {:else if !data?.seasons?.length}
    <div class="rounded-xl border border-border bg-card/40 py-16 text-center text-sm text-muted-foreground">
      还没有计入积分榜的赛事。创建赛事时在「年度积分榜」里设置积分即可。
    </div>
  {:else}
    <div class="flex flex-wrap items-center gap-3">
      <div class="inline-flex rounded-lg border border-border bg-muted/30 p-0.5 text-[11px]" role="group" aria-label="赛季">
        {#each data.seasons as season (season)}
          <button
            type="button"
            class="px-2.5 py-1 rounded-md transition-colors cursor-pointer {data.season === season
              ? 'bg-background text-foreground shadow-sm font-semibold'
              : 'text-muted-foreground hover:text-foreground'}"
            aria-pressed={data.season === season}
            onclick={() => pickSeason(season)}
          >
            {season} 赛季
          </button>
        {/each}
      </div>
      {#if data.boards.length}
        <div class="inline-flex flex-wrap rounded-lg border border-border bg-muted/30 p-0.5 text-[11px]" role="group" aria-label="比赛类型">
          {#each VEHICLE_POOLS.filter((p) => data.boards.some((b) => b.pool === p.id)) as opt (opt.id)}
            <button
              type="button"
              class="px-2.5 py-1 rounded-md transition-colors cursor-pointer {board?.pool === opt.id
                ? 'bg-background text-foreground shadow-sm font-semibold'
                : 'text-muted-foreground hover:text-foreground'}"
              aria-pressed={board?.pool === opt.id}
              onclick={() => pickPool(opt.id)}
            >
              {opt.name}
            </button>
          {/each}
        </div>
      {/if}
      <div class="relative w-full sm:ml-auto sm:w-56">
        <SearchIcon class="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input bind:value={query} placeholder="搜索选手 / 战队" class="h-8 pl-8 text-xs" />
      </div>
    </div>

    {#if !board}
      <div class="rounded-xl border border-border bg-card/40 py-16 text-center text-sm text-muted-foreground">
        {data.season} 赛季还没有已结束的积分赛。
      </div>
    {:else}
      <div class="rounded-xl border border-border bg-card/40">
        <div class="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 px-4 py-3">
          <h2 class="text-sm font-bold text-foreground">{data.season} 赛季 · {vehiclePoolLabel(board.pool)}</h2>
          <span class="text-[11px] text-muted-foreground">{board.events.length} 场积分赛 · {board.players.length} 名选手有积分</span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full border-collapse text-xs">
            <thead>
              <tr class="border-b border-border bg-muted/20 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                <th class="sticky left-0 z-10 w-12 bg-card px-3 py-2.5 text-right">#</th>
                <th class="sticky left-12 z-10 min-w-40 bg-card px-3 py-2.5 text-left">选手</th>
                <th class="px-3 py-2.5 text-center">总积分</th>
                <th class="px-3 py-2.5 text-left whitespace-nowrap">冬季总决赛</th>
                {#each board.events as ev (ev.id)}
                  <th class="px-2 py-2.5 text-center font-semibold normal-case tracking-normal whitespace-nowrap">
                    <a href="/tournament/{encodeURIComponent(ev.id)}" class="hover:text-primary" title={ev.name}>{shortName(ev.name)}</a>
                    {#if ev.kind === "monthly"}<span class="ml-0.5 text-[9px] font-bold text-amber-500" title="月赛">月</span>{/if}
                  </th>
                {/each}
              </tr>
            </thead>
            <tbody class="divide-y divide-border/40">
              {#each shownPlayers as p (p.id)}
                <tr class="hover:bg-muted/20 {p.finals ? '' : 'opacity-70'} {p.id === userState.id ? 'bg-primary/5' : ''}">
                  <td class="sticky left-0 z-10 bg-card px-3 py-2 text-right font-mono font-bold {p.rank <= 3 ? 'text-amber-500' : 'text-muted-foreground'}">{p.rank}</td>
                  <td class="sticky left-12 z-10 bg-card px-3 py-2">
                    <div class="flex items-center gap-1.5 min-w-0">
                      <Flag code={p.flag} size={16} />
                      {#if p.team}
                        <span class="shrink-0 font-mono text-[9px] font-bold text-muted-foreground">[{p.team}]</span>
                      {/if}
                      <span class="truncate font-semibold text-foreground">{p.display_name}</span>
                    </div>
                  </td>
                  <td class="px-3 py-2 text-center font-mono text-sm font-black text-foreground">{p.total}</td>
                  <td class="px-3 py-2 whitespace-nowrap">
                    {#if p.finals?.via === "monthly"}
                      <span class="rounded border border-amber-500/30 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400" title="月赛冠军直通">
                        月赛 · {shortName(board.events.find((e) => e.id === p.finals.event_id)?.name)}
                      </span>
                    {:else if p.finals?.via === "points"}
                      <span class="rounded border border-emerald-500/30 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">积分</span>
                    {/if}
                  </td>
                  {#each board.events as ev (ev.id)}
                    <td class="px-2 py-2 text-center font-mono {p.points[ev.id] ? 'text-foreground' : 'text-muted-foreground/40'}">
                      {p.points[ev.id] || "—"}
                    </td>
                  {/each}
                </tr>
              {:else}
                <tr>
                  <td colspan={4 + board.events.length} class="py-10 text-center text-muted-foreground">没有匹配的选手</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <p class="border-t border-border/50 px-4 py-2 text-[10px] text-muted-foreground">
          「月赛」为月赛冠军直通名额（已举行 {board.finals.monthly_held}/{board.finals.monthly_spots} 场月赛），「积分」为按积分排名的 {board.finals.spots - board.finals.monthly_spots} 个名额，随赛季进行变化。同分并列同一名次。
        </p>
      </div>
    {/if}
  {/if}
</div>
