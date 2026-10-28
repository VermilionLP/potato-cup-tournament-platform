<script>
  // Event page header: title (editable by admins), status, the tag row
  // (mode, type, format, points), facts, match time and points settings.
  import { goto } from "$app/navigation";
  import { toast } from "svelte-sonner";
  import { API } from "$lib/api.js";
  import { resolveTemplate } from "$lib/vehicle-pools.js";
  import { POINTS_PRESETS, cleanTable, copyTable, currentSeason, pointsTableProblem } from "$lib/points.js";
  import {
    POOL_TAG,
    VEHICLE_POOLS,
    eventFormatLabel,
    gameModeLabel,
    gameModeTitle,
    vehiclePoolLabel,
  } from "$lib/tournament.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import MatchTime from "$lib/components/MatchTime.svelte";
  import PointsEditor from "$lib/components/PointsEditor.svelte";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import PencilIcon from "@lucide/svelte/icons/pencil";
  import TrophyIcon from "@lucide/svelte/icons/trophy";
  import CalendarIcon from "@lucide/svelte/icons/calendar";
  import ExternalLinkIcon from "@lucide/svelte/icons/external-link";

  let {
    tournament = $bindable(),
    tid,
    isAdmin = false,
    statusText = "",
    isSwiss = false,
    isTwoStage = false,
    hasGroupBrackets = false,
    swissRoundsLabel = "",
    vehicleTemplates = [],
    bpTemplate = null,
    onreload,
    onedittime,
  } = $props();

  let hasPoints = $derived(Boolean(tournament?.points_table?.length));

  function adminOnly() {
    if (isAdmin) return true;
    toast.error("此操作需要管理员权限，请先点击右上角盾牌图标登录");
    return false;
  }

  // Title
  let editingTitle = $state(false);
  let titleDraft = $state("");
  let savingTitle = $state(false);

  function startTitleEdit() {
    titleDraft = tournament?.name || "";
    editingTitle = true;
  }

  async function saveTitle() {
    if (!adminOnly()) return;
    const name = titleDraft.trim();
    if (!name) return toast.error("赛事标题不能为空");
    savingTitle = true;
    try {
      tournament = await API.updateTournament(tid, { name });
      editingTitle = false;
      toast.success("赛事标题已更新");
    } catch (e) {
      toast.error(e.message);
    } finally {
      savingTitle = false;
    }
  }

  // Event type (螺旋桨 / 顶级喷气 / 早期喷气 / Pro League BVR): admins can change it any time.
  let savingPool = $state(false);
  async function saveEventPool(pool) {
    if (!adminOnly() || !pool || pool === tournament?.vehicle_pool) return;
    savingPool = true;
    try {
      const res = await API.updateTournament(tid, { vehicle_pool: pool });
      tournament = { ...tournament, vehicle_pool: res.vehicle_pool };
      toast.success(`比赛类型已改为 ${vehiclePoolLabel(res.vehicle_pool)}`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      savingPool = false;
    }
  }

  // Ban / Pick vehicle pool template: automatic (best match for the event
  // type and game mode) unless an admin picks one.
  let typeTemplates = $derived(vehicleTemplates.filter((t) => t.event_type === tournament?.vehicle_pool));
  let autoTemplate = $derived(resolveTemplate(vehicleTemplates, { ...tournament, vehicle_template: null }));
  let savingTemplate = $state(false);
  async function saveTemplate(id) {
    if (!adminOnly() || id === (tournament?.vehicle_template || "")) return;
    savingTemplate = true;
    try {
      const res = await API.updateTournament(tid, { vehicle_template: id || null });
      tournament = { ...tournament, vehicle_template: res.vehicle_template ?? null };
      toast.success(id ? "已指定载具池模板" : "载具池模板改为自动匹配");
    } catch (e) {
      toast.error(e.message);
    } finally {
      savingTemplate = false;
    }
  }

  // Potato Cup points (积分榜): admins edit an event's table at any time.
  let editingPoints = $state(false);
  let pointsDraft = $state([]);
  let pointsSeasonDraft = $state("");
  let pointsKindDraft = $state("weekly");
  let pointsInviteDraft = $state(false);
  let savingPoints = $state(false);

  async function openPointsEdit() {
    pointsDraft = copyTable(tournament?.points_table?.length ? tournament.points_table : POINTS_PRESETS[0].table);
    pointsSeasonDraft = tournament?.points_season || currentSeason();
    if (!tournament?.points_season) {
      // Not on the leaderboard yet: default to the admins' current season.
      try {
        const res = await API.getPointsSeasons();
        if (res.current) pointsSeasonDraft = res.current;
      } catch {
        // keep the calendar year
      }
    }
    pointsKindDraft = tournament?.points_kind === "monthly" ? "monthly" : "weekly";
    pointsInviteDraft = Boolean(tournament?.points_invite);
    editingPoints = true;
  }

  async function savePoints(clear = false) {
    if (!adminOnly()) return;
    if (!clear) {
      const problem = pointsTableProblem(pointsDraft, pointsSeasonDraft);
      if (problem) return toast.error(problem);
    }
    savingPoints = true;
    try {
      await API.updateTournament(
        tid,
        clear
          ? { points_table: null }
          : { points_table: cleanTable(pointsDraft), points_season: pointsSeasonDraft.trim(), points_kind: pointsKindDraft, points_invite: pointsInviteDraft },
      );
      // Reload: awarded points are computed with the event.
      await onreload?.();
      editingPoints = false;
      toast.success(clear ? "已设为不计入积分榜" : "积分已保存");
    } catch (e) {
      toast.error(e.message);
    } finally {
      savingPoints = false;
    }
  }
</script>

<div class="space-y-1">
  <button
    onclick={() => goto("/")}
    class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors mb-1.5 cursor-pointer"
  >
    <ArrowLeftIcon class="w-3 h-3" /> 返回大厅
  </button>
  <div class="flex items-center gap-3 flex-wrap">
    {#if editingTitle}
      <div class="flex items-center gap-1.5 flex-wrap">
        <Input
          bind:value={titleDraft}
          class="h-9 text-base font-bold w-64 max-w-full bg-background border-border"
          onkeydown={(e) => {
            if (e.key === "Enter") saveTitle();
            if (e.key === "Escape") editingTitle = false;
          }}
        />
        <Button size="sm" onclick={saveTitle} disabled={savingTitle} class="h-9 text-xs">{savingTitle ? "保存中..." : "保存"}</Button>
        <Button variant="ghost" size="sm" onclick={() => (editingTitle = false)} class="h-9 text-xs">取消</Button>
      </div>
    {:else}
      <h1 class="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">{tournament.name}</h1>
      {#if isAdmin}
        <button
          type="button"
          onclick={startTitleEdit}
          title="修改赛事标题"
          aria-label="修改赛事标题"
          class="text-muted-foreground/60 hover:text-primary transition-colors cursor-pointer"
        >
          <PencilIcon class="w-4 h-4" />
        </button>
      {/if}
    {/if}
    <Badge variant="outline" class="text-[10px] px-2 py-0.5 font-bold uppercase tracking-wider bg-primary/10 text-primary border-primary/20">
      {statusText}
    </Badge>
  </div>

  <!-- Event tags: mode · type · format · detail, then points. -->
  <div class="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
    <span class="rounded-md border border-border bg-muted/60 px-2 py-0.5 font-mono font-bold text-foreground/80" title={gameModeTitle(tournament.game_mode)}>{gameModeLabel(tournament.game_mode)}</span>
    {#if isAdmin}
      <select
        aria-label="比赛类型"
        title="比赛类型"
        value={tournament.vehicle_pool}
        disabled={savingPool}
        onchange={(e) => saveEventPool(e.currentTarget.value)}
        class="h-6 rounded-md border px-1.5 text-xs font-semibold cursor-pointer disabled:opacity-60 {POOL_TAG[tournament.vehicle_pool] || 'border-border bg-background text-foreground'}"
      >
        {#if !vehiclePoolLabel(tournament.vehicle_pool)}
          <option value={tournament.vehicle_pool}>未分类</option>
        {/if}
        {#each VEHICLE_POOLS as pool (pool.id)}
          <option value={pool.id}>{pool.name}</option>
        {/each}
      </select>
    {:else if vehiclePoolLabel(tournament.vehicle_pool)}
      <span class="rounded-md border px-2 py-0.5 font-semibold {POOL_TAG[tournament.vehicle_pool] || 'border-border bg-muted/60 text-muted-foreground'}">{vehiclePoolLabel(tournament.vehicle_pool)}</span>
    {/if}
    {#if tournament.banpick_enabled !== false && vehicleTemplates.length}
      {#if isAdmin}
        <select
          aria-label="载具池模板"
          title="Ban / Pick 使用的载具池模板"
          value={tournament.vehicle_template || ""}
          disabled={savingTemplate}
          onchange={(e) => saveTemplate(e.currentTarget.value)}
          class="h-6 rounded-md border border-border bg-background px-1.5 text-xs font-semibold text-foreground cursor-pointer disabled:opacity-60"
        >
          <option value="">载具池：自动（{autoTemplate?.name || "无"}）</option>
          {#if tournament.vehicle_template && !typeTemplates.some((t) => t.id === tournament.vehicle_template)}
            <option value={tournament.vehicle_template}>载具池：{bpTemplate?.name || tournament.vehicle_template}</option>
          {/if}
          {#each typeTemplates as t (t.id)}
            <option value={t.id}>载具池：{t.name}</option>
          {/each}
        </select>
      {:else if bpTemplate}
        <a href="/pools?template={bpTemplate.id}" class="rounded-md border border-border bg-muted/60 px-2 py-0.5 font-semibold text-muted-foreground hover:text-primary" title="Ban / Pick 载具池">载具池：{bpTemplate.name}</a>
      {/if}
    {/if}
    <span class="rounded-md border border-border bg-muted/60 px-2 py-0.5 font-semibold text-muted-foreground">{isSwiss && !isTwoStage ? `瑞士轮 · ${swissRoundsLabel}` : eventFormatLabel(tournament)}</span>
    {#if isTwoStage}
      <span class="text-muted-foreground">{tournament.swiss_group_size ? `每组 ${tournament.swiss_group_size} 人` : "不分组"}{hasGroupBrackets ? "" : ` · ${swissRoundsLabel}`} · 每组前 {tournament.advance_per_group} 名晋级</span>
    {:else if !isSwiss && tournament.loser_advances}
      <span class="text-muted-foreground">败者晋级</span>
    {/if}
    {#if hasPoints}
      <a
        href="/points?season={tournament.points_season}&pool={tournament.vehicle_pool}"
        class="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 font-semibold text-primary hover:bg-primary/20 transition-colors"
        title="年度积分榜"
      >
        <TrophyIcon class="w-3 h-3" />
        {tournament.points_season} 赛季{tournament.points_kind === "monthly" ? "月赛" : "周赛"}{tournament.points_invite ? " · 冠军直邀" : ""}
      </a>
    {/if}
    {#if isAdmin}
      <button
        type="button"
        onclick={() => (editingPoints ? (editingPoints = false) : openPointsEdit())}
        class="text-[11px] font-semibold text-primary hover:underline cursor-pointer"
      >
        {editingPoints ? "收起积分设置" : hasPoints ? "编辑积分" : "设置积分"}
      </button>
    {/if}
  </div>

  <!-- Facts: ID, players, date. -->
  <p class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
    <span class="font-mono">ID: {tournament.id}</span>
    <span>选手 <span class="font-semibold text-foreground tabular-nums">{tournament.player_count || 0} / {tournament.player_capacity}</span></span>
    {#if tournament.status === "voting"}
      <span>投票 <span class="font-semibold text-foreground tabular-nums">{tournament.voter_count || 0}</span> 人</span>
    {/if}
    {#if tournament.source_url}
      <span>比赛日期 {tournament.scheduled_time || "未知"}</span>
    {:else}
      <span>创建于 {new Date(tournament.created_at).toLocaleDateString("zh-CN")}</span>
    {/if}
  </p>

  {#if isAdmin && editingPoints}
    <div class="mt-3 max-w-xl space-y-2 rounded-xl border border-border bg-card/60 p-3">
      <div class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">年度积分榜设置</div>
      <PointsEditor bind:table={pointsDraft} bind:season={pointsSeasonDraft} bind:kind={pointsKindDraft} bind:invite={pointsInviteDraft} compact />
      <div class="flex flex-wrap items-center gap-2">
        <Button size="sm" class="h-8 text-xs cursor-pointer" disabled={savingPoints} onclick={() => savePoints(false)}>保存积分</Button>
        {#if hasPoints}
          <Button variant="outline" size="sm" class="h-8 text-xs cursor-pointer" disabled={savingPoints} onclick={() => savePoints(true)}>不计入积分榜</Button>
        {/if}
        <Button variant="outline" size="sm" class="h-8 text-xs cursor-pointer" disabled={savingPoints} onclick={() => (editingPoints = false)}>取消</Button>
      </div>
    </div>
  {/if}

  {#if tournament.source_url}
    <a
      href={tournament.source_url}
      target="_blank"
      rel="noopener noreferrer"
      class="mt-2.5 inline-flex max-w-full items-center gap-1.5 rounded-xl border border-border bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
      title="历史赛事，赛果来自 Liquipedia（CC-BY-SA 3.0）"
    >
      <ExternalLinkIcon class="w-3.5 h-3.5 shrink-0" />
      <span class="truncate">数据来源：Liquipedia · {tournament.source_title || tournament.name}</span>
    </a>
  {:else if tournament.scheduled_time}
    <MatchTime value={tournament.scheduled_time} status={tournament.status}>
      {#snippet actions()}
        {#if isAdmin && ["registration", "in_progress"].includes(tournament.status)}
          <button
            type="button"
            onclick={onedittime}
            class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-primary/25 bg-background/50 text-[10px] font-bold text-primary hover:bg-primary hover:text-primary-foreground transition-colors cursor-pointer"
            title="调整比赛时间"
          >
            <PencilIcon class="w-3 h-3" />
            调整
          </button>
        {/if}
        <a
          href={`/api/tournaments/${encodeURIComponent(tournament.id)}/calendar.ics`}
          download={`${tournament.id}.ics`}
          class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-primary/25 bg-background/50 text-[10px] font-bold text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
          title="下载 .ics 日历文件，一键导入日历（会按你的时区显示）"
        >
          <CalendarIcon class="w-3 h-3" />
          添加到日历
        </a>
      {/snippet}
    </MatchTime>
  {/if}
</div>
