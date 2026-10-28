<script>
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import { API } from "$lib/api.js";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { userState } from "$lib/user.svelte.js";
  import { eliminationStandings } from "$lib/standings.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import {
    bracketRoundLabel,
    bracketRoundTotal,
    buildMatchOrder,
    maxRound,
    roundLabel,
  } from "$lib/bracket.js";
  import DoubleElimBracket from "$lib/components/DoubleElimBracket.svelte";
  import SwissView from "$lib/components/SwissView.svelte";
  import PlayoffPanel from "$lib/components/PlayoffPanel.svelte";
  import VoteBoard from "$lib/components/tournament/VoteBoard.svelte";
  import VoteProposals from "$lib/components/tournament/VoteProposals.svelte";
  import { formatVoteTime, suggestedVoteTimes, voteOptionsFrom } from "$lib/votes.js";
  import RegistrationCard from "$lib/components/tournament/RegistrationCard.svelte";
  import SeedingCard from "$lib/components/tournament/SeedingCard.svelte";
  import EventHeader from "$lib/components/tournament/EventHeader.svelte";
  import StatusControls from "$lib/components/tournament/StatusControls.svelte";
  import PhaseStepper from "$lib/components/tournament/PhaseStepper.svelte";
  import MatchResultDialog from "$lib/components/tournament/MatchResultDialog.svelte";
  import SingleElimBracket from "$lib/components/tournament/SingleElimBracket.svelte";
  import ResultsPanel from "$lib/components/tournament/ResultsPanel.svelte";
  import RosterCard from "$lib/components/tournament/RosterCard.svelte";
  import ObsControlCard from "$lib/components/tournament/ObsControlCard.svelte";
  import StreamChecklistDialog from "$lib/components/tournament/StreamChecklistDialog.svelte";
  import NextMatchDialog from "$lib/components/tournament/NextMatchDialog.svelte";
  import WikiExportDialog from "$lib/components/tournament/WikiExportDialog.svelte";
  import TimeEditDialog from "$lib/components/tournament/TimeEditDialog.svelte";
  import FinalTimeDialog from "$lib/components/tournament/FinalTimeDialog.svelte";
  import PlayerEditDialog from "$lib/components/tournament/PlayerEditDialog.svelte";
  import { formatScheduled, parseLocal } from "$lib/datetime.js";
  import { initialBanPick } from "$lib/banpick.js";
  import { resolveTemplate } from "$lib/vehicle-pools.js";
  import { copyText } from "$lib/clipboard.js";
  import { overlayStages, pickStage } from "$lib/overlay.js";
  import {
    canCorrectResult,
    isValidSwissRounds,
    MAX_SWISS_ROUNDS,
    MIN_SWISS_ROUNDS,
    startBlockedMessage,
    groupLabel,
    eventFormatLabel,
    GROUP_FORMATS,
    GROUP_STAGE_BRACKETS,
  } from "$lib/tournament.js";
  import GroupBracketsView from "$lib/components/GroupBracketsView.svelte";
  import { buildContact, parseContact } from "$lib/contact.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";

  import TrophyIcon from "@lucide/svelte/icons/trophy";
  import ClockIcon from "@lucide/svelte/icons/clock";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";

  let tid = $derived(page.params.id);
  let tournament = $state(null);
  // Two-stage events: a group stage (Swiss, or single-/double-elimination
  // brackets per group; `format` says which), then an elimination playoff
  // (`playoff_format`). The elimination views and placements only ever see
  // playoff matches.
  let isTwoStage = $derived(Boolean(tournament?.playoff_format));
  let inPlayoffs = $derived(isTwoStage && tournament?.current_stage === "playoff");
  let bracketMatches = $derived(
    (tournament?.matches || []).filter((m) =>
      isTwoStage
        ? !GROUP_STAGE_BRACKETS.includes(m.bracket)
        : tournament?.format !== "swiss" ? m.bracket !== "sw" : true,
    ),
  );
  // Group stage played as brackets (not Swiss).
  let hasGroupBrackets = $derived(isTwoStage && tournament?.format !== "swiss");
  let groupStageMatches = $derived(
    (tournament?.matches || []).filter((m) => GROUP_STAGE_BRACKETS.includes(m.bracket)),
  );
  let groupFormatLabel = $derived(
    GROUP_FORMATS.find((f) => f.id === tournament?.format)?.label || "瑞士轮",
  );
  // Overlay round controls need a non-empty list even before a playoff exists.
  let overlayMatches = $derived(bracketMatches.length ? bracketMatches : tournament?.matches || []);
  // Stages the overlay can show (as the overlay picks them): the group stage
  // until the playoff starts, then the playoff; one round of one bracket each.
  let overlayStageList = $derived(
    overlayStages(
      (tournament?.matches || []).filter((m) =>
        tournament?.playoff_format
          ? (tournament?.current_stage === "playoff") === !GROUP_STAGE_BRACKETS.includes(m.bracket)
          : true,
      ),
    ),
  );
  let overlayShownStage = $derived(
    pickStage(overlayStageList, tournament?.overlay_stage || null),
  );
  let stageView = $state(null); // "group" | "playoff"; null follows the current stage
  // Before the playoff exists only the group stage can be shown.
  let shownStage = $derived(inPlayoffs ? stageView || "playoff" : "group");
  let playoffBusy = $state(false);
  let totalRounds = $derived(maxRound(bracketMatches || []));
  let matchOrder = $derived(buildMatchOrder(tournament?.matches || []));
  // The elimination bracket shown outside the group stage.
  let isDoubleElim = $derived(
    isTwoStage ? tournament?.playoff_format === "double_elim" : tournament?.format === "double_elim",
  );
  let isSwiss = $derived(tournament?.format === "swiss");
  let banpickEnabled = $derived(tournament?.banpick_enabled !== false);
  // Vehicle pool templates (loaded on mount); Ban / Pick uses the one picked
  // for the event, else the best match for its type and game mode.
  let vehicleTemplates = $state([]);
  let bpTemplate = $derived(resolveTemplate(vehicleTemplates, tournament || {}));
  let swissRoundsLabel = $derived(
    tournament?.swiss_rounds_auto
      ? `${tournament?.swiss_rounds_effective ?? "?"} 轮（自动单循环）`
      : `${tournament?.swiss_rounds ?? "?"} 轮`,
  );
  let registeredCount = $derived(tournament?.players?.length || 0);
  let startBlocked = $derived(
    startBlockedMessage(tournament?.format, registeredCount, tournament?.swiss_rounds, isTwoStage ? {
      groupSize: tournament?.swiss_group_size,
      perGroup: tournament?.advance_per_group,
      playoffFormat: tournament?.playoff_format,
    } : null),
  );
  let canStartTournament = $derived(!startBlocked);
  let wbTotalRounds = $derived(
    bracketRoundTotal(bracketMatches || [], "wb"),
  );
  let lbTotalRounds = $derived(
    bracketRoundTotal(bracketMatches || [], "lb"),
  );
  let grandFinalMatches = $derived(
    (bracketMatches || [])
      .filter((m) => m.bracket === "gf")
      .sort((a, b) => a.position - b.position),
  );
  let allPlayers = $state([]);
  let playTimes = $state(null);
  let voteWeekOffset = $state(0);
  let loading = $state(true);
  let isAdmin = $derived(!!userState.adminToken);

  // Derived unregistered players list for quick registration select
  let unregisteredPlayers = $derived(
    allPlayers.filter(
      (ap) => !(tournament?.players || []).some((tp) => tp.id === ap.id),
    ),
  );

  function ensureAdmin() {
    if (isAdmin) return true;
    toast.error("此操作需要管理员权限，请先点击右上角盾牌图标登录");
    return false;
  }


  // Player Editing states
  let showPlayerEditDialog = $state(false);
  let editingPlayerId = $state("");
  let editPlayerNewId = $state("");
  let editPlayerFlag = $state("cn");
  let editPlayerTeam = $state("");
  let editPlayerContactBase = $state({});
  let editPlayerQQ = $state("");
  let editPlayerDiscord = $state("");
  let editPlayerLink = $state("");


  // Wiki generation states
  let showWikiDialog = $state(false);
  let generatedWikiText = $state("");
  let loadingWiki = $state(false);

  // Registration states
  let seedOrder = $state([]);
  // Intro link stage; "" = whatever stage is current.

  // Modal for match results
  let showMatchDialog = $state(false);
  let reportStep = $state("banpick");
  // True while an admin is correcting a match that already has a result.
  let correctingMatch = $state(false);
  // Ban/Pick progress for the match it was started on.
  let bpState = $state(initialBanPick());
  let bpMatchId = $state(null);
  let score1Input = $state(0);
  let score2Input = $state(0);
  let selectedMatch = $state(null);
  let resultScore1 = $state(0);
  let resultScore2 = $state(0);
  let submittingResult = $state(false);

  // Modal for selecting final time
  let showStatusTimeDialog = $state(false);
  // Admin: move the match time after registration opened.
  let showTimeEditDialog = $state(false);
  let timeEditValue = $state("");
  let savingTime = $state(false);
  let selectedFinalTime = $state("");

  // Next-match hand-off enforcement: force choosing the next live match, then auto-switch to ingame HUD
  let nextMatchModalOpen = $state(false);
  let autoHudActive = $state(false);
  let autoHudSeconds = $state(60);
  let autoHudTimer = null;
  const AUTO_HUD_DELAY = 60;
  const AUTO_HUD_EXTEND = 30;

  // "Going live" mode: only this browser forces the next-match flow, so other viewers are unaffected
  let streamMode = $state(
    isAdmin &&
      typeof window !== "undefined" &&
      localStorage.getItem("suck_stream_mode") === "1",
  );
  let showStreamChecklist = $state(false);
  // Suggested times (moved by "顺延一周") merged with the votes cast.
  let voteOptions = $derived(
    voteOptionsFrom(tournament?.votes || [], suggestedVoteTimes(playTimes, voteWeekOffset)),
  );

  // Derived properties for stages
  let isRegistered = $derived(
    tournament?.players?.some((p) => p.id === userState.id),
  );

  // The active match only counts as live if it is still pending
  let liveActiveMatch = $derived.by(() => {
    const activeId = tournament?.active_match_id;
    if (!activeId) return null;
    const m = tournament?.matches?.find((x) => x.id === activeId);
    return m && m.status === "pending" ? m : null;
  });

  // Candidate matches the operator can hand off to
  let nextMatchCandidates = $derived.by(() => {
    if (!tournament?.matches?.length) return [];
    return [...tournament.matches]
      .filter((m) => m.status === "pending" && m.player1_id && m.player2_id)
      .sort((a, b) => (matchOrder.get(a.id) ?? 0) - (matchOrder.get(b.id) ?? 0));
  });

  // In "going live" mode, in progress with no live match => operator must choose the next match
  let needsNextMatch = $derived(
    streamMode &&
      tournament?.status === "in_progress" &&
      !liveActiveMatch &&
      nextMatchCandidates.length > 0,
  );

  function currentOverlayRound() {
    return (
      tournament?.overlay_round ||
      Math.max(...(overlayMatches?.map((m) => m.round) || [1]))
    );
  }

  function clearAutoHudTimer() {
    if (autoHudTimer) {
      clearInterval(autoHudTimer);
      autoHudTimer = null;
    }
    autoHudActive = false;
  }

  async function switchOverlayToHud() {
    if (!ensureAdmin()) return;
    try {
      await API.setOverlayState(tid, "ingame", currentOverlayRound());
      toast.success("已自动切换大屏到游戏内 HUD 场景");
    } catch (e) {
      toast.error("自动切换大屏场景失败: " + e.message);
    }
  }

  // Keep showing the bracket while waiting for the game to start
  async function showHybridScene() {
    if (!ensureAdmin()) return;
    try {
      await API.setOverlayState(tid, "hybrid", currentOverlayRound());
    } catch (e) {
      toast.error("切换大屏到场间场景失败: " + e.message);
    }
  }

  function startAutoHudCountdown() {
    clearAutoHudTimer();
    autoHudSeconds = AUTO_HUD_DELAY;
    autoHudActive = true;
    autoHudTimer = setInterval(() => {
      autoHudSeconds -= 1;
      if (autoHudSeconds <= 0) {
        clearAutoHudTimer();
        switchOverlayToHud();
      }
    }, 1000);
  }

  function postponeAutoHud() {
    if (!autoHudActive) return;
    autoHudSeconds += AUTO_HUD_EXTEND;
    toast.info(`已延后 ${AUTO_HUD_EXTEND} 秒切换到大屏 HUD`);
  }

  async function chooseNextMatch(matchId) {
    if (!ensureAdmin()) return;
    try {
      // Keep the bracket on screen first, then mark the match live so the overlay never flashes ingame
      await showHybridScene();
      await API.setActiveMatch(tid, matchId);
      nextMatchModalOpen = false;
      toast.success("已选择当前直播对局，倒计时结束后切换到大屏游戏内 HUD");
      startAutoHudCountdown();
      await load();
    } catch (e) {
      toast.error("选择直播对局失败: " + e.message);
    }
  }

  function requestStreamMode() {
    showStreamChecklist = true;
  }

  // Called by the checklist once every item is ticked.
  function confirmStreamMode() {
    streamMode = true;
    if (typeof window !== "undefined") {
      localStorage.setItem("suck_stream_mode", "1");
    }
    toast.success("已激活直播状态，将强制选择下一场直播对局");
  }

  function disableStreamMode() {
    streamMode = false;
    if (typeof window !== "undefined") {
      localStorage.setItem("suck_stream_mode", "0");
    }
    clearAutoHudTimer();
    nextMatchModalOpen = false;
    toast.info("已结束直播状态");
  }

  // When a hand-off is required, force the blocking modal open and cancel any stale countdown
  $effect(() => {
    if (needsNextMatch && isAdmin) {
      clearAutoHudTimer();
      nextMatchModalOpen = true;
    } else {
      nextMatchModalOpen = false;
    }
  });

  // Clean up the countdown timer when leaving the page
  $effect(() => () => clearAutoHudTimer());

  onMount(load);
  onMount(() => {
    API.getVehiclePools()
      .then((res) => (vehicleTemplates = res.templates || []))
      .catch((e) => console.warn("vehicle pools failed to load:", e));
  });

  let eventSource = null;
  $effect(() => {
    if (!tid) return;
    const es = new EventSource(`/api/tournaments/${tid}/stream`);
    eventSource = es;

    es.onmessage = async (event) => {
      try {
        JSON.parse(event.data); // malformed messages are skipped below
        const updated = await API.getTournament(tid);
        tournament = updated;
        initializeSeedOrder();
      } catch (e) {
        console.error("解析实时事件失败", e);
      }
    };

    es.onerror = (e) => {
      console.warn("实时推送连接发生错误，正在尝试重连...", e);
    };

    return () => {
      es.close();
    };
  });

  let loadedTournamentId = null;

  async function load() {
    // Only show the full-page loading state on the first load (or when the
    // route switches to another tournament). Refreshes after a vote,
    // registration or SSE event must keep the page mounted.
    const isInitial = !tournament || loadedTournamentId !== tid;
    if (isInitial) loading = true;
    try {
      tournament = await API.getTournament(tid);
      loadedTournamentId = tid;
      if (isInitial && !playTimes) {
        API.getPlayTimes()
          .then((times) => (playTimes = times))
          .catch((e) => console.warn("load play times failed:", e));
      }
      allPlayers = await API.listPlayers();
      initializeSeedOrder();

      // Auto-generate/refresh bracket preview on page load in registration phase
      if (
        isAdmin &&
        tournament.status === "registration" &&
        tournament.players?.length >=
          (tournament.format === "double_elim" ? 4 : 2)
      ) {
        const matches = await API.generateBracket(tid);
        tournament = { ...tournament, matches };
      }
    } catch (e) {
      toast.error("加载赛事详情失败: " + e.message);
    } finally {
      if (isInitial) loading = false;
    }
  }

  function initializeSeedOrder() {
    if (!tournament?.players) return;
    const sortedPlayers = [...tournament.players].sort((a, b) => {
      const aSeed = a.seed !== null && a.seed !== undefined ? a.seed : 999999;
      const bSeed = b.seed !== null && b.seed !== undefined ? b.seed : 999999;
      if (aSeed !== bSeed) return aSeed - bSeed;
      return new Date(a.registered_at) - new Date(b.registered_at);
    });
    seedOrder = sortedPlayers.map((p) => p.id);
  }

  async function changeStatus(status) {
    if (!ensureAdmin()) return;
    try {
      tournament = await API.updateStatus(tid, status);
      toast.success(`赛事状态已切换至: ${statusLabel(status)}`);
      await load();
    } catch (e) {
      toast.error(e.message);
    }
  }

  // "结束投票并开启报名": preselect the most voted future time.
  function openEndVoting() {
    if (!userState.qqGroup || !userState.id) {
      toast.error("此操作需要先填写 QQ / Discord 联系方式与选手 ID。已为您打开配置面板！");
      document.getElementById("header-profile-button")?.click();
      return;
    }
    const future = voteOptions.filter((opt) => new Date(opt.proposed_time).getTime() >= Date.now());
    const top = [...future].sort((a, b) => b.count - a.count)[0];
    selectedFinalTime = top ? formatVoteTime(top.proposed_time) : "";
    showStatusTimeDialog = true;
  }

  async function confirmEndVoting() {
    if (!ensureAdmin()) return;
    if (!selectedFinalTime.trim()) {
      return toast.error("请选择或输入确定的比赛时间");
    }
    try {
      const res = await API.updateStatus(
        tid,
        "registration",
        selectedFinalTime.trim(),
      );
      tournament = res;
      const autoCount = res.auto_registered?.length || 0;
      toast.success(
        `赛事已开启报名，比赛时间已定为: ${selectedFinalTime}` +
          (autoCount > 0 ? `，已自动报名 ${autoCount} 名投票选手` : ""),
      );
      showStatusTimeDialog = false;
      await load();
    } catch (e) {
      toast.error(e.message);
    }
  }

  // Registration
  // targetId: another player (admins); "" registers the visitor. Resolves
  // to true once registered.
  async function doRegister(targetId = "") {
    targetId = String(targetId || "").trim();
    if (targetId && targetId !== userState.id && !ensureAdmin()) return;
    if (!targetId && (!userState.qqGroup || !userState.id)) {
      toast.error("此操作需要先填写 QQ / Discord 联系方式与选手 ID。已为您打开配置面板！");
      document.getElementById("header-profile-button")?.click();
      return;
    }
    const id = targetId || userState.id;
    if (!id) return toast.error("请输入选手 ID");
    try {
      const players = await API.register(tid, id);
      tournament = { ...tournament, players };
      toast.success(`选手 ${id} 报名成功`);
      await load();

      // Auto-update bracket preview (admin only; server rejects it for other users)
      if (
        isAdmin &&
        tournament.players?.length >=
          (tournament.format === "double_elim" ? 4 : 2)
      ) {
        const matches = await API.generateBracket(tid);
        tournament = { ...tournament, matches };
      }
      return true;
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function doBatchRegister(ids = []) {
    if (!ensureAdmin()) return;
    if (ids.length === 0) return toast.error("请先选择选手");
    let ok = 0;
    const errors = [];
    for (const id of ids) {
      try {
        await API.register(tid, id);
        ok += 1;
      } catch (e) {
        errors.push(`${id}: ${e.message}`);
      }
    }
    await load();
    if (
      (tournament.players?.length || 0) >=
      (tournament.format === "double_elim" ? 4 : 2)
    ) {
      try {
        const matches = await API.generateBracket(tid);
        tournament = { ...tournament, matches };
      } catch (e) {
        console.warn("bracket regeneration failed:", e);
      }
    }
    if (ok > 0) toast.success(`已批量报名 ${ok} 人`);
    if (errors.length > 0) toast.error(errors[0]);
  }

  async function doUnregister(pid) {
    if (pid !== userState.id) {
      if (!ensureAdmin()) return;
    } else if (!userState.qqGroup || !userState.id) {
      toast.error("此操作需要先填写 QQ / Discord 联系方式与选手 ID。已为您打开配置面板！");
      document.getElementById("header-profile-button")?.click();
      return;
    }
    try {
      await API.unregister(tid, pid);
      toast.success(`选手 ${pid} 已取消报名`);
      await load();

      // Auto-update bracket preview (admin only)
      if (
        isAdmin &&
        tournament.players?.length >=
          (tournament.format === "double_elim" ? 4 : 2)
      ) {
        const matches = await API.generateBracket(tid);
        tournament = { ...tournament, matches };
      } else if (!isAdmin) {
        tournament = { ...tournament, matches: [] };
      }
    } catch (e) {
      toast.error(e.message);
    }
  }

  // Seeding setup
  async function autoSeed() {
    if (!ensureAdmin()) return;
    try {
      await API.autoSeeds(tid);
      await load();
      toast.success("已按天梯 MMR 自动重排种子");
    } catch (e) {
      toast.error("自动排序失败: " + e.message);
    }
  }

  async function randomizeSeed() {
    if (!ensureAdmin()) return;
    if (!confirm("随机微调会打乱 MMR 相近的选手（保留前 2 和后 2 名），继续？")) return;
    try {
      await API.randomizeSeeds(tid, { band: 80, keep_top: 2, keep_bottom: 2 });
      await load();
      toast.success("已在相近分段内随机微调种子");
    } catch (e) {
      toast.error("随机微调失败: " + e.message);
    }
  }

  async function moveSeed(idx, dir) {
    if (!ensureAdmin()) return;
    const target = idx + dir;
    if (target < 0 || target >= seedOrder.length) return;
    [seedOrder[idx], seedOrder[target]] = [seedOrder[target], seedOrder[idx]];
    seedOrder = [...seedOrder];

    try {
      await API.setSeeds(tid, seedOrder);
      // Reload so the seed panel keeps the ladder MMR/tier fields and the preview
      // stays in sync with the server-side seed order.
      await load();
    } catch (e) {
      toast.error("保存种子排序失败: " + e.message);
    }
  }

  async function toggleActiveMatch(match) {
    const isActive = tournament?.active_match_id === match.id;
    try {
      await API.setActiveMatch(tid, isActive ? null : match.id);
      tournament = {
        ...tournament,
        active_match_id: isActive ? null : match.id,
      };
      toast.success(isActive ? "已取消直播该场次" : "已开启该场次直播！");
    } catch (err) {
      toast.error("更新直播状态失败: " + err.message);
    }
  }

  // Bracket generation
  async function doGenerateBracket() {
    if (!ensureAdmin()) return;
    try {
      const matches = await API.generateBracket(tid);
      tournament = { ...tournament, matches };
      toast.success(`${eventFormatLabel(tournament)} 对阵已成功生成！`);
      await load();
    } catch (e) {
      toast.error(e.message);
    }
  }

  // Match report modal triggers
  // Match report modal triggers
  // Clicking a card opens the score form; the card's BP button opens Ban/Pick.
  function openMatchReport(match, step = "score") {
    if (bpMatchId !== match.id) {
      bpState = initialBanPick(bpTemplate?.rules);
      bpMatchId = match.id;
    }
    selectedMatch = match;
    correctingMatch = false;
    reportStep = step === "banpick" && banpickEnabled ? "banpick" : "score";
    score1Input = 0;
    score2Input = 0;
    showMatchDialog = true;
  }

  function openBanPick(match) {
    openMatchReport(match, "banpick");
  }

  // Opens the score step pre-filled with the recorded result so an admin can fix it.
  function openMatchCorrection(match) {
    selectedMatch = match;
    correctingMatch = true;
    reportStep = "score";
    score1Input = match.status === "walkover" ? 0 : Number(match.score1) || 0;
    score2Input = match.status === "walkover" ? 0 : Number(match.score2) || 0;
    showMatchDialog = true;
  }

  async function openMatchDetails(match) {
    if (match.status === "pending" && tournament.status !== "completed") {
      openMatchReport(match);
    } else if (isAdmin && canCorrectResult(match)) {
      openMatchCorrection(match);
    }
  }

  async function startPlayoffs() {
    if (!ensureAdmin()) return;
    const q = tournament?.group_stage?.qualifiers?.length || 0;
    const warn = tournament?.group_stage?.warnings?.length
      ? "\n\n注意：晋级线上有同分，由报名种子决定（详见名单上方提示）。"
      : "";
    if (!confirm(`按当前名单生成淘汰赛（${q} 人）？生成后小组赛结果将被锁定。${warn}`)) return;
    playoffBusy = true;
    try {
      await API.startPlayoffs(tid);
      stageView = null;
      toast.success("淘汰赛已生成");
      await load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      playoffBusy = false;
    }
  }

  async function withdrawPlayoffs() {
    if (!ensureAdmin()) return;
    const played = bracketMatches.some(
      (m) => (m.status === "completed" || m.status === "walkover") && m.player1_id && m.player2_id,
    );
    const msg = played
      ? "【警告】淘汰赛已有比赛打完！撤回会删除整个淘汰赛对阵和比分，回到小组赛（可修改小组赛结果）。确定继续吗？"
      : "撤回淘汰赛并回到小组赛？淘汰赛对阵会被删除。";
    if (!confirm(msg)) return;
    playoffBusy = true;
    try {
      await API.withdrawPlayoffs(tid);
      stageView = null;
      toast.success("已撤回淘汰赛，回到小组赛");
      await load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      playoffBusy = false;
    }
  }

  async function editSwissRounds() {
    if (!ensureAdmin()) return;
    const current = tournament?.swiss_rounds ?? "";
    const input = prompt(
      `瑞士轮总轮数（${MIN_SWISS_ROUNDS}-${MAX_SWISS_ROUNDS}）。留空 = 自动（单循环，每人与同组所有人各打一场）。比赛进行中修改时，不能少于当前轮次。`,
      String(current),
    );
    if (input === null) return;
    const trimmed = input.trim();
    const rounds = trimmed === "" ? null : Number(trimmed);
    if (rounds !== null && !isValidSwissRounds(rounds)) {
      toast.error(`轮数必须是 ${MIN_SWISS_ROUNDS}-${MAX_SWISS_ROUNDS} 之间的整数，或留空表示自动`);
      return;
    }
    try {
      await API.setSwissRounds(tid, rounds);
      toast.success(rounds === null ? "瑞士轮轮数已改为自动（单循环）" : `瑞士轮已设为 ${rounds} 轮`);
      await load();
    } catch (e) {
      toast.error(e.message);
    }
  }

  function openTimeEdit() {
    if (!ensureAdmin()) return;
    timeEditValue = parseLocal(tournament?.scheduled_time) ? tournament.scheduled_time : "";
    showTimeEditDialog = true;
  }

  async function saveTimeEdit() {
    if (!parseLocal(timeEditValue)) return toast.error("请选择日期和时间");
    savingTime = true;
    try {
      tournament = await API.updateTournament(tid, { scheduled_time: timeEditValue });
      toast.success(`比赛时间已改为北京时间 ${formatScheduled(timeEditValue)}`);
      showTimeEditDialog = false;
      await load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      savingTime = false;
    }
  }

  function recordedResultLabel(match) {
    if (!match) return "";
    if (match.status === "walkover") return `弃权判定，${playerName(match.winner_id)} 晋级`;
    return `${playerName(match.player1_id)} ${match.score1 ?? 0} : ${match.score2 ?? 0} ${playerName(match.player2_id)}`;
  }

  // A correction first resets this match (and anything it fed into), then the
  // new result is submitted and propagated again. Returns false if cancelled.
  async function prepareCorrection(actionLabel) {
    if (!ensureAdmin()) return false;
    const dependent = checkHasDependentMatchPlayed(selectedMatch);
    const laterSwissRounds =
      selectedMatch.bracket === "sw" && downstreamMatches(selectedMatch).length > 0;
    const msg = laterSwissRounds
      ? dependent
        ? `【警告】瑞士轮后续轮次已经有比赛打完！\n${actionLabel}会删除第 ${selectedMatch.round + 1} 轮及之后的所有对阵和比分，并按新结果重新配对。\n\n确定继续吗？`
        : `${actionLabel}会删除第 ${selectedMatch.round + 1} 轮及之后的对阵（都还没开打），并按新结果重新配对。确定继续吗？`
      : dependent
        ? `【警告】该场比赛的晋级选手已在后续轮次进行了比赛！\n${actionLabel}会先重置本场，后续所有相关比赛的比分与晋级状态都将被清空。\n\n确定继续吗？`
        : `${actionLabel}会先重置本场结果，再按新结果重新晋级。确定继续吗？`;
    if (!confirm(msg)) return false;
    try {
      await API.rollbackResult(tid, selectedMatch.id);
    } catch (err) {
      toast.error("重置原结果失败: " + err.message);
      return false;
    }
    return true;
  }

  async function openWikiExport() {
    loadingWiki = true;
    showWikiDialog = true;
    try {
      const res = await API.getWikiScript(tid);
      generatedWikiText = res.wikiScript;
    } catch (e) {
      toast.error("生成 Wiki 脚本失败: " + e.message);
    }
    loadingWiki = false;
  }

  function copyWikiToClipboard() {
    if (!generatedWikiText) return;
    copyText(generatedWikiText).then((ok) =>
      ok ? toast.success("Wiki 代码已成功复制到剪贴板！") : toast.error("复制失败，请手动选中后复制"),
    );
  }

  function downstreamMatches(match) {
    if (!match || !tournament?.matches) return [];
    // Later Swiss rounds were paired from this result.
    if (match.bracket === "sw") {
      return tournament.matches.filter(
        (x) =>
          x.bracket === "sw" &&
          x.round > match.round &&
          (x.swiss_group ?? null) === (match.swiss_group ?? null),
      );
    }
    const ids = [];
    if (match.next_match_id) ids.push(match.next_match_id);
    if (match.loser_next_match_id) ids.push(match.loser_next_match_id);

    // Legacy single-elimination brackets link implicitly by position.
    if (
      ids.length === 0 &&
      (!match.bracket || match.bracket === "main") &&
      match.round - 1 >= 1
    ) {
      const nextPosition = Math.ceil(match.position / 2);
      const next = tournament.matches.find(
        (x) =>
          x.bracket === "main" &&
          x.round === match.round - 1 &&
          x.position === nextPosition,
      );
      if (next) ids.push(next.id);
    }

    return ids
      .map((id) => tournament.matches.find((x) => x.id === id))
      .filter(Boolean);
  }

  function checkHasDependentMatchPlayed(match) {
    const seen = new Set();

    function check(m) {
      for (const next of downstreamMatches(m)) {
        if (seen.has(next.id)) continue;
        seen.add(next.id);
        if (
          next.status === "completed" ||
          next.status === "walkover" ||
          next.winner_id
        ) {
          return true;
        }
        if (check(next)) return true;
      }
      return false;
    }

    return check(match);
  }

  async function selectGameWinner(winnerId) {
    if (!userState.qqGroup || !userState.id) {
      toast.error("此操作需要先填写 QQ / Discord 联系方式与选手 ID。已为您打开配置面板！");
      document.getElementById("header-profile-button")?.click();
      return;
    }
    if (!selectedMatch) return;

    if (correctingMatch) {
      if (!(await prepareCorrection("修正比分"))) return;
    } else if (checkHasDependentMatchPlayed(selectedMatch)) {
      const confirmMsg = "【警告】该场比赛的晋级选手已在后续轮次进行了比赛！\n修改此场比赛将导致后续所有相关比赛的比分与晋级状态都被清空重置。\n\n确定要继续修改并重置后续比赛吗？";
      if (!confirm(confirmMsg)) return;
      
      try {
        await API.rollbackResult(tid, selectedMatch.id);
      } catch (err) {
        toast.error("重置后续比赛失败: " + err.message);
        return;
      }
    }

    submittingResult = true;

    const score1 = Number(score1Input) || 0;
    const score2 = Number(score2Input) || 0;

    try {
      await API.submitResult(tid, selectedMatch.id, score1, score2);
      if (tournament?.format === "double_elim" || isTwoStage) {
        let destination = "胜者晋级下一轮";
        if (selectedMatch.bracket === "wb" || selectedMatch.bracket === "gwb") {
          destination = "胜者晋级胜者组，败者进入败者组";
        } else if (selectedMatch.bracket === "gf") {
          destination =
            selectedMatch.position === 1 &&
            winnerId === selectedMatch.player2_id &&
            tournament?.grand_final_reset
              ? "败者组冠军赢下首场，将进行重置赛"
              : "总决赛胜者夺冠";
        }
        toast.success(
          `已判定游戏获胜者为 ${playerName(winnerId)}，${destination}`,
        );
      } else {
        const advancerId = winnerId === selectedMatch.player1_id
          ? selectedMatch.player2_id
          : selectedMatch.player1_id;
        const isLoserAdvances = tournament?.loser_advances === 1 || tournament?.loser_advances === true;
        const advancerName = playerName(isLoserAdvances ? advancerId : winnerId);
        toast.success(
          `已判定游戏获胜者为 ${playerName(winnerId)}，${isLoserAdvances ? "败者" : "胜者"} ${advancerName} 晋级`,
        );
      }
      if (isAdmin && tournament && tournament.active_match_id === selectedMatch.id) {
        await API.setActiveMatch(tid, null);
        if (streamMode) await showHybridScene();
      }
      showMatchDialog = false;
      selectedMatch = null;
      await load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      submittingResult = false;
    }
  }

  async function recordWalkover(winnerId) {
    if (!userState.qqGroup || !userState.id) {
      toast.error("此操作需要先填写 QQ / Discord 联系方式与选手 ID。已为您打开配置面板！");
      document.getElementById("header-profile-button")?.click();
      return;
    }
    if (!selectedMatch) return;

    if (correctingMatch) {
      if (!(await prepareCorrection("改判弃权"))) return;
    } else if (checkHasDependentMatchPlayed(selectedMatch)) {
      const confirmMsg = "【警告】该场比赛的晋级选手已在后续轮次进行了比赛！\n判定弃权将导致后续所有相关比赛的比分与晋级状态都被清空重置。\n\n确定要继续修改并重置后续比赛吗？";
      if (!confirm(confirmMsg)) return;
      
      try {
        await API.rollbackResult(tid, selectedMatch.id);
      } catch (err) {
        toast.error("重置后续比赛失败: " + err.message);
        return;
      }
    }

    submittingResult = true;
    try {
      await API.submitWalkover(tid, selectedMatch.id, winnerId);
      toast.success("已记录弃权并晋级胜者");
      if (isAdmin && tournament && tournament.active_match_id === selectedMatch.id) {
        await API.setActiveMatch(tid, null);
        if (streamMode) await showHybridScene();
      }
      showMatchDialog = false;
      selectedMatch = null;
      await load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      submittingResult = false;
    }
  }

  async function doRollback() {
    if (!ensureAdmin()) return;
    if (!selectedMatch) return;

    let confirmMsg = "确定要回滚这场比赛的比分并将其重设为未开始状态吗？";
    if (checkHasDependentMatchPlayed(selectedMatch)) {
      confirmMsg = "【警告】该场比赛的晋级选手已在后续轮次进行了比赛！\n如果确认回滚，后续所有相关的比赛比分与晋级状态都将被清空重置。\n\n确定要继续回滚并重置后续比赛吗？";
    }

    if (!confirm(confirmMsg)) return;

    submittingResult = true;
    try {
      await API.rollbackResult(tid, selectedMatch.id);
      toast.success("比赛已成功回滚并重设");
      showMatchDialog = false;
      selectedMatch = null;
      await load();
    } catch (e) {
      toast.error("回滚失败: " + e.message);
    } finally {
      submittingResult = false;
    }
  }

  function openEditPlayer(p) {
    if (!ensureAdmin()) return;
    editingPlayerId = p.id;
    editPlayerNewId = p.id;
    editPlayerFlag = p.flag || "cn";
    editPlayerTeam = p.team || "";
    editPlayerLink = p.link || "";

    const contact = parseContact(p.battle_tags);
    editPlayerContactBase = contact.base;
    editPlayerQQ = contact.qq;
    editPlayerDiscord = contact.discord;

    showPlayerEditDialog = true;
  }

  async function handleSavePlayer() {
    if (!ensureAdmin()) return;

    try {
      const cleanNewId = editPlayerNewId.trim();
      if (!cleanNewId) {
        toast.error("选手唯一 ID 不能为空");
        return;
      }

      if (cleanNewId !== editingPlayerId) {
        const isMe = (editingPlayerId === userState.id);
        if (isMe) {
          const confirmed = confirm(`修改您的选手 ID 将会同时更新您的登录凭证，确定要修改吗？`);
          if (!confirmed) return;
        }
        toast.loading("正在修改选手唯一 ID 并同步所有关联数据...", {
          id: "player-save",
        });
        await API.renamePlayer(editingPlayerId, cleanNewId);
        if (isMe) {
          userState.setId(cleanNewId);
        }
        editingPlayerId = cleanNewId;
      }

      toast.loading("正在更新选手资料...", { id: "player-save" });
      await API.updatePlayer(editingPlayerId, {
        flag: editPlayerFlag,
        team: editPlayerTeam,
        link: editPlayerLink,
        battle_tags: buildContact(editPlayerContactBase, {
          qq: editPlayerQQ,
          discord: editPlayerDiscord,
        }),
        tournament_id: tid,
      });

      toast.dismiss("player-save");
      toast.success("选手资料更新成功");
      showPlayerEditDialog = false;
      const isMe = (editingPlayerId === userState.id);
      await load();
      if (isMe) {
        setTimeout(() => {
          window.location.reload();
        }, 100);
      }
    } catch (e) {
      toast.dismiss("player-save");
      toast.error("更新资料失败: " + e.message);
    }
  }

  // Helpers
  function playerName(pid, match = null) {
    if (!pid) {
      if (
        match &&
        (!match.bracket || match.bracket === "main") &&
        match.round === totalRounds
      ) {
        return "BYE (轮空)";
      }
      return "TBD";
    }
    const p = tournament?.players?.find((p) => p.id === pid);
    return p?.display_name || pid;
  }

  function rounds() {
    if (!bracketMatches?.length) return [];
    const map = {};
    bracketMatches.forEach((m) => {
      if (m.round === 0) return; // Exclude Third Place Match from main columns
      if (!map[m.round]) map[m.round] = [];
      map[m.round].push(m);
    });
    return Object.entries(map)
      .map(([round, ms]) => ({
        round: parseInt(round),
        matches: ms.sort((a, b) => a.position - b.position),
      }))
      .sort((a, b) => b.round - a.round);
  }

  function matchRoundLabel(match) {
    if (!match) return "";
    if (match.bracket === "sw") {
      return isTwoStage && match.swiss_group
        ? `小组赛 ${groupLabel(match.swiss_group)} 组 第 ${match.round} 轮`
        : `瑞士轮 第 ${match.round} 轮`;
    }
    if (["gse", "gwb", "glb"].includes(match.bracket)) {
      const own = (tournament?.matches || []).filter(
        (x) => x.bracket === match.bracket && (x.swiss_group || 1) === (match.swiss_group || 1),
      );
      const total = Math.max(1, ...own.map((x) => x.round));
      const prefix = `小组赛 ${groupLabel(match.swiss_group)} 组`;
      if (match.bracket === "gse") return `${prefix} ${roundLabel(match.round, total)}`;
      const side = match.bracket === "glb" ? "lb" : "wb";
      if (match.round === 1) return `${prefix} ${side === "lb" ? "败者组" : "胜者组"}出线战`;
      return `${prefix} ${bracketRoundLabel(side, match.round, total)}`;
    }
    if (match.bracket === "wb") {
      return bracketRoundLabel("wb", match.round, wbTotalRounds);
    }
    if (match.bracket === "lb") {
      return bracketRoundLabel("lb", match.round, lbTotalRounds);
    }
    if (match.bracket === "gf") {
      return match.position === 2 ? "总决赛 · 重置" : "总决赛";
    }
    return roundLabel(match.round, totalRounds);
  }

  function statusLabel(s) {
    return (
      {
        registration: "报名中",
        voting: "时间投票",
        in_progress: "比赛进行中",
        completed: "已结束",
      }[s] || s
    );
  }

  // Find the match that decides the title: the grand final (or its reset) for
  // double elimination, the last match of the main bracket otherwise.
  let championshipMatch = $derived.by(() => {
    if (!bracketMatches?.length) return null;
    if (isDoubleElim) {
      const played = grandFinalMatches.filter(
        (m) =>
          (m.status === "completed" || m.status === "walkover") && m.winner_id,
      );
      return played.length ? played[played.length - 1] : grandFinalMatches[0] || null;
    }
    return (
      bracketMatches.find((m) => m.round === 1 && m.position === 1) || null
    );
  });

  // Find overall champion and runner-up
  let podium = $derived.by(() => {
    if (!bracketMatches?.length || tournament.status !== "completed")
      return null;
    if (isSwiss && !isTwoStage) {
      const table = tournament.standings || [];
      if (!table.length) return null;
      return { champion: table[0].player_id, runnerUp: table[1]?.player_id ?? null };
    }
    const finalMatch = championshipMatch;
    if (!finalMatch || finalMatch.status !== "completed") return null;
    const champion = finalMatch.winner_id;
    const runnerUp =
      champion === finalMatch.player1_id
        ? finalMatch.player2_id
        : finalMatch.player1_id;
    return { champion, runnerUp };
  });

  // Derive standings for completed/in-progress stages
  let standings = $derived.by(() => {
    if (!bracketMatches?.length) return [];

    // Swiss placements come straight from the server-side standings.
    if (isSwiss && !isTwoStage) {
      const byId = new Map((tournament.players || []).map((p) => [p.id, p]));
      return (tournament.standings || []).map((row) => {
        const p = byId.get(row.player_id) || {};
        return {
          id: row.player_id,
          display_name: p.display_name,
          flag: p.flag,
          team: p.team,
          link: p.link,
          rank:
            row.rank === 1 ? "第 1 名 (冠军)" : row.rank === 2 ? "第 2 名 (亚军)" : `第 ${row.rank} 名`,
          eliminatedRound: null,
          matchesPlayed: row.wins + row.losses,
          matchesWon: row.wins,
        };
      });
    }

    let placed = eliminationStandings({
      matches: bracketMatches || [],
      players: tournament.players || [],
      doubleElim: isDoubleElim,
      championshipMatch,
    });
    // Two-stage events: playoff placements for qualifiers; everyone else is
    // listed after them by group rank.
    let groupStageOut = [];
    if (isTwoStage) {
      // In the playoff: group qualifiers, plus anyone invited straight into it.
      const qualified = new Set((tournament.group_stage?.qualifiers || []).map((q) => q.player_id));
      for (const m of bracketMatches) {
        if (m.player1_id) qualified.add(m.player1_id);
        if (m.player2_id) qualified.add(m.player2_id);
      }
      const rowsById = new Map();
      for (const g of tournament.group_stage?.groups || []) {
        for (const row of g.rows) rowsById.set(row.player_id, { ...row, label: g.label });
      }
      for (const p of placed) {
        const row = rowsById.get(p.id);
        if (row && row.wins !== undefined) {
          p.matchesWon += row.wins;
          p.matchesPlayed += row.wins + row.losses;
        }
      }
      // Bracket groups: count the group matches themselves.
      if (hasGroupBrackets) {
        const byId = new Map(placed.map((p) => [p.id, p]));
        for (const m of groupStageMatches) {
          if (m.bracket === "sw" || !m.player1_id || !m.player2_id || !m.winner_id) continue;
          for (const id of [m.player1_id, m.player2_id]) {
            const p = byId.get(id);
            if (!p) continue;
            p.matchesPlayed += 1;
            if (m.winner_id === id) p.matchesWon += 1;
          }
        }
      }
      groupStageOut = placed
        .filter((p) => !qualified.has(p.id))
        .map((p) => {
          const row = rowsById.get(p.id);
          return { ...p, rank: row ? `小组赛出局（${row.label} 组第 ${row.rank} 名）` : "小组赛出局", groupRank: row?.rank ?? 99 };
        })
        .sort((a, b) => a.groupRank - b.groupRank || b.matchesWon - a.matchesWon);
      placed = placed.filter((p) => qualified.has(p.id));
    }

    return placed.concat(groupStageOut);
  });

  // Dynamic layout variables based on bracket size (exactly like overlay/+page.svelte)
  let firstRoundMatchCount = $derived.by(() => {
    const rs = rounds();
    if (!rs.length) return 0;
    return rs[0].matches?.length || 0;
  });

  // Group the bracket: 32 players per page on desktop, 16 on phones.
  let isMobileViewport = $state(false);
  onMount(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => (isMobileViewport = mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  });

  let sectionFirstMatches = $derived(
    Math.min(isMobileViewport ? 8 : 16, Math.max(2, firstRoundMatchCount)),
  );
  let sectionDepth = $derived(
    Math.max(1, Math.round(Math.log2(sectionFirstMatches)) + 1),
  );
  let sectionCount = $derived(
    Math.max(1, Math.ceil(firstRoundMatchCount / sectionFirstMatches)),
  );
  let maxRoundNumber = $derived.by(() => {
    const rs = rounds();
    return rs.length ? Math.max(...rs.map((r) => r.round)) : 1;
  });
  let finalStartRound = $derived(
    Math.max(1, maxRoundNumber - (sectionDepth - 1)),
  );
  let autoFinalStage = $derived.by(() => {
    if (sectionCount <= 1) return false;
    const finalRound = rounds().find((r) => r.round === finalStartRound);
    if (!finalRound) return false;
    return finalRound.matches.some(
      (m) =>
        m.player1_id ||
        m.player2_id ||
        m.status === "completed" ||
        m.status === "walkover",
    );
  });
  let bracketViewMode = $state("auto"); // auto | sections | final
  let bracketSectionIndex = $state(0);
  let showFinalStage = $derived(
    sectionCount > 1 &&
      (bracketViewMode === "final" ||
        (bracketViewMode === "auto" && autoFinalStage)),
  );

  $effect(() => {
    if (bracketSectionIndex >= sectionCount) bracketSectionIndex = 0;
  });

  let displayRounds = $derived.by(() => {
    const rs = rounds();
    if (!rs.length) return [];
    if (sectionCount <= 1) return rs;
    if (showFinalStage) return rs.filter((r) => r.round <= finalStartRound);

    return rs
      .filter((r) => r.round >= finalStartRound)
      .map((r) => {
        const size = sectionFirstMatches >> (maxRoundNumber - r.round);
        const start = bracketSectionIndex * size;
        return { ...r, matches: r.matches.slice(start, start + size) };
      });
  });
  // Direct download export
  function triggerJsonDownload() {
    if (!tournament || !isAdmin) return;
    const json = JSON.stringify(tournament, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `potato-cup-${tournament.id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("赛事 JSON 导出成功");
  }

</script>




{#if loading}
  <div
    class="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground"
  >
    <div
      class="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin"
    ></div>
    <p class="text-sm">正在加载赛事详情...</p>
  </div>
{:else if !tournament}
  <div
    class="text-center py-16 border border-border bg-card/30 rounded-2xl max-w-xl mx-auto space-y-4"
  >
    <TrophyIcon class="w-12 h-12 text-muted-foreground mx-auto" />
    <div>
      <h2 class="text-lg font-bold text-foreground">赛事不存在</h2>
      <p class="text-xs text-muted-foreground mt-1">
        您访问的赛事 ID 在数据库中未找到。
      </p>
    </div>
    <Button size="sm" onclick={() => goto("/")} class="gap-1 text-xs">
      <ArrowLeftIcon class="w-3.5 h-3.5" /> 返回首页
    </Button>
  </div>
{:else}
  {#if autoHudActive}
    <div
      class="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 rounded-xl border border-primary/30 bg-card/95 px-4 py-3 shadow-lg backdrop-blur"
    >
      <ClockIcon class="w-4 h-4 text-primary shrink-0" />
      <span class="text-xs font-medium whitespace-nowrap">
        {autoHudSeconds}s 后自动切换大屏到游戏内 HUD
      </span>
      <Button
        size="sm"
        class="h-7 text-xs cursor-pointer"
        onclick={switchOverlayToHud}
      >
        立即切换
      </Button>
      <Button
        size="sm"
        variant="outline"
        class="h-7 text-xs cursor-pointer"
        onclick={postponeAutoHud}
      >
        延后 +30s
      </Button>
    </div>
  {/if}

  {#snippet rosterSidebar()}
    <RosterCard {tournament} {isAdmin} onedit={openEditPlayer} onunregister={doUnregister} />
  {/snippet}

  {#snippet obsControl()}
    <ObsControlCard
      {tournament}
      {tid}
      {isAdmin}
      {streamMode}
      {matchOrder}
      roundLabel={matchRoundLabel}
      {playerName}
      {overlayMatches}
      {overlayStageList}
      {overlayShownStage}
      onstreamstart={requestStreamMode}
      onstreamend={disableStreamMode}
      onclearhud={clearAutoHudTimer}
    />
  {/snippet}

  {#snippet bracketView()}
    <Card.Root class="border-border bg-card/40">
      <Card.Header
        class="p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/40 pb-4"
      >
        <div>
          <Card.Title class="text-base font-bold flex items-center gap-2">
            <ShieldCheckIcon class="w-5 h-5 text-amber-500" />
            {#if tournament.status === "registration"}
              对阵图预览 (Bracket Preview)
            {:else}
              赛事对阵图 · {eventFormatLabel(tournament)}
            {/if}
          </Card.Title>
          <Card.Description class="text-xs">
            {#if tournament.status === "registration"}
              基于当前报名的选手和种子排名实时生成的对阵预览（调整上方种子排序会自动刷新）。
              {#if hasGroupBrackets}
                <span class="block mt-1 text-muted-foreground/80">开赛时按种子蛇形分组，每组打{groupFormatLabel}淘汰，每组前 {tournament.advance_per_group} 名进入{tournament.playoff_format === "double_elim" ? "双败" : "单败"}淘汰赛。</span>
              {:else if isDoubleElim}
                <span class="block mt-1 text-muted-foreground/80">双败淘汰至少需要 4 名选手；种子会依次填入胜者组。</span>
              {:else if isSwiss}
                <span class="block mt-1 text-muted-foreground/80">瑞士轮第 1 轮按种子上半区对下半区配对；之后每轮按积分榜重新配对，不会重复交手。</span>
              {/if}
              <span class="sm:hidden block mt-1 text-muted-foreground/80">左右滑动查看本组对阵。</span>
            {:else if tournament.status === "in_progress"}
              点击包含两位选手的待赛卡片可以填报比分或进行弃权处理。
              {#if hasGroupBrackets && shownStage === "group"}
                <span class="block mt-1 text-muted-foreground/80">各组比赛独立进行；所有小组打完后，管理员在上方确认晋级名单进入淘汰赛。</span>
              {:else if isDoubleElim}
                <span class="block mt-1 text-muted-foreground/80">胜者组败者落入败者组；败者组再败即淘汰；总决赛按需加赛。</span>
              {:else if isSwiss}
                <span class="block mt-1 text-muted-foreground/80">一轮全部打完后自动生成下一轮对阵；最后一轮结束后积分榜第一即为冠军。</span>
              {/if}
            {:else}
              赛事已结束，此对阵图当前为只读。
            {/if}
          </Card.Description>
        </div>
      </Card.Header>

      {#if sectionCount > 1 && !isDoubleElim && !(isSwiss && (!isTwoStage || shownStage === "group")) && !(hasGroupBrackets && shownStage === "group")}
        <div
          class="flex flex-wrap items-center gap-2 px-3 sm:px-6 pt-4"
        >
          <Badge variant="outline" class="text-[10px] font-mono">
            第 {bracketSectionIndex + 1} / {sectionCount} 组 · {sectionFirstMatches * 2} 人
          </Badge>
          <Button
            variant="outline"
            size="sm"
            disabled={showFinalStage || bracketSectionIndex === 0}
            onclick={() => {
              bracketViewMode = "sections";
              bracketSectionIndex = Math.max(0, bracketSectionIndex - 1);
            }}
            class="h-7 text-[10px] px-2"
          >
            上一组
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={showFinalStage || bracketSectionIndex >= sectionCount - 1}
            onclick={() => {
              bracketViewMode = "sections";
              bracketSectionIndex = Math.min(sectionCount - 1, bracketSectionIndex + 1);
            }}
            class="h-7 text-[10px] px-2"
          >
            下一组
          </Button>
          <Button
            variant={showFinalStage ? "default" : "outline"}
            size="sm"
            onclick={() => (bracketViewMode = "final")}
            class="h-7 text-[10px] px-2"
          >
            决赛阶段
          </Button>
          <Button
            variant={showFinalStage ? "outline" : "default"}
            size="sm"
            onclick={() => (bracketViewMode = "sections")}
            class="h-7 text-[10px] px-2"
          >
            分组
          </Button>
          <span class="text-[10px] text-muted-foreground/70">
            手机每 16 人一组，桌面每 32 人一组
          </span>
        </div>
      {/if}

      <Card.Content class="p-3 sm:p-6 overflow-x-auto relative min-h-100">
        {#if isTwoStage}
          <div class="mb-4 space-y-3">
            <div class="flex flex-wrap items-center gap-1.5">
              {#each [{ id: "group", label: "小组赛" }, { id: "playoff", label: "淘汰赛" }] as st (st.id)}
                <button
                  type="button"
                  disabled={st.id === "playoff" && !inPlayoffs}
                  onclick={() => (stageView = st.id)}
                  class="rounded-full border px-3 py-1 text-xs font-bold transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40
                    {shownStage === st.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground/80 hover:border-foreground/40'}"
                >
                  {st.label}
                </button>
              {/each}
            </div>
            {#if tournament.status !== "registration" && !tournament.source_url}
              <PlayoffPanel
                groupStage={tournament.group_stage}
                players={tournament.players || []}
                playoffFormat={tournament.playoff_format}
                {inPlayoffs}
                status={tournament.status}
                {isAdmin}
                busy={playoffBusy}
                onStart={startPlayoffs}
                onWithdraw={withdrawPlayoffs}
              />
            {/if}
          </div>
        {/if}
        {#if isSwiss && (!isTwoStage || shownStage === "group")}
          <SwissView
            matches={tournament.matches || []}
            players={tournament.players || []}
            standings={tournament.standings || []}
            totalRounds={tournament.swiss_rounds_effective ?? tournament.swiss_rounds}
            status={tournament.status}
            activeMatchId={tournament.active_match_id}
            isAdmin={isAdmin}
            userId={userState.id}
            onOpenMatch={openMatchDetails}
            onToggleActive={toggleActiveMatch}
            onEditRounds={editSwissRounds}
            banpickEnabled={banpickEnabled}
            onBanPick={openBanPick}
            groups={isTwoStage ? tournament.group_stage?.groups || [] : []}
            perGroup={isTwoStage ? tournament.advance_per_group || 0 : 0}
            locked={inPlayoffs}
          />
        {:else if hasGroupBrackets && shownStage === "group"}
          <GroupBracketsView
            groups={tournament.group_stage?.groups || []}
            matches={groupStageMatches}
            players={tournament.players || []}
            format={tournament.format}
            perGroup={tournament.advance_per_group || 0}
            status={tournament.status}
            activeMatchId={tournament.active_match_id}
            isAdmin={isAdmin}
            userId={userState.id}
            onOpenMatch={openMatchDetails}
            onToggleActive={toggleActiveMatch}
            banpickEnabled={banpickEnabled}
            onBanPick={openBanPick}
          />
        {:else if isDoubleElim}
          <DoubleElimBracket
            matches={bracketMatches || []}
            players={tournament.players || []}
            status={tournament.status}
            activeMatchId={tournament.active_match_id}
            isAdmin={isAdmin}
            userId={userState.id}
            grandFinalReset={tournament.grand_final_reset}
            onOpenMatch={openMatchDetails}
            onToggleActive={toggleActiveMatch}
            banpickEnabled={banpickEnabled}
            onBanPick={openBanPick}
          />
        {:else}
        {#if bracketMatches?.length > 0}
          <SingleElimBracket
            {tournament}
            {tid}
            rounds={displayRounds}
            matches={bracketMatches}
            {totalRounds}
            {isAdmin}
            {banpickEnabled}
            {matchOrder}
            {playerName}
            onopen={openMatchDetails}
            onbanpick={openBanPick}
          />
        {:else}
          <div class="text-center py-12 text-muted-foreground">
            {#if tournament.status === "registration"}
              <p class="text-xs italic">暂无对阵预览，调整上面种子顺序后，点击“生成对阵预览”。</p>
            {:else}
              <p class="text-xs italic">对阵图尚未生成。</p>
            {/if}
          </div>
        {/if}
        {/if}
      </Card.Content>
    </Card.Root>
  {/snippet}

  <div class="space-y-6">
    <!-- Header: title, tags, time; admin stage controls -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/60 pb-5">
      <EventHeader
        bind:tournament
        {tid}
        {isAdmin}
        statusText={statusLabel(tournament.status)}
        {isSwiss}
        {isTwoStage}
        {hasGroupBrackets}
        {swissRoundsLabel}
        {vehicleTemplates}
        {bpTemplate}
        onreload={load}
        onedittime={openTimeEdit}
      />
      {#if isAdmin}
        <StatusControls
          status={tournament.status}
          {startBlocked}
          canStart={canStartTournament}
          onendvoting={openEndVoting}
          onstatus={changeStatus}
        />
      {/if}
    </div>

    <PhaseStepper {tournament} />

    <!-- Active Panel based on current stage -->
    {#if tournament.status === "registration"}
      <!-- STAGE 1: REGISTRATION -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Join / Seeding Panel -->
        <div class="lg:col-span-2 space-y-6">
          <RegistrationCard
            {tournament}
            {isAdmin}
            {isRegistered}
            {unregisteredPlayers}
            onregister={doRegister}
            onunregister={doUnregister}
            onbatch={doBatchRegister}
          />
          {#if isAdmin && (tournament.players?.length || 0) >= 2}
            <SeedingCard {tournament} {seedOrder} {playerName} onauto={autoSeed} onrandom={randomizeSeed} onmove={moveSeed} />
          {/if}
        </div>

        <!-- Sidebar Player List -->
        <div class="space-y-6">
          {@render obsControl()}
          {@render rosterSidebar()}
        </div>
      </div>

      <!-- Bracket Preview in Registration stage -->
      {#if (tournament.players?.length || 0) >= (isDoubleElim ? 4 : 2)}
        <div class="mt-6">
          {@render bracketView()}
        </div>
      {/if}
    {:else if tournament.status === "voting"}
      <!-- STAGE 2: VOTING -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-2 space-y-6">
          <VoteBoard {tournament} {tid} {isAdmin} {voteOptions} bind:weekOffset={voteWeekOffset} {playerName} onchanged={load} />
        </div>
        <div class="space-y-6">
          <VoteProposals {tid} onchanged={load} />
          {@render obsControl()}
          {@render rosterSidebar()}
        </div>
      </div>
    {:else if ["in_progress", "completed"].includes(tournament.status)}
      <!-- STAGE 3 & 4: BRACKET & RESULT -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-2 space-y-6">
          {#if tournament.status === "completed"}
            <ResultsPanel
              {tournament}
              {podium}
              {standings}
              swissTable={isSwiss && !isTwoStage}
              {isAdmin}
              {playerName}
              onexportjson={triggerJsonDownload}
              onexportwiki={openWikiExport}
            />
          {/if}

          {@render bracketView()}
        </div>
        <div class="space-y-6">
          {@render obsControl()}
          {@render rosterSidebar()}
        </div>
      </div>
    {/if}
  </div>
{/if}

<!-- Match Result Submission Dialog -->
<MatchResultDialog
  bind:open={showMatchDialog}
  bind:step={reportStep}
  bind:bp={bpState}
  bind:score1={score1Input}
  bind:score2={score2Input}
  match={selectedMatch}
  {tournament}
  correcting={correctingMatch}
  {banpickEnabled}
  {bpMatchId}
  vehicles={bpTemplate?.vehicles || []}
  poolName={bpTemplate?.name || ""}
  submitting={submittingResult}
  roundLabel={matchRoundLabel}
  recordedLabel={recordedResultLabel}
  {playerName}
  onwalkover={recordWalkover}
  onrollback={doRollback}
  onsubmit={selectGameWinner}
/>

<!-- Admin: adjust the match time -->
<TimeEditDialog bind:open={showTimeEditDialog} bind:value={timeEditValue} current={tournament?.scheduled_time} saving={savingTime} onsave={saveTimeEdit} />

<!-- Ending the vote: pick the final time -->
<FinalTimeDialog bind:open={showStatusTimeDialog} bind:value={selectedFinalTime} options={voteOptions} formatTime={formatVoteTime} onconfirm={confirmEndVoting} />

<!-- Liquipedia Wiki Export Dialog -->
<WikiExportDialog bind:open={showWikiDialog} loading={loadingWiki} text={generatedWikiText} oncopy={copyWikiToClipboard} />

<!-- Participant Profile Edit Dialog -->
<PlayerEditDialog
  bind:open={showPlayerEditDialog}
  bind:id={editPlayerNewId}
  bind:qq={editPlayerQQ}
  bind:discord={editPlayerDiscord}
  bind:flag={editPlayerFlag}
  bind:team={editPlayerTeam}
  bind:link={editPlayerLink}
  onsave={handleSavePlayer}
/>

<!-- Next Match Hand-off Dialog (blocking while in progress with no live match) -->
<NextMatchDialog bind:open={nextMatchModalOpen} candidates={nextMatchCandidates} {matchOrder} roundLabel={matchRoundLabel} {playerName} onchoose={chooseNextMatch} />

<!-- Going-live pre-flight checklist -->
<StreamChecklistDialog bind:open={showStreamChecklist} onconfirm={confirmStreamMode} />


