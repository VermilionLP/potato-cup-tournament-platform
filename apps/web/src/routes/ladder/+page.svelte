<script>
  import { LADDER_WEIGHTS } from "#lib/ladder-sim.js";
  import SwordsIcon from "@lucide/svelte/icons/swords";
  import PageHeader from "#lib/components/PageHeader.svelte";
  import RankingTabs from "#lib/components/rankings/RankingTabs.svelte";
  import PageSkeleton from "#lib/components/PageSkeleton.svelte";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import { API } from "#lib/api.js";
  import { userState } from "#lib/user.svelte.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import DivisionPicker from "#lib/components/ladder/DivisionPicker.svelte";
  import LadderSummary from "#lib/components/ladder/LadderSummary.svelte";
  import LadderBoard from "#lib/components/ladder/LadderBoard.svelte";
  import LadderPlayerDetail from "#lib/components/ladder/LadderPlayerDetail.svelte";
  import { page } from "$app/state";
  import { replaceState } from "$app/navigation";
  import { GAME_MODES, VEHICLE_POOLS } from "#lib/tournament.js";

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
  let ladderDetail = $state(null);
  let detailLoading = $state(false);


  let myRank = $derived(
    userState.id
      ? (data?.players || []).find((p) => p.id === userState.id)
      : null,
  );

  let topPlayer = $derived(data?.players?.[0] || null);

  onMount(() => {
    const params = page.url.searchParams;
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
    const url = new URL(page.url.href);
    for (const [key, value] of [["mode", mode], ["pool", pool]]) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    replaceState(url, {});
    selected = null;
    ladderDetail = null;
    await load();
  }

  async function load() {
    loading = true;
    errorMsg = "";
    try {
      data = await API.getLadder({ includeInactive, window: ladderWindow, mode: ladderMode, pool: ladderPool });
      if (selected && !data?.players?.some((p) => p.id === selected.id)) {
        selected = null;
        ladderDetail = null;
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
    ladderDetail = null;
    await load();
  }

  async function setWindow(value) {
    if (ladderWindow === value) return;
    ladderWindow = value;
    selected = null;
    ladderDetail = null;
    await load();
  }

  // Opens a player's details under their row; null closes them.
  async function selectPlayer(player) {
    if (!player) {
      selected = null;
      ladderDetail = null;
      return;
    }
    if (selected?.id === player.id) return;
    selected = player;
    ladderDetail = null;
    detailLoading = true;
    try {
      ladderDetail = await API.getLadderPlayer(player.id, { window: ladderWindow, mode: ladderMode, pool: ladderPool });
    } catch (e) {
      toast.error("加载选手天梯记录失败: " + e.message);
    } finally {
      detailLoading = false;
    }
  }
</script>

<svelte:head><title>天梯 · 排行 · Potato Cup</title></svelte:head>

<div class="space-y-6">
  <div class="space-y-3">
    <PageHeader title="排行" icon={SwordsIcon} description="天梯 MMR：全部已完成对局按日期顺序用 Elo 计算，初始 MMR 3000">
      {#snippet badge()}
        {#if divisionLabel}
          <Badge variant="outline" class="text-xs font-bold border-primary/40 text-brand-ink">{divisionLabel}</Badge>
        {/if}
      {/snippet}
      {#snippet more()}
        <p>
          所有已完成的赛事对局按比赛日期顺序用 Elo 计算；初始
          MMR 3000。选“最近一年”时只用近 365 天的对局从 3000 重新计算。默认只显示近 {data?.active_days || 365} 天有对局的选手；分数不重置，
          回归后沿用原分。种子默认按这里的 MMR 自动排序。
        </p>
        <p>
          选择模式和比赛类型可以查看单独计算的分榜（如 AB 螺旋桨），只用该组合的对局从 3000 开始算。分榜只列出在该组合打过对局的选手。赛事自动排种子时按该赛事的模式和比赛类型分榜排序，没有该组合对局的选手排在最后。
        </p>
      {/snippet}
    </PageHeader>
    <RankingTabs />
    <!-- Division picker: game mode × event type -->
    <DivisionPicker mode={ladderMode} pool={ladderPool} onchange={setDivision} />
  </div>

  {#if loading}
    <PageSkeleton kind="table" label="正在计算天梯分..." rows={10} />
  {:else if errorMsg}
    <div class="text-center py-16 border border-border bg-card/30 rounded-2xl">
      <p class="text-sm text-rose-600 dark:text-rose-400">加载失败：{errorMsg}</p>
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
    >
      {#snippet detail(p)}
        <LadderPlayerDetail player={p} detail={ladderDetail} {detailLoading} />
      {/snippet}
    </LadderBoard>

    <p class="text-small text-muted-foreground/70">
      Elo：初始 3000，前 10 场 K=200（同分对局 ±100），10–30 场 K=100，30 场以后 K=50；2-0 与 2-1 同权。
      按赛事性质加权：大型赛事 ×{LADDER_WEIGHTS.major}、预选赛 ×{LADDER_WEIGHTS.qualifier}、周赛 ×{LADDER_WEIGHTS.weekly}（K 乘以权重，大赛加减分更多）。
      只有已完成的赛事对局计入，弃权/平局不计。活跃窗口 {data?.active_days || 365} 天；
      不活跃选手移出榜单，但分数保留，回归后继续使用。
    </p>
  {/if}
</div>
