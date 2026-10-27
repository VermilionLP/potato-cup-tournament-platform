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
  import { placeColor, placeRangeLabel } from "$lib/points.js";
  import Flag from "$lib/components/Flag.svelte";
  import { Input } from "$lib/components/ui/input/index.js";
  import AwardIcon from "@lucide/svelte/icons/award";
  import SearchIcon from "@lucide/svelte/icons/search";

  let isAdmin = $derived(!!userState.adminToken);
  let data = $state(null);
  let savingInvite = $state("");
  // Season management (admins).
  let currentDraft = $state("");
  let seasonBusy = $state(false);
  let confirmEnd = $state(false);
  let confirmReopen = $state(false);
  let endProblem = $state("");
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
      currentDraft = data.current || currentDraft;
      confirmEnd = false;
      confirmReopen = false;
      endProblem = "";
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

  const validSeason = (value) => /^\d{4}$/.test(String(value ?? "").trim());

  async function saveCurrentSeason() {
    seasonBusy = true;
    try {
      const res = await API.setCurrentSeason(currentDraft.trim());
      toast.success(`当前赛季已设为 ${res.current}，新建赛事默认计入该赛季`);
      await load(data?.season || "");
    } catch (e) {
      toast.error(e.message);
    } finally {
      seasonBusy = false;
    }
  }

  async function endSeason(force = false) {
    seasonBusy = true;
    try {
      await API.endSeason(data.season, force);
      toast.success(`${data.season} 赛季已结束，积分榜和冬季总决赛名单已锁定`);
      await load(data.season);
    } catch (e) {
      // Unfinished events: show them and offer to end anyway.
      endProblem = e.message;
    } finally {
      seasonBusy = false;
    }
  }

  async function reopenSeason() {
    seasonBusy = true;
    try {
      await API.reopenSeason(data.season);
      toast.success(`${data.season} 赛季已重新开放`);
      await load(data.season);
    } catch (e) {
      toast.error(e.message);
    } finally {
      seasonBusy = false;
    }
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
      计入积分榜的周赛和月赛按最终名次给分，每个赛季按比赛类型分别排名。冬季总决赛每个类型 16 人：管理员指定的直邀赛事冠军直接晋级（冠军已有资格时顺延给亚军），其余名额按积分排名。积分在赛事设置中定义，赛事结束后计入。
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
      <div class="space-y-2 rounded-xl border border-border bg-card/40 p-3 text-xs">
        <div class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">赛季管理</div>
        <div class="flex flex-wrap items-center gap-2">
          <label class="flex items-center gap-1.5">
            当前赛季
            <input
              aria-label="当前赛季"
              class="h-7 w-16 rounded border border-border bg-background px-1.5 font-mono text-xs text-foreground focus:border-primary focus:outline-none"
              inputmode="numeric"
              maxlength="4"
              bind:value={currentDraft}
            />
          </label>
          <button type="button" disabled={seasonBusy || !validSeason(currentDraft) || currentDraft.trim() === data.current} onclick={saveCurrentSeason}
            class="h-7 rounded-md border border-border px-2.5 font-semibold hover:bg-muted cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">设为当前赛季</button>
          <span class="text-[10px] text-muted-foreground">新建赛事默认计入当前赛季{data.current ? `（现在是 ${data.current}）` : "（未设置时按当年年份）"}。</span>
        </div>
        <div class="flex flex-wrap items-center gap-2 border-t border-border/50 pt-2">
          {#if isEnded}
            {#if confirmReopen}
              <span>重新开放 {data.season} 赛季？积分榜会重新按当前数据计算，积分和直邀可以再修改。</span>
              <button type="button" disabled={seasonBusy} onclick={reopenSeason} class="h-7 rounded-md bg-primary px-2.5 font-semibold text-primary-foreground cursor-pointer disabled:opacity-50">确认重新开放</button>
              <button type="button" onclick={() => (confirmReopen = false)} class="h-7 rounded-md border border-border px-2.5 cursor-pointer">取消</button>
            {:else}
              <button type="button" onclick={() => (confirmReopen = true)} class="h-7 rounded-md border border-border px-2.5 font-semibold hover:bg-muted cursor-pointer">重新开放 {data.season} 赛季</button>
            {/if}
          {:else if confirmEnd}
            <span>结束 {data.season} 赛季？积分榜和冬季总决赛名单会固定下来，该赛季所有赛事的积分和直邀将被锁定。</span>
            <button type="button" disabled={seasonBusy} onclick={() => endSeason(false)} class="h-7 rounded-md bg-red-600 px-2.5 font-semibold text-white cursor-pointer disabled:opacity-50">确认结束</button>
            <button type="button" onclick={() => { confirmEnd = false; endProblem = ""; }} class="h-7 rounded-md border border-border px-2.5 cursor-pointer">取消</button>
            {#if endProblem}
              <div class="w-full space-y-1.5 rounded-md bg-amber-500/10 p-2 text-amber-700 dark:text-amber-300">
                <p>{endProblem}</p>
                {#if /没有结束/.test(endProblem)}
                  <button type="button" disabled={seasonBusy} onclick={() => endSeason(true)} class="h-7 rounded-md border border-amber-500/50 px-2.5 font-semibold cursor-pointer disabled:opacity-50">仍然结束（这些赛事不计入）</button>
                {/if}
              </div>
            {/if}
          {:else}
            <button type="button" onclick={() => (confirmEnd = true)} class="h-7 rounded-md border border-red-500/40 px-2.5 font-semibold text-red-600 hover:bg-red-500/10 dark:text-red-400 cursor-pointer">结束 {data.season} 赛季</button>
            <span class="text-[10px] text-muted-foreground">结束后积分榜和冬季总决赛名单固定，不再随修改变化；需要时可以重新开放。</span>
          {/if}
        </div>
      </div>
    {/if}

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
        <div class="overflow-x-auto p-2 sm:p-3">
          <!-- Point standings in the style of Liquipedia: placing-coloured cells,
               qualified places highlighted in the # column. -->
          <table class="w-full border-collapse text-xs [&_td]:border [&_td]:border-border/70 [&_th]:border [&_th]:border-border/70">
            <thead>
              <tr class="bg-muted/50 text-[11px] font-bold text-foreground">
                <th class="sticky left-0 z-10 w-10 bg-muted px-2 py-2 text-center">#</th>
                <th class="sticky left-10 z-10 min-w-44 bg-muted px-3 py-2 text-center">选手</th>
                <th class="w-16 px-2 py-2 text-center leading-tight">总积分</th>
                <th class="px-2 py-2 text-center whitespace-nowrap">冬季总决赛</th>
                {#each board.events as ev (ev.id)}
                  <th class="w-16 min-w-16 px-1.5 py-2 text-center align-bottom leading-tight">
                    <a href="/tournament/{encodeURIComponent(ev.id)}" class="font-bold text-sky-600 hover:underline dark:text-sky-400" title={ev.name}>{shortName(ev.name)}</a>
                    {#if ev.invite}<div class="text-[9px] font-bold text-amber-500" title="冠军直邀冬季总决赛">邀</div>{/if}
                  </th>
                {/each}
              </tr>
            </thead>
            <tbody>
              {#each shownPlayers as p, i (p.id)}
                <tr class="{i % 2 ? 'bg-muted/25' : 'bg-card'} {p.id === userState.id ? 'outline outline-2 -outline-offset-2 outline-primary/60' : ''}">
                  <td
                    class="sticky left-0 z-10 px-2 py-1.5 text-center font-mono font-bold
                      {p.finals ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-100' : i % 2 ? 'bg-muted' : 'bg-card'}"
                    title={p.finals ? "冬季总决赛名额" : undefined}
                  >{p.rank}</td>
                  <td class="sticky left-10 z-10 px-2 py-1.5 {i % 2 ? 'bg-muted' : 'bg-card'}">
                    <div class="flex items-center gap-1.5 min-w-0">
                      <Flag code={p.flag} size={16} />
                      {#if p.team}
                        <span class="shrink-0 font-mono text-[9px] font-bold text-muted-foreground">[{p.team}]</span>
                      {/if}
                      <span class="truncate font-semibold text-foreground">{p.display_name}</span>
                    </div>
                  </td>
                  <td class="px-2 py-1.5 text-center font-bold text-foreground">{p.total}</td>
                  <td class="px-2 py-1.5 whitespace-nowrap">
                    {#if p.finals?.via === "invite"}
                      <span class="rounded border border-amber-500/30 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400" title="直邀名额">
                        直邀 · {shortName(board.events.find((e) => e.id === p.finals.event_id)?.name)}
                      </span>
                    {:else if p.finals?.via === "points"}
                      <span class="rounded border border-emerald-500/30 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">积分</span>
                    {/if}
                  </td>
                  {#each board.events as ev (ev.id)}
                    {@const place = p.places?.[ev.id]}
                    {#if p.points[ev.id]}
                      <td
                        class="px-1 py-1.5 text-center font-bold text-white"
                        style="background-color: {placeColor(place)}"
                        title={place ? placeRangeLabel(place) : undefined}
                      >{p.points[ev.id]}</td>
                    {:else}
                      <td class="px-1 py-1.5"></td>
                    {/if}
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
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pb-2 text-[10px] text-muted-foreground">
          {#each [[{ from: 1, to: 1 }, "第 1 名"], [{ from: 2, to: 2 }, "第 2 名"], [{ from: 3, to: 3 }, "第 3 名 / 3-4 名"], [{ from: 4, to: 4 }, "第 4 名"], [{ from: 5, to: 8 }, "第 5-8 名"], [{ from: 9, to: 16 }, "第 9 名以后"]] as [place, label] (label)}
            <span class="inline-flex items-center gap-1">
              <span class="inline-block h-3 w-3 rounded-sm" style="background-color: {placeColor(place)}"></span>{label}
            </span>
          {/each}
          <span class="inline-flex items-center gap-1">
            <span class="inline-block h-3 w-3 rounded-sm bg-emerald-100 ring-1 ring-emerald-300 dark:bg-emerald-900/60"></span>冬季总决赛名额
          </span>
        </div>
        <div class="space-y-2 border-t border-border/50 px-4 py-3">
          <div class="text-[11px] font-bold text-foreground">
            直邀名额 {board.finals.invites.length} 个 · 积分名额 {board.finals.points_spots} 个
          </div>
          {#if isAdmin && !isEnded}
            <p class="text-[10px] text-muted-foreground">勾选的赛事，冠军直接获得冬季总决赛名额；随时可以更改。</p>
            <div class="flex flex-wrap gap-1.5">
              {#each board.events as ev (ev.id)}
                <label class="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] cursor-pointer
                  {ev.invite ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'border-border text-muted-foreground hover:text-foreground'}">
                  <input type="checkbox" class="accent-amber-500" checked={ev.invite} disabled={!!savingInvite} onchange={() => toggleInvite(ev)} />
                  {shortName(ev.name)}
                </label>
              {/each}
            </div>
            {#if board.finals.invites.some((i) => !i.finished)}
              <p class="text-[10px] text-muted-foreground">
                还没结束的直邀赛事（名额已预留）：{board.finals.invites.filter((i) => !i.finished).map((i) => shortName(i.name)).join("、")}；可在赛事页的积分设置里更改。
              </p>
            {/if}
          {:else if board.finals.invites.length}
            <p class="text-[10px] text-muted-foreground">
              直邀赛事：{board.finals.invites.map((i) => shortName(i.name) + (i.finished ? "" : "（未结束）")).join("、")}
            </p>
          {/if}
          <p class="text-[10px] text-muted-foreground">
            「直邀」为指定赛事冠军的名额（冠军已有资格时顺延给亚军），「积分」为按积分排名的名额，随赛季进行变化。同分并列同一名次。
          </p>
        </div>
      </div>
    {/if}
  {/if}
</div>
