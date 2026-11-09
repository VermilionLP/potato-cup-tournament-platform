<script>
  // Lobby: the event that matters now on top (LobbyHero), the other upcoming
  // / running events (filtered by status, 8 at a time), then finished ones
  // filtered by event type and tier (10 at a time). Rows and the create-event wizard live in #lib/components/lobby.
  import { FilterBar, FilterGroup } from "#lib/components/ui/filter-group/index.js";
  import PageHeader from "#lib/components/PageHeader.svelte";
  import PageSkeleton from "#lib/components/PageSkeleton.svelte";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import { API } from "#lib/api.js";
  import { askConfirm } from "#lib/confirm.svelte.js";
  import { downloadText } from "#lib/download.js";
  import { userState } from "#lib/user.svelte.js";
  import { EVENT_TIERS, VEHICLE_POOLS } from "#lib/tournament.js";
  import { eventDate, featuredEvent, relativeDay } from "#lib/lobby.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import ActiveEventRow from "#lib/components/lobby/ActiveEventRow.svelte";
  import HistoryEventRow from "#lib/components/lobby/HistoryEventRow.svelte";
  import LobbyHero from "#lib/components/lobby/LobbyHero.svelte";
  import { copyableEvents } from "#lib/create-event.js";
  import CopyIcon from "@lucide/svelte/icons/copy";
  import CreateEventDialog from "#lib/components/lobby/CreateEventDialog.svelte";
  import ClockIcon from "@lucide/svelte/icons/clock";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import TrophyIcon from "@lucide/svelte/icons/trophy";

  let tournaments = $state([]);
  let loading = $state(true);
  let isAdmin = $derived(!!userState.adminToken);
  let createDialog = $state(null);
  // Default season of new events: the current season set by the admins.
  let defaultPointsSeason = $state("");

  let activeTournaments = $derived(tournaments.filter((t) => t.status !== "completed"));
  let historyTournaments = $derived(tournaments.filter((t) => t.status === "completed"));
  // The event on top (LobbyHero); the list below shows the others.
  let featured = $derived(featuredEvent(activeTournaments));
  let otherActive = $derived(activeTournaments.filter((t) => t.id !== featured?.id));
  // Other active events by status ("" = all); statuses with none are hidden.
  let activeStatus = $state("");
  const ACTIVE_STATUSES = [
    { id: "in_progress", name: "进行中" },
    { id: "registration", name: "报名中" },
    { id: "voting", name: "投票中" },
  ];
  let statusChips = $derived([
    { id: "", name: "全部", count: otherActive.length },
    ...ACTIVE_STATUSES.map((st) => ({ ...st, count: otherActive.filter((t) => t.status === st.id).length })).filter((c) => c.count > 0 || c.id === activeStatus),
  ]);
  let filteredActive = $derived(activeStatus ? otherActive.filter((t) => t.status === activeStatus) : otherActive);
  const ACTIVE_PAGE = 8;
  const HISTORY_PAGE = 10;
  let activeLimit = $state(ACTIVE_PAGE);
  let historyLimit = $state(HISTORY_PAGE);
  let shownActive = $derived(filteredActive.slice(0, activeLimit));

  // History filter by event type ("" = all).
  let historyPool = $state("");
  let historyChips = $derived([
    { id: "", name: "全部", count: historyTournaments.length },
    ...VEHICLE_POOLS.map((p) => ({ ...p, count: historyTournaments.filter((t) => t.vehicle_pool === p.id).length })),
  ]);
  // And by tier ("" = all, "none" = not rated); tiers with no events are hidden.
  let historyTier = $state("");
  let poolHistory = $derived(
    historyPool ? historyTournaments.filter((t) => t.vehicle_pool === historyPool) : historyTournaments,
  );
  let tierChips = $derived(
    [
      { id: "", name: "全部", count: poolHistory.length },
      ...EVENT_TIERS.map((tier) => ({ ...tier, count: poolHistory.filter((t) => t.tier === tier.id).length })),
      { id: "none", name: "未分级", count: poolHistory.filter((t) => !t.tier).length },
    ].filter((chip) => chip.id === "" || chip.count > 0 || chip.id === historyTier),
  );
  let filteredHistory = $derived(
    historyTier ? poolHistory.filter((t) => (historyTier === "none" ? !t.tier : t.tier === historyTier)) : poolHistory,
  );
  let shownHistory = $derived(filteredHistory.slice(0, historyLimit));

  onMount(() => {
    load();
    API.getPointsSeasons()
      .then((res) => (defaultPointsSeason = res.current || ""))
      .catch(() => {});
  });

  async function load() {
    loading = true;
    try {
      tournaments = await API.listTournaments();
    } catch (e) {
      toast.error("加载数据失败: " + e.message);
    }
    loading = false;
  }

  // The latest event made on the site: "复制上一场" starts from it.
  let lastEvent = $derived(copyableEvents(tournaments, 1)[0] || null);

  function openCreateDialog(fromId = "") {
    if (!isAdmin) {
      toast.error("创建赛事需要管理员权限，请先点击右上角盾牌图标登录");
      return;
    }
    if (!userState.qqGroup || !userState.id) {
      toast.error("创建赛事需要先填写 QQ / Discord 联系方式与选手 ID。已为您打开配置面板！");
      document.getElementById("header-profile-button")?.click();
      return;
    }
    createDialog?.start(typeof fromId === "string" ? fromId : "");
  }

  // Downloads an event's full data as JSON.
  async function exportTournament(t) {
    try {
      const details = await API.getTournament(t.id);
      downloadText(`potato-cup-${t.id}.json`, JSON.stringify(details, null, 2));
      toast.success(`${t.name} 数据导出成功`);
    } catch (e) {
      toast.error("导出失败: " + e.message);
    }
  }

  async function deleteTournament(t) {
    if (!(await askConfirm(`确定删除赛事「${t.name || t.id}」？报名、对阵和比分会一并删除，且无法恢复。`, { danger: true, confirmText: "删除" }))) return;
    try {
      await API.deleteTournament(t.id);
      toast.success("已删除");
      await load();
    } catch (e) {
      toast.error("删除失败: " + e.message);
    }
  }
</script>

{#snippet more(total, shown, onmore, onall, step)}
  {#if total > shown}
    <div class="flex items-center justify-center gap-3 text-xs text-muted-foreground">
      <span class="num">显示 {shown} / {total} 场</span>
      <button type="button" class="font-bold text-brand-ink hover:underline cursor-pointer" onclick={onmore}>再显示 {Math.min(step, total - shown)} 场</button>
      <button type="button" class="hover:text-foreground hover:underline cursor-pointer" onclick={onall}>全部显示</button>
    </div>
  {/if}
{/snippet}

<svelte:head><title>赛事大厅 · Potato Cup</title></svelte:head>

<div class="space-y-6">
  <!-- Top Headline and Create trigger -->
  <PageHeader title="赛事大厅" icon={TrophyIcon} description="报名、投票和观看 Potato Cup 水友赛">
    {#snippet actions()}
      {#if isAdmin}
        {#if lastEvent}
          <Button
            variant="outline"
            onclick={() => openCreateDialog(lastEvent.id)}
            title="按「{lastEvent.name}」的设置创建下一场：编号 +1，时间顺延一周"
            class="gap-1.5 text-xs"
          >
            <CopyIcon class="w-4 h-4" />
            复制上一场
          </Button>
        {/if}
        <Button
          onclick={openCreateDialog}
          class="gap-1.5 font-bold hover:scale-[1.02] transition-transform text-xs"
        >
          <PlusIcon class="w-4 h-4" />
          创建赛事
        </Button>
      {/if}
    {/snippet}
  </PageHeader>

  {#if loading}
    <PageSkeleton kind="lobby" label="正在加载赛事数据..." />
  {:else}
    <!-- ── Active Tournaments ──────────────────────────────── -->
    {#if activeTournaments.length === 0}
      <div
        class="py-5 px-4 border border-dashed border-border rounded-2xl bg-card/20 flex flex-col sm:flex-row items-center justify-center gap-4 text-center sm:text-left"
      >
        <div class="w-9 h-9 rounded-full bg-muted/60 border border-border/70 flex items-center justify-center shrink-0">
          <TrophyIcon class="w-4.5 h-4.5 text-muted-foreground/50" />
        </div>
        <div class="min-w-0">
          <p class="text-sm font-semibold text-foreground">暂无活跃赛事</p>
          <p class="text-xs text-muted-foreground mt-0.5">
            可以直接创建一场新的 WarThunder 锦标赛。
          </p>
          {#if historyTournaments.length > 0}
            <div class="mt-2 inline-flex items-center gap-1.5 text-small text-muted-foreground/70">
              <ClockIcon class="w-3 h-3 shrink-0" />
              <span>上次比赛：{relativeDay(eventDate(historyTournaments[0]))}</span>
            </div>
          {/if}
        </div>
        {#if isAdmin}
          <Button
            onclick={openCreateDialog}
            class="gap-1.5 font-bold text-xs shrink-0"
          >
            <PlusIcon class="w-4 h-4" />
            发起下一场锦标赛
          </Button>
        {/if}
      </div>
    {:else}
      {#if featured}
        <LobbyHero t={featured} onchanged={load} {isAdmin} ondelete={deleteTournament} />
      {/if}
      {#if otherActive.length}
        <div class="space-y-3">
          <div class="flex items-center gap-3">
            <h2 class="text-sm font-bold text-muted-foreground uppercase tracking-wider">其他赛事</h2>
            <div class="flex-1 h-px bg-border/60"></div>
          </div>
          {#if statusChips.length > 2}
            <FilterBar>
              <FilterGroup
                label="状态"
                value={activeStatus}
                onpick={(id) => ((activeStatus = id), (activeLimit = ACTIVE_PAGE))}
                options={statusChips.map((c) => ({ id: c.id, label: c.name, count: c.count }))}
              />
            </FilterBar>
          {/if}
          <div class="divide-y divide-border border border-border bg-card/30 rounded-2xl overflow-hidden shadow-sm">
            {#each shownActive as t (t.id)}
              <ActiveEventRow {t} {isAdmin} ondelete={deleteTournament} />
            {/each}
          </div>
          {@render more(filteredActive.length, shownActive.length, () => (activeLimit += ACTIVE_PAGE), () => (activeLimit = Infinity), ACTIVE_PAGE)}
        </div>
      {/if}
    {/if}

    <!-- ── History Tournaments ────────────────────────────── -->
    {#if historyTournaments.length > 0}
      <div class="pt-4">
        <div class="flex items-center gap-3 mb-4">
          <h2 class="text-sm font-bold text-muted-foreground uppercase tracking-wider">历史记录</h2>
          <div class="flex-1 h-px bg-border/60"></div>
        </div>
        <!-- Filter by event type and tier -->
        <div class="mb-3">
          <FilterBar>
            <FilterGroup
              label="类型"
              value={historyPool}
              onpick={(id) => ((historyPool = id), (historyLimit = HISTORY_PAGE))}
              options={historyChips.map((c) => ({ id: c.id, label: c.name, count: c.count }))}
            />
            {#if tierChips.length > 2}
              <FilterGroup
                label="等级"
                value={historyTier}
                onpick={(id) => ((historyTier = id), (historyLimit = HISTORY_PAGE))}
                options={tierChips.map((c) => ({ id: c.id, label: c.id && c.id !== "none" ? c.id : c.name, count: c.count, title: c.name }))}
              />
            {/if}
          </FilterBar>
        </div>
        <div class="divide-y divide-border border border-border bg-card/15 rounded-2xl overflow-hidden shadow-sm">
          {#each shownHistory as t (t.id)}
            <HistoryEventRow {t} {isAdmin} ondelete={deleteTournament} onexport={exportTournament} />
          {/each}
        </div>
        <div class="pt-3">
          {@render more(filteredHistory.length, shownHistory.length, () => (historyLimit += HISTORY_PAGE), () => (historyLimit = Infinity), HISTORY_PAGE)}
        </div>
      </div>
    {/if}
  {/if}
</div>

<CreateEventDialog bind:this={createDialog} defaultSeason={defaultPointsSeason} events={tournaments} oncreated={load} />
