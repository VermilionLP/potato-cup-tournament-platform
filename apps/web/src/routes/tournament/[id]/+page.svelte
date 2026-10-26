<script>
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import { API } from "$lib/api.js";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { userState } from "$lib/user.svelte.js";
  import { Calendar } from "$lib/components/ui/calendar/index.js";
  import {
    Popover,
    PopoverContent,
    PopoverTrigger,
  } from "$lib/components/ui/popover/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { accountRegionLabel, accountKey } from "$lib/utils.js";
  import {
    bracketRoundLabel,
    bracketRoundTotal,
    buildMatchOrder,
    maxRound,
    roundLabel,
  } from "$lib/bracket.js";
  import DoubleElimBracket from "$lib/components/DoubleElimBracket.svelte";
  import SwissView from "$lib/components/SwissView.svelte";
  import BanPickPanel from "$lib/components/BanPickPanel.svelte";
  import ScoreForm from "$lib/components/ScoreForm.svelte";
  import PlayoffPanel from "$lib/components/PlayoffPanel.svelte";
  import { canConfirm, confirmResult, initialBanPick, poolVehicles } from "$lib/banpick.js";
  import { defaultVehiclePools } from "$lib/data/vehiclePools.js";
  import {
    advancementLabel,
    formatLabel,
    canCorrectResult,
    gameModeLabel,
    isValidSwissRounds,
    MAX_SWISS_ROUNDS,
    MIN_SWISS_ROUNDS,
    startBlockedMessage,
    groupLabel,
  } from "$lib/tournament.js";
  import TierBadge from "$lib/components/TierBadge.svelte";
  import Flag from "$lib/components/Flag.svelte";
  import { buildContact, parseContact } from "$lib/contact.js";
  import { isRecentlySeen } from "$lib/players.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { CalendarDate } from "@internationalized/date";

  import TrophyIcon from "@lucide/svelte/icons/trophy";
  import UserRoundIcon from "@lucide/svelte/icons/user";
  import UsersIcon from "@lucide/svelte/icons/users";
  import CalendarIcon from "@lucide/svelte/icons/calendar";
  import ClockIcon from "@lucide/svelte/icons/clock";
  import CheckIcon from "@lucide/svelte/icons/check";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import PlayIcon from "@lucide/svelte/icons/play";
  import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
  import TrashIcon from "@lucide/svelte/icons/trash-2";
  import CrownIcon from "@lucide/svelte/icons/crown";
  import DownloadIcon from "@lucide/svelte/icons/download";
  import FileTextIcon from "@lucide/svelte/icons/file-text";
  import LinkIcon from "@lucide/svelte/icons/link";
  import UnlinkIcon from "@lucide/svelte/icons/unlink";
  import XIcon from "@lucide/svelte/icons/x";
  import TrendingUpIcon from "@lucide/svelte/icons/trending-up";
  import ShuffleIcon from "@lucide/svelte/icons/shuffle";
  import MessageSquareIcon from "@lucide/svelte/icons/message-square";
  import ListOrderedIcon from "@lucide/svelte/icons/list-ordered";
  import CopyIcon from "@lucide/svelte/icons/copy";
  import SettingsIcon from "@lucide/svelte/icons/settings";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import RadioIcon from "@lucide/svelte/icons/radio";
  import MicIcon from "@lucide/svelte/icons/mic";
  import HeadphonesIcon from "@lucide/svelte/icons/headphones";
  import Volume2Icon from "@lucide/svelte/icons/volume-2";
  import MonitorIcon from "@lucide/svelte/icons/monitor";
  import LayoutDashboardIcon from "@lucide/svelte/icons/layout-dashboard";
  import PencilIcon from "@lucide/svelte/icons/pencil";

  let tid = $derived(page.params.id);
  let tournament = $state(null);
  // Two-stage events: Swiss group stage, then an elimination playoff. The
  // elimination views and placements only ever see playoff matches.
  let isTwoStage = $derived(tournament?.format === "swiss" && Boolean(tournament?.playoff_format));
  let inPlayoffs = $derived(isTwoStage && tournament?.current_stage === "playoff");
  let bracketMatches = $derived(
    (tournament?.matches || []).filter((m) => (isTwoStage || tournament?.format !== "swiss") ? m.bracket !== "sw" : true),
  );
  // Overlay round controls need a non-empty list even before a playoff exists.
  let overlayMatches = $derived(bracketMatches.length ? bracketMatches : tournament?.matches || []);
  let stageView = $state(null); // "group" | "playoff"; null follows the current stage
  // Before the playoff exists only the group stage can be shown.
  let shownStage = $derived(inPlayoffs ? stageView || "playoff" : "group");
  let playoffBusy = $state(false);
  let totalRounds = $derived(maxRound(bracketMatches || []));
  let matchOrder = $derived(buildMatchOrder(tournament?.matches || []));
  let isDoubleElim = $derived(
    tournament?.format === "double_elim" || (isTwoStage && tournament?.playoff_format === "double_elim"),
  );
  let isSwiss = $derived(tournament?.format === "swiss");
  let banpickEnabled = $derived(tournament?.banpick_enabled !== false);
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
  let editingTitle = $state(false);
  let titleDraft = $state("");
  let savingTitle = $state(false);

  // Derived unregistered players list for quick registration select
  let unregisteredPlayers = $derived(
    allPlayers.filter(
      (ap) => !(tournament?.players || []).some((tp) => tp.id === ap.id),
    ),
  );
  let showInactiveReg = $state(false);
  let selectedRegIds = $state([]);
  let activeUnregistered = $derived(
    unregisteredPlayers.filter((p) => isRecentlySeen(p.last_seen_at)),
  );
  let inactiveUnregistered = $derived(
    unregisteredPlayers.filter((p) => !isRecentlySeen(p.last_seen_at)),
  );

  function toggleRegSelection(playerId) {
    selectedRegIds = selectedRegIds.includes(playerId)
      ? selectedRegIds.filter((id) => id !== playerId)
      : [...selectedRegIds, playerId];
  }

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
  let editPlayerBnetIds = $state([]);


  // Tournament-scoped account links (temporary / borrowed accounts)
  let showAccountsDialog = $state(false);
  let accountsBusy = $state(false);
  let tournamentAccounts = $state([]);

  function parseBnetEntries(raw) {
    try {
      const arr = typeof raw === "string" ? JSON.parse(raw || "[]") : raw || [];
      return Array.isArray(arr)
        ? arr.map((b) => (typeof b === "string" ? { id: b, url: "" } : b))
        : [];
    } catch {
      return [];
    }
  }

  function globalEntryPayload(g) {
    const isStr = typeof g === "string";
    return {
      account_key: accountKey(g),
      name: (isStr ? g : g.id || "").trim(),
      url: (isStr ? "" : g.url) || "",
      toon_handle: (isStr ? "" : g.toon_handle) || "",
      region: (isStr ? null : g.region) ?? null,
      subregion: isStr ? null : g.subregion ?? null,
    };
  }

  async function loadTournamentAccounts() {
    try {
      tournamentAccounts = await API.getTournamentAccounts(tid);
    } catch (e) {
      toast.error("加载账号关联失败: " + e.message);
    }
  }

  async function refreshAccounts() {
    await loadTournamentAccounts();
    await load();
  }

  async function unlinkTournamentAccount(accountKey) {
    if (!ensureAdmin()) return;
    if (!confirm("解除该账号在本赛事的临时关联？（若该账号也不在该选手全局资料里，本届将退回按名字判断）")) return;
    try {
      accountsBusy = true;
      await API.unlinkTournamentAccount(tid, accountKey);
      toast.success("已解除临时关联");
      await refreshAccounts();
    } catch (e) {
      toast.error("解除关联失败: " + e.message);
    } finally {
      accountsBusy = false;
    }
  }

  async function removeGlobalAccount(playerId, g) {
    if (!ensureAdmin()) return;
    if (!confirm("从该选手的全局资料中移除该账号？所有赛事都会受影响。")) return;
    try {
      accountsBusy = true;
      const e = globalEntryPayload(g);
      await API.unlinkPlayerAccount(playerId, e.account_key, e.name);
      toast.success("已移除全局账号");
      await refreshAccounts();
    } catch (err) {
      toast.error("移除失败: " + err.message);
    } finally {
      accountsBusy = false;
    }
  }

  async function makeTemporary(playerId, g) {
    if (!ensureAdmin()) return;
    try {
      accountsBusy = true;
      const e = globalEntryPayload(g);
      await API.linkTournamentAccounts(tid, playerId, [e]);
      await API.unlinkPlayerAccount(playerId, e.account_key, e.name);
      toast.success("已转为临时（仅本赛事）");
      await refreshAccounts();
    } catch (err) {
      toast.error("操作失败: " + err.message);
    } finally {
      accountsBusy = false;
    }
  }

  async function makePermanent(playerId, s) {
    if (!ensureAdmin()) return;
    try {
      accountsBusy = true;
      await API.linkPlayerAccounts(playerId, [{
        account_key: s.account_key,
        name: s.account_name || s.account_key,
        url: s.url || "",
        toon_handle: s.toon_handle || "",
        region: s.region ?? null,
        subregion: s.subregion ?? null,
      }]);
      await API.unlinkTournamentAccount(tid, s.account_key);
      toast.success("已转为全局");
      await refreshAccounts();
    } catch (err) {
      toast.error("操作失败: " + err.message);
    } finally {
      accountsBusy = false;
    }
  }

  async function cleanupEmptyAccounts() {
    if (!ensureAdmin()) return;
    const ids = (tournament?.players || []).map((p) => p.id);
    if (ids.length === 0) return;
    if (!confirm("移除本赛事选手名下所有「无 URL」旧账号条目？（这些是补不出 URL 的历史名字）")) return;
    try {
      accountsBusy = true;
      const res = await API.cleanupEmptyAccounts(ids);
      toast.success(`已清理 ${res.removed ?? 0} 个无 URL 账号`);
      await refreshAccounts();
    } catch (e) {
      toast.error("清理失败: " + e.message);
    } finally {
      accountsBusy = false;
    }
  }

  let accountsByPlayer = $derived.by(() => {
    const map = {};
    for (const a of tournamentAccounts || []) {
      (map[a.player_id] = map[a.player_id] || []).push(a);
    }
    return map;
  });

  // Wiki generation states
  let showWikiDialog = $state(false);
  let generatedWikiText = $state("");
  let loadingWiki = $state(false);

  // Registration states
  let regInput = $state("");
  let seedOrder = $state([]);
  let obsIntroRound = $state(1);

  // Time voting states
  const today = new Date();
  let voteDate = $state(
    new CalendarDate(
      today.getFullYear(),
      today.getMonth() + 1,
      today.getDate(),
    ),
  );
  let voteTime = $state("20:00");

  const timeSlots = [
    "13:00",
    "13:30",
    "14:00",
    "14:30",
    "15:00",
    "15:30",
    "16:00",
    "16:30",
    "17:00",
    "17:30",
    "18:00",
    "18:30",
    "19:00",
    "19:30",
    "20:00",
    "20:30",
    "21:00",
    "21:30",
    "22:00",
    "22:30",
    "23:00",
    "23:30",
  ];

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
  let streamChecks = $state({
    mic: false,
    voice: false,
    gameSound: false,
    gameScreen: false,
    overlay: false,
  });
  const STREAM_CHECKLIST_ITEMS = [
    { key: "mic", label: "麦克风", desc: "麦克风已连接，收音正常", icon: MicIcon },
    { key: "voice", label: "语音", desc: "语音 / 开黑频道已就绪", icon: HeadphonesIcon },
    { key: "gameSound", label: "游戏声音", desc: "游戏音效已进入 OBS 混音", icon: Volume2Icon },
    { key: "gameScreen", label: "游戏画面", desc: "游戏画面采集正常", icon: MonitorIcon },
    { key: "overlay", label: "Overlay", desc: "直播大屏叠加已设置完成", icon: LayoutDashboardIcon },
  ];
  let streamChecklistAllDone = $derived(
    STREAM_CHECKLIST_ITEMS.every((item) => streamChecks[item.key]),
  );

  function nextVoteOccurrence(weekday, hour, minute, now = new Date()) {
    const d = new Date(now);
    d.setHours(hour, minute, 0, 0);
    let delta = (weekday - d.getDay() + 7) % 7;
    if (delta === 0 && d.getTime() <= now.getTime()) delta = 7;
    d.setDate(d.getDate() + delta);
    return d;
  }

  function voteIso(d) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
  }

  // Suggested slots are always visible; they double as quick vote buttons.
  let quickVoteOptions = $derived.by(() => {
    const fallback = [
      { weekday: 4, hour: 20, minute: 30 },
      { weekday: 6, hour: 20, minute: 30 },
      { weekday: 0, hour: 20, minute: 30 },
      { weekday: 6, hour: 15, minute: 0 },
      { weekday: 0, hour: 15, minute: 0 },
    ];
    const historical = (playTimes?.top_slots || []).slice(0, 3).map((slot) => {
      const [hour, minute] = String(slot.time).split(":").map(Number);
      return { weekday: slot.weekday, hour, minute };
    });
    // Keep the usual Thursday 20:30 plus the Saturday/Sunday afternoon slots available.
    const extra = [
      { weekday: 4, hour: 20, minute: 30 },
      { weekday: 6, hour: 15, minute: 0 },
      { weekday: 0, hour: 15, minute: 0 },
    ];
    const specs = [...historical, ...extra, ...fallback];
    const now = new Date();
    // Keep the requested time-of-day relative to "now + offset weeks".
    const anchor = new Date(now.getTime() + voteWeekOffset * 7 * 24 * 3600 * 1000);
    const seen = new Set();
    const out = [];
    for (const spec of specs) {
      const d = nextVoteOccurrence(spec.weekday, spec.hour, spec.minute, anchor);
      const iso = voteIso(d);
      if (seen.has(iso)) continue;
      seen.add(iso);
      out.push({ proposed_time: iso, suggested: true });
      if (out.length >= 6) break;
    }
    return out;
  });

  // Compute votes sorted chronologically by date; merge suggested zero-vote slots.
  let voteOptions = $derived.by(() => {
    const map = {};
    if (tournament?.votes) {
      for (const v of tournament.votes) {
        const t = v.proposed_time;
        if (!map[t]) map[t] = { proposed_time: t, count: 0, voters: [] };
        map[t].count++;
        map[t].voters.push(v);
      }
    }
    const suggested = new Set(quickVoteOptions.map((q) => q.proposed_time));
    for (const q of quickVoteOptions) {
      if (!map[q.proposed_time]) {
        map[q.proposed_time] = {
          proposed_time: q.proposed_time,
          count: 0,
          voters: [],
        };
      }
    }
    return Object.values(map)
      .map((opt) => ({ ...opt, suggested: suggested.has(opt.proposed_time) }))
      .sort((a, b) => a.proposed_time.localeCompare(b.proposed_time));
  });

  let pastVotes = $derived(
    (tournament?.votes || []).filter((vote) => {
      const time = new Date(vote.proposed_time).getTime();
      return Number.isFinite(time) && time < Date.now();
    }),
  );

  // Group vote options by date for "Anime Schedule" layout
  let groupedVoteDates = $derived.by(() => {
    const datesMap = {};
    for (const opt of voteOptions) {
      const parts = opt.proposed_time.split("T");
      const dateStr = parts[0];
      const timeStr = parts[1] ? parts[1].substring(0, 5) : "00:00";
      
      if (!datesMap[dateStr]) {
        datesMap[dateStr] = {
          date: dateStr,
          formattedDate: formatDateHeader(dateStr),
          options: []
        };
      }
      datesMap[dateStr].options.push({
        ...opt,
        timeOnly: timeStr
      });
    }
    return Object.values(datesMap).sort((a, b) => a.date.localeCompare(b.date));
  });

  function formatDateHeader(dateStr) {
    try {
      const date = new Date(dateStr + "T00:00:00");
      if (isNaN(date.getTime())) return dateStr;
      const month = date.getMonth() + 1;
      const day = date.getDate();
      const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
      const weekday = weekdays[date.getDay()];
      return `${month}/${day} ${weekday}`;
    } catch (e) {
      return dateStr;
    }
  }

  function formatVoteTime(timeStr) {
    if (!timeStr) return "";
    try {
      const date = new Date(timeStr.replace(" ", "T"));
      if (isNaN(date.getTime())) return timeStr;
      
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");
      
      const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
      const weekday = weekdays[date.getDay()];
      
      return `${year}-${month}-${day} (${weekday}) ${hours}:${minutes}`;
    } catch (e) {
      return timeStr;
    }
  }

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
    streamChecks = {
      mic: false,
      voice: false,
      gameSound: false,
      gameScreen: false,
      overlay: false,
    };
    showStreamChecklist = true;
  }

  function confirmStreamMode() {
    if (!streamChecklistAllDone) return;
    streamMode = true;
    if (typeof window !== "undefined") {
      localStorage.setItem("suck_stream_mode", "1");
    }
    showStreamChecklist = false;
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

  let eventSource = null;
  $effect(() => {
    if (!tid) return;
    const es = new EventSource(`/api/tournaments/${tid}/stream`);
    eventSource = es;

    es.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        console.log("实时接收到服务器推送的赛事变动事件:", msg);
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

      if (bracketMatches?.length) {
        obsIntroRound = Math.max(...bracketMatches.map((m) => m.round));
      }

      // Auto-generate/refresh bracket preview on page load in registration phase
      if (
        isAdmin &&
        tournament.status === "registration" &&
        tournament.players?.length >=
          (tournament.format === "double_elim" ? 4 : 2)
      ) {
        const matches = await API.generateBracket(tid);
        tournament = { ...tournament, matches };
        if (matches?.length) {
          obsIntroRound = Math.max(...matches.map((m) => m.round));
        }
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

  async function startTitleEdit() {
    titleDraft = tournament?.name || "";
    editingTitle = true;
  }

  async function saveTitle() {
    if (!ensureAdmin()) return;
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
  async function doRegister() {
    const targetId = regInput.trim();
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
      regInput = "";
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
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function doBatchRegister() {
    if (!ensureAdmin()) return;
    if (selectedRegIds.length === 0) return toast.error("请先选择选手");
    const ids = [...selectedRegIds];
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
    selectedRegIds = [];
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
      toast.success(`${formatLabel(tournament.format)} 对阵已成功生成！`);
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
      bpState = initialBanPick();
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
      `瑞士轮总轮数（${MIN_SWISS_ROUNDS}-${MAX_SWISS_ROUNDS}）。比赛进行中修改时，不能少于当前轮次。`,
      String(current),
    );
    if (input === null) return;
    const rounds = Number(input.trim());
    if (!isValidSwissRounds(rounds)) {
      toast.error(`轮数必须是 ${MIN_SWISS_ROUNDS}-${MAX_SWISS_ROUNDS} 之间的整数`);
      return;
    }
    try {
      await API.setSwissRounds(tid, rounds);
      toast.success(`瑞士轮已设为 ${rounds} 轮`);
      await load();
    } catch (e) {
      toast.error(e.message);
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
    navigator.clipboard.writeText(generatedWikiText);
    toast.success("Wiki 代码已成功复制到剪贴板！");
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
      if (tournament?.format === "double_elim") {
        let destination = "胜者晋级下一轮";
        if (selectedMatch.bracket === "wb") {
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

  // Time voting
  async function postponeVoteWeek() {
    if (!ensureAdmin()) return;
    try {
      const res = await API.deletePastVotes(tid);
      voteWeekOffset += 1;
      if (res.deleted > 0) {
        toast.info(
          `已作废 ${res.deleted} 条过期投票，推荐时间已顺延到下周`,
        );
      } else {
        toast.info(`推荐时间已顺延 ${voteWeekOffset} 周`);
      }
      await load();
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function doVote() {
    if (!userState.qqGroup || !userState.id) {
      toast.error("此操作需要先填写 QQ / Discord 联系方式与选手 ID。已为您打开配置面板！");
      document.getElementById("header-profile-button")?.click();
      return;
    }
    if (!voteDate) return toast.error("请选择日期");
    const timeStr = voteTime || "20:00";
    const dateStr = voteDate.toString();
    const iso = `${dateStr}T${timeStr}:00`;
    try {
      await API.submitVote(tid, userState.id, iso);
      toast.success("已投票；若该时间最终当选，会自动为你报名");
      voteDate = undefined;
      voteTime = "20:00";
      await load();
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function toggleVoteOption(optionTime, voted) {
    if (!userState.qqGroup || !userState.id) {
      toast.error("此操作需要先填写 QQ / Discord 联系方式与选手 ID。已为您打开配置面板！");
      document.getElementById("header-profile-button")?.click();
      return;
    }
    try {
      if (voted) {
        await API.removeVote(tid, userState.id, optionTime);
        toast.success("已取消该时间的投票");
      } else {
        await API.submitVote(tid, userState.id, optionTime);
        toast.success("已投票；若该时间最终当选，会自动为你报名");
      }
      await load();
    } catch (e) {
      toast.error(e.message);
    }
  }

  // Custom voting states
  let customTopicSelect = $state("服务器");
  let customTopicInput = $state("");
  let customOptionInput = $state("");

  let customVoteTopics = $derived.by(() => {
    if (!tournament?.custom_votes) return [];
    const topicsMap = {};
    for (const cv of tournament.custom_votes) {
      const t = cv.topic;
      const val = cv.value;
      if (!topicsMap[t]) {
        topicsMap[t] = {};
      }
      if (!topicsMap[t][val]) {
        topicsMap[t][val] = { value: val, count: 0, voters: [] };
      }
      topicsMap[t][val].count++;
      topicsMap[t][val].voters.push(cv);
    }
    return Object.entries(topicsMap).map(([topic, optsMap]) => {
      const options = Object.values(optsMap).sort((a, b) => b.count - a.count);
      return { topic, options };
    }).sort((a, b) => a.topic.localeCompare(b.topic));
  });

  async function handleAddCustomVote() {
    const topic = customTopicSelect === "new" ? customTopicInput : customTopicSelect;
    await submitCustomVote(topic, customOptionInput);
  }

  async function submitCustomVote(topic, value) {
    if (!userState.qqGroup || !userState.id) {
      toast.error("此操作需要先填写 QQ / Discord 联系方式与选手 ID。已为您打开配置面板！");
      document.getElementById("header-profile-button")?.click();
      return;
    }
    if (!topic || !topic.trim()) return toast.error("请输入或选择投票主题");
    if (!value || !value.trim()) return toast.error("请输入选项内容");
    try {
      await API.submitCustomVote(tid, userState.id, topic.trim(), value.trim());
      toast.success("自定义选项已添加并投票");
      customOptionInput = "";
      customTopicInput = "";
      await load();
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function toggleCustomVote(topic, value, voted) {
    if (!userState.qqGroup || !userState.id) {
      toast.error("此操作需要先填写 QQ / Discord 联系方式与选手 ID。已为您打开配置面板！");
      document.getElementById("header-profile-button")?.click();
      return;
    }
    try {
      if (voted) {
        await API.removeCustomVote(tid, userState.id, topic, value);
        toast.success("已取消该选项的投票");
      } else {
        await API.submitCustomVote(tid, userState.id, topic, value);
        toast.success("已投赞成票");
      }
      await load();
    } catch (e) {
      toast.error(e.message);
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

    if (p.bnet_ids) {
      try {
        const ids =
          typeof p.bnet_ids === "string" ? JSON.parse(p.bnet_ids) : p.bnet_ids;
        if (Array.isArray(ids)) {
          editPlayerBnetIds = ids.map((item) =>
            typeof item === "string" ? { id: item, url: "" } : item,
          );
        } else {
          editPlayerBnetIds = [];
        }
      } catch (_) {
        editPlayerBnetIds = [];
      }
    } else {
      editPlayerBnetIds = [];
    }

    showPlayerEditDialog = true;
  }

  function removeBnetId(idx) {
    editPlayerBnetIds = editPlayerBnetIds.filter((_, i) => i !== idx);
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
        bnet_ids: editPlayerBnetIds,
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

    const playersMap = {};
    (tournament.players || []).forEach((p) => {
      playersMap[p.id] = {
        id: p.id,
        display_name: p.display_name,
        flag: p.flag,
        team: p.team,
        link: p.link,
        rank: "TBD",
        eliminatedRound: null,
        matchesPlayed: 0,
        matchesWon: 0,
      };
    });

    const matches = bracketMatches || [];
    const finalMatch = championshipMatch;

    matches.forEach((m) => {
      if (m.player1_id && playersMap[m.player1_id])
        playersMap[m.player1_id].matchesPlayed++;
      if (m.player2_id && playersMap[m.player2_id])
        playersMap[m.player2_id].matchesPlayed++;

      if (m.status === "completed" || m.status === "walkover") {
        const winnerId = m.winner_id;
        const loserId = winnerId === m.player1_id ? m.player2_id : m.player1_id;

        if (winnerId && playersMap[winnerId]) {
          playersMap[winnerId].matchesWon++;
        }

        if (loserId && playersMap[loserId]) {
          playersMap[loserId].eliminatedRound = m.round;
        }
      }
    });

    if (
      finalMatch &&
      (finalMatch.status === "completed" || finalMatch.status === "walkover")
    ) {
      const champId = finalMatch.winner_id;
      const runnerUpId =
        champId === finalMatch.player1_id
          ? finalMatch.player2_id
          : finalMatch.player1_id;

      if (champId && playersMap[champId]) {
        playersMap[champId].rank = "第 1 名 (冠军)";
      }
      if (runnerUpId && playersMap[runnerUpId]) {
        playersMap[runnerUpId].rank = "第 2 名 (亚军)";
      }

      // In double elimination the loser of the losers-bracket final is third.
      if (isDoubleElim) {
        const firstFinal = matches.find(
          (m) => m.bracket === "gf" && m.position === 1,
        );
        const lbFinal = firstFinal
          ? matches.find(
              (m) =>
                m.next_match_id === firstFinal.id && m.next_slot === 2,
            )
          : null;
        if (lbFinal?.winner_id) {
          const thirdId =
            lbFinal.winner_id === lbFinal.player1_id
              ? lbFinal.player2_id
              : lbFinal.player1_id;
          if (thirdId && playersMap[thirdId]) {
            playersMap[thirdId].rank = "第 3 名";
          }
        }
      }
    }

    Object.values(playersMap).forEach((p) => {
      if (p.rank !== "TBD") return;
      if (isDoubleElim) {
        p.rank = "已淘汰";
        return;
      }
      if (p.eliminatedRound === null) {
        p.rank = "未淘汰";
        return;
      }

      const r = p.eliminatedRound;
      if (r === 2) {
        p.rank = "第 3 - 4 名 (四强)";
      } else if (r === 3) {
        p.rank = "第 5 - 8 名 (八强)";
      } else if (r === 4) {
        p.rank = "第 9 - 16 名";
      } else if (r > 4) {
        const minRank = (1 << (r - 1)) + 1;
        const maxRank = 1 << r;
        p.rank = `第 ${minRank} - ${maxRank} 名`;
      }
    });

    let placed = Object.values(playersMap);
    // Two-stage events: playoff placements for qualifiers; everyone else is
    // listed after them by group rank.
    let groupStageOut = [];
    if (isTwoStage) {
      const qualified = new Set((tournament.group_stage?.qualifiers || []).map((q) => q.player_id));
      const rowsById = new Map();
      for (const g of tournament.group_stage?.groups || []) {
        for (const row of g.rows) rowsById.set(row.player_id, { ...row, label: g.label });
      }
      for (const p of placed) {
        const row = rowsById.get(p.id);
        if (row) {
          p.matchesWon += row.wins;
          p.matchesPlayed += row.wins + row.losses;
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

    return placed.sort((a, b) => {
      const getPriority = (rankStr) => {
        if (rankStr.includes("1")) return 1;
        if (rankStr.includes("2")) return 2;
        if (rankStr.includes("3")) return 3;
        if (rankStr.includes("5")) return 4;
        if (rankStr.includes("9")) return 5;
        if (rankStr.includes("未淘汰")) return 0;
        return 100;
      };
      return getPriority(a.rank) - getPriority(b.rank);
    }).concat(groupStageOut);
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
  let displayFirstRoundCount = $derived(
    displayRounds[0]?.matches?.length || 0,
  );

  let bracketSpecs = $derived.by(() => {
    const count = displayFirstRoundCount;
    if (count >= 8) {
      // 16 players or more
      return {
        H: 64,
        g: 12,
        G: 24,
        cardWidth: "w-40",
        colGap: "gap-6",
        slotOffset: 16,
        connMid: 12,
        connWidth: 12,
        connGap: 24,
      };
    } else {
      // 8 players or fewer
      return {
        H: 64,
        g: 20,
        G: 40,
        cardWidth: "w-40",
        colGap: "gap-8",
        slotOffset: 16,
        connMid: 16,
        connWidth: 16,
        connGap: 32,
      };
    }
  });

  let matchPositions = $derived.by(() => {
    const rs = displayRounds;
    if (!rs.length)
      return { positions: {}, centers: {}, totalHeight: 600 };

    const H = bracketSpecs.H; // Card height
    const g = bracketSpecs.g; // Intra-pair gap
    const G = bracketSpecs.G; // Inter-pair gap

    const positions = {}; // map of matchId -> { top, height }
    const centers = {}; // map of matchId -> center px

    const localMaxRound = Math.max(...rs.map((r) => r.round));
    const firstRound = rs.find((r) => r.round === localMaxRound);
    if (!firstRound) return { positions: {}, centers: {}, totalHeight: 600 };

    const firstRoundMatches = firstRound.matches;
    firstRoundMatches.forEach((m, idx) => {
      const pairIdx = Math.floor(idx / 2);
      const isEven = idx % 2 === 0;
      const top = isEven
        ? pairIdx * (2 * H + g + G)
        : pairIdx * (2 * H + g + G) + H + g;

      positions[m.id] = { top, height: H };
      centers[m.id] = top + H / 2;
    });

    for (let rNum = localMaxRound - 1; rNum >= 1; rNum--) {
      const roundData = rs.find((r) => r.round === rNum);
      const prevRoundData = rs.find((r) => r.round === rNum + 1);
      if (!roundData || !prevRoundData) continue;

      roundData.matches.forEach((m, idx) => {
        const parent1 = prevRoundData.matches[idx * 2];
        const parent2 = prevRoundData.matches[idx * 2 + 1];

        let center = 0;
        if (parent1 && parent2) {
          center = (centers[parent1.id] + centers[parent2.id]) / 2;
        } else if (parent1) {
          center = centers[parent1.id];
        } else {
          center = idx * 300 + 150;
        }

        const top = center - H / 2;
        positions[m.id] = { top, height: H };
        centers[m.id] = center;
      });
    }

    const totalHeight =
      firstRoundMatches.length > 0
        ? Math.ceil(firstRoundMatches.length / 2) * (2 * H + g + G) - G
        : 600;

    return { positions, centers, totalHeight };
  });

  let adjustedTotalHeight = $derived.by(() => {
    let base = matchPositions.totalHeight;
    if (tournament.hold_third_place && bracketMatches?.some(m => m.round === 0)) {
      return Math.max(base, 190);
    }
    return base;
  });

  // Alive player tracking for detailing connector states
  let alivePlayerIds = $derived.by(() => {
    if (!tournament?.players) return new Set();
    const alive = new Set(tournament.players.map((p) => p.id));
    (bracketMatches || []).forEach((m) => {
      if (m.status === "completed" || m.status === "walkover") {
        const loserId =
          m.winner_id === m.player1_id ? m.player2_id : m.player1_id;
        if (loserId) {
          alive.delete(loserId);
        }
      }
    });
    return alive;
  });

  function isAlive(playerId) {
    if (!playerId) return false;
    return alivePlayerIds.has(playerId);
  }

  function getRaceColorClass(race) {
    if (!race) return 'text-muted-foreground';
    const r = race.toUpperCase();
    if (r === 'T') return 'text-blue-400 font-bold';
    if (r === 'Z') return 'text-purple-400 font-bold';
    if (r === 'P') return 'text-amber-400 font-bold';
    if (r === 'R') return 'text-emerald-400 font-bold';
    return 'text-muted-foreground';
  }

  // Direct download export
  function triggerJsonDownload() {
    if (!tournament) return;
    const json = JSON.stringify(tournament, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `suck-tournament-${tournament.id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("赛事 JSON 导出成功");
  }

  function getPlayerRowBgClass(playerId, race) {
    if (!playerId) {
      return 'bg-[#f8f9fa] dark:bg-neutral-900/30 text-neutral-400 dark:text-neutral-500';
    }
    const r = race ? race.toUpperCase() : 'U';
    
    if (r === 'T') {
      return 'bg-[#d8e8ff] dark:bg-[#152a4a]/40 hover:bg-[#cbe0ff] dark:hover:bg-[#152a4a]/60 text-blue-900 dark:text-blue-200 border-l border-blue-500/50';
    }
    if (r === 'Z') {
      return 'bg-[#ffe2e2] dark:bg-[#3f1515]/40 hover:bg-[#ffd5d5] dark:hover:bg-[#3f1515]/60 text-red-900 dark:text-red-200 border-l border-red-500/50';
    }
    if (r === 'P') {
      return 'bg-[#e2ffe2] dark:bg-[#1a382a]/40 hover:bg-[#c9ffc9] dark:hover:bg-[#1a382a]/60 text-emerald-900 dark:text-emerald-200 border-l border-emerald-500/50';
    }
    if (r === 'R') {
      return 'bg-[#fff7d8] dark:bg-[#3d331a]/30 hover:bg-[#ffefa8] dark:hover:bg-[#3d331a]/50 text-amber-900 dark:text-amber-200 border-l border-amber-500/50';
    }
    return 'bg-[#f8f9fa] dark:bg-neutral-900/60 hover:bg-neutral-200/50 dark:hover:bg-neutral-900/80 text-neutral-800 dark:text-neutral-200 border-l border-neutral-400 dark:border-l-neutral-500';
  }
</script>

{#snippet raceIcon(race)}
  {#if race === 'T'}
    <svg class="w-3.5 h-3.5 text-blue-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2L2 9h4v6H2l10 7 10-7h-4V9h4L12 2zm0 3.8l5 3.5h-2.5v6h-5v-6H7l5-3.5z"/>
    </svg>
  {:else if race === 'Z'}
    <svg class="w-3.5 h-3.5 text-purple-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15.5c-3.03 0-5.5-2.47-5.5-5.5s2.47-5.5 5.5-5.5 5.5 2.47 5.5 5.5-2.47 5.5-5.5 5.5zm0-8.5c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
    </svg>
  {:else if race === 'P'}
    <svg class="w-3.5 h-3.5 text-amber-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2L3 7v10l9 5 9-5V7L12 2zm0 3.3l6 3.3v6.8l-6 3.3-6-3.3V8.6l6-3.3z"/>
    </svg>
  {:else if race === 'R'}
    <svg class="w-3.5 h-3.5 text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 16h-2v-2h2v2zm1.07-7.75l-.9.92C12.45 11.9 12 12.5 12 14h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H6c0-3.31 2.69-6 6-6s6 2.69 6 6c0 1.04-.42 1.99-1.07 2.75z"/>
    </svg>
  {:else}
    <div class="w-3.5 h-3.5 rounded-full border border-neutral-700 bg-neutral-800 shrink-0"></div>
  {/if}
{/snippet}


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
    <Card.Root class="border-border bg-card/40">
      <Card.Header class="p-5 pb-3">
        <Card.Title class="text-sm font-bold flex items-center justify-between">
          <span>选手名册</span>
          <Badge
            variant="outline"
            class="text-[10px] bg-primary/10 text-primary border-primary/20"
          >
            {tournament.players?.length || 0} / {tournament.player_capacity}
            人
          </Badge>
        </Card.Title>
      </Card.Header>
      <Card.Content class="p-5 pt-0">
        <div class="space-y-1.5 max-h-100 overflow-y-auto pr-1">
          {#each tournament.players || [] as p}
            <div
              class="flex items-center justify-between px-3 py-1.5 rounded-lg bg-background/40 border border-border/60 hover:bg-background/80 transition-colors"
            >
              <span
                class="text-xs font-medium flex items-center gap-1.5  mr-2"
              >
                <div
                  class="w-2.5 h-2.5 rounded-full bg-primary/30 border border-primary/50"
                ></div>
                {#if p.team}
                  <span class="text-[10px] text-muted-foreground font-mono"
                    >[{p.team}]</span
                  >
                {/if}
                <span class="">{p.display_name}</span>
                {#if p.flag}
                  <span class="flex items-center gap-1">
                    <Flag code={p.flag} size={16} />
                    <span
                      class="text-[9px] font-bold px-1 rounded bg-muted text-muted-foreground uppercase font-mono"
                      >{p.flag}</span
                    >
                  </span>
                {/if}
                {#if p.seed}
                  <span class="text-[10px] text-amber-500 font-bold"
                    >#{p.seed}</span
                  >
                {/if}
              </span>
              <div class="flex items-center gap-1 shrink-0">
                {#if isAdmin}
                  <button
                    onclick={() => openEditPlayer(p)}
                    class="text-muted-foreground hover:text-primary p-1 rounded transition-colors cursor-pointer"
                    title="编辑选手资料"
                  >
                    <SettingsIcon class="w-3.5 h-3.5" />
                  </button>
                  {#if tournament.status === "registration"}
                    <button
                      onclick={() => doUnregister(p.id)}
                      class="text-muted-foreground hover:text-red-400 p-1 rounded transition-colors cursor-pointer"
                      title="注销此选手"
                    >
                      <TrashIcon class="w-3.5 h-3.5" />
                    </button>
                  {/if}
                {/if}
              </div>
            </div>
          {/each}
          {#if (tournament.players || []).length === 0}
            <p class="text-xs text-muted-foreground/60 italic text-center py-6">
              暂无选手报名
            </p>
          {/if}
        </div>
      </Card.Content>
    </Card.Root>
  {/snippet}

  {#snippet obsControl()}
    <Card.Root class="border-border bg-card/40">
      <Card.Header class="p-5 pb-3">
        <Card.Title class="text-sm font-bold flex items-center gap-2">
          <SettingsIcon class="w-4 h-4 text-primary" />
          <span>OBS 直播大屏控制</span>
        </Card.Title>
      </Card.Header>
      <Card.Content class="p-5 pt-0 space-y-4 text-xs">
        {#if isAdmin}
        <div
          class="flex items-center justify-between gap-3 rounded-xl border p-3 {streamMode
            ? 'border-red-500/40 bg-red-500/10'
            : 'border-border bg-background/40'}"
        >
          <div class="flex items-center gap-2.5">
            <RadioIcon
              class="w-4 h-4 shrink-0 {streamMode
                ? 'text-red-500 animate-pulse'
                : 'text-muted-foreground'}"
            />
            <div>
              <div class="text-[11px] font-bold">
                {streamMode ? "直播状态已激活" : "直播状态未激活"}
              </div>
              <div class="text-[10px] text-muted-foreground leading-normal">
                激活后本页会强制选择下一场对局并自动切换大屏；仅影响本机，不影响其他访问者。
              </div>
            </div>
          </div>
          <Button
            size="sm"
            variant={streamMode ? "destructive" : "default"}
            class="h-7 text-xs cursor-pointer shrink-0"
            onclick={streamMode ? disableStreamMode : requestStreamMode}
          >
            {streamMode ? "结束直播" : "我要直播"}
          </Button>
        </div>

        <div class="space-y-2">
          <span class="font-semibold text-muted-foreground block">当前直播对局:</span>
          {#if tournament?.matches?.length > 0}
            <div class="flex gap-2">
              <select
                class="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                value={tournament.active_match_id || ""}
                onchange={async (e) => {
                  const val = e.target.value;
                  try {
                    await API.setActiveMatch(tid, val ? parseInt(val) : null);
                    toast.success("当前直播对局已更新");
                  } catch (err) {
                    toast.error("更新直播对局失败: " + err.message);
                  }
                }}
              >
                <option value="">-- 未选择对局 --</option>
                {#each (tournament.matches || []).filter(m => m.player1_id && m.player2_id) as m}
                  <option value={m.id}>
                    #{matchOrder.get(m.id)} 场次 {m.position} ({roundLabel(m.round, totalRounds)}): {playerName(m.player1_id)} vs {playerName(m.player2_id)} [{m.status === 'completed' ? '完赛' : m.status === 'walkover' ? '弃权' : '待赛'}]
                  </option>
                {/each}
              </select>
            </div>
            {#if tournament.active_match_id}
              {@const currentActive = tournament.matches.find(m => m.id === tournament.active_match_id)}
              {#if currentActive}
                <div class="p-2 rounded bg-primary/5 border border-primary/20 text-[11px] text-primary flex items-center justify-between">
                  <span class="font-medium">直播中: {playerName(currentActive.player1_id)} vs {playerName(currentActive.player2_id)}</span>
                  <button
                    onclick={async () => {
                      try {
                        await API.setActiveMatch(tid, null);
                        clearAutoHudTimer();
                        toast.success("已清除直播对局");
                      } catch (err) {
                        toast.error(err.message);
                      }
                    }}
                    class="hover:text-destructive font-bold text-xs shrink-0 cursor-pointer"
                  >
                    清除
                  </button>
                </div>
              {/if}
            {/if}
          {:else}
            <p class="text-muted-foreground text-[11px]">暂无对局，请先生成 Bracket</p>
          {/if}
        </div>

        {/if}

        <div class="border-t border-border/40 pt-3 space-y-3">
          {#if isAdmin}
          <span class="font-semibold text-muted-foreground block">直播大屏控制 (Overlay Control):</span>
          <div class="flex flex-col gap-2.5 bg-primary/5 p-3 rounded-xl border border-primary/20">
            <!-- Scene selector -->
            <div class="flex items-center justify-between gap-2">
              <span class="font-bold text-primary block text-[11px] shrink-0">当前显示大屏:</span>
              <select
                class="flex h-8 rounded border border-primary/30 bg-background px-2 py-1 text-[10px] text-primary font-bold shadow-sm focus-visible:outline-none cursor-pointer"
                value={tournament.overlay_scene || "auto"}
                onchange={async (e) => {
                  const val = e.target.value;
                  try {
                    await API.setOverlayState(tid, val, tournament.overlay_round || Math.max(...(overlayMatches?.map(m => m.round) || [1])));
                    clearAutoHudTimer();
                    toast.success("大屏显示场景已切换为: " + val.toUpperCase());
                  } catch (err) {
                    toast.error("切换大屏场景失败: " + err.message);
                  }
                }}
              >
                <option value="auto">Auto (智能自动模式)</option>
                <option value="intro">Intro (开场对阵轮次列表)</option>
                <option value="hybrid">Hybrid (场间树状对阵图)</option>
                <option value="intermission">Intermission (场间可打预告)</option>
                <option value="ingame">HUD (游戏内选手面板)</option>
              </select>
            </div>

            <!-- Round selector (Visible if intro is selected) -->
            {#if tournament.overlay_scene === "intro"}
              <div class="flex items-center justify-between gap-2 pt-2 border-t border-primary/10">
                <span class="text-[11px] font-semibold text-muted-foreground shrink-0">展示轮次:</span>
                <select
                  class="h-7 rounded border border-input bg-background px-2 text-[10px] cursor-pointer"
                  value={tournament.overlay_round || Math.max(...(overlayMatches?.map(m => m.round) || [1]))}
                  onchange={async (e) => {
                    const val = parseInt(e.target.value);
                    try {
                      await API.setOverlayState(tid, tournament.overlay_scene || "intro", val);
                      toast.success("大屏展示轮次已更改为: " + roundLabel(val, totalRounds));
                    } catch (err) {
                      toast.error("更改大屏轮次失败: " + err.message);
                    }
                  }}
                >
                  {#each Array.from({length: Math.max(...(overlayMatches?.map(m => m.round) || [1]))}, (_, i) => i + 1).reverse() as r}
                    <option value={r}>{roundLabel(r, totalRounds)}</option>
                  {/each}
                </select>
              </div>
            {/if}
          </div>
          {/if}
        </div>

        <div class="border-t border-border/40 pt-3 space-y-3">
          <span class="font-semibold text-muted-foreground block">OBS 浏览器源链接:</span>
          
          <div class="space-y-2.5">
            <!-- Unified Auto link -->
            <div class="space-y-1.5 p-2.5 rounded-xl border border-primary/20 bg-primary/5">
              <span class="font-bold text-primary block text-[11px]">✨ 推荐：全自动智能切换直播源 (Unified Auto)</span>
              <span class="text-[10px] text-muted-foreground block leading-normal mb-1">
                放入 OBS 浏览器源即可。有直播中比赛时自动渲染游戏 HUD（透明底），无直播对局时自动渲染场间统计大屏（深色底，显示待开打对局和本轮详情）。
              </span>
              <div class="flex items-center gap-1.5">
                <input
                  type="text"
                  readonly
                  class="flex-1 h-7 px-2 border border-primary/25 rounded bg-background text-[10px] select-all cursor-default text-primary font-mono"
                  value={window.location.origin + `/tournament/${tid}/overlay`}
                />
                <Button
                  size="icon-xs"
                  class="h-7 w-7 cursor-pointer shrink-0 bg-primary text-black hover:bg-primary/90"
                  onclick={() => {
                    navigator.clipboard.writeText(window.location.origin + `/tournament/${tid}/overlay`);
                    toast.success("已复制全自动智能直播源链接");
                  }}
                >
                  <CopyIcon class="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            <div class="h-px bg-border/40 my-2"></div>
            <span class="text-[10px] font-bold text-muted-foreground block">特定单场景链接 (如有需要手动配置):</span>

            <div class="space-y-1">
              <div class="flex justify-between items-center">
                <span class="font-medium">1. 开场对阵 (Intro / 比赛列表)</span>
                <!-- Round selector for URL -->
                <div class="flex items-center gap-1">
                  <span class="text-[10px] text-muted-foreground">轮次:</span>
                  <select
                    class="h-5 rounded border border-input bg-background px-1 text-[10px]"
                    bind:value={obsIntroRound}
                  >
                    {#each Array.from({length: Math.max(...(overlayMatches?.map(m => m.round) || [1]))}, (_, i) => i + 1).reverse() as r}
                      <option value={r}>{roundLabel(r, totalRounds)}</option>
                    {/each}
                  </select>
                </div>
              </div>
              <div class="flex items-center gap-1.5">
                <input
                  type="text"
                  readonly
                  class="flex-1 h-7 px-2 border border-input rounded bg-muted/30 text-[10px] select-all cursor-default"
                  value={window.location.origin + `/tournament/${tid}/overlay?scene=intro&round=${obsIntroRound}`}
                />
                <Button
                  size="icon-xs"
                  variant="outline"
                  class="h-7 w-7 cursor-pointer shrink-0"
                  onclick={() => {
                    navigator.clipboard.writeText(window.location.origin + `/tournament/${tid}/overlay?scene=intro&round=${obsIntroRound}`);
                    toast.success("已复制开场对阵链接");
                  }}
                >
                  <CopyIcon class="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            <div class="space-y-1">
              <span class="font-medium block">2. 游戏内 HUD (右上角选手+滚动比分)</span>
              <div class="flex items-center gap-1.5">
                <input
                  type="text"
                  readonly
                  class="flex-1 h-7 px-2 border border-input rounded bg-muted/30 text-[10px] select-all cursor-default"
                  value={window.location.origin + `/tournament/${tid}/overlay?scene=ingame`}
                />
                <Button
                  size="icon-xs"
                  variant="outline"
                  class="h-7 w-7 cursor-pointer shrink-0"
                  onclick={() => {
                    navigator.clipboard.writeText(window.location.origin + `/tournament/${tid}/overlay?scene=ingame`);
                    toast.success("已复制游戏内 HUD 链接");
                  }}
                >
                  <CopyIcon class="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            <div class="space-y-1">
              <span class="font-medium block">3. 场间 Coming Up (可打比赛)</span>
              <div class="flex items-center gap-1.5">
                <input
                  type="text"
                  readonly
                  class="flex-1 h-7 px-2 border border-input rounded bg-muted/30 text-[10px] select-all cursor-default"
                  value={window.location.origin + `/tournament/${tid}/overlay?scene=intermission`}
                />
                <Button
                  size="icon-xs"
                  variant="outline"
                  class="h-7 w-7 cursor-pointer shrink-0"
                  onclick={() => {
                    navigator.clipboard.writeText(window.location.origin + `/tournament/${tid}/overlay?scene=intermission`);
                    toast.success("已复制场间 Coming Up 链接");
                  }}
                >
                  <CopyIcon class="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Card.Content>
    </Card.Root>
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
              赛事对阵图 · {formatLabel(tournament.format)}
            {/if}
          </Card.Title>
          <Card.Description class="text-xs">
            {#if tournament.status === "registration"}
              基于当前报名的选手和种子排名实时生成的对阵预览（调整上方种子排序会自动刷新）。
              {#if isDoubleElim}
                <span class="block mt-1 text-muted-foreground/80">双败淘汰至少需要 4 名选手；种子会依次填入胜者组。</span>
              {:else if isSwiss}
                <span class="block mt-1 text-muted-foreground/80">瑞士轮第 1 轮按种子上半区对下半区配对；之后每轮按积分榜重新配对，不会重复交手。</span>
              {/if}
              <span class="sm:hidden block mt-1 text-muted-foreground/80">左右滑动查看本组对阵。</span>
            {:else if tournament.status === "in_progress"}
              点击包含两位选手的待赛卡片可以填报比分或进行弃权处理。
              {#if isDoubleElim}
                <span class="block mt-1 text-muted-foreground/80">胜者组败者落入败者组；败者组再败即淘汰；总决赛按需加赛。</span>
              {:else if isSwiss}
                <span class="block mt-1 text-muted-foreground/80">一轮全部打完后自动生成下一轮对阵；最后一轮结束后积分榜第一即为冠军。</span>
              {/if}
            {:else}
              赛事已结束，此对阵图当前为只读。
            {/if}
          </Card.Description>
        </div>
        {#if ["in_progress", "completed"].includes(tournament.status) && isAdmin}
          <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0 w-full sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              onclick={() => {
                showAccountsDialog = true;
                loadTournamentAccounts();
              }}
              class="h-8 text-xs font-bold rounded-xl border border-sky-500/30 bg-sky-500/5 text-sky-500 shadow hover:bg-sky-500 hover:text-black cursor-pointer gap-1.5 w-full sm:w-auto"
            >
              <LinkIcon class="w-3.5 h-3.5" />
              <span>账号关联</span>
            </Button>
          </div>
        {/if}
      </Card.Header>

      {#if sectionCount > 1 && !isDoubleElim && !(isSwiss && (!isTwoStage || shownStage === "group"))}
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
            {#if tournament.status !== "registration"}
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
            totalRounds={tournament.swiss_rounds}
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
          <div class="flex justify-start items-stretch min-w-max py-4 {bracketSpecs.colGap}">
            {#each displayRounds as r, colIdx (r.round)}
              <div class="shrink-0 flex flex-col justify-start h-full {bracketSpecs.cardWidth}">
                <!-- Round Header -->
                <div class="text-xs text-neutral-200 bg-neutral-800/80 border border-neutral-700/50 py-1.5 px-3 font-bold text-center mb-4 tracking-wider shrink-0 rounded-md shadow-sm">
                  {roundLabel(r.round, totalRounds)}
                </div>


                <!-- Match cards in round (Absolutely positioned for perfect alignment) -->
                <div class="relative w-full" style="height: {adjustedTotalHeight}px">
                  {#each r.matches as m, idx (m.id)}
                    {@const pos = matchPositions.positions[m.id] || { top: 0, height: 110 }}
                    {@const userInMatch = userState.id && (m.player1_id === userState.id || m.player2_id === userState.id)}
                    {@const bothPlayersReady = m.player1_id && m.player2_id}
                    {@const isPending = m.status === "pending"}
                    {@const isPlayable = bothPlayersReady && isPending && tournament.status === "in_progress"}
                    {@const isBye = m.status === "completed" && m.winner_id && (!m.player1_id || !m.player2_id)}
                    {@const p1 = tournament.players?.find(p => p.id === m.player1_id)}
                    {@const p2 = tournament.players?.find(p => p.id === m.player2_id)}

                    <div class="absolute left-0 w-full" style="top: {pos.top}px; height: {pos.height}px;">
                      {#if isBye}
                        <!-- Bye Card (Hidden from view but occupies layout space) -->
                        <div class="w-full h-full border border-transparent bg-transparent select-none pointer-events-none opacity-0"></div>
                      {:else}
                        <!-- Normal Match Card -->
                        {@const isCorrectable = isAdmin && canCorrectResult(m)}
                        {@const isClickable = isPlayable || isCorrectable}
                        <div
                          role="button"
                          tabindex="0"
                          onclick={() => { if (isClickable) openMatchDetails(m); }}
                          onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { if (isClickable) openMatchDetails(m); } }}
                          class="w-full h-full text-left bg-white dark:bg-[#1c1c1c] border border-neutral-300 dark:border-neutral-800 rounded-md transition-all flex flex-col justify-between group/match shadow-md text-xs cursor-default overflow-hidden
                          {isClickable ? 'hover:border-neutral-400 dark:hover:border-neutral-700 hover:shadow-lg cursor-pointer' : ''}
                          {isPlayable ? 'ring-2 ring-primary/45 border-primary/20' : ''}"
                        >
                          <!-- Tiny Header Bar -->
                          <div class="px-2 py-1 bg-neutral-100 dark:bg-neutral-900 text-[8px] font-mono text-neutral-500 dark:text-neutral-400 flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800/80 shrink-0">
                            <span>#{matchOrder.get(m.id)} · 场次 {m.position}</span>
                            <div class="flex items-center gap-1.5">
                              {#if isAdmin && isPlayable}
                                {@const isActive = tournament.active_match_id === m.id}
                                <button
                                  onclick={async (e) => {
                                    e.stopPropagation();
                                    try {
                                      await API.setActiveMatch(tid, isActive ? null : m.id);
                                      toast.success(isActive ? "已取消直播该场次" : "已开启该场次直播！");
                                    } catch (err) {
                                      toast.error("更新直播状态失败: " + err.message);
                                    }
                                  }}
                                  class="px-1 py-0.5 rounded font-bold text-[7px] flex items-center gap-0.5 cursor-pointer transition-all
                                    {isActive ? 'bg-amber-500 text-black hover:bg-amber-400' : 'bg-primary text-primary-foreground hover:bg-primary/85'}"
                                >
                                  {isActive ? "直播中" : "推流直播"}
                                </button>
                              {/if}
                              {#if banpickEnabled && isPlayable}
                                <button
                                  type="button"
                                  onclick={(e) => { e.stopPropagation(); openBanPick(m); }}
                                  class="px-1 py-0.5 rounded font-bold text-[7px] cursor-pointer border border-primary/40 text-primary hover:bg-primary hover:text-primary-foreground transition-all"
                                  title="打开 Ban / Pick"
                                >BP</button>
                              {/if}
                              {#if userInMatch && isPending}
                                <span class="text-primary font-bold animate-pulse">我的比赛</span>
                              {/if}
                              {#if isCorrectable}
                                <span class="rounded bg-amber-500/15 px-1 py-0.5 text-[7px] font-bold text-amber-500">修正</span>
                              {/if}
                            </div>
                          </div>

                          <!-- Player 1 Row -->
                          <div class="flex items-center justify-between w-full h-6 border-b border-neutral-200/50 dark:border-neutral-900/40 transition-colors
                            {getPlayerRowBgClass(m.player1_id, p1?.race)}">
                            <div class="flex items-center gap-1.5 pl-1.5  flex-1 min-w-0 h-full py-0">
                              <span class=" font-semibold flex items-center gap-0.5 text-[10.5px]
                                {m.winner_id === m.player1_id ? 'text-black dark:text-white font-black' : 'text-neutral-700 dark:text-neutral-300'}
                                {!m.player1_id ? 'text-neutral-400 dark:text-neutral-500/80' : ''}"
                              >
                                {#if m.winner_id === m.player1_id && m.winner_id}
                                  <CrownIcon class="w-2.5 h-2.5 text-amber-500 dark:text-amber-400 shrink-0" />
                                {/if}
                                <span class="">{playerName(m.player1_id, m)}</span>
                              </span>
                            </div>
                            <!-- Score -->
                            {#if m.status !== "pending"}
                              <div class="w-6 h-full flex items-center justify-center font-mono font-bold text-[11px] bg-neutral-100/60 dark:bg-black/40 text-center shrink-0 border-l border-neutral-200 dark:border-neutral-900/60
                                {m.winner_id === m.player1_id ? 'text-primary font-black' : 'text-neutral-400 dark:text-neutral-500'}">
                                {m.status === 'walkover' ? (m.winner_id === m.player1_id ? 'W' : 'FF') : m.score1}
                              </div>
                            {/if}
                          </div>

                          <!-- Player 2 Row -->
                          <div class="flex items-center justify-between w-full h-6 transition-colors
                            {getPlayerRowBgClass(m.player2_id, p2?.race)}">
                            <div class="flex items-center gap-1.5 pl-1.5  flex-1 min-w-0 h-full py-0">
                              <span class=" font-semibold flex items-center gap-0.5 text-[10.5px]
                                {m.winner_id === m.player2_id ? 'text-black dark:text-white font-black' : 'text-neutral-700 dark:text-neutral-300'}
                                {!m.player2_id ? 'text-neutral-400 dark:text-neutral-500/80' : ''}"
                              >
                                {#if m.winner_id === m.player2_id && m.winner_id}
                                  <CrownIcon class="w-2.5 h-2.5 text-amber-500 dark:text-amber-400 shrink-0" />
                                {/if}
                                <span class="">{playerName(m.player2_id, m)}</span>
                              </span>
                            </div>
                            <!-- Score -->
                            {#if m.status !== "pending"}
                              <div class="w-6 h-full flex items-center justify-center font-mono font-bold text-[11px] bg-neutral-100/60 dark:bg-black/40 text-center shrink-0 border-l border-neutral-200 dark:border-neutral-900/60
                                {m.winner_id === m.player2_id ? 'text-primary font-black' : 'text-neutral-400 dark:text-neutral-500'}">
                                {m.status === 'walkover' ? (m.winner_id === m.player2_id ? 'W' : 'FF') : m.score2}
                              </div>
                            {/if}
                          </div>
                        </div>
                      {/if}

                      <!-- Render Connectors to the right (Only if not the last column) -->
                      {#if colIdx < displayRounds.length - 1}
                        {@const nextRound = displayRounds[colIdx + 1]}
                        {@const isEven = idx % 2 === 0}

                        {#if isEven}
                          {@const sibling = r.matches[idx + 1]}
                          {#if sibling}
                            {@const center1 = matchPositions.centers[m.id]}
                            {@const center2 = matchPositions.centers[sibling.id]}
                            {@const vHeight = center2 - center1}
                            {@const isWinner1Alive = m.winner_id && isAlive(m.winner_id)}
                            {@const isWinner2Alive = sibling.winner_id && isAlive(sibling.winner_id)}
                            {@const isMBye = m.status === "completed" && m.winner_id && (!m.player1_id || !m.player2_id)}
                            {@const isSiblingBye = sibling.status === "completed" && sibling.winner_id && (!sibling.player1_id || !sibling.player2_id)}

                            <!-- Top card horizontal right line -->
                            {#if !isMBye}
                              <div
                                class="absolute -translate-y-1/2 z-0 {isWinner1Alive ? 'line-horizontal-active' : 'line-horizontal-inactive'}"
                                style="right: -{bracketSpecs.connMid}px; width: {bracketSpecs.connWidth}px; top: {bracketSpecs.H / 2}px;"
                              ></div>
                            {/if}

                            <!-- Bottom card horizontal right line -->
                            {#if !isSiblingBye}
                              <div
                                class="absolute z-0 {isWinner2Alive ? 'line-horizontal-active' : 'line-horizontal-inactive'}"
                                style="right: -{bracketSpecs.connMid}px; width: {bracketSpecs.connWidth}px; top: {bracketSpecs.H / 2}px; transform: translateY(calc(-50% + {vHeight}px));"
                              ></div>
                            {/if}

                            <!-- Vertical segment 1 (top half) -->
                            {#if !isMBye}
                              <div
                                class="absolute w-0.5 z-0 {isWinner1Alive ? 'line-vertical-active' : 'line-vertical-inactive'}"
                                style="right: -{bracketSpecs.connMid}px; top: {bracketSpecs.H / 2}px; height: {vHeight / 2 - bracketSpecs.slotOffset}px;"
                              ></div>
                            {/if}

                            <!-- Vertical segment 3 (bottom half) -->
                            {#if !isSiblingBye}
                              <div
                                class="absolute w-0.5 z-0 {isWinner2Alive ? 'line-vertical-active' : 'line-vertical-inactive'}"
                                style="right: -{bracketSpecs.connMid}px; top: calc({bracketSpecs.H / 2}px + {vHeight / 2 + bracketSpecs.slotOffset}px); height: {vHeight / 2 - bracketSpecs.slotOffset}px;"
                              ></div>
                            {/if}

                            <!-- Outgoing Branch 1 to next round -->
                            {#if !isMBye}
                              <div
                                class="absolute z-0 {isWinner1Alive ? 'line-horizontal-active' : 'line-horizontal-inactive'}"
                                style="right: -{bracketSpecs.connGap}px; width: {bracketSpecs.connWidth}px; top: calc({bracketSpecs.H / 2}px + {vHeight / 2 - bracketSpecs.slotOffset}px); transform: translateY(-50%);"
                              ></div>
                            {/if}

                            <!-- Outgoing Branch 2 to next round -->
                            {#if !isSiblingBye}
                              <div
                                class="absolute z-0 {isWinner2Alive ? 'line-horizontal-active' : 'line-horizontal-inactive'}"
                                style="right: -{bracketSpecs.connGap}px; width: {bracketSpecs.connWidth}px; top: calc({bracketSpecs.H / 2}px + {vHeight / 2 + bracketSpecs.slotOffset}px); transform: translateY(-50%);"
                              ></div>
                            {/if}
                          {/if}
                        {/if}
                      {/if}
                    </div>
                  {/each}

                  {#if colIdx === displayRounds.length - 1}
                    {@const thirdPlaceMatch = bracketMatches.find(m => m.round === 0)}
                    {#if thirdPlaceMatch}
                      {@const tp1 = tournament.players?.find(p => p.id === thirdPlaceMatch.player1_id)}
                      {@const tp2 = tournament.players?.find(p => p.id === thirdPlaceMatch.player2_id)}
                      {@const gfMatch = r.matches[0]}
                      {@const tpClickable = (thirdPlaceMatch.player1_id && thirdPlaceMatch.player2_id && thirdPlaceMatch.status === "pending" && tournament.status === "in_progress") || (isAdmin && canCorrectResult(thirdPlaceMatch))}
                      {#if gfMatch}
                        {@const gfPos = matchPositions.positions[gfMatch.id] || { top: 0, height: 64 }}
                        {@const tpTop = gfPos.top + gfPos.height + 28}
                        
                        <!-- Third Place Match Header -->
                        <div class="absolute left-0 w-full text-[9px] font-bold text-center text-neutral-500 uppercase tracking-wider h-4 flex items-center justify-center gap-1.5"
                             style="top: {tpTop - 18}px;">
                          三四名决赛
                          {#if banpickEnabled && thirdPlaceMatch.player1_id && thirdPlaceMatch.player2_id && thirdPlaceMatch.status === "pending" && tournament.status === "in_progress"}
                            <button
                              type="button"
                              onclick={() => openBanPick(thirdPlaceMatch)}
                              class="px-1 rounded font-bold text-[7px] cursor-pointer border border-primary/40 text-primary hover:bg-primary hover:text-primary-foreground transition-all normal-case"
                              title="打开 Ban / Pick"
                            >BP</button>
                          {/if}
                        </div>
                        
                        <!-- Third Place Match Card -->
                        <div class="absolute left-0 w-full" style="top: {tpTop}px; height: {gfPos.height}px;">
                          <button
                            type="button"
                            onclick={() => { if (tpClickable) openMatchDetails(thirdPlaceMatch); }}
                            class="w-full h-full text-left bg-white dark:bg-[#1c1c1c] border border-neutral-300 dark:border-neutral-800 rounded-md transition-all flex flex-col justify-between group/match shadow-md text-xs cursor-default overflow-hidden
                            {tpClickable ? 'hover:border-neutral-400 dark:hover:border-neutral-700 hover:shadow-lg cursor-pointer' : ''}"
                          >
                            <!-- Tiny Header Bar -->
                            <div class="px-2 py-0.5 bg-neutral-100 dark:bg-neutral-900 text-[8px] font-mono text-neutral-500 dark:text-neutral-400 flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800/80 shrink-0 h-4">
                              <span>场次 {thirdPlaceMatch.position}</span>
                            </div>

                            <!-- Player 1 Row -->
                            <div class="flex items-center justify-between w-full h-6 border-b border-neutral-200/50 dark:border-neutral-900/40 transition-colors
                              {getPlayerRowBgClass(thirdPlaceMatch.player1_id, tp1?.race)}">
                              <div class="flex items-center gap-1.5 pl-1.5  flex-1 min-w-0 h-full py-0">
                                <span class=" font-semibold flex items-center gap-0.5 text-[10.5px]
                                  {thirdPlaceMatch.winner_id === thirdPlaceMatch.player1_id ? 'text-black dark:text-white font-black' : 'text-neutral-700 dark:text-neutral-300'}
                                  {!thirdPlaceMatch.player1_id ? 'text-neutral-400 dark:text-neutral-500/80' : ''}"
                                >
                                  {#if thirdPlaceMatch.winner_id === thirdPlaceMatch.player1_id && thirdPlaceMatch.winner_id}
                                    <CrownIcon class="w-2.5 h-2.5 text-amber-500 dark:text-amber-400 shrink-0" />
                                  {/if}
                                  <span class="">{playerName(thirdPlaceMatch.player1_id, thirdPlaceMatch)}</span>
                                </span>
                              </div>
                              {#if thirdPlaceMatch.status !== "pending"}
                                <div class="w-6 h-full flex items-center justify-center font-mono font-bold text-[11px] bg-neutral-100/60 dark:bg-black/40 text-center shrink-0 border-l border-neutral-200 dark:border-neutral-900/60
                                  {thirdPlaceMatch.winner_id === thirdPlaceMatch.player1_id ? 'text-primary font-black' : 'text-neutral-400 dark:text-neutral-500'}">
                                  {thirdPlaceMatch.status === 'walkover' ? (thirdPlaceMatch.winner_id === thirdPlaceMatch.player1_id ? 'W' : 'FF') : thirdPlaceMatch.score1}
                                </div>
                              {/if}
                            </div>

                            <!-- Player 2 Row -->
                            <div class="flex items-center justify-between w-full h-6 transition-colors
                              {getPlayerRowBgClass(thirdPlaceMatch.player2_id, tp2?.race)}">
                              <div class="flex items-center gap-1.5 pl-1.5  flex-1 min-w-0 h-full py-0">
                                <span class=" font-semibold flex items-center gap-0.5 text-[10.5px]
                                  {thirdPlaceMatch.winner_id === thirdPlaceMatch.player2_id ? 'text-black dark:text-white font-black' : 'text-neutral-700 dark:text-neutral-300'}
                                  {!thirdPlaceMatch.player2_id ? 'text-neutral-400 dark:text-neutral-500/80' : ''}"
                                >
                                  {#if thirdPlaceMatch.winner_id === thirdPlaceMatch.player2_id && thirdPlaceMatch.winner_id}
                                    <CrownIcon class="w-2.5 h-2.5 text-amber-500 dark:text-amber-400 shrink-0" />
                                  {/if}
                                  <span class="">{playerName(thirdPlaceMatch.player2_id, thirdPlaceMatch)}</span>
                                </span>
                              </div>
                              {#if thirdPlaceMatch.status !== "pending"}
                                <div class="w-6 h-full flex items-center justify-center font-mono font-bold text-[11px] bg-neutral-100/60 dark:bg-black/40 text-center shrink-0 border-l border-neutral-200 dark:border-neutral-900/60
                                  {thirdPlaceMatch.winner_id === thirdPlaceMatch.player2_id ? 'text-primary font-black' : 'text-neutral-400 dark:text-neutral-500'}">
                                  {thirdPlaceMatch.status === 'walkover' ? (thirdPlaceMatch.winner_id === thirdPlaceMatch.player2_id ? 'W' : 'FF') : thirdPlaceMatch.score2}
                                </div>
                              {/if}
                            </div>
                          </button>
                        </div>
                      {/if}
                    {/if}
                  {/if}
                </div>
              </div>
            {/each}
          </div>
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
    <!-- Breadcrumb & Status Panel -->
    <div
      class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/60 pb-5"
    >
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
              <Button size="sm" onclick={saveTitle} disabled={savingTitle} class="h-9 text-xs">
                {savingTitle ? "保存中..." : "保存"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onclick={() => (editingTitle = false)}
                class="h-9 text-xs"
              >
                取消
              </Button>
            </div>
          {:else}
            <h1
              class="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground"
            >
              {tournament.name}
            </h1>
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
          <Badge
            variant="outline"
            class="text-[10px] px-2 py-0.5 font-bold uppercase tracking-wider bg-primary/10 text-primary border-primary/20"
          >
            {statusLabel(tournament.status)}
          </Badge>
          <Badge
            variant="outline"
            class="text-[10px] px-2 py-0.5 font-mono bg-muted/40 text-muted-foreground border-border/70"
            title={formatLabel(tournament.format)}
          >
            {gameModeLabel(tournament.game_mode)} · {formatLabel(tournament.format)}
          </Badge>
        </div>
        <p class="text-xs text-muted-foreground font-medium">
          ID: {tournament.id} • 比赛模式: <span class="font-bold text-foreground">{gameModeLabel(tournament.game_mode)}</span>
          • 赛制: <span class="font-bold text-foreground">{formatLabel(tournament.format)}</span>
          • 选手容量: {tournament.player_count ||
            0}/{tournament.player_capacity} 人
          {#if tournament.status === "voting"}
            • 投票人数: {tournament.voter_count || 0} 人
          {/if}
          • 创建于 {new Date(
            tournament.created_at,
          ).toLocaleDateString("zh-CN")}
          • {isSwiss ? "赛制结构" : "晋级规则"}: <span class="font-bold text-primary">{isTwoStage
            ? `小组赛 ${tournament.swiss_rounds ?? "?"} 轮（${tournament.swiss_group_size ? `每组 ${tournament.swiss_group_size} 人` : "不分组"}，每组前 ${tournament.advance_per_group} 名晋级）→ ${tournament.playoff_format === "double_elim" ? "双败" : "单败"}淘汰赛`
            : isSwiss ? `积分制 · ${tournament.swiss_rounds ?? "?"} 轮` : advancementLabel(tournament.loser_advances)}</span>
        </p>
        {#if tournament.scheduled_time}
          <div
            class="mt-2.5 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-primary/30 bg-primary/5 text-primary text-xs font-bold shadow-md shadow-primary/5"
          >
            <ClockIcon class="w-4 h-4 text-primary shrink-0 animate-pulse" />
            <span>比赛时间: {tournament.scheduled_time}</span>
            <a
              href={`/api/tournaments/${encodeURIComponent(tournament.id)}/calendar.ics`}
              download={`${tournament.id}.ics`}
              class="ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-primary/25 bg-background/50 text-[10px] font-bold text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
              title="下载 .ics 日历文件，一键导入日历"
            >
              <CalendarIcon class="w-3 h-3" />
              添加到日历
            </a>
          </div>
        {/if}
      </div>

      <!-- Admin Status Stepper Controls -->
      {#if isAdmin}
        <div class="flex items-center gap-2 flex-wrap">
        {#if tournament.status === "voting"}
          <Button
            size="sm"
            onclick={() => {
              if (!userState.qqGroup || !userState.id) {
                toast.error(
                  "此操作需要先填写 QQ / Discord 联系方式与选手 ID。已为您打开配置面板！",
                );
                document.getElementById("header-profile-button")?.click();
                return;
              }
              const futureOptions = voteOptions.filter(
                (opt) => new Date(opt.proposed_time).getTime() >= Date.now(),
              );
              if (futureOptions.length > 0) {
                const highestVoted = [...futureOptions].sort((a, b) => b.count - a.count)[0];
                selectedFinalTime = formatVoteTime(highestVoted.proposed_time);
              } else {
                selectedFinalTime = "";
              }
              showStatusTimeDialog = true;
            }}
            class="text-xs font-semibold cursor-pointer"
          >
            结束投票并开启报名
          </Button>
        {:else if tournament.status === "registration"}
          <Button
            variant="outline"
            size="sm"
            onclick={() => {
              if (
                confirm(
                  "返回时间投票会清空已生成的对阵，确定继续吗？",
                )
              ) {
                changeStatus("voting");
              }
            }}
            class="text-xs border-purple-500/30 text-purple-400 hover:bg-purple-500 hover:text-white cursor-pointer"
          >
            改为时间投票
          </Button>
          {#if startBlocked}
            <span class="text-xs text-muted-foreground self-center">
              {startBlocked}
            </span>
          {/if}
          <Button
            size="sm"
            disabled={!canStartTournament}
            onclick={() => changeStatus("in_progress")}
            class="text-xs font-semibold cursor-pointer"
          >
            结束报名并开赛
          </Button>
        {:else if tournament.status === "in_progress"}
          <Button
            variant="outline"
            size="sm"
            onclick={() => changeStatus("registration")}
            class="text-xs border-sky-500/30 text-sky-400 hover:bg-sky-500 hover:text-white cursor-pointer"
          >
            返回选手报名
          </Button>
          <Button
            size="sm"
            onclick={() => changeStatus("completed")}
            class="text-xs font-bold cursor-pointer"
          >
            结束赛事
          </Button>
        {:else if tournament.status === "completed"}
          <Button
            variant="outline"
            size="sm"
            onclick={() => changeStatus("in_progress")}
            class="text-xs border-amber-500/30 text-amber-400 hover:bg-amber-500 hover:text-black cursor-pointer"
          >
            重新打开比赛
          </Button>
        {/if}
        </div>
      {/if}
    </div>

    <!-- Phase Stepper Graphic -->
    <div
      class="grid grid-cols-5 gap-3 border border-border bg-card/25 p-3 rounded-2xl text-center text-xs"
    >
      <div
        class="space-y-1.5 {tournament.status === 'voting'
          ? 'text-purple-400 font-bold'
          : 'text-muted-foreground'}"
      >
        <div
          class="w-6 h-6 rounded-full mx-auto flex items-center justify-center text-[10px] border {tournament.status ===
          'voting'
            ? 'bg-purple-500 text-white border-purple-500'
            : 'bg-muted/40 border-border'}"
        >
          1
        </div>
        <div>时间投票</div>
        {#if tournament.scheduled_time && tournament.status !== "voting"}
          <div class="text-[9px] text-emerald-500 font-semibold">已跳过</div>
        {/if}
      </div>
      <div
        class="space-y-1.5 {tournament.status === 'registration'
          ? 'text-primary font-bold'
          : 'text-muted-foreground'}"
      >
        <div
          class="w-6 h-6 rounded-full mx-auto flex items-center justify-center text-[10px] border {tournament.status ===
          'registration'
            ? 'bg-primary text-black border-primary'
            : 'bg-muted/40 border-border'}"
        >
          2
        </div>
        <div>选手报名</div>
      </div>
      <div
        class="space-y-1.5 {tournament.status === 'in_progress'
          ? 'text-amber-500 font-bold'
          : 'text-muted-foreground'}"
      >
        <div
          class="w-6 h-6 rounded-full mx-auto flex items-center justify-center text-[10px] border {tournament.status ===
          'in_progress'
            ? 'bg-amber-500 text-black border-amber-500'
            : 'bg-muted/40 border-border'}"
        >
          3
        </div>
        <div>淘汰赛中</div>
      </div>
      <div
        class="space-y-1.5 {tournament.status === 'completed'
          ? 'text-emerald-400 font-bold'
          : 'text-muted-foreground'}"
      >
        <div
          class="w-6 h-6 rounded-full mx-auto flex items-center justify-center text-[10px] border {tournament.status ===
          'completed'
            ? 'bg-emerald-500 text-black border-emerald-500'
            : 'bg-muted/40 border-border'}"
        >
          4
        </div>
        <div>赛事结束</div>
      </div>
    </div>

    <!-- Active Panel based on current stage -->
    {#if tournament.status === "registration"}
      <!-- STAGE 1: REGISTRATION -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Join / Seeding Panel -->
        <div class="lg:col-span-2 space-y-6">
          <Card.Root class="border-border bg-card/40">
            <Card.Header class="p-6">
              <Card.Title class="text-base font-bold flex items-center gap-2">
                <UsersIcon class="w-5 h-5 text-primary" />
                选手报名管理
              </Card.Title>
              <Card.Description class="text-xs">
                当报名人数达到设定或充足时，组织者可进行种子排序并生成{formatLabel(
                  tournament.format,
                )} Bracket。
              </Card.Description>
            </Card.Header>
            <Card.Content class="p-6 pt-0 space-y-4">
              <!-- One-Click Register for Current User -->
              <div
                class="p-4 rounded-xl border border-border bg-muted/20 flex flex-col sm:flex-row items-center justify-between gap-4"
              >
                {#if userState.id}
                  <div class="flex items-center gap-3">
                    <div
                      class="w-10 h-10 rounded-full bg-linear-to-br from-amber-500 to-orange-600 flex items-center justify-center text-xs font-bold text-white uppercase"
                    >
                      {userState.id.slice(0, 2)}
                    </div>
                    <div>
                      <p class="text-xs text-muted-foreground">
                        当前浏览器 Gamer ID
                      </p>
                      <h4 class="font-bold text-foreground text-sm">
                        {userState.id}
                      </h4>
                    </div>
                  </div>
                  {#if isRegistered}
                    <div class="flex items-center gap-2">
                      <Badge
                        class="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs gap-1 py-1"
                      >
                        <CheckIcon class="w-3.5 h-3.5" /> 已在选手中
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onclick={() => doUnregister(userState.id)}
                        class="text-xs text-red-400 hover:text-red-300 border-red-500/20 hover:bg-red-500/10 h-8 cursor-pointer"
                      >
                        取消报名
                      </Button>
                    </div>
                  {:else}
                    <Button
                      onclick={doRegister}
                      size="sm"
                      class="font-bold text-xs h-8 cursor-pointer"
                    >
                      一键快速报名
                    </Button>
                  {/if}
                {:else}
                  <div class="flex items-center gap-3">
                    <div
                      class="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground"
                    >
                      ?
                    </div>
                    <div>
                      <p class="text-xs text-muted-foreground">
                        未关联 Gamer ID
                      </p>
                      <p class="text-[10px] text-muted-foreground/80 mt-0.5">
                        请先关联或在右侧输入框注册
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onclick={() => {
                      document.getElementById("header-profile-button")?.click();
                    }}
                    class="text-xs h-8 cursor-pointer border-primary/30 text-primary animate-pulse"
                  >
                    去关联游戏ID
                  </Button>
                {/if}
              </div>

              <!-- Admin/Organizer Manual registration -->
              {#if isAdmin}
              <div class="space-y-2.5">
                <label
                  for="reg-id-input"
                  class="text-xs font-bold text-muted-foreground"
                  >管理员手动为群友报名</label
                >
                <div class="flex gap-2">
                  <Input
                    id="reg-id-input"
                    bind:value={regInput}
                    placeholder="输入群友 ID，如 ZergKing"
                    class="bg-background border-border text-foreground flex-1 h-9 text-xs"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onclick={doRegister}
                    class="text-xs h-9 cursor-pointer"
                  >
                    添加选手
                  </Button>
                </div>

                {#if unregisteredPlayers.length > 0}
                  <div class="space-y-2 pt-1">
                    <div
                      class="flex flex-wrap items-center justify-between gap-2"
                    >
                      <span class="text-[10px] font-bold text-muted-foreground">
                        多选选手批量报名（默认只显示一年内活跃）
                      </span>
                      {#if selectedRegIds.length > 0}
                        <div class="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            onclick={doBatchRegister}
                            class="h-7 text-[10px] px-2"
                          >
                            批量报名 ({selectedRegIds.length})
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onclick={() => (selectedRegIds = [])}
                            class="h-7 text-[10px] px-2"
                          >
                            清空
                          </Button>
                        </div>
                      {/if}
                    </div>
                    <div
                      class="flex flex-wrap gap-1.5 max-h-30 overflow-y-auto pr-1"
                    >
                      {#each activeUnregistered as p}
                        <button
                          type="button"
                          onclick={() => toggleRegSelection(p.id)}
                          title={p.last_seen_at
                            ? `最近活跃: ${new Date(p.last_seen_at).toLocaleDateString("zh-CN")}`
                            : "无登录记录"}
                          class="text-[10px] px-2 py-0.5 rounded border transition-colors cursor-pointer {selectedRegIds.includes(
                            p.id,
                          )
                            ? 'bg-primary text-primary-foreground border-primary font-bold'
                            : 'bg-muted text-foreground border-border/80 hover:bg-primary/80 hover:text-primary-foreground'}"
                        >
                          {selectedRegIds.includes(p.id) ? "✓ " : ""}{p.display_name}
                        </button>
                      {:else}
                        <span
                          class="text-[10px] text-muted-foreground/60 italic px-1"
                        >
                          暂无最近一年活跃的未报名选手
                        </span>
                      {/each}
                    </div>
                    {#if inactiveUnregistered.length > 0}
                      <details
                        class="rounded-lg border border-border/60 bg-muted/20 px-2 py-1.5"
                        bind:open={showInactiveReg}
                      >
                        <summary
                          class="text-[10px] text-muted-foreground cursor-pointer select-none"
                        >
                          显示一年未登录的选手（{inactiveUnregistered.length}）
                        </summary>
                        <div
                          class="flex flex-wrap gap-1.5 max-h-25 overflow-y-auto pr-1 mt-1.5"
                        >
                          {#each inactiveUnregistered as p}
                            <button
                              type="button"
                              onclick={() => toggleRegSelection(p.id)}
                              title={p.last_seen_at
                                ? `最近活跃: ${new Date(p.last_seen_at).toLocaleDateString("zh-CN")}`
                                : "无登录记录"}
                              class="text-[10px] px-2 py-0.5 rounded border transition-colors cursor-pointer {selectedRegIds.includes(
                                p.id,
                              )
                                ? 'bg-primary text-primary-foreground border-primary font-bold'
                                : 'bg-muted/70 text-muted-foreground border-border/80 hover:bg-primary/80 hover:text-primary-foreground'}"
                            >
                              {selectedRegIds.includes(p.id) ? "✓ " : ""}{p.display_name}
                            </button>
                          {/each}
                        </div>
                      </details>
                    {/if}
                  </div>
                {/if}
              </div>
              {/if}
            </Card.Content>
          </Card.Root>

          <!-- Seeding Panel -->
          {#if isAdmin && (tournament.players?.length || 0) >= 2}
            <Card.Root class="border-border bg-card/40">
              <Card.Header class="p-6">
                <div>
                  <Card.Title
                    class="text-base font-bold flex items-center gap-2"
                  >
                    <CrownIcon class="w-5 h-5 text-amber-500" />
                    种子排序配置
                  </Card.Title>
                  <Card.Description class="text-xs">
                    默认按天梯 MMR 自动排序：高种子在前，空出的轮次优先轮空高种子。手动调整或随机微调后会切换为手动模式。
                  </Card.Description>
                  <div class="mt-2">
                    <Badge variant="outline" class="text-[9px] px-1.5 py-0 uppercase tracking-wider
                      {tournament.seed_mode === 'manual'
                        ? 'border-amber-500/30 bg-amber-500/10 text-amber-500'
                        : 'border-primary/30 bg-primary/10 text-primary'}">
                      {tournament.seed_mode === 'manual' ? '手动模式' : '自动按天梯排序'}
                    </Badge>
                  </div>
                </div>
              </Card.Header>
              <Card.Content class="p-6 pt-0 space-y-4">
                <div class="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onclick={autoSeed}
                    class="h-7 text-[10px] cursor-pointer gap-1"
                  >
                    <RefreshCwIcon class="w-3 h-3" />
                    按天梯分重排
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onclick={randomizeSeed}
                    class="h-7 text-[10px] cursor-pointer gap-1"
                  >
                    <ShuffleIcon class="w-3 h-3" />
                    随机微调
                  </Button>
                  <span class="text-[10px] text-muted-foreground">
                    随机只打乱 MMR 相近的选手，前 2 / 后 2 名不动
                  </span>
                </div>
                <div class="space-y-1.5 max-h-75 overflow-y-auto pr-1">
                  {#each seedOrder as pid, idx}
                    {@const p = tournament.players?.find((x) => x.id === pid)}
                    <div
                      class="flex items-center gap-3 bg-background/50 border border-border rounded-xl px-4 py-2 text-xs"
                    >
                      <span class="text-amber-500 font-bold w-6"
                        >#{idx + 1}</span
                      >
                      <div class="flex-1 min-w-0">
                        <div class="font-semibold ">{playerName(pid)}</div>
                        <div class="flex items-center gap-1.5 mt-0.5">
                          <TierBadge tier={p?.ladder_tier} className="text-[9px]" />
                          <span class="text-[9px] font-mono text-muted-foreground">
                            {p?.ladder_mmr ?? 3000} MMR · {p?.ladder_games ?? 0} 场
                          </span>
                          {#if p?.ladder_active === false}
                            <span class="text-[9px] text-amber-500/80">不活跃</span>
                          {/if}
                        </div>
                      </div>
                      <div class="flex items-center gap-1.5">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onclick={() => moveSeed(idx, -1)}
                          disabled={idx === 0}
                          class="h-6 w-6 cursor-pointer"
                        >
                          &uarr;
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onclick={() => moveSeed(idx, 1)}
                          disabled={idx === seedOrder.length - 1}
                          class="h-6 w-6 cursor-pointer"
                        >
                          &darr;
                        </Button>
                      </div>
                    </div>
                  {/each}
                </div>
              </Card.Content>
            </Card.Root>
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
        <!-- Voting Slot List -->
        <div class="lg:col-span-2 space-y-6">
          <Card.Root class="border-border bg-card/40">
            <Card.Header class="p-6">
              <Card.Title class="text-base font-bold flex items-center gap-2">
                <ClockIcon class="w-5 h-5 text-purple-400" />
                时间偏好点选（可多选）
              </Card.Title>
              <Card.Description class="text-xs">
                点击对应的时间框来投出赞成票。我们会根据票数最高的时间来安排赛程。
                投票后，如果该时间最终当选，会自动为你报名；不想参赛可在报名阶段取消。
              </Card.Description>
              {#if isAdmin}
              <div class="flex flex-wrap items-center gap-2 mt-3">
                <Button
                  variant="outline"
                  size="sm"
                  onclick={postponeVoteWeek}
                  class="h-7 text-[10px] px-2"
                >
                  顺延一周推荐
                </Button>
                {#if voteWeekOffset > 0}
                  <Button
                    variant="ghost"
                    size="sm"
                    onclick={() => (voteWeekOffset = 0)}
                    class="h-7 text-[10px] px-2"
                  >
                    回到本周
                  </Button>
                  <span class="text-[10px] text-amber-500 font-bold">
                    已顺延 {voteWeekOffset} 周
                  </span>
                {/if}
                <span class="text-[10px] text-muted-foreground/60">
                  顺延会作废已过期投票；未过期选项保留
                </span>
              </div>
              {/if}
            </Card.Header>
            <Card.Content class="p-6 pt-0 space-y-4">
              {#if pastVotes.length > 0}
                <div
                  class="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-600 dark:text-amber-400"
                >
                  有 {pastVotes.length} 条已过期时间投票。点「顺延一周推荐」会作废它们并切到下周。
                </div>
              {/if}
              {#if groupedVoteDates.length > 0}
                <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {#each groupedVoteDates as dayData}
                    <div class="border border-border/80 bg-background/25 rounded-2xl p-4 space-y-3 flex flex-col">
                      <!-- Date Header -->
                      <div class="flex items-center gap-2 pb-2.5 border-b border-border/40 justify-center">
                        <span class="text-sm font-bold text-foreground">
                          {dayData.formattedDate}
                        </span>
                      </div>

                      <!-- Time slots list under this date -->
                      <div class="space-y-2 flex-1">
                        {#each dayData.options as opt}
                          {@const voted = !!(tournament.votes || []).find(
                            (v) =>
                              v.player_id === userState.id &&
                              v.proposed_time === opt.proposed_time,
                          )}
                          <button
                            onclick={() => toggleVoteOption(opt.proposed_time, voted)}
                            class="w-full flex flex-col text-left p-3.5 rounded-xl border transition-all text-xs cursor-pointer group/opt {voted
                              ? 'bg-purple-950/20 border-purple-500 shadow-md shadow-purple-500/5'
                              : 'bg-background/40 border-border/60 hover:border-purple-500/40 hover:bg-background/80'}"
                          >
                            <div class="flex items-center justify-between w-full">
                              <span class="font-bold font-mono text-sm text-foreground group-hover/opt:text-purple-400 transition-colors">
                                {opt.timeOnly}
                              </span>
                              <div class="flex items-center gap-1.5">
                                {#if opt.suggested}
                                  <Badge variant="outline" class="text-[8px] px-1 py-0 text-purple-400 border-purple-500/30">推荐</Badge>
                                {/if}
                                {#if voted}
                                  <Badge class="bg-purple-500 text-white font-bold hover:bg-purple-500 text-[9px] px-1 py-0 shadow">已投</Badge>
                                {/if}
                                <span class="bg-primary text-primary-foreground text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center shadow">
                                  {opt.count}
                                </span>
                              </div>
                            </div>

                            <!-- Voters -->
                            <div class="flex flex-wrap gap-1 mt-2.5 border-t border-border/40 pt-2 w-full">
                              {#each opt.voters as voter}
                                <span class="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/40 font-medium">
                                  {playerName(voter.player_id)}
                                </span>
                              {/each}
                            </div>
                          </button>
                        {/each}
                      </div>
                    </div>
                  {/each}
                </div>
              {:else}
                <div
                  class="text-center py-10 border border-dashed border-border rounded-xl bg-muted/10"
                >
                  <p class="text-xs text-muted-foreground/60 italic">
                    目前还没有人发起时间选项，请在右侧时间框中添加第一个偏好。
                  </p>
                </div>
              {/if}
            </Card.Content>
          </Card.Root>

          {#each customVoteTopics as topicData}
            <Card.Root class="border-border bg-card/40">
              <Card.Header class="p-6">
                <Card.Title class="text-base font-bold flex items-center gap-2">
                  <span class="w-2.5 h-2.5 rounded-full bg-purple-500 shadow shadow-purple-500/50"></span>
                  {topicData.topic} 投票偏好
                </Card.Title>
                <Card.Description class="text-xs">
                  点击对应选项投出赞成票。该投票是多选。
                </Card.Description>
              </Card.Header>
              <Card.Content class="p-6 pt-0 space-y-4">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {#each topicData.options as opt}
                    {@const voted = !!(tournament.custom_votes || []).find(
                      (cv) =>
                        cv.player_id === userState.id &&
                        cv.topic === topicData.topic &&
                        cv.value === opt.value,
                    )}
                    <button
                      onclick={() => toggleCustomVote(topicData.topic, opt.value, voted)}
                      class="flex flex-col text-left p-4 rounded-xl border transition-all text-xs cursor-pointer group/opt {voted
                        ? 'bg-purple-950/20 border-purple-500 shadow-md shadow-purple-500/5'
                        : 'bg-background/40 border-border hover:border-purple-500/40 hover:bg-background/80'}"
                    >
                      <div class="flex items-center justify-between w-full">
                        <span class="font-bold text-foreground group-hover/opt:text-purple-400 transition-colors">
                          {opt.value}
                        </span>
                        <div class="flex items-center gap-1.5">
                          {#if voted}
                            <Badge class="bg-purple-500 text-white font-bold hover:bg-purple-500 text-[9px] px-1 py-0 shadow">
                              已投票
                            </Badge>
                          {/if}
                          <span class="bg-primary text-primary-foreground text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center shadow">
                            {opt.count}
                          </span>
                        </div>
                      </div>
                      <div class="flex flex-wrap gap-1 mt-3 border-t border-border/50 pt-2 w-full">
                        {#each opt.voters as voter}
                          <span class="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/40 font-medium">
                            {playerName(voter.player_id)}
                          </span>
                        {/each}
                      </div>
                    </button>
                  {/each}
                </div>
              </Card.Content>
            </Card.Root>
          {/each}
        </div>

        <!-- Add Option Sidebar -->
        <div class="space-y-6">
          <Card.Root class="border-border bg-card/40">
            <Card.Header class="p-5 pb-3">
              <Card.Title class="text-sm font-bold flex items-center gap-2">
                <CalendarIcon class="w-4 h-4 text-purple-400" />
                提案一个新的时间
              </Card.Title>
            </Card.Header>
            <Card.Content class="p-4 pt-0 space-y-4">
              {#if userState.id}
                <div class="space-y-3">
                  <!-- Inline Calendar and Time Slots Card -->
                  <div
                    class="border border-border bg-background/30 rounded-xl overflow-hidden flex flex-col"
                  >
                    <div
                      class="p-3 border-b border-border/40 bg-muted/5 flex items-center justify-between text-[10px] font-bold text-muted-foreground"
                    >
                      <span>当前身份: {userState.id}</span>
                      <span class="text-primary">不可代投票</span>
                    </div>
                    <div class="p-3">
                      <Calendar
                        type="single"
                        bind:value={voteDate}
                        class="bg-transparent p-0 mx-auto"
                        weekdayFormat="short"
                      />
                    </div>
                    <!-- Scrollable slots grid in sidebar -->
                    <div
                      class="border-t border-border/60 p-3 max-h-40 overflow-y-auto"
                    >
                      <span
                        class="text-[9px] text-muted-foreground font-bold uppercase tracking-wider block mb-2"
                        >选择具体时段</span
                      >
                      <div class="grid grid-cols-3 gap-1.5">
                        {#each timeSlots as time}
                          <Button
                            variant={voteTime === time ? "default" : "outline"}
                            onclick={() => (voteTime = time)}
                            class="shadow-none text-[11px] h-7 py-1 px-1.5 cursor-pointer"
                          >
                            {time}
                          </Button>
                        {/each}
                      </div>
                    </div>
                  </div>

                  <div
                    class="p-3 bg-muted/20 border border-border rounded-xl text-xs space-y-2"
                  >
                    <div
                      class="text-[11px] text-muted-foreground leading-normal font-medium"
                    >
                      {#if voteDate && voteTime}
                        你选择的提案时间为:
                        <span class="font-bold text-foreground block mt-0.5">
                          {voteDate.toString()}
                          {voteTime}
                        </span>
                      {:else}
                        请在上方日历和时段中选择时间
                      {/if}
                    </div>
                    <Button
                      disabled={!voteDate || !voteTime}
                      onclick={doVote}
                      class="w-full text-xs font-bold h-8 cursor-pointer mt-1"
                    >
                      添加此选项并投票
                    </Button>
                  </div>
                </div>
              {:else}
                <div
                  class="p-4 rounded-xl border border-dashed border-border bg-muted/20 text-center space-y-2.5"
                >
                  <p class="text-xs text-muted-foreground leading-normal">
                    您需要先在右上角配置您的 <strong>Gamer ID</strong> 才能发起时间偏好提案。
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onclick={() => {
                      document.getElementById("header-profile-button")?.click();
                    }}
                    class="text-[11px] h-7 cursor-pointer"
                  >
                    立即配置游戏ID
                  </Button>
                </div>
              {/if}
            </Card.Content>
          </Card.Root>

          <Card.Root class="border-border bg-card/40">
            <Card.Header class="p-5 pb-3">
              <Card.Title class="text-sm font-bold flex items-center gap-2">
                <PlusIcon class="w-4 h-4 text-purple-400" />
                提案自定义选项投票
              </Card.Title>
            </Card.Header>
            <Card.Content class="p-4 pt-0 space-y-4">
              {#if userState.id}
                <div class="space-y-3">
                  <div class="space-y-1">
                    <span class="text-[10px] font-bold text-muted-foreground block">选择投票主题</span>
                    <select
                      bind:value={customTopicSelect}
                      class="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="服务器">服务器 (Server)</option>
                      <option value="游戏版本">游戏版本 (Version)</option>
                      <option value="比赛地图">比赛地图 (Maps)</option>
                      <option value="new">新建自定义主题...</option>
                    </select>
                  </div>

                  {#if customTopicSelect === "new"}
                    <div class="space-y-1 animate-in fade-in slide-in-from-top-1 duration-200">
                      <span class="text-[10px] font-bold text-muted-foreground block">自定义主题名称</span>
                      <Input
                        bind:value={customTopicInput}
                        placeholder="例如: 比赛规则, BP赛制"
                        class="h-8 text-xs bg-background/50"
                      />
                    </div>
                  {/if}

                  <div class="space-y-1">
                    <span class="text-[10px] font-bold text-muted-foreground block">选项内容</span>
                    <Input
                      bind:value={customOptionInput}
                      placeholder="例如: 韩服, BO5双败, Neo Sylphid"
                      class="h-8 text-xs bg-background/50"
                    />
                  </div>

                  <Button
                    disabled={!customOptionInput || (customTopicSelect === 'new' && !customTopicInput)}
                    onclick={handleAddCustomVote}
                    class="w-full text-xs font-bold h-8 cursor-pointer mt-1"
                  >
                    添加选项并投票
                  </Button>
                </div>
              {:else}
                <div
                  class="p-4 rounded-xl border border-dashed border-border bg-muted/20 text-center space-y-2.5"
                >
                  <p class="text-xs text-muted-foreground leading-normal">
                    您需要先在右上角配置您的 <strong>Gamer ID</strong> 才能添加自定义投票提案。
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onclick={() => {
                      document.getElementById("header-profile-button")?.click();
                    }}
                    class="text-[11px] h-7 cursor-pointer"
                  >
                    立即配置游戏ID
                  </Button>
                </div>
              {/if}
            </Card.Content>
          </Card.Root>

          {@render obsControl()}
          {@render rosterSidebar()}
        </div>
      </div>
    {:else if ["in_progress", "completed"].includes(tournament.status)}
      <!-- STAGE 3 & 4: BRACKET & RESULT -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-2 space-y-6">
          <!-- Winner Podium for Completed stage -->
          {#if tournament.status === "completed" && podium}
            <div
              class="bg-linear-to-r from-amber-500/10 via-background to-amber-500/10 border border-primary/20 rounded-2xl p-6 text-center max-w-2xl mx-auto space-y-4 shadow-lg shadow-primary/5"
            >
              <TrophyIcon
                class="w-12 h-12 text-primary mx-auto animate-bounce"
              />
              <div>
                <h2
                  class="text-xl font-extrabold tracking-tight bg-linear-to-r from-amber-400 to-amber-200 bg-clip-text text-transparent"
                >
                  冠军诞生！恭喜 {playerName(podium.champion)}
                </h2>
                <p class="text-xs text-muted-foreground mt-1">
                  SUCK 赛事已完美收官
                </p>
              </div>

              <div class="grid grid-cols-2 gap-4 max-w-md mx-auto pt-2">
                <div class="p-3 bg-card/60 border border-primary/20 rounded-xl">
                  <CrownIcon class="w-5 h-5 text-amber-400 mx-auto mb-1" />
                  <p
                    class="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold"
                  >
                    冠军 (Gold)
                  </p>
                  <p class="text-sm font-bold text-foreground mt-0.5">
                    {playerName(podium.champion)}
                  </p>
                </div>
                <div class="p-3 bg-card/60 border border-border rounded-xl">
                  <div
                    class="w-5 h-5 rounded-full bg-zinc-400 text-black text-[10px] font-bold mx-auto mb-1 flex items-center justify-center"
                  >
                    2
                  </div>
                  <p
                    class="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold"
                  >
                    亚军 (Silver)
                  </p>
                  <p class="text-sm font-bold text-foreground mt-0.5">
                    {playerName(podium.runnerUp)}
                  </p>
                </div>
              </div>

              <!-- Export data for SUCK Utilities -->
              <div class="pt-2 flex justify-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onclick={triggerJsonDownload}
                  class="text-xs gap-1.5 h-8 hover:bg-primary hover:text-black cursor-pointer border-primary/20"
                >
                  <DownloadIcon class="w-3.5 h-3.5" />
                  导出赛事数据 (JSON)
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onclick={openWikiExport}
                  class="text-xs gap-1.5 h-8 hover:bg-primary hover:text-black cursor-pointer border-primary/20"
                >
                  <FileTextIcon class="w-3.5 h-3.5" />
                  生成 Liquipedia Wiki 脚本
                </Button>
              </div>
            </div>
          {/if}

          <!-- Standings / Rankings Table for Completed stage -->
          {#if tournament.status === "completed" && standings.length > 0}
            <Card.Root class="border-border bg-card/40 max-w-2xl mx-auto mt-6">
              <Card.Header class="p-6 pb-3">
                <Card.Title class="text-base font-bold flex items-center gap-2">
                  <ListOrderedIcon class="w-5 h-5 text-primary" />
                  赛事最终名次排行 (Standings)
                </Card.Title>
                <Card.Description class="text-xs">
                  {isSwiss
                    ? "按瑞士轮积分榜排名：积分 → 小分净胜 → 对手分（对手积分之和）→ 种子。"
                    : "基于淘汰赛各轮次淘汰情况计算得出的选手最终名次。"}
                </Card.Description>
              </Card.Header>
              <Card.Content class="p-6 pt-0">
                <div
                  class="overflow-x-auto border border-border/50 rounded-xl bg-background/25"
                >
                  <table
                    class="w-full border-collapse text-left text-xs text-foreground/95"
                  >
                    <thead>
                      <tr
                        class="border-b border-border/50 bg-muted/20 text-[10px] uppercase font-bold text-muted-foreground"
                      >
                        <th class="py-2.5 px-4 w-40">名次</th>
                        <th class="py-2.5 px-4">选手 (Player)</th>
                        <th class="py-2.5 px-4 text-center w-24">胜场/总场</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-border/30">
                      {#each standings as item}
                        <tr class="hover:bg-background/40 transition-colors">
                          <td class="py-3 px-4 font-bold text-primary">
                            {item.rank}
                          </td>
                          <td class="py-3 px-4">
                            <span
                              class="flex items-center gap-1.5 font-semibold"
                            >
                              {#if item.team}
                                <span
                                  class="text-[10px] text-muted-foreground font-mono"
                                  >[{item.team}]</span
                                >
                              {/if}
                              <span>{item.display_name || item.id}</span>
                              {#if item.flag}
                                <span class="flex items-center gap-1">
                                  <Flag code={item.flag} size={16} />
                                  <span
                                    class="text-[9px] font-bold px-1 rounded bg-muted text-muted-foreground uppercase font-mono"
                                    >{item.flag}</span
                                  >
                                </span>
                              {/if}
                            </span>
                          </td>
                          <td
                            class="py-3 px-4 text-center font-mono font-medium text-muted-foreground"
                          >
                            {item.matchesWon} / {item.matchesPlayed}
                          </td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              </Card.Content>
            </Card.Root>
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
<Dialog.Root bind:open={showMatchDialog}>
  <Dialog.Content class="{reportStep === 'banpick' && banpickEnabled && !correctingMatch ? '!max-w-4xl' : '!max-w-xl'} w-full max-h-[90vh] overflow-y-auto bg-card border border-border">
    <Dialog.Header>
      <Dialog.Title class="text-base font-bold text-foreground">
        {#if correctingMatch}
          <div class="mb-1">修正比赛结果</div>
        {:else if reportStep === "banpick" && banpickEnabled}
          <div class="flex flex-wrap items-center gap-2 mb-1 pr-6">
            <span>Ban / Pick</span>
            {#if bpState.phase === "done"}
              <Button size="sm" onclick={() => (reportStep = "score")}>填报比分 →</Button>
            {:else}
              <Button size="sm" disabled={!canConfirm(bpState)} onclick={() => (bpState = confirmResult(bpState))}
                title={canConfirm(bpState) ? "锁定本场载具" : "抽到载具后才能确认"}>确认抽取结果</Button>
            {/if}
          </div>
        {:else}
          <div class="flex flex-wrap items-center gap-2 mb-1 pr-6">
            <span>填报比分</span>
            {#if banpickEnabled && bpMatchId === selectedMatch?.id && bpState.phase === "done"}
              <span class="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                本场载具：{bpState.vehicle}
              </span>
            {/if}
          </div>
        {/if}
      </Dialog.Title>
      <Dialog.Description class="text-xs text-muted-foreground">
        场次: {selectedMatch?.position} • {selectedMatch ? matchRoundLabel(selectedMatch) : ""}
      </Dialog.Description>
    </Dialog.Header>

    {#if selectedMatch}
      {#if reportStep === "banpick" && banpickEnabled}
        <div class="py-2">
          {#key selectedMatch.id}
            <BanPickPanel
              bind:bp={bpState}
              vehicles={poolVehicles(tournament?.vehicle_pool, defaultVehiclePools)}
              poolName={defaultVehiclePools.find((p) => p.id === tournament?.vehicle_pool)?.name || ""}
              player1={{ name: playerName(selectedMatch.player1_id), flag: tournament?.players?.find((p) => p.id === selectedMatch.player1_id)?.flag }}
              player2={{ name: playerName(selectedMatch.player2_id), flag: tournament?.players?.find((p) => p.id === selectedMatch.player2_id)?.flag }}
            />
          {/key}
        </div>
      {:else}
        <div class="py-3 space-y-4">
          {#if correctingMatch}
            <div class="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs space-y-1">
              <div><span class="font-bold text-amber-500">当前记录：</span>{recordedResultLabel(selectedMatch)}</div>
              <div class="text-muted-foreground">提交后会先重置本场，再按新结果重新晋级；如果晋级选手已打过后续比赛，那些比赛也会被清空。</div>
            </div>
          {/if}
          <ScoreForm
            player1={{
              id: selectedMatch.player1_id,
              name: playerName(selectedMatch.player1_id),
              flag: tournament?.players?.find((p) => p.id === selectedMatch.player1_id)?.flag,
              seed: tournament?.players?.find((p) => p.id === selectedMatch.player1_id)?.seed,
            }}
            player2={{
              id: selectedMatch.player2_id,
              name: playerName(selectedMatch.player2_id),
              flag: tournament?.players?.find((p) => p.id === selectedMatch.player2_id)?.flag,
              seed: tournament?.players?.find((p) => p.id === selectedMatch.player2_id)?.seed,
            }}
            bind:score1={score1Input}
            bind:score2={score2Input}
            format={tournament?.format}
            loserAdvances={tournament?.loser_advances === 1 || tournament?.loser_advances === true}
            disabled={submittingResult}
            onWalkover={recordWalkover}
          />
        </div>
        <Dialog.Footer class="flex gap-2">
          {#if correctingMatch}
            <Button size="sm" variant="outline" disabled={submittingResult} onclick={doRollback}
              class="border-destructive/40 text-destructive hover:bg-destructive hover:text-white">重置为未开始</Button>
          {/if}
          <Button size="sm" disabled={submittingResult || Number(score1Input) === Number(score2Input)} onclick={() => {
            const winnerId = Number(score1Input) > Number(score2Input) ? selectedMatch.player1_id : selectedMatch.player2_id;
            selectGameWinner(winnerId);
          }} class="flex-1 h-9 font-bold">
            {submittingResult ? "提交中…" : `${correctingMatch ? "提交修正" : "提交比分"}  ${Number(score1Input) || 0} : ${Number(score2Input) || 0}`}
          </Button>
        </Dialog.Footer>
      {/if}
    {/if}
  </Dialog.Content>
</Dialog.Root>

<!-- Dialog for ending voting and selecting final time -->
<Dialog.Root bind:open={showStatusTimeDialog}>
  <Dialog.Content class="max-w-100 bg-card border border-border">
    <Dialog.Header>
      <Dialog.Title
        class="text-lg font-bold tracking-tight text-foreground flex items-center gap-2"
      >
        <ClockIcon class="w-5 h-5 text-primary" />
        确定比赛时间
      </Dialog.Title>
      <Dialog.Description class="text-xs text-muted-foreground">
        请确定比赛最终进行的时间。开启报名后，选手将能看到此时间。
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-4 py-3">
      <!-- Custom Input -->
      <div class="space-y-1.5">
        <label
          for="final-time-input"
          class="text-xs font-bold text-muted-foreground"
          >确定的比赛时间 (支持输入自定义文字)</label
        >
        <Input
          id="final-time-input"
          bind:value={selectedFinalTime}
          placeholder="例如: 2026-06-20 20:00 或 本周六晚8点"
          class="bg-background border-border text-foreground text-xs"
        />
      </div>

      <!-- Voted Options to pick -->
      {#if voteOptions.length > 0}
        <div class="space-y-2">
          <span class="text-xs font-bold text-muted-foreground block"
            >根据投票结果快捷点选：</span
          >
          <div
            class="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto pr-1"
          >
            {#each voteOptions as opt}
              {@const displayTime = formatVoteTime(opt.proposed_time)}
              <button
                type="button"
                onclick={() => (selectedFinalTime = displayTime)}
                class="flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all text-xs cursor-pointer text-left
                {selectedFinalTime === displayTime
                  ? 'bg-primary/10 border-primary text-primary font-bold'
                  : 'bg-background/40 border-border hover:border-primary/40 hover:bg-background/80 text-foreground'}"
              >
                <span>{displayTime}</span>
                <Badge
                  variant="secondary"
                  class="bg-primary/20 text-primary font-bold text-[10px]"
                >
                  {opt.count} 票
                </Badge>
              </button>
            {/each}
          </div>
        </div>
      {/if}
    </div>

    <Dialog.Footer class="flex flex-col sm:flex-row gap-2 mt-2">
      <Button
        variant="outline"
        size="sm"
        onclick={() => (showStatusTimeDialog = false)}
        class="w-full sm:w-auto text-xs"
      >
        取消
      </Button>
      <Button
        size="sm"
        onclick={confirmEndVoting}
        class="w-full sm:w-auto text-xs font-bold"
      >
        确定并开启报名
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<!-- Liquipedia Wiki Export Dialog -->
<Dialog.Root bind:open={showWikiDialog}>
  <Dialog.Content
    class="max-w-125 bg-card border border-border p-6 flex flex-col gap-4"
  >
    <Dialog.Header>
      <Dialog.Title
        class="text-lg font-bold text-foreground flex items-center gap-2"
      >
        <FileTextIcon class="w-5 h-5 text-primary" />
        Liquipedia Wiki 代码导出
      </Dialog.Title>
      <Dialog.Description class="text-xs text-muted-foreground">
        为您自动统计赛事结果与比分，生成匹配的 Liquipedia Bracket
        格式代码。
      </Dialog.Description>
    </Dialog.Header>

    {#if loadingWiki}
      <div
        class="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground text-xs"
      >
        <div
          class="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"
        ></div>
        <span>正在编译生成代码...</span>
      </div>
    {:else}
      <div class="space-y-4">
        <div class="relative">
          <textarea
            readonly
            value={generatedWikiText}
            class="w-full h-64 bg-background border border-border rounded-xl p-3 text-[10px] font-mono text-foreground focus-visible:outline-none resize-none"
          ></textarea>
        </div>

        <div class="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onclick={() => (showWikiDialog = false)}
            class="flex-1 text-xs h-9 cursor-pointer"
          >
            取消
          </Button>
          <Button
            size="sm"
            onclick={copyWikiToClipboard}
            class="flex-1 text-xs font-semibold h-9 cursor-pointer gap-1.5"
          >
            <CopyIcon class="w-3.5 h-3.5" /> 复制 Wiki 代码
          </Button>
        </div>
      </div>
    {/if}
  </Dialog.Content>
</Dialog.Root>

<!-- Participant Profile Edit Dialog -->
<Dialog.Root bind:open={showPlayerEditDialog}>
  <Dialog.Content
    class="max-w-105 bg-card border border-border p-6 flex flex-col gap-4"
  >
    <Dialog.Header>
      <Dialog.Title
        class="text-base font-bold text-foreground flex items-center gap-2"
      >
        <SettingsIcon class="w-5 h-5 text-primary" />
        编辑选手资料
      </Dialog.Title>
      <Dialog.Description class="text-xs text-muted-foreground">
        配置选手的展示名称、国籍、战队前缀等 Liquipedia Wiki 导出字段。
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-4 py-2">
      <!-- ID -->
      <div class="space-y-1.5">
        <label
          for="edit-player-id"
          class="text-xs font-bold text-muted-foreground"
          >选手唯一 ID (Player ID)</label
        >
        <Input
          id="edit-player-id"
          bind:value={editPlayerNewId}
          placeholder="选手唯一 ID（修改后会自动刷新全库所有对局和记录）"
          class="bg-background border-border text-foreground text-xs"
        />
      </div>

      <!-- Contact (QQ / Discord) -->
      <div class="space-y-2.5">
        <span class="text-xs font-bold text-muted-foreground"
          >联系方式（QQ / Discord）</span
        >
        <div
          class="grid grid-cols-1 md:grid-cols-2 gap-4 bg-muted/20 border border-border/60 p-4 rounded-xl"
        >
          <div class="space-y-1">
            <label
              for="edit-contact-qq"
              class="text-[11px] font-bold text-muted-foreground">QQ 号</label
            >
            <Input
              id="edit-contact-qq"
              bind:value={editPlayerQQ}
              placeholder="例如: 123456789"
              class="text-xs h-8 bg-background border-border text-foreground"
            />
          </div>
          <div class="space-y-1">
            <label
              for="edit-contact-discord"
              class="text-[11px] font-bold text-muted-foreground"
              >Discord 用户名</label
            >
            <Input
              id="edit-contact-discord"
              bind:value={editPlayerDiscord}
              placeholder="例如: username"
              class="text-xs h-8 bg-background border-border text-foreground"
            />
          </div>
        </div>
        <p class="text-[10px] text-muted-foreground/60">
          赛务联系用，会显示在选手列表中。
        </p>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div class="space-y-1.5">
          <label for="edit-flag" class="text-xs font-bold text-muted-foreground"
            >国籍/地区 (Flag)</label
          >
          <div class="flex items-center gap-2">
            <Flag code={editPlayerFlag} size={20} />
            <Input
              id="edit-flag"
              bind:value={editPlayerFlag}
              placeholder="例如: cn, hk, tw"
              class="bg-background border-border text-foreground text-xs flex-1"
            />
          </div>
        </div>
        <div class="space-y-1.5">
          <label for="edit-team" class="text-xs font-bold text-muted-foreground"
            >战队前缀 (Team Tag)</label
          >
          <Input
            id="edit-team"
            bind:value={editPlayerTeam}
            placeholder="例如: AlphaX"
            class="bg-background border-border text-foreground text-xs"
          />
        </div>
      </div>

      <!-- Battle.net IDs (removable) -->
      <div class="space-y-1.5">
        <span class="text-xs font-bold text-muted-foreground block"
          >已关联游戏账号 (Battle.net IDs)</span
        >
        <div
          class="flex flex-wrap gap-1.5 min-h-10 p-2 rounded-xl border border-border bg-background/30"
        >
          {#each editPlayerBnetIds as account, idx (idx)}
            <Badge
              variant="secondary"
              class="text-xs py-0.5 px-2 bg-muted/65 border border-border/60 text-foreground font-mono gap-1"
            >
              {#if account.url}
                <a
                  href={account.url}
                  target="_blank"
                  rel="noopener"
                  class="text-primary hover:underline">{account.id} ↗</a
                >
              {:else}
                {account.id}
              {/if}
              {#if accountRegionLabel(account)}
                <span class="text-muted-foreground/70"
                  >{accountRegionLabel(account)}</span
                >
              {/if}
              <button
                type="button"
                onclick={() => removeBnetId(idx)}
                title="移除该账号"
                class="rounded p-0.5 text-muted-foreground hover:bg-destructive/20 hover:text-destructive cursor-pointer"
              >
                <XIcon class="w-3 h-3" />
              </button>
            </Badge>
          {/each}
          {#if editPlayerBnetIds.length === 0}
            <span
              class="text-[10px] text-muted-foreground/60 italic self-center px-1"
              >暂无关联的游戏账号</span
            >
          {/if}
        </div>
        <p class="text-[10px] text-muted-foreground/60">
          此处为全局账号；仅在某届赛事临时使用的账号请到该赛事的「账号关联」里管理。
        </p>
      </div>

      <!-- Wiki Link -->
      <div class="space-y-1.5">
        <label for="edit-link" class="text-xs font-bold text-muted-foreground"
          >Wiki 个人页链接 (Link)</label
        >
        <Input
          id="edit-link"
          bind:value={editPlayerLink}
          placeholder="例如: User:Bnet"
          class="bg-background border-border text-foreground text-xs"
        />
        <p class="text-[10px] text-muted-foreground/60">
          Liquipedia Wiki 页面名称，最终将链接至
          https://liquipedia.net/warthunder/&lt;名称&gt;
        </p>
      </div>
    </div>

    <Dialog.Footer class="flex flex-col sm:flex-row gap-2 mt-2">
      <Button
        variant="outline"
        size="sm"
        onclick={() => (showPlayerEditDialog = false)}
        class="w-full sm:w-auto text-xs"
      >
        取消
      </Button>
      <Button
        size="sm"
        onclick={handleSavePlayer}
        class="w-full sm:w-auto text-xs font-bold"
      >
        保存资料
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<!-- Dialog: tournament-scoped account links -->
<Dialog.Root bind:open={showAccountsDialog}>
  <Dialog.Content
    class="max-w-2xl bg-card border border-border p-6 flex flex-col gap-4"
  >
    <Dialog.Header>
      <Dialog.Title
        class="text-lg font-bold text-foreground flex items-center gap-2"
      >
        <LinkIcon class="w-5 h-5 text-sky-500" />
        本赛事账号关联
      </Dialog.Title>
      <Dialog.Description class="text-xs text-muted-foreground">
        解析默认把账号写入选手<b>全局资料</b>（所有赛事通用，URL 为空的会在重新解析时补全）。只有个别临时借用的账号才点「解绑全局」，改成仅本赛事生效。「重新解析并补充」也会把历史遗留的临时关联合并回全局。
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-3 max-h-100 overflow-y-auto pr-1 py-1">
      {#each tournament.players || [] as p (p.id)}
        {@const scoped = accountsByPlayer[p.id] || []}
        {@const scopedKeys = new Set(scoped.map((s) => s.account_key))}
        {@const scopedNames = new Set(
          scoped.map((s) => (s.account_name || "").toLowerCase().trim()),
        )}
        {@const global = parseBnetEntries(p.bnet_ids).filter((g) => {
          const name = ((typeof g === "string" ? g : g.id) || "")
            .toLowerCase()
            .trim();
          const key = accountKey(g);
          return !(name && scopedNames.has(name)) && !(key && scopedKeys.has(key));
        })}
        <div class="p-3 rounded-xl border border-border bg-background/30 space-y-2">
          <div class="flex items-center justify-between gap-2">
            <div class="text-sm font-bold text-foreground ">
              {p.display_name && p.display_name !== p.id
                ? `${p.display_name} (${p.id})`
                : p.id}
            </div>
            <Badge variant="secondary" class="text-[10px] font-mono shrink-0"
              >{p.race || "U"}</Badge
            >
          </div>
          {#if global.length === 0 && scoped.length === 0}
            <div class="text-[11px] text-muted-foreground/60 italic">
              暂无关联账号
            </div>
          {:else}
            <div class="flex flex-wrap gap-1.5">
              {#each global as g, gi (gi)}
                {@const gName = typeof g === "string" ? g : g.id || ""}
                {@const gUrl = typeof g === "object" ? g.url : ""}
                <span
                  class="inline-flex items-center gap-1 text-[10px] font-mono bg-muted/60 border border-border/60 rounded-md pl-1.5 pr-1 py-0.5"
                >
                  <span class="text-[9px] text-emerald-500 font-bold">全局</span>
                  {#if gUrl}
                    <a
                      href={gUrl}
                      target="_blank"
                      rel="noopener"
                      class="text-primary hover:underline">{gName} ↗</a
                    >
                  {:else}
                    <span>{gName}</span>
                  {/if}
                  {#if accountRegionLabel(g)}
                    <span class="text-muted-foreground/70"
                      >{accountRegionLabel(g)}</span
                    >
                  {/if}
                  <button
                    type="button"
                    disabled={accountsBusy}
                    onclick={() => makeTemporary(p.id, g)}
                    title="解绑全局（只在本次赛事临时保留该账号）"
                    class="rounded px-1 py-0.5 text-[9px] hover:bg-sky-500/20 hover:text-sky-500 text-muted-foreground disabled:opacity-50 cursor-pointer"
                    >解绑全局</button
                  >
                  <button
                    type="button"
                    disabled={accountsBusy}
                    onclick={() => removeGlobalAccount(p.id, g)}
                    title="移除全局账号"
                    class="rounded p-0.5 hover:bg-destructive/20 hover:text-destructive text-muted-foreground disabled:opacity-50 cursor-pointer"
                  >
                    <XIcon class="w-3 h-3" />
                  </button>
                </span>
              {/each}
              {#each scoped as a (a.account_key)}
                <span
                  class="inline-flex items-center gap-1 text-[10px] font-mono bg-sky-500/5 border border-sky-500/30 rounded-md pl-1.5 pr-1 py-0.5"
                >
                  <span class="text-[9px] text-sky-500 font-bold">临时</span>
                  {#if a.url}
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noopener"
                      class="text-primary hover:underline"
                      >{a.account_name || a.account_key} ↗</a
                    >
                  {:else}
                    <span>{a.account_name || a.account_key}</span>
                  {/if}
                  {#if accountRegionLabel(a)}
                    <span class="text-muted-foreground/70"
                      >{accountRegionLabel(a)}</span
                    >
                  {/if}
                  <button
                    type="button"
                    disabled={accountsBusy}
                    onclick={() => makePermanent(p.id, a)}
                    title="绑回全局（写入选手全局资料）"
                    class="rounded px-1 py-0.5 text-[9px] hover:bg-emerald-500/20 hover:text-emerald-500 text-muted-foreground disabled:opacity-50 cursor-pointer"
                    >绑回全局</button
                  >
                  <button
                    type="button"
                    disabled={accountsBusy}
                    onclick={() => unlinkTournamentAccount(a.account_key)}
                    title="解除临时关联"
                    class="rounded p-0.5 hover:bg-destructive/20 hover:text-destructive text-muted-foreground disabled:opacity-50 cursor-pointer"
                  >
                    <XIcon class="w-3 h-3" />
                  </button>
                </span>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>

    <Dialog.Footer
      class="mt-2 border-t border-border pt-3 flex flex-row items-center justify-between gap-3"
    >
      <Button
        variant="ghost"
        size="sm"
        onclick={() => (showAccountsDialog = false)}
        class="text-xs h-8 cursor-pointer">关闭</Button
      >
      <div class="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={accountsBusy}
          onclick={cleanupEmptyAccounts}
          class="text-xs h-8 cursor-pointer gap-1.5"
        >
          <TrashIcon class="w-3.5 h-3.5" />
          清理无 URL 账号
        </Button>
      </div>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<!-- Next Match Hand-off Dialog (blocking while in progress with no live match) -->
<Dialog.Root bind:open={nextMatchModalOpen}>
  <Dialog.Content
    showCloseButton={false}
    escapeKeydownBehavior="ignore"
    interactOutsideBehavior="ignore"
    class="max-w-2xl bg-card border border-primary/30"
  >
    <Dialog.Header>
      <Dialog.Title class="text-base font-bold text-primary flex items-center gap-2">
        <PlayIcon class="w-4 h-4" /> 请选择下一场直播对局
      </Dialog.Title>
      <Dialog.Description class="text-xs text-muted-foreground">
        赛事进行中，但当前没有正在直播的对局。请从下方候选对局中选择一场；选定后将开始
        60 秒倒计时，超时自动把大屏切换到游戏内 HUD。
      </Dialog.Description>
    </Dialog.Header>

    <div class="max-h-[60vh] overflow-y-auto space-y-2 py-2">
      {#each nextMatchCandidates as m (m.id)}
        <button
          onclick={() => chooseNextMatch(m.id)}
          class="w-full text-left p-3 rounded-lg border border-border bg-background/40 hover:border-primary/50 hover:bg-primary/5 transition-colors cursor-pointer"
        >
          <div class="flex items-center justify-between gap-3">
            <span class="text-xs font-semibold text-foreground">
              #{matchOrder.get(m.id)} · {roundLabel(m.round, totalRounds)} · 场次 {m.position}
            </span>
            <Badge variant="outline" class="text-[10px]">待赛</Badge>
          </div>
          <div class="mt-1 text-xs text-foreground/90">
            {playerName(m.player1_id)}
            <span class="text-muted-foreground"> vs </span>
            {playerName(m.player2_id)}
          </div>
        </button>
      {/each}
    </div>
  </Dialog.Content>
</Dialog.Root>

<!-- Going-live pre-flight checklist -->
<Dialog.Root bind:open={showStreamChecklist}>
  <Dialog.Content class="max-w-2xl bg-card border border-primary/30">
    <Dialog.Header>
      <Dialog.Title class="text-base font-bold text-primary flex items-center gap-2">
        <RadioIcon class="w-4 h-4" /> 开播前检查
      </Dialog.Title>
      <Dialog.Description class="text-xs text-muted-foreground">
        请确认以下各项均已设置完成；全部勾选后才能激活直播状态。
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-2 py-2">
      {#each STREAM_CHECKLIST_ITEMS as item (item.key)}
        {@const ItemIcon = item.icon}
        <label
          class="flex items-center gap-3 p-3 rounded-lg border border-border bg-background/40 cursor-pointer select-none"
        >
          <input
            type="checkbox"
            bind:checked={streamChecks[item.key]}
            class="h-4 w-4 accent-primary cursor-pointer"
          />
          <ItemIcon class="w-4 h-4 text-muted-foreground shrink-0" />
          <div class="min-w-0">
            <div class="text-xs font-semibold text-foreground">{item.label}</div>
            <div class="text-[10px] text-muted-foreground">{item.desc}</div>
          </div>
        </label>
      {/each}
    </div>

    <Dialog.Footer class="flex flex-row justify-end gap-2">
      <Button
        variant="ghost"
        size="sm"
        class="h-8 text-xs cursor-pointer"
        onclick={() => (showStreamChecklist = false)}
      >
        取消
      </Button>
      <Button
        size="sm"
        class="h-8 text-xs cursor-pointer"
        disabled={!streamChecklistAllDone}
        onclick={confirmStreamMode}
      >
        开始直播
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<style>
  /* Bracket Connectors */
  .line-horizontal-active, .line-horizontal-inactive {
    background: #a2a9b1;
    opacity: 0.8;
    height: 1.5px !important;
  }

  .line-vertical-active, .line-vertical-inactive {
    background: #a2a9b1;
    opacity: 0.8;
    width: 1.5px !important;
  }

  /* Dark mode overrides for connectors */
  :global(.dark) .line-horizontal-active, :global(.dark) .line-horizontal-inactive {
    background: #475569;
    opacity: 0.4;
    height: 1.5px !important;
  }
  :global(.dark) .line-vertical-active, :global(.dark) .line-vertical-inactive {
    background: #475569;
    opacity: 0.4;
    width: 1.5px !important;
  }
</style>

