<script>
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import { API } from "$lib/api.js";
  import { userState } from "$lib/user.svelte.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import TrendingUpIcon from "@lucide/svelte/icons/trending-up";
  import DivisionPicker from "$lib/components/ladder/DivisionPicker.svelte";
  import LadderSummary from "$lib/components/ladder/LadderSummary.svelte";
  import LadderBoard from "$lib/components/ladder/LadderBoard.svelte";
  import LadderPlayerDetail from "$lib/components/ladder/LadderPlayerDetail.svelte";
  import { page } from "$app/stores";
  import { replaceState } from "$app/navigation";
  import { GAME_MODES, VEHICLE_POOLS } from "$lib/tournament.js";

  let data = $state(null);
  let loading = $state(true);
  let errorMsg = $state("");
  let includeInactive = $state(false);
  // "all" = every recorded game; "year" = ratings from the last 365 days only.
  let ladderWindow = $state("all");
  // Division: game mode and event type ("" = all), e.g. AB 螺旋桨. Kept in
  // the URL (?mode=ab&pool=prop) so a division can be linked.
  let ladderMode = $state("");
  let ladderPool = $state("");
  let divisionLabel = $derived(
    [GAME_MODES.find((m) => m.id === ladderMode)?.code, VEHICLE_POOLS.find((p) => p.id === ladderPool)?.name]
      .filter(Boolean)
      .join(" "),
  );
  let selected = $state(null);
  let detail = $state(null);
  let detailLoading = $state(false);


  let myRank = $derived(
    userState.id
      ? (data?.players || []).find((p) => p.id === userState.id)
      : null,
  );

  let topPlayer = $derived(data?.players?.[0] || null);

  onMount(() => {
    const params = $page.url.searchParams;
    const mode = params.get("mode") || "";
    const pool = params.get("pool") || "";
    if (GAME_MODES.some((m) => m.id === mode)) ladderMode = mode;
    if (VEHICLE_POOLS.some((p) => p.id === pool)) ladderPool = pool;
    load();
  });

  async function setDivision(mode, pool) {
    if (mode === ladderMode && pool === ladderPool) return;
    ladderMode = mode;
    ladderPool = pool;
    const url = new URL($page.url);
    for (const [key, value] of [["mode", mode], ["pool", pool]]) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    replaceState(url, {});
    selected = null;
    detail = null;
    await load();
  }

  async function load() {
    loading = true;
    errorMsg = "";
    try {
      data = await API.getLadder({ includeInactive, window: ladderWindow, mode: ladderMode, pool: ladderPool });
      if (selected && !data?.players?.some((p) => p.id === selected.id)) {
        selected = null;
        detail = null;
      }
      if (!selected && data?.players?.length) {
        await selectPlayer(data.players[0]);
      }
    } catch (e) {
      errorMsg = e.message;
      toast.error("加载天梯数据失败: " + e.message);
    } finally {
      loading = false;
    }
  }

  async function toggleInactive(event) {
    includeInactive = event.target.checked;
    selected = null;
    detail = null;
    await load();
  }

  async function setWindow(value) {
    if (ladderWindow === value) return;
    ladderWindow = value;
    selected = null;
    detail = null;
    await load();
  }

  async function selectPlayer(player) {
    if (selected?.id === player.id) return;
    selected = player;
    detail = null;
    detailLoading = true;
    try {
      detail = await API.getLadderPlayer(player.id, { window: ladderWindow, mode: ladderMode, pool: ladderPool });
    } catch (e) {
      toast.error("加载选手天梯记录失败: " + e.message);
    } finally {
      detailLoading = false;
    }
  }
</script>

<div class="space-y-6">
  <div class="flex flex-col gap-2">
    <div class="flex items-center gap-2">
      <TrendingUpIcon class="w-6 h-6 text-primary" />
      <h1 class="text-2xl font-extrabold tracking-tight">天梯 MMR</h1>
      {#if divisionLabel}
        <Badge variant="outline" class="text-xs font-bold border-primary/40 text-primary">{divisionLabel}</Badge>
      {/if}
    </div>
    <p class="text-xs text-muted-foreground">
      所有已完成的赛事对局按比赛日期顺序用 Elo 计算；初始
      MMR 3000。选“最近一年”时只用近 365 天的对局从 3000 重新计算。默认只显示近 {data?.active_days || 365} 天有对局的选手；分数不重置，
      回归后沿用原分。种子默认按这里的 MMR 自动排序。
    </p>
    <p class="text-xs text-muted-foreground">
      选择模式和比赛类型可以查看单独计算的分榜（如 AB 螺旋桨），只用该组合的对局从 3000 开始算。分榜只列出在该组合打过对局的选手。赛事自动排种子时按该赛事的模式和比赛类型分榜排序，没有该组合对局的选手排在最后。
    </p>
    <!-- Division picker: game mode × event type -->
    <DivisionPicker mode={ladderMode} pool={ladderPool} onchange={setDivision} />
  </div>

  {#if loading}
    <div class="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
      <div class="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
      <span class="text-xs">正在计算天梯分...</span>
    </div>
  {:else if errorMsg}
    <div class="text-center py-16 border border-border bg-card/30 rounded-2xl">
      <p class="text-sm text-rose-400">加载失败：{errorMsg}</p>
    </div>
  {:else}
    <!-- Summary -->
    <LadderSummary count={data?.players?.length || 0} {includeInactive} {topPlayer} {myRank} />

    <LadderBoard
      players={data?.players || []}
      scoreWindow={ladderWindow}
      {includeInactive}
      {selected}
      onwindow={setWindow}
      oninactive={toggleInactive}
      onselect={selectPlayer}
    />

    <!-- Selected player detail -->
    {#if selected}
      <LadderPlayerDetail player={selected} {detail} {detailLoading} />
    {/if}

    <p class="text-[10px] text-muted-foreground/70">
      Elo：初始 3000，前 10 场 K=200（同分对局 ±100），10–30 场 K=100，30 场以后 K=50；2-0 与 2-1 同权。
      只有已完成的赛事对局计入，弃权/平局不计。活跃窗口 {data?.active_days || 365} 天；
      不活跃选手移出榜单，但分数保留，回归后继续使用。
    </p>
  {/if}
</div>
