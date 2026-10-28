<script>
  // Lobby: upcoming / running events, then finished ones filtered by event
  // type. Rows and the create-event wizard live in $lib/components/lobby.
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import { API } from "$lib/api.js";
  import { userState } from "$lib/user.svelte.js";
  import { EVENT_TIERS, VEHICLE_POOLS } from "$lib/tournament.js";
  import { eventDate, relativeDay } from "$lib/lobby.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import ActiveEventRow from "$lib/components/lobby/ActiveEventRow.svelte";
  import HistoryEventRow from "$lib/components/lobby/HistoryEventRow.svelte";
  import CreateEventDialog from "$lib/components/lobby/CreateEventDialog.svelte";
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
      { id: "", name: "全部等级", count: poolHistory.length },
      ...EVENT_TIERS.map((tier) => ({ ...tier, count: poolHistory.filter((t) => t.tier === tier.id).length })),
      { id: "none", name: "未分级", count: poolHistory.filter((t) => !t.tier).length },
    ].filter((chip) => chip.id === "" || chip.count > 0 || chip.id === historyTier),
  );
  let shownHistory = $derived(
    historyTier ? poolHistory.filter((t) => (historyTier === "none" ? !t.tier : t.tier === historyTier)) : poolHistory,
  );

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

  function openCreateDialog() {
    if (!isAdmin) {
      toast.error("创建赛事需要管理员权限，请先点击右上角盾牌图标登录");
      return;
    }
    if (!userState.qqGroup || !userState.id) {
      toast.error("创建赛事需要先填写 QQ / Discord 联系方式与选手 ID。已为您打开配置面板！");
      document.getElementById("header-profile-button")?.click();
      return;
    }
    createDialog?.start();
  }

  // Downloads an event's full data as JSON.
  async function exportTournament(t) {
    try {
      const details = await API.getTournament(t.id);
      const blob = new Blob([JSON.stringify(details, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `potato-cup-${t.id}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`${t.name} 数据导出成功`);
    } catch (e) {
      toast.error("导出失败: " + e.message);
    }
  }

  async function deleteTournament(t) {
    if (!confirm(`确定删除赛事「${t.name || t.id}」？报名、对阵和比分会一并删除，且无法恢复。`)) return;
    try {
      await API.deleteTournament(t.id);
      toast.success("已删除");
      await load();
    } catch (e) {
      toast.error("删除失败: " + e.message);
    }
  }
</script>

<div class="space-y-6">
  <!-- Top Headline and Create trigger -->
  <div class="flex items-center justify-between border-b border-border/60 pb-5">
    <div>
      <h1
        class="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-foreground via-foreground/90 to-primary bg-clip-text text-transparent"
      >
        赛事大厅
      </h1>
      <p class="text-xs text-muted-foreground mt-1">
        管理并投票单淘汰赛事的首选工具
      </p>
    </div>
    <div class="flex items-center gap-2 shrink-0">
      {#if isAdmin}
        <Button
          onclick={openCreateDialog}
          class="gap-1.5 font-bold hover:scale-[1.02] transition-transform text-xs"
        >
          <PlusIcon class="w-4 h-4" />
          创建赛事
        </Button>
      {/if}
    </div>
  </div>

  {#if loading}
    <div
      class="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground"
    >
      <div
        class="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin"
      ></div>
      <p class="text-sm">正在加载赛事数据...</p>
    </div>
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
            <div class="mt-2 inline-flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
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
      <div class="divide-y divide-border border border-border bg-card/30 rounded-2xl overflow-hidden shadow-sm">
        {#each activeTournaments as t (t.id)}
          <ActiveEventRow {t} {isAdmin} ondelete={deleteTournament} />
        {/each}
      </div>
    {/if}

    <!-- ── History Tournaments ────────────────────────────── -->
    {#if historyTournaments.length > 0}
      <div class="pt-4">
        <div class="flex items-center gap-3 mb-4">
          <h2 class="text-sm font-bold text-muted-foreground uppercase tracking-wider">历史记录</h2>
          <div class="flex-1 h-px bg-border/60"></div>
        </div>
        <!-- Filter by vehicle pool -->
        <div class="flex flex-wrap items-center gap-1.5 mb-3">
          {#each historyChips as chip (chip.id)}
            <button
              type="button"
              onclick={() => (historyPool = chip.id)}
              aria-pressed={historyPool === chip.id}
              class="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition-colors cursor-pointer
                {historyPool === chip.id
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground'}"
            >
              {chip.name}
              <span class="text-[10px] font-normal opacity-75 tabular-nums">{chip.count}</span>
            </button>
          {/each}
        </div>
        {#if tierChips.length > 2}
          <div class="flex flex-wrap items-center gap-1.5 -mt-1 mb-3">
            {#each tierChips as chip (chip.id)}
              <button
                type="button"
                onclick={() => (historyTier = chip.id)}
                aria-pressed={historyTier === chip.id}
                class="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-colors cursor-pointer
                  {historyTier === chip.id
                  ? 'border-primary bg-primary/15 text-primary'
                  : 'border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground'}"
              >
                {chip.name}
                <span class="text-[10px] font-normal opacity-75 tabular-nums">{chip.count}</span>
              </button>
            {/each}
          </div>
        {/if}
        <div class="divide-y divide-border border border-border bg-card/15 rounded-2xl overflow-hidden shadow-sm">
          {#each shownHistory as t (t.id)}
            <HistoryEventRow {t} {isAdmin} ondelete={deleteTournament} onexport={exportTournament} />
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</div>

<CreateEventDialog bind:this={createDialog} defaultSeason={defaultPointsSeason} oncreated={load} />
