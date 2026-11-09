<script>
  // Event page header: title (editable by admins), status and the sign-up
  // button, one row of read-only tags in two groups (settings: tier, mode,
  // type, format, ladder limit; rewards: points and prizes), the player
  // count and the match time (with check-in). Admins change the tags and
  // points in EventSettingsDialog (the 设置 button, loaded for admins only).
  import { statusTone } from "#lib/lobby.js";
  import { Tag } from "#lib/components/ui/tag/index.js";
  import { goto } from "$app/navigation";
  import { toast } from "svelte-sonner";
  import { API } from "#lib/api.js";
  import { placeName, prizeRows, prizeTotal } from "#lib/points.js";
  import { lazy } from "#lib/lazy.js";
  import { eventFormatLabel } from "#lib/tournament.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import MatchTime from "#lib/components/MatchTime.svelte";
  import EventTagControls from "./EventTagControls.svelte";
  import LadderLimitTag from "./LadderLimitTag.svelte";
  import SettingsIcon from "@lucide/svelte/icons/settings";
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
    oncheckinchange,
  } = $props();

  // Admins: the settings dialog (tags, ladder limit, check-in, points).
  const loadSettings = lazy(() => import("./EventSettingsDialog.svelte"));
  let settings = $state(null);
  const openSettings = (section = "") => settings?.open(section);
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
</script>

<div class="space-y-1">
  <button
    onclick={() => goto("/")}
    class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-brand-ink transition-colors mb-1.5 cursor-pointer"
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
      <h1 class="font-display text-[2.25rem] sm:text-[2.5rem] font-extrabold uppercase leading-none text-foreground">{tournament.name}</h1>
      {#if isAdmin}
        <button
          type="button"
          onclick={startTitleEdit}
          title="修改赛事标题"
          aria-label="修改赛事标题"
          class="text-muted-foreground/60 hover:text-brand-ink transition-colors cursor-pointer"
        >
          <PencilIcon class="w-4 h-4" />
        </button>
      {/if}
    {/if}
    <Tag tone={statusTone(tournament.status)} dot={tournament.status === "in_progress"}>{statusText}</Tag>
    {#if canSignUp}
      {#if isRegistered}
        <span class="inline-flex items-center gap-2 text-xs">
          <Tag tone="success">已报名 ✓</Tag>
          <button type="button" onclick={() => onunregister?.()} class="text-muted-foreground hover:text-destructive cursor-pointer">取消报名</button>
        </span>
      {:else}
        <Button size="sm" onclick={() => onregister?.()}>立即报名</Button>
      {/if}
    {/if}
  </div>

  <!-- Event tags: settings (tier, mode, type, format, ladder limit), then rewards (points, prizes); admins: 设置. -->
  <div class="flex flex-wrap items-center gap-x-1.5 gap-y-1.5 pt-1 text-xs">
    <EventTagControls bind:tournament {tid} />
    <span class="rounded-md border border-border bg-muted/60 px-2 py-0.5 font-semibold text-muted-foreground">{isSwiss && !isTwoStage ? `瑞士轮 · ${swissRoundsLabel}` : eventFormatLabel(tournament)}</span>
    {#if isTwoStage}
      <span class="text-muted-foreground">{tournament.swiss_group_size ? `每组 ${tournament.swiss_group_size} 人` : "不分组"}{hasGroupBrackets ? "" : ` · ${swissRoundsLabel}`} · 每组前 {tournament.advance_per_group} 名晋级</span>
    {:else if !isSwiss && tournament.loser_advances}
      <span class="text-muted-foreground">败者晋级</span>
    {/if}
    {#if !tournament.source_url}
      <LadderLimitTag bind:tournament {tid} />
    {/if}
    {#if hasPoints || prizePool}
      <span class="hidden sm:inline-block h-4 w-px bg-border mx-1" aria-hidden="true"></span>
    {/if}
    {#if hasPoints}
      <a
        href="/points?season={tournament.points_season}&pool={tournament.vehicle_pool}"
        class="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 font-semibold text-brand-ink hover:bg-primary/20 transition-colors"
        title="年度积分榜"
      >
        <TrophyIcon class="w-3 h-3" />
        <span>计入 {tournament.points_season} 积分榜</span>{#if !tournament.event_kind}<span>{tournament.points_kind === "monthly" ? "（大型赛事）" : "（周赛）"}</span>{/if}{#if tournament.points_invite}<span>· 冠军直邀</span>{/if}
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
        onclick={() => openSettings()}
        class="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-0.5 font-semibold text-muted-foreground hover:border-primary/50 hover:text-brand-ink transition-colors cursor-pointer"
        title="修改等级、模式、类型、天梯限制、签到和奖金积分"
      >
        <SettingsIcon class="h-3 w-3" />
        设置
      </button>
    {/if}
  </div>

  <!-- Facts: players, voters, date of an imported event (ID and creation date are in 设置). -->
  <p class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-small text-muted-foreground">
    <span>选手 <span class="font-semibold text-foreground tabular-nums">{tournament.player_count || 0} / {tournament.player_capacity}</span></span>
    {#if tournament.status === "voting"}
      <span>投票 <span class="font-semibold text-foreground tabular-nums">{tournament.voter_count || 0}</span> 人</span>
    {/if}
    {#if tournament.source_url}
      <span>比赛日期 {tournament.scheduled_time || "未知"}</span>
    {/if}
  </p>

  {#if tournament.source_url}
    <a
      href={tournament.source_url}
      target="_blank"
      rel="noopener noreferrer"
      class="mt-2.5 inline-flex max-w-full items-center gap-1.5 rounded-xl border border-border bg-muted/30 px-3 py-1.5 text-small text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
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
            class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-primary/25 bg-background/50 text-small font-bold text-brand-ink hover:bg-primary hover:text-primary-foreground transition-colors cursor-pointer"
            title="调整比赛时间"
          >
            <PencilIcon class="w-3 h-3" />
            调整
          </button>
        {/if}
        <a
          href={`/api/tournaments/${encodeURIComponent(tournament.id)}/calendar.ics`}
          download={`${tournament.id}.ics`}
          class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-primary/25 bg-background/50 text-small font-bold text-brand-ink hover:bg-primary hover:text-primary-foreground transition-colors"
          title="下载 .ics 日历文件，一键导入日历（会按你的时区显示）"
        >
          <CalendarIcon class="w-3 h-3" />
          添加到日历
        </a>
      {/snippet}
    </MatchTime>
  {/if}
</div>

{#if isAdmin}
  {#await loadSettings() then m}
    <m.default bind:this={settings} bind:tournament {tid} {oncheckinchange} {onreload} />
  {/await}
{/if}
