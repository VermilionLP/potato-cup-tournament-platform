<script>
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import { API } from "$lib/api.js";
  import {
    GAME_MODES,
    gameModeLabel,
    VEHICLE_POOLS,
    vehiclePoolLabel,
    autoSwissRounds,
    isValidSwissRounds,
    MAX_SWISS_ROUNDS,
    MIN_SWISS_ROUNDS,
    PLAYOFF_FORMATS,
    GROUP_FORMATS,
    eventSummary,
    POOL_TAG,
    groupBracketProblem,
  } from "$lib/tournament.js";
  import PointsEditor from "$lib/components/PointsEditor.svelte";
  import { POINTS_PRESETS, cleanTable, copyTable, currentSeason, pointsTableProblem } from "$lib/points.js";
  import DateTimePicker from "$lib/components/DateTimePicker.svelte";
  import { formatInZone, toInstant } from "$lib/datetime.js";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";
  import { goto } from "$app/navigation";
  import { userState } from "$lib/user.svelte.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import ClockIcon from "@lucide/svelte/icons/clock";
  import UsersIcon from "@lucide/svelte/icons/users";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import DownloadIcon from "@lucide/svelte/icons/download";
  import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
  import TrophyIcon from "@lucide/svelte/icons/trophy";

  let tournaments = $state([]);
  let loading = $state(true);
  let isAdmin = $derived(!!userState.adminToken);

  // Relative day helper (past and future).
  function relativeDay(value) {
    if (value == null) return "未知时间";
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return "未知时间";
    const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
    if (diff === 0) return "今天";
    if (diff === 1) return "明天";
    if (diff === -1) return "昨天";
    if (diff > 0) return `${diff} 天后`;
    return `${-diff} 天前`;
  }

  function startTimeLabel(raw) {
    if (!raw) return "";
    // Stored as Beijing time: show it in the viewer's own time zone.
    const instant = toInstant(raw);
    if (instant) return formatInZone(instant);
    const m = String(raw).match(
      /(\d{4})[-/](\d{1,2})[-/](\d{1,2})[^\d]*(\d{1,2}):(\d{2})/,
    );
    const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      const hh = String(m[4]).padStart(2, "0");
      const mm = String(m[5]).padStart(2, "0");
      return `${m[1]}/${String(m[2]).padStart(2, "0")}/${String(m[3]).padStart(2, "0")} ${weekdays[d.getDay()]} ${hh}:${mm}`;
    }
    const dm = String(raw).match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (dm) {
      const d = new Date(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]));
      return `${dm[1]}/${String(dm[2]).padStart(2, "0")}/${String(dm[3]).padStart(2, "0")} ${weekdays[d.getDay()]}`;
    }
    return String(raw);
  }

  function scheduledDateTime(t) {
    const raw = t?.scheduled_time;
    if (!raw) return null;
    const instant = toInstant(raw);
    if (instant) return instant;
    const m = String(raw).match(
      /(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[^\d]*(\d{1,2}):(\d{2}))?/,
    );
    if (!m) return null;
    return new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      m[4] == null ? 20 : Number(m[4]),
      m[5] == null ? 0 : Number(m[5]),
    );
  }

  function countdownLabel(t) {
    const d = scheduledDateTime(t);
    if (!d) return "";
    const diff = d.getTime() - Date.now();
    if (diff <= 0) return "已开赛";
    const mins = Math.ceil(diff / 60000);
    if (mins < 60) return `${mins} 分钟后`;
    const hours = Math.ceil(mins / 60);
    if (hours < 24) return `${hours} 小时后`;
    return `${Math.ceil(hours / 24)} 天后`;
  }

  function actionLabel(t) {
    if (t.status === "voting") return "去投票";
    if (t.status === "registration") return "去报名";
    if (t.status === "in_progress") return "看对阵";
    return "查看";
  }

  function displayCapacity(t) {
    const count = t?.player_count || 0;
    const tiers = [8, 16, 32, 64, 128];
    const tier = tiers.find((value) => value > count) ?? 128;
    return Math.min(Number(t?.player_capacity) || 128, tier);
  }

  // Best-known match date: prefer the scheduled match time, fall back to creation time.
  function getTournamentDate(t) {
    const raw = t?.scheduled_time;
    if (raw) {
      const m = String(raw).match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
      if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      const parsed = new Date(raw);
      if (!isNaN(parsed.getTime())) return parsed;
    }
    return t?.created_at ? new Date(t.created_at) : null;
  }

  const avatarColors = [
    "from-amber-500 to-orange-500",
    "from-purple-500 to-indigo-500",
    "from-blue-500 to-cyan-500",
    "from-emerald-500 to-teal-500",
    "from-rose-500 to-pink-500",
    "from-violet-500 to-fuchsia-500",
  ];

  function getGradient(id) {
    let s = 0;
    for (let i = 0; i < id.length; i++) s += id.charCodeAt(i);
    return avatarColors[s % avatarColors.length];
  }


  // Modal creation states
  let showCreateDialog = $state(false);
  let newName = $state("");
  let newCapacity = $state(128);
  let newLoserAdvances = $state(false);
  let newScheduledTime = $state("");
  let newGameMode = $state("rb");
  let newFormat = $state("single_elim");
  let newGrandFinalReset = $state(true);
  let newSwissRounds = $state(3);
  // "auto" = full round robin (everyone meets everyone in their group once).
  let newSwissRoundsMode = $state("auto");
  let newBanpickEnabled = $state(true);
  // newFormat "two_stage" = group stage + playoff; the group stage is played
  // as newGroupFormat (Swiss, single or double elimination per group).
  let newGroupFormat = $state("swiss");
  let newPlayoffFormat = $state("single_elim");
  let newGroupSize = $state(4);
  let newAdvancePerGroup = $state(2);
  let isNewTwoStage = $derived(newFormat === "two_stage");
  let newUsesSwissRounds = $derived(newFormat === "swiss" || (isNewTwoStage && newGroupFormat === "swiss"));
  // Group size the automatic round count is based on (single stage: everyone).
  let autoRoundsBasis = $derived(
    isNewTwoStage && Number(newGroupSize) >= 2 ? Number(newGroupSize) : null,
  );
  // The create dialog is a wizard: basics, format, then one page per stage
  // of a two-stage event, then vehicles and a summary.
  let createStep = $state(0);
  let createSteps = $derived([
    { id: "basics", label: "基本信息" },
    { id: "format", label: "赛制" },
    ...(isNewTwoStage
      ? [
          { id: "group", label: "第一阶段 · 小组赛" },
          { id: "playoff", label: "第二阶段 · 淘汰赛" },
        ]
      : []),
    { id: "extras", label: "载具与确认" },
  ]);
  let currentStepIndex = $derived(Math.min(createStep, createSteps.length - 1));
  let currentStepId = $derived(createSteps[currentStepIndex].id);
  let isLastStep = $derived(currentStepIndex === createSteps.length - 1);

  // What blocks leaving a step, or "" when it is complete.
  function stepError(id) {
    if (id === "basics") {
      if (!newName.trim()) return "请输入赛事名称";
      if (!newName.trim().toLowerCase().replace(/[^a-z0-9]/g, "")) {
        return "赛事名称需包含英文或数字（用来生成赛事 ID）";
      }
      if (!(Number(newCapacity) >= 2 && Number(newCapacity) <= 128)) return "选手容量必须在 2 至 128 人之间";
    }
    if ((id === "format" && newFormat === "swiss") || (id === "group" && newGroupFormat === "swiss")) {
      if (newSwissRoundsMode === "manual" && !isValidSwissRounds(newSwissRounds)) {
        return `瑞士轮轮数必须在 ${MIN_SWISS_ROUNDS} 至 ${MAX_SWISS_ROUNDS} 之间`;
      }
    }
    if (id === "group") {
      const size = newGroupSize === "" || newGroupSize === null ? null : Number(newGroupSize);
      if (newGroupFormat !== "swiss" && size === null) return "淘汰制小组需要设置每组人数";
      if (size !== null && (!Number.isInteger(size) || size < 2 || size > 64)) return "每组人数必须在 2 至 64 之间";
      const k = Number(newAdvancePerGroup);
      if (!Number.isInteger(k) || k < 1) return "请设置每组晋级人数（至少 1 人）";
      if (size !== null && k > size) return "每组晋级人数不能多于每组人数";
      if (newGroupProblem) return newGroupProblem;
    }
    return "";
  }
  let currentStepError = $derived(stepError(currentStepId));
  // A step's hint shows once "下一步" has been tried there.
  let triedStep = $state(-1);

  function goToStep(index) {
    // Moving forward checks every step on the way.
    for (let i = currentStepIndex; i < index; i += 1) {
      const err = stepError(createSteps[i].id);
      if (err) {
        createStep = i;
        triedStep = i;
        toast.error(err);
        return;
      }
    }
    createStep = index;
  }

  // Example numbers for the two-stage pages, based on a full field.
  let groupPreview = $derived.by(() => {
    if (!isNewTwoStage) return null;
    const n = Number(newCapacity) || 0;
    const size = Number(newGroupSize) || 0;
    const k = Number(newAdvancePerGroup) || 0;
    if (n < 2 || k < 1) return null;
    const groups = size >= 2 ? Math.max(1, Math.ceil(n / size)) : 1;
    const qualifiers = groups * k;
    const bracket = 2 ** Math.ceil(Math.log2(Math.max(2, qualifiers)));
    return {
      players: n,
      groups,
      smallest: Math.floor(n / groups),
      largest: Math.ceil(n / groups),
      qualifiers,
      byes: bracket - qualifiers,
    };
  });

  // Live check of an elimination group set-up (the server checks again at start).
  let newGroupProblem = $derived(
    isNewTwoStage && newGroupFormat !== "swiss" && Number(newGroupSize) >= 2
      ? groupBracketProblem(newGroupFormat, Number(newGroupSize), Number(newAdvancePerGroup))
      : null,
  );
  // Event type (螺旋桨 / 早期喷气 / Pro League BVR), set with or without
  // Ban / Pick; Ban / Pick uses the vehicle pool of this type.
  let newEventPool = $state("proleague");
  // Potato Cup points (积分榜): on by default with the weekly table.
  let newPointsEnabled = $state(true);
  let newPointsTable = $state(copyTable(POINTS_PRESETS[0].table));
  let newPointsSeason = $state(currentSeason());
  let newPointsKind = $state("weekly");
  let newPointsInvite = $state(false);
  let creating = $state(false);

  // Divide tournaments
  let activeTournaments = $derived(
    tournaments.filter((t) => t.status !== "completed"),
  );
  let historyTournaments = $derived(
    tournaments.filter((t) => t.status === "completed"),
  );
  // History filter by vehicle pool ("" = all).
  let historyPool = $state("");
  let historyPoolCounts = $derived(
    Object.fromEntries(
      VEHICLE_POOLS.map((p) => [p.id, historyTournaments.filter((t) => t.vehicle_pool === p.id).length]),
    ),
  );
  let shownHistory = $derived(
    historyPool ? historyTournaments.filter((t) => t.vehicle_pool === historyPool) : historyTournaments,
  );

  onMount(load);
  // Default season of new events: the current season set by the admins.
  let defaultPointsSeason = $state("");
  onMount(() => {
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
    newName = "";
    newCapacity = 128;
    newScheduledTime = "";
    newLoserAdvances = false;
    newGameMode = "rb";
    newFormat = "single_elim";
    newGrandFinalReset = true;
    newSwissRounds = 5;
    newBanpickEnabled = true;
    newGroupFormat = "swiss";
    newSwissRoundsMode = "auto";
    createStep = 0;
    triedStep = -1;
    newSwissRounds = 3;
    newPlayoffFormat = "single_elim";
    newGroupSize = 4;
    newAdvancePerGroup = 2;
    newEventPool = "proleague";
    newPointsEnabled = true;
    newPointsTable = copyTable(POINTS_PRESETS[0].table);
    newPointsSeason = defaultPointsSeason || currentSeason();
    newPointsKind = "weekly";
    newPointsInvite = false;
    showCreateDialog = true;
  }

  async function createTournament() {
    const trimmedName = newName.trim();
    if (!trimmedName) return toast.error("请输入赛事名称");
    if (newPointsEnabled) {
      const pointsProblem = pointsTableProblem(newPointsTable, newPointsSeason);
      if (pointsProblem) return toast.error(pointsProblem);
    }

    const generatedId = trimmedName.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!generatedId) {
      return toast.error("无法根据赛事名称生成合法的赛事 ID，请确保包含英文或数字");
    }

    if (newCapacity < 2 || newCapacity > 128) {
      return toast.error("选手容量必须在 2 至 128 人之间");
    }
    const manualRounds = newUsesSwissRounds && newSwissRoundsMode === "manual";
    if (manualRounds && !isValidSwissRounds(newSwissRounds)) {
      return toast.error(`瑞士轮轮数必须在 ${MIN_SWISS_ROUNDS} 至 ${MAX_SWISS_ROUNDS} 之间`);
    }
    const twoStage = isNewTwoStage;
    const groupSizeValue = newGroupSize === "" || newGroupSize === null ? null : Number(newGroupSize);
    if (twoStage) {
      if (newGroupFormat !== "swiss" && groupSizeValue === null) {
        return toast.error("淘汰制小组需要设置每组人数");
      }
      if (groupSizeValue !== null && (!Number.isInteger(groupSizeValue) || groupSizeValue < 2 || groupSizeValue > 64)) {
        return toast.error("每组人数必须在 2 至 64 之间，留空表示不分组");
      }
      const k = Number(newAdvancePerGroup);
      if (!Number.isInteger(k) || k < 1) return toast.error("请设置每组晋级人数（至少 1 人）");
      if (groupSizeValue !== null && k > groupSizeValue) return toast.error("每组晋级人数不能多于每组人数");
      if (newGroupProblem) return toast.error(newGroupProblem);
    }

    creating = true;
    try {
      await API.createTournament({
        id: generatedId,
        name: trimmedName,
        player_capacity: newCapacity,
        hold_third_place: 0,
        loser_advances: newFormat === "single_elim" && newLoserAdvances ? 1 : 0,
        scheduled_time: newScheduledTime || null,
        game_mode: newGameMode,
        vehicle_pool: newEventPool,
        points_table: newPointsEnabled ? cleanTable(newPointsTable) : null,
        points_season: newPointsEnabled ? newPointsSeason.trim() : null,
        points_kind: newPointsEnabled ? newPointsKind : null,
        points_invite: newPointsEnabled && newPointsInvite,
        // Two-stage: `format` is the group stage, `playoff_format` the playoff.
        format: twoStage ? newGroupFormat : newFormat,
        grand_final_reset:
          (twoStage ? newPlayoffFormat === "double_elim" : newFormat === "double_elim")
            ? newGrandFinalReset
            : false,
        swiss_rounds: manualRounds ? Number(newSwissRounds) : null,
        banpick_enabled: newBanpickEnabled,
        playoff_format: twoStage ? newPlayoffFormat : null,
        swiss_group_size: twoStage ? groupSizeValue : null,
        advance_per_group: twoStage ? Number(newAdvancePerGroup) : null,
      });
      toast.success(
        newScheduledTime
          ? `赛事创建成功！已直接开启报名 (生成 ID: ${generatedId})`
          : `赛事创建成功！(生成 ID: ${generatedId})`,
      );
      newName = "";
      newCapacity = 128;
      newScheduledTime = "";
      newLoserAdvances = false;
      newGameMode = "rb";
      newFormat = "single_elim";
      newGrandFinalReset = true;
      showCreateDialog = false;
      await load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      creating = false;
    }
  }

  // Quick download export for historical tournaments
  async function exportTournament(tId, tName) {
    try {
      const details = await API.getTournament(tId);
      const json = JSON.stringify(details, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `potato-cup-${tId}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`${tName} 数据导出成功`);
    } catch (e) {
      toast.error("导出失败: " + e.message);
    }
  }

  function getStatusStyle(status) {
    return (
      {
        registration: "bg-sky-500/10 text-sky-400 border-sky-500/30",
        voting: "bg-purple-500/10 text-purple-400 border-purple-500/30",
        in_progress: "bg-amber-500/10 text-primary border-primary/30",
        completed: "bg-zinc-500/10 text-zinc-400 border-zinc-500/30",
      }[status] || "bg-zinc-500/10 text-zinc-400"
    );
  }

  function getStatusLabel(status) {
    return (
      {
        registration: "报名中",
        voting: "投票中",
        in_progress: "比赛进行中",
        completed: "已结束",
      }[status] || status
    );
  }

  async function deleteTournament(id, name = id) {
    if (!confirm(`确定删除赛事「${name}」？报名、对阵和比分会一并删除，且无法恢复。`)) return;
    try {
      await API.deleteTournament(id);
      toast.success("已删除");
      await load();
    } catch (e) {
      toast.error("删除失败: " + e.message);
    }
  }

</script>

<!-- Event tags under the title: mode · type · format, then the detail and
     the event ID in muted text. -->
{#snippet eventTags(t)}
  {@const info = eventSummary(t)}
  <div class="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] leading-none">
    <span class="rounded-md border border-border bg-muted/60 px-1.5 py-1 font-mono font-bold text-foreground/80" title={info.modeTitle}>{info.mode}</span>
    {#if info.pool}
      <span class="rounded-md border px-1.5 py-1 font-semibold {POOL_TAG[t.vehicle_pool] || 'border-border bg-muted/60 text-muted-foreground'}">{info.pool}</span>
    {/if}
    <span class="rounded-md border border-border bg-muted/60 px-1.5 py-1 font-semibold text-muted-foreground">{info.format}</span>
    {#if info.detail}
      <span class="text-muted-foreground">{info.detail}</span>
    {/if}
    <span class="font-mono text-[10px] text-muted-foreground/50" title="赛事 ID">#{t.id}</span>
  </div>
{/snippet}

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
              <span>上次比赛：{relativeDay(getTournamentDate(historyTournaments[0]))}</span>
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
          <div
            role="button"
            tabindex="0"
            onclick={() => goto(`/tournament/${encodeURIComponent(t.id)}`)}
            onkeydown={(e) => e.key === 'Enter' && goto(`/tournament/${encodeURIComponent(t.id)}`)}
            class="group flex flex-col md:flex-row md:items-center justify-between p-4.5 hover:bg-muted/40 transition-colors cursor-pointer gap-4"
          >
            <!-- Left: Avatar + Title -->
            <div class="flex items-center gap-4 min-w-0 flex-1">
              <div class="w-10 h-10 rounded-full bg-gradient-to-br {getGradient(t.id)} flex items-center justify-center text-white shrink-0 shadow-sm border border-white/10">
                <TrophyIcon class="w-5 h-5 text-white" />
              </div>
              <div class="min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <h3 class="font-bold text-base text-foreground group-hover:text-primary transition-colors truncate max-w-[280px] sm:max-w-[400px]">
                    {t.name}
                  </h3>
                  <Badge variant="outline" class="text-[9px] px-2 py-0 font-bold uppercase tracking-wider {getStatusStyle(t.status)} shrink-0">
                    {getStatusLabel(t.status)}
                  </Badge>
                </div>
                {@render eventTags(t)}
              </div>
            </div>

            <!-- Right: Time + Players + Action -->
            <div class="flex items-center justify-between md:justify-end gap-6 shrink-0 flex-wrap md:flex-nowrap border-t md:border-t-0 border-border/40 pt-3 md:pt-0">
              <!-- Time Info -->
              <div class="min-w-[205px]">
                {#if t.scheduled_time}
                  <div class="flex items-center gap-1.5 text-primary text-xs font-bold whitespace-nowrap tabular-nums">
                    <ClockIcon class="w-4 h-4 shrink-0 animate-pulse" />
                    <span title={toInstant(t.scheduled_time) ? `北京时间 ${formatInZone(toInstant(t.scheduled_time), "Asia/Shanghai")}（已换算为你的时区）` : undefined}>{startTimeLabel(t.scheduled_time)}</span>
                  </div>
                {:else if t.status === "voting"}
                  <div class="flex items-center gap-1.5 text-purple-400 text-xs font-semibold italic">
                    <ClockIcon class="w-4 h-4 shrink-0" />
                    <span>时间投票进行中...</span>
                  </div>
                {:else}
                  <div class="flex items-center gap-1.5 text-muted-foreground/60 text-xs font-medium italic">
                    <ClockIcon class="w-4 h-4 text-muted-foreground/40 shrink-0" />
                    <span>比赛时间待定...</span>
                  </div>
                {/if}
                <div class="text-[10px] text-muted-foreground/50 mt-1 font-mono">
                  {#if t.scheduled_time}
                    <span class="text-primary/80 font-bold">{countdownLabel(t)}</span>
                    <span class="mx-1">·</span>
                  {/if}
                  创建于 {new Date(t.created_at).toLocaleDateString("zh-CN")}
                </div>
              </div>

              <!-- Players Progress Bar -->
              <div class="flex items-center gap-3 w-[170px]">
                <div
                  class="flex items-center gap-1 text-xs text-muted-foreground font-semibold shrink-0"
                  title={`报名上限 ${t.player_capacity} 人`}
                >
                  <UsersIcon class="w-3.5 h-3.5" />
                  {#if t.status === "voting"}
                    <span>{t.voter_count || 0} 人投票</span>
                  {:else}
                    <span>{t.player_count || 0} / {displayCapacity(t)}</span>
                  {/if}
                </div>
                <div class="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div class="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500"
                    style="width: {Math.min(100, ((t.status === 'voting' ? (t.voter_count || 0) : (t.player_count || 0)) / displayCapacity(t)) * 100)}%"></div>
                </div>
              </div>

              <!-- Action -->
              <div class="flex items-center gap-1.5">
                {#if userState.adminToken}
                  <button
                    type="button"
                    onclick={(e) => { e.stopPropagation(); deleteTournament(t.id, t.name); }}
                    onkeydown={(e) => e.stopPropagation()}
                    class="flex items-center justify-center w-8 h-8 rounded-full text-muted-foreground/50 hover:text-red-500 hover:bg-red-500/10 transition-all sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 cursor-pointer"
                    title="删除赛事"
                    aria-label="删除赛事 {t.name}"
                  >
                    <Trash2Icon class="w-4 h-4" />
                  </button>
                {/if}
                <div class="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground/70 group-hover:text-primary transition-colors">
                  <span>{actionLabel(t)}</span>
                  <div class="flex items-center justify-center w-8 h-8 rounded-full bg-muted/40 group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300">
                    <ArrowRightIcon class="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </div>
              </div>
            </div>
          </div>
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
          {#each [{ id: "", name: "全部", count: historyTournaments.length }, ...VEHICLE_POOLS.map((p) => ({ ...p, count: historyPoolCounts[p.id] }))] as chip (chip.id)}
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
        <div class="divide-y divide-border border border-border bg-card/15 rounded-2xl overflow-hidden shadow-sm">
          {#each shownHistory as t (t.id)}
            <div
              role="button"
              tabindex="0"
              onclick={() => goto(`/tournament/${encodeURIComponent(t.id)}`)}
              onkeydown={(e) => e.key === 'Enter' && goto(`/tournament/${encodeURIComponent(t.id)}`)}
              class="group flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-muted/40 transition-colors cursor-pointer gap-3"
            >
              <!-- Left: Avatar + Title info -->
              <div class="flex items-center gap-3.5 min-w-0 flex-1">
                <div class="w-9 h-9 rounded-full bg-muted/60 border border-border/80 flex items-center justify-center text-muted-foreground shrink-0 shadow-inner">
                  <TrophyIcon class="w-4.5 h-4.5 text-muted-foreground/50" />
                </div>
                <div class="min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <h3 class="font-bold text-sm text-foreground group-hover:text-primary transition-colors truncate max-w-[240px] sm:max-w-[360px]">
                      {t.name}
                    </h3>
                    <Badge variant="outline" class="text-[9px] px-1.5 py-0 bg-zinc-500/10 text-zinc-400 border-zinc-500/20 shrink-0">已完结</Badge>
                  </div>
                  {@render eventTags(t)}
                </div>
              </div>

              <!-- Right: Meta + Buttons -->
              <div class="flex items-center justify-between sm:justify-end gap-4 shrink-0 flex-wrap sm:flex-nowrap border-t sm:border-t-0 border-border/40 pt-2.5 sm:pt-0">
                <div class="text-right sm:text-left">
                  <div class="grid grid-cols-1 sm:grid-cols-[205px_105px_110px] items-center gap-x-3 gap-y-1 text-xs text-muted-foreground/80">
                    <div class="flex items-center sm:justify-start justify-end gap-1 text-primary font-bold whitespace-nowrap tabular-nums">
                      <ClockIcon class="w-3.5 h-3.5 shrink-0" />
                      <span title={toInstant(t.scheduled_time) ? `北京时间 ${formatInZone(toInstant(t.scheduled_time), "Asia/Shanghai")}` : undefined}>{startTimeLabel(t.scheduled_time) || "时间未记录"}</span>
                    </div>
                    <div class="flex items-center sm:justify-start justify-end gap-1 bg-muted/40 border border-border/60 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
                      <UsersIcon class="w-3 h-3 text-muted-foreground/50 shrink-0" />
                      <span>{t.player_count || 0} 人参赛</span>
                    </div>
                    <div class="flex items-center sm:justify-start justify-end gap-1 font-semibold text-zinc-400 whitespace-nowrap">
                      <span class="text-xs">✓</span>
                      <span>{relativeDay(getTournamentDate(t))}完赛</span>
                    </div>
                  </div>
                  <div class="text-[10px] text-muted-foreground/50 mt-1 font-mono">
                    创建于 {new Date(t.created_at).toLocaleDateString("zh-CN")}
                  </div>
                </div>

                <!-- Buttons -->
                <div class="flex items-center gap-2">
                  {#if userState.adminToken}
                  <button
                    type="button"
                    onclick={(e) => { e.stopPropagation(); deleteTournament(t.id, t.name); }}
                    onkeydown={(e) => e.stopPropagation()}
                    class="flex items-center justify-center w-7.5 h-7.5 rounded-full text-muted-foreground/50 hover:text-red-500 hover:bg-red-500/10 transition-all sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 cursor-pointer"
                    title="删除赛事"
                    aria-label="删除赛事 {t.name}"
                  >
                    <Trash2Icon class="w-4 h-4" />
                  </button>
                {/if}
                  <Button
                    variant="outline"
                    size="sm"
                    onclick={(e) => { e.stopPropagation(); exportTournament(t.id, t.name); }}
                    class="text-xs gap-1 px-2.5 h-7.5 hover:bg-secondary cursor-pointer border-border hover:text-foreground">
                    <DownloadIcon class="w-3 h-3" /> 导出
                  </Button>
                  <div class="hidden sm:flex items-center justify-center w-7.5 h-7.5 rounded-full bg-muted/30 group-hover:bg-muted group-hover:text-foreground transition-all duration-300">
                    <ArrowRightIcon class="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</div>

<!-- Create Tournament Dialog -->
<Dialog.Root bind:open={showCreateDialog}>
  <!-- The form scrolls inside the dialog; title and buttons stay in view. -->
  <Dialog.Content class="sm:max-w-[560px] max-h-[90vh] flex flex-col gap-3 bg-card border border-border">
    <Dialog.Header class="shrink-0">
      <Dialog.Title class="text-lg font-bold tracking-tight text-foreground">
        创建新赛事
      </Dialog.Title>
      <Dialog.Description class="text-xs text-muted-foreground">
        填写比赛时间会跳过时间投票，直接开启报名。
      </Dialog.Description>
    </Dialog.Header>
    <div class="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain -mx-4 px-4 py-1">
      {#snippet segmented(options, current, pick, cols = "grid-cols-3")}
        <div class="grid {cols} gap-1 rounded-lg bg-muted/50 p-1">
          {#each options as opt (opt.id)}
            <button
              type="button"
              disabled={opt.disabled}
              onclick={() => pick(opt.id)}
              title={opt.title}
              class="rounded-md px-2 py-1.5 text-xs font-semibold transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-40
                {current === opt.id ? 'bg-background text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:text-foreground'}"
            >
              {opt.label}
              {#if opt.sub}<span class="ml-0.5 text-[10px] font-normal opacity-70">{opt.sub}</span>{/if}
            </button>
          {/each}
        </div>
      {/snippet}

      {#snippet swissRoundsPicker()}
          <div class="space-y-1.5">
            <span class="block text-xs text-foreground/80">轮数</span>
            <div class="flex flex-wrap items-center gap-2">
              <div class="w-40">
                {@render segmented(
                  [{ id: "auto", label: "自动" }, { id: "manual", label: "手动" }],
                  newSwissRoundsMode,
                  (id) => {
                    if (id === "manual" && newSwissRoundsMode === "auto") {
                      newSwissRounds = autoSwissRounds(autoRoundsBasis ?? 8);
                    }
                    newSwissRoundsMode = id;
                  },
                  "grid-cols-2"
                )}
              </div>
              {#if newSwissRoundsMode === "manual"}
                <input
                  id="new-swiss-rounds"
                  type="number"
                  min={MIN_SWISS_ROUNDS}
                  max={MAX_SWISS_ROUNDS}
                  bind:value={newSwissRounds}
                  aria-label="瑞士轮轮数"
                  class="h-8 w-16 rounded-md border border-border bg-background px-2 text-center text-sm text-foreground"
                />
                <span class="text-xs text-muted-foreground">轮</span>
              {:else if autoRoundsBasis}
                <span class="text-xs font-semibold text-primary">每组 {autoRoundsBasis} 人 → {autoSwissRounds(autoRoundsBasis)} 轮</span>
              {:else}
                <span class="text-xs font-semibold text-primary">按开赛人数自动计算</span>
              {/if}
            </div>
            <p class="text-[10px] leading-relaxed text-muted-foreground">
              {#if newSwissRoundsMode === "auto"}
                自动 = 单循环：每位选手和{autoRoundsBasis ? "同组" : ""}其他所有人各打一场（偶数人打 人数−1 轮，奇数人每人轮空一次、打 人数 轮{autoRoundsBasis ? "" : "；最多 15 轮"}）。
              {:else}
                轮数少于单循环时按积分配对、不重复交手；开赛后也可以在比赛页修改。
              {/if}
              胜 1 分，同分依次比小分净胜、对手分。
              {#if isNewTwoStage}
                开赛时按报名人数蛇形分组，各组打完后由管理员确认进入淘汰赛。
              {/if}
            </p>
          </div>
      {/snippet}

      <!-- Steps -->
      <ol class="flex flex-wrap items-center gap-1.5" aria-label="创建步骤">
        {#each createSteps as step, i (step.id)}
          <li>
            <button
              type="button"
              onclick={() => goToStep(i)}
              aria-current={i === currentStepIndex ? "step" : undefined}
              class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer
                {i === currentStepIndex
                ? 'border-primary bg-primary text-primary-foreground'
                : i < currentStepIndex
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground'}"
            >
              <span class="inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold
                {i === currentStepIndex ? 'bg-primary-foreground/20' : 'bg-muted'}">{i + 1}</span>
              {step.label}
            </button>
          </li>
        {/each}
      </ol>

      {#if currentStepId === "basics"}
      <section class="space-y-3 rounded-xl border border-border/60 bg-background/30 p-3">
        <div class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">基本信息</div>
        <div class="space-y-1.5">
          <label for="create-name-input" class="text-xs font-semibold text-foreground/80">赛事名称</label>
          <Input
            id="create-name-input"
            bind:value={newName}
            placeholder="例如 Potato Cup Weekly #40"
            class="bg-background border-border text-foreground"
          />
        </div>
        <div class="grid grid-cols-[6.5rem_1fr] gap-3">
          <div class="space-y-1.5">
            <label for="create-capacity-input" class="text-xs font-semibold text-foreground/80">人数上限</label>
            <Input
              id="create-capacity-input"
              type="number"
              bind:value={newCapacity}
              min="2"
              max="128"
              class="bg-background border-border text-foreground"
            />
          </div>
          <div class="space-y-1.5">
            <span class="text-xs font-semibold text-foreground/80">比赛模式</span>
            {@render segmented(
              GAME_MODES.map((m) => ({ id: m.id, label: m.code, sub: m.name.replace("模式", ""), title: m.full })),
              newGameMode,
              (id) => (newGameMode = id)
            )}
          </div>
        </div>
        <div class="space-y-1.5">
          <span class="text-xs font-semibold text-foreground/80">比赛类型</span>
          {@render segmented(
            VEHICLE_POOLS.map((p) => ({ id: p.id, label: p.name, title: p.code })),
            newEventPool,
            (id) => (newEventPool = id)
          )}
        </div>
        <div class="space-y-1.5">
          <label for="create-time-input" class="text-xs font-semibold text-foreground/80">
            比赛时间 <span class="font-normal text-muted-foreground">· 可选，设置后跳过时间投票直接开启报名</span>
          </label>
          <DateTimePicker id="create-time-input" bind:value={newScheduledTime} placeholder="不设置（先进行时间投票）" />
        </div>
      </section>

      {:else if currentStepId === "format"}
      <section class="space-y-3 rounded-xl border border-border/60 bg-background/30 p-3">
        <div class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">赛制结构</div>
        <div class="grid grid-cols-2 gap-2">
          {#each [
            { id: "single_elim", label: "单败淘汰", hint: "输一场即出局" },
            { id: "double_elim", label: "双败淘汰", hint: "输两场才出局，含总决赛" },
            { id: "swiss", label: "瑞士轮", hint: "积分制，积分榜第一夺冠" },
            { id: "two_stage", label: "小组赛 + 淘汰赛", hint: "分两个阶段，分别设置" },
          ] as opt (opt.id)}
            <button
              type="button"
              onclick={() => (newFormat = opt.id)}
              class="rounded-lg border px-2.5 py-2 text-left transition-colors cursor-pointer
                {newFormat === opt.id ? 'border-primary bg-primary/10 ring-1 ring-primary/30' : 'border-border hover:border-foreground/40'}"
            >
              <div class="text-xs font-bold text-foreground">{opt.label}</div>
              <div class="text-[10px] text-muted-foreground">{opt.hint}</div>
            </button>
          {/each}
        </div>

        {#if newFormat === "single_elim"}
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-xs text-foreground/80">晋级规则</span>
            <div class="w-44">
              {@render segmented(
                [{ id: "winner", label: "胜者晋级" }, { id: "loser", label: "败者晋级" }],
                newLoserAdvances ? "loser" : "winner",
                (id) => (newLoserAdvances = id === "loser"),
                "grid-cols-2"
              )}
            </div>
            {#if newLoserAdvances}
              <span class="text-[10px] text-amber-600 dark:text-amber-400">特殊玩法：每场的败者晋级</span>
            {/if}
          </div>
        {:else if newFormat === "double_elim"}
          <label class="flex items-start gap-2 text-xs text-foreground/80 cursor-pointer">
            <input type="checkbox" bind:checked={newGrandFinalReset} class="accent-primary mt-0.5" />
            <span>总决赛重置 <span class="text-muted-foreground">· 败者组冠军赢下首场后加赛一场；至少 4 人</span></span>
          </label>
        {:else if newFormat === "swiss"}
          {@render swissRoundsPicker()}
        {:else}
          <p class="text-[11px] leading-relaxed text-muted-foreground">
            第一阶段分组比赛，各组前几名进入第二阶段淘汰赛。点「下一步」分别设置两个阶段。
          </p>
        {/if}
      </section>

      {:else if currentStepId === "group"}
      <section class="space-y-3 rounded-xl border border-border/60 bg-background/30 p-3">
        <div class="flex items-center justify-between gap-2">
          <div class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">第一阶段 · 小组赛</div>
          <span class="text-[10px] text-muted-foreground">开赛时按种子蛇形分组</span>
        </div>
        <div class="space-y-1.5">
          <span class="block text-xs text-foreground/80">小组赛赛制</span>
          {@render segmented(
            GROUP_FORMATS.map((f) => ({ id: f.id, label: f.label, title: f.hint })),
            newGroupFormat,
            (id) => (newGroupFormat = id)
          )}
          <p class="text-[10px] text-muted-foreground">
            {GROUP_FORMATS.find((f) => f.id === newGroupFormat)?.hint}
            {#if newGroupFormat === "double_elim"}
              ；每组晋级 2 人 = 胜者组冠军 + 败者组冠军（可选 2、3、4、8 人）
            {:else if newGroupFormat === "single_elim"}
              ；晋级 3 人及以上时加打三四名决赛
            {/if}
          </p>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <label class="space-y-1.5" for="new-group-size">
            <span class="block text-xs text-foreground/80">每组人数</span>
            <input id="new-group-size" type="number" min="2" max="64" placeholder={newGroupFormat === "swiss" ? "不分组" : "必填"} bind:value={newGroupSize}
              class="h-8 w-24 rounded-md border border-border bg-background px-2 text-center text-sm text-foreground" />
          </label>
          <label class="space-y-1.5" for="new-advance">
            <span class="block text-xs text-foreground/80">每组晋级</span>
            <input id="new-advance" type="number" min="1" max="64" bind:value={newAdvancePerGroup}
              class="h-8 w-24 rounded-md border border-border bg-background px-2 text-center text-sm text-foreground" />
          </label>
        </div>
        {#if newGroupProblem}
          <p class="text-[11px] font-semibold text-amber-600 dark:text-amber-400">⚠ {newGroupProblem}</p>
        {:else if groupPreview}
          <p class="rounded-lg bg-muted/40 px-2.5 py-1.5 text-[11px] text-foreground/80">
            若报满 {groupPreview.players} 人：分 {groupPreview.groups} 组（每组 {groupPreview.smallest === groupPreview.largest ? groupPreview.smallest : `${groupPreview.smallest}–${groupPreview.largest}`} 人），共 <b>{groupPreview.qualifiers}</b> 人进入淘汰赛。
          </p>
        {/if}
        {#if newGroupFormat === "swiss"}
          {@render swissRoundsPicker()}
        {:else}
          <p class="text-[10px] leading-relaxed text-muted-foreground">
            每组各打一个{newGroupFormat === "double_elim" ? "双败（组内不打总决赛）" : "单败"}对阵，各组独立进行。
          </p>
        {/if}
      </section>

      {:else if currentStepId === "playoff"}
      <section class="space-y-3 rounded-xl border border-border/60 bg-background/30 p-3">
        <div class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">第二阶段 · 淘汰赛</div>
        <div class="space-y-1.5">
          <span class="block text-xs text-foreground/80">淘汰赛赛制</span>
          {@render segmented(
            PLAYOFF_FORMATS.map((f) => ({ id: f.id, label: f.label })),
            newPlayoffFormat,
            (id) => (newPlayoffFormat = id),
            "grid-cols-2"
          )}
        </div>
        {#if newPlayoffFormat === "double_elim"}
          <label class="flex items-start gap-2 text-xs text-foreground/80 cursor-pointer">
            <input type="checkbox" bind:checked={newGrandFinalReset} class="accent-primary mt-0.5" />
            <span>总决赛重置 <span class="text-muted-foreground">· 败者组冠军赢下首场后加赛一场</span></span>
          </label>
        {/if}
        {#if groupPreview}
          <p class="rounded-lg bg-muted/40 px-2.5 py-1.5 text-[11px] text-foreground/80">
            若报满 {groupPreview.players} 人：{groupPreview.qualifiers} 人进入{newPlayoffFormat === "double_elim" ? "双败" : "单败"}淘汰赛{groupPreview.byes ? `，前 ${groupPreview.byes} 号种子首轮轮空` : ""}{newPlayoffFormat === "double_elim" && groupPreview.qualifiers < 4 ? "（双败至少需要 4 人，请增加每组晋级人数）" : ""}。
          </p>
        {/if}
        <p class="text-[10px] leading-relaxed text-muted-foreground">
          所有小组打完后由管理员确认晋级名单进入淘汰赛：种子先按小组名次排（各组第一，再各组第二……），同组选手首轮尽量分开。
        </p>
      </section>

      {:else}
      <section class="space-y-2 rounded-xl border border-border/60 bg-background/30 p-3">
        <div class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Ban / Pick</div>
        <label class="flex items-center gap-2 text-xs text-foreground/80 cursor-pointer">
          <input type="checkbox" bind:checked={newBanpickEnabled} class="accent-primary" />
          启用 Ban / Pick
        </label>
        <p class="text-[10px] text-muted-foreground">
          {newBanpickEnabled
            ? `每张对阵卡片上显示 BP 按钮，使用${vehiclePoolLabel(newEventPool)}载具池禁用和抽取。`
            : "不启用时比赛仍按上一步选的比赛类型分类统计。"}
        </p>
      </section>

      <section class="space-y-2 rounded-xl border border-border/60 bg-background/30 p-3">
        <div class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">年度积分榜</div>
        <label class="flex items-center gap-2 text-xs text-foreground/80 cursor-pointer">
          <input type="checkbox" bind:checked={newPointsEnabled} class="accent-primary" />
          计入土豆杯积分榜
        </label>
        {#if newPointsEnabled}
          <PointsEditor bind:table={newPointsTable} bind:season={newPointsSeason} bind:kind={newPointsKind} bind:invite={newPointsInvite} />
        {/if}
      </section>

      <section class="space-y-1.5 rounded-xl border border-border/60 bg-background/30 p-3 text-xs">
        <div class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">确认</div>
        <dl class="grid grid-cols-[5.5rem_1fr] gap-x-2 gap-y-1">
          <dt class="text-muted-foreground">名称</dt><dd class="font-semibold text-foreground break-all">{newName.trim() || "—"}</dd>
          <dt class="text-muted-foreground">人数 / 模式</dt><dd class="text-foreground">{newCapacity} 人 · {gameModeLabel(newGameMode)}</dd>
          <dt class="text-muted-foreground">比赛时间</dt><dd class="text-foreground">{newScheduledTime || "先进行时间投票"}</dd>
          {#if isNewTwoStage}
            <dt class="text-muted-foreground">第一阶段</dt>
            <dd class="text-foreground">{GROUP_FORMATS.find((f) => f.id === newGroupFormat)?.label}小组 · {newGroupSize ? `每组 ${newGroupSize} 人` : "不分组"} · 每组前 {newAdvancePerGroup} 名晋级{newGroupFormat === "swiss" ? ` · ${newSwissRoundsMode === "auto" ? "单循环" : `${newSwissRounds} 轮`}` : ""}</dd>
            <dt class="text-muted-foreground">第二阶段</dt>
            <dd class="text-foreground">{newPlayoffFormat === "double_elim" ? `双败淘汰${newGrandFinalReset ? " · 总决赛重置" : ""}` : "单败淘汰"}</dd>
          {:else}
            <dt class="text-muted-foreground">赛制</dt>
            <dd class="text-foreground">
              {#if newFormat === "single_elim"}单败淘汰 · {newLoserAdvances ? "败者晋级" : "胜者晋级"}
              {:else if newFormat === "double_elim"}双败淘汰{newGrandFinalReset ? " · 总决赛重置" : ""}
              {:else}瑞士轮 · {newSwissRoundsMode === "auto" ? "单循环" : `${newSwissRounds} 轮`}{/if}
            </dd>
          {/if}
          <dt class="text-muted-foreground">比赛类型</dt><dd class="text-foreground">{vehiclePoolLabel(newEventPool)}</dd>
          <dt class="text-muted-foreground">年度积分榜</dt>
          <dd class="text-foreground">{newPointsEnabled ? `${newPointsSeason} 赛季 · ${newPointsKind === "monthly" ? "月赛" : "周赛"}${newPointsInvite ? " · 冠军直邀" : ""} · ${cleanTable(newPointsTable).map((r) => `${r.from === r.to ? r.from : `${r.from}-${r.to}`}:${r.points}`).join(" ")}` : "不计入"}</dd>
          <dt class="text-muted-foreground">Ban / Pick</dt><dd class="text-foreground">{newBanpickEnabled ? "启用" : "不启用"}</dd>
        </dl>
      </section>
      {/if}
    </div>
    <Dialog.Footer class="shrink-0 flex flex-col sm:flex-row gap-2">
      {#if currentStepError && !isLastStep && triedStep === currentStepIndex}
        <span class="text-[11px] text-amber-600 dark:text-amber-400 sm:mr-auto self-center">{currentStepError}</span>
      {/if}
      <Button
        variant="outline"
        size="sm"
        onclick={() => (currentStepIndex === 0 ? (showCreateDialog = false) : (createStep = currentStepIndex - 1))}
        disabled={creating}
        class="w-full sm:w-auto text-xs"
      >
        {currentStepIndex === 0 ? "取消" : "上一步"}
      </Button>
      {#if isLastStep}
        <Button
          size="sm"
          onclick={createTournament}
          disabled={creating}
          class="w-full sm:w-auto text-xs font-bold"
        >
          {#if creating}创建中...{:else}创建赛事{/if}
        </Button>
      {:else}
        <Button
          size="sm"
          onclick={() => goToStep(currentStepIndex + 1)}
          class="w-full sm:w-auto text-xs font-bold"
        >
          下一步
        </Button>
      {/if}
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
