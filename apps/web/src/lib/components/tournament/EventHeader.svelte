<script>
  // Event page header: title (editable by admins), status and the sign-up
  // button, the tag row in two groups (settings: EventTagControls and the
  // format; rewards: points and prizes), facts, match time (with check-in)
  // and points settings.
  import { goto } from "$app/navigation";
  import { toast } from "svelte-sonner";
  import { API } from "$lib/api.js";
  import { POINTS_PRESETS, cleanTable, copyTable, currentSeason, placeName, pointsTableProblem, prizeRows, prizeTotal } from "$lib/points.js";
  import { eventFormatLabel } from "$lib/tournament.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import MatchTime from "$lib/components/MatchTime.svelte";
  import EventTagControls from "./EventTagControls.svelte";
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
    isRegistered = false,
    onregister,
    onunregister,
    onreload,
    onedittime,
  } = $props();
  let canSignUp = $derived(tournament?.status === "registration" && !tournament?.source_url);

  let hasPoints = $derived(Boolean(tournament?.points_table?.length));
  let prizePool = $derived(prizeTotal(tournament?.points_table));
  let prizeTitle = $derived(prizeRows(tournament?.points_table).map((r) => `${placeName(r)} ${r.prize} 金鹰币`).join(" · "));

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
    {#if canSignUp}
      {#if isRegistered}
        <span class="inline-flex items-center gap-2 text-xs">
          <span class="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 font-bold text-emerald-600 dark:text-emerald-400">已报名 ✓</span>
          <button type="button" onclick={() => onunregister?.()} class="text-muted-foreground hover:text-destructive cursor-pointer">取消报名</button>
        </span>
      {:else}
        <Button size="sm" onclick={() => onregister?.()} class="h-8 font-bold">立即报名</Button>
      {/if}
    {/if}
  </div>

  <!-- Event tags: settings (tier, mode, type, format, detail), then rewards (points, prizes). -->
  <div class="flex flex-wrap items-center gap-x-1.5 gap-y-1.5 pt-1 text-xs">
    <EventTagControls bind:tournament {tid} {isAdmin} />
    <span class="rounded-md border border-border bg-muted/60 px-2 py-0.5 font-semibold text-muted-foreground">{isSwiss && !isTwoStage ? `瑞士轮 · ${swissRoundsLabel}` : eventFormatLabel(tournament)}</span>
    {#if isTwoStage}
      <span class="text-muted-foreground">{tournament.swiss_group_size ? `每组 ${tournament.swiss_group_size} 人` : "不分组"}{hasGroupBrackets ? "" : ` · ${swissRoundsLabel}`} · 每组前 {tournament.advance_per_group} 名晋级</span>
    {:else if !isSwiss && tournament.loser_advances}
      <span class="text-muted-foreground">败者晋级</span>
    {/if}
    {#if hasPoints || prizePool || isAdmin}
      <span class="hidden sm:inline-block h-4 w-px bg-border mx-1" aria-hidden="true"></span>
    {/if}
    {#if hasPoints}
      <a
        href="/points?season={tournament.points_season}&pool={tournament.vehicle_pool}"
        class="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 font-semibold text-primary hover:bg-primary/20 transition-colors"
        title="年度积分榜"
      >
        <TrophyIcon class="w-3 h-3" />
        <span>计入 {tournament.points_season} 积分榜</span>{#if !tournament.event_kind}<span>{tournament.points_kind === "monthly" ? "（月赛）" : "（周赛）"}</span>{/if}{#if tournament.points_invite}<span>· 冠军直邀</span>{/if}
      </a>
    {/if}
    {#if prizePool}
      <span class="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-semibold text-amber-600 dark:text-amber-400" title={prizeTitle}>
        奖金 {prizePool} 金鹰币
      </span>
    {/if}
    {#if isAdmin}
      <button
        type="button"
        onclick={() => (editingPoints ? (editingPoints = false) : openPointsEdit())}
        class="text-[11px] font-semibold text-primary hover:underline cursor-pointer"
      >
        {editingPoints ? "收起奖金与积分" : hasPoints ? "编辑奖金与积分" : "设置奖金与积分"}
      </button>
    {/if}
  </div>

  <!-- Facts: ID, players, date. -->
  <p class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
    {#if isAdmin}<span class="font-mono">ID: {tournament.id}</span>{/if}
    <span>选手 <span class="font-semibold text-foreground tabular-nums">{tournament.player_count || 0} / {tournament.player_capacity}</span></span>
    {#if tournament.status === "voting"}
      <span>投票 <span class="font-semibold text-foreground tabular-nums">{tournament.voter_count || 0}</span> 人</span>
    {/if}
    {#if tournament.source_url}
      <span>比赛日期 {tournament.scheduled_time || "未知"}</span>
    {:else if isAdmin}
      <span>创建于 {new Date(tournament.created_at).toLocaleDateString("zh-CN")}</span>
    {/if}
  </p>

  {#if isAdmin && editingPoints}
    <div class="mt-3 max-w-xl space-y-2 rounded-xl border border-border bg-card/60 p-3">
      <div class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">奖金与积分设置</div>
      <PointsEditor bind:table={pointsDraft} bind:season={pointsSeasonDraft} bind:kind={pointsKindDraft} bind:invite={pointsInviteDraft} compact />
      <div class="flex flex-wrap items-center gap-2">
        <Button size="sm" class="h-8 text-xs cursor-pointer" disabled={savingPoints} onclick={() => savePoints(false)}>保存</Button>
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
    <MatchTime
      value={tournament.scheduled_time}
      status={tournament.status}
      checkinAt={tournament.status === "registration" && tournament.checkin?.enabled ? tournament.checkin.opens_at : ""}
    >
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
