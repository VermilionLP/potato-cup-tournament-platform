<script>
  // Potato Cup points leaderboard (积分榜): per season (year) and event type,
  // the points players earned in finished events with a points table. The
  // board is PointsBoard; admins also get SeasonAdmin (loaded on demand).
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import { page } from "$app/state";
  import { replaceState } from "$app/navigation";
  import { API } from "#lib/api.js";
  import { userState } from "#lib/user.svelte.js";
  import { VEHICLE_POOLS } from "#lib/tournament.js";
  import { lazy } from "#lib/lazy.js";
  import PointsBoard from "#lib/components/points/PointsBoard.svelte";
  import { Input } from "#lib/components/ui/input/index.js";
  import AwardIcon from "@lucide/svelte/icons/award";
  import SearchIcon from "@lucide/svelte/icons/search";

  const loadSeasonAdmin = lazy(() => import("#lib/components/points/SeasonAdmin.svelte"));

  let isAdmin = $derived(!!userState.adminToken);
  let data = $state(null);
  let savingInvite = $state("");
  let isEnded = $derived(Boolean(data?.ended_at));
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
    const url = new URL(page.url.href);
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
    const params = page.url.searchParams;
    pool = params.get("pool") || "";
    await load(params.get("season") || "");
  });

  async function pickSeason(season) {
    if (season === data?.season) return;
    await load(season);
    syncUrl();
  }

  // Admins choose which events' champions get a direct Winter Finals invite.
  async function toggleInvite(ev) {
    savingInvite = ev.id;
    try {
      await API.updateTournament(ev.id, { points_invite: !ev.invite });
      await load(data?.season || "");
      toast.success(ev.invite ? `已取消 ${shortName(ev.name)} 的直邀名额` : `${shortName(ev.name)} 的冠军将直接获得名额`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      savingInvite = "";
    }
  }

  function pickPool(id) {
    pool = id;
    syncUrl();
  }
</script>

<svelte:head><title>年度积分榜 · Potato Cup</title></svelte:head>

<div class="space-y-5">
  <div class="space-y-1">
    <h1 class="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
      <AwardIcon class="h-6 w-6 text-primary" />
      土豆杯积分榜
    </h1>
    <p class="text-xs text-muted-foreground">
      计入积分榜的周赛和大型赛事按最终名次给分，每个赛季按比赛类型分别排名。冬季总决赛每个类型 16 人：管理员指定的直邀赛事冠军直接晋级（冠军已有资格时顺延给亚军），其余名额按积分排名。积分在赛事设置中定义，赛事结束后计入。
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
            {season} 赛季{season === data.current ? " · 当前" : ""}
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

    <!-- Season status; admins set the current season and end / reopen one. -->
    <div class="flex flex-wrap items-center gap-2 text-[11px]">
      {#if isEnded}
        <span class="rounded-full border border-border bg-muted/50 px-2.5 py-0.5 font-semibold text-foreground">
          {data.season} 赛季已结束 · {new Date(data.ended_at).toLocaleDateString("zh-CN")} · 积分和名单已锁定
        </span>
      {:else if data.season === data.current}
        <span class="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 font-semibold text-primary">当前赛季 · 进行中</span>
      {:else}
        <span class="rounded-full border border-border px-2.5 py-0.5 text-muted-foreground">进行中</span>
      {/if}
    </div>
    {#if isAdmin}
      {#await loadSeasonAdmin() then m}
        <m.default {data} onchanged={load} />
      {/await}
    {/if}

    {#if !board}
      <div class="rounded-xl border border-border bg-card/40 py-16 text-center text-sm text-muted-foreground">
        {data.season} 赛季还没有已结束的积分赛。
      </div>
    {:else}
      <PointsBoard
        {board}
        season={data.season}
        players={shownPlayers}
        {isAdmin}
        {isEnded}
        {savingInvite}
        {shortName}
        ontoggleinvite={toggleInvite}
      />
    {/if}
  {/if}
</div>
