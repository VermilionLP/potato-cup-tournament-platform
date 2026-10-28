<script>
  // Event page: loads the event, keeps it live (SSE) and holds the actions
  // (registration, seeds, results, stages). What it shows is derived in
  // $lib/event-view.js; sections and dialogs live in
  // $lib/components/tournament.
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import { API } from "$lib/api.js";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { userState } from "$lib/user.svelte.js";
  import { buildMatchOrder } from "$lib/bracket.js";
  import { formatScheduled, parseLocal } from "$lib/datetime.js";
  import { initialBanPick } from "$lib/banpick.js";
  import { resolveTemplate } from "$lib/vehicle-pools.js";
  import { overlayStages, pickStage } from "$lib/overlay.js";
  import { formatVoteTime, suggestedVoteTimes, voteOptionsFrom } from "$lib/votes.js";
  import {
    canCorrectResult,
    eventFormatLabel,
    GROUP_FORMATS,
    isValidSwissRounds,
    MAX_SWISS_ROUNDS,
    MIN_SWISS_ROUNDS,
    startBlockedMessage,
  } from "$lib/tournament.js";
  import {
    bracketMatchesOf,
    correctionWarning,
    eventStandings,
    eventStatusLabel,
    hasDependentMatchPlayed,
    inPlayoffStage,
    isDoubleElimEvent,
    isTwoStageEvent,
    overlayStageMatches,
    playableInOrder,
    playerNamer,
    podiumOf,
    previewMinPlayers,
    recordedResultLabel,
    resultMessage,
    roundLabeler,
    seedOrderOf,
  } from "$lib/event-view.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import VoteBoard from "$lib/components/tournament/VoteBoard.svelte";
  import VoteProposals from "$lib/components/tournament/VoteProposals.svelte";
  import RegistrationCard from "$lib/components/tournament/RegistrationCard.svelte";
  import SeedingCard from "$lib/components/tournament/SeedingCard.svelte";
  import EventHeader from "$lib/components/tournament/EventHeader.svelte";
  import StatusControls from "$lib/components/tournament/StatusControls.svelte";
  import PhaseStepper from "$lib/components/tournament/PhaseStepper.svelte";
  import MatchResultDialog from "$lib/components/tournament/MatchResultDialog.svelte";
  import ResultsPanel from "$lib/components/tournament/ResultsPanel.svelte";
  import RosterCard from "$lib/components/tournament/RosterCard.svelte";
  import ObsControlCard from "$lib/components/tournament/ObsControlCard.svelte";
  import WikiExportDialog from "$lib/components/tournament/WikiExportDialog.svelte";
  import TimeEditDialog from "$lib/components/tournament/TimeEditDialog.svelte";
  import FinalTimeDialog from "$lib/components/tournament/FinalTimeDialog.svelte";
  import PlayerEditDialog from "$lib/components/tournament/PlayerEditDialog.svelte";
  import EventBracketCard from "$lib/components/tournament/EventBracketCard.svelte";
  import LiveHandoff from "$lib/components/tournament/LiveHandoff.svelte";
  import { channelOptions, liveElsewhere, savedChannel, savedStreamMode, saveChannel, withChannel } from "$lib/live-channels.js";
  import TrophyIcon from "@lucide/svelte/icons/trophy";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";

  let tid = $derived(page.params.id);
  let tournament = $state(null);
  let loading = $state(true);
  let isAdmin = $derived(!!userState.adminToken);

  // Two-stage events: a group stage (Swiss, or single-/double-elimination
  // brackets per group; `format` says which), then an elimination playoff
  // (`playoff_format`). The elimination views and placements only ever see
  // playoff matches.
  let isTwoStage = $derived(isTwoStageEvent(tournament));
  let inPlayoffs = $derived(inPlayoffStage(tournament));
  let bracketMatches = $derived(bracketMatchesOf(tournament));
  // Group stage played as brackets (not Swiss).
  let hasGroupBrackets = $derived(isTwoStage && tournament?.format !== "swiss");
  let groupFormatLabel = $derived(GROUP_FORMATS.find((f) => f.id === tournament?.format)?.label || "瑞士轮");
  let isDoubleElim = $derived(isDoubleElimEvent(tournament));
  let isSwiss = $derived(tournament?.format === "swiss");
  let stageView = $state(null); // "group" | "playoff"; null follows the current stage
  // Before the playoff exists only the group stage can be shown.
  let shownStage = $derived(inPlayoffs ? stageView || "playoff" : "group");
  let playoffBusy = $state(false);

  // Overlay controls: round controls need a non-empty list even before a
  // playoff exists; stages as the overlay picks them.
  let overlayMatches = $derived(bracketMatches.length ? bracketMatches : tournament?.matches || []);
  let overlayStageList = $derived(overlayStages(overlayStageMatches(tournament)));
  let overlayShownStage = $derived(pickStage(overlayStageList, live?.overlay_stage || null));

  let matchOrder = $derived(buildMatchOrder(tournament?.matches || []));
  let playerName = $derived(playerNamer(tournament, bracketMatches));
  let matchRoundLabel = $derived(roundLabeler(tournament, bracketMatches));
  let podium = $derived(podiumOf(tournament, bracketMatches));
  let standings = $derived(tournament ? eventStandings(tournament, bracketMatches) : []);

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
  let startBlocked = $derived(
    startBlockedMessage(
      tournament?.format,
      tournament?.players?.length || 0,
      tournament?.swiss_rounds,
      isTwoStage
        ? { groupSize: tournament?.swiss_group_size, perGroup: tournament?.advance_per_group, playoffFormat: tournament?.playoff_format }
        : null,
    ),
  );

  let allPlayers = $state([]);
  let unregisteredPlayers = $derived(allPlayers.filter((ap) => !(tournament?.players || []).some((tp) => tp.id === ap.id)));
  let isRegistered = $derived(tournament?.players?.some((p) => p.id === userState.id));
  let seedOrder = $state([]);

  // Time vote: suggested times (moved by "顺延一周") merged with the votes cast.
  let playTimes = $state(null);
  let voteWeekOffset = $state(0);
  let voteOptions = $derived(voteOptionsFrom(tournament?.votes || [], suggestedVoteTimes(playTimes, voteWeekOffset)));

  // Match result dialog
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
  let submittingResult = $state(false);

  // Dialogs
  let showStatusTimeDialog = $state(false);
  let selectedFinalTime = $state("");
  let showTimeEditDialog = $state(false);
  let timeEditValue = $state("");
  let savingTime = $state(false);
  let wikiDialog = $state(null);
  let playerEditor = $state(null);

  // Live channel of this console (remembered per event in this browser):
  // the live match and overlay controls act on it; other channels' live
  // matches are shown but left alone. `live` is the event as the channel
  // sees it.
  let liveChannel = $state(1);
  let live = $derived(withChannel(tournament, liveChannel));
  let otherChannels = $derived(liveElsewhere(tournament, liveChannel));
  let channelChoices = $derived(channelOptions(tournament, liveChannel));

  // "Going live" mode: only this browser forces the next-match flow.
  let handoff = $state(null);
  let streamMode = $state(false);
  $effect(() => {
    liveChannel = savedChannel(tid);
    streamMode = isAdmin && savedStreamMode(tid);
  });
  // Next match to stream: not one already live on another channel.
  let nextMatchCandidates = $derived(
    playableInOrder(tournament?.matches || [], matchOrder).filter((m) => !otherChannels.has(m.id)),
  );

  function changeChannel(channel) {
    handoff?.clearHud();
    liveChannel = channel;
    saveChannel(tid, channel);
  }

  function ensureAdmin() {
    if (isAdmin) return true;
    toast.error("此操作需要管理员权限，请先点击右上角盾牌图标登录");
    return false;
  }

  // Actions that need a player identity first open the profile dialog.
  function needsIdentity() {
    if (userState.qqGroup && userState.id) return false;
    toast.error("此操作需要先填写 QQ / Discord 联系方式与选手 ID。已为您打开配置面板！");
    document.getElementById("header-profile-button")?.click();
    return true;
  }

  onMount(() => {
    load();
    API.getVehiclePools()
      .then((res) => (vehicleTemplates = res.templates || []))
      .catch((e) => console.warn("vehicle pools failed to load:", e));
  });

  // Live updates: reload on every event message.
  $effect(() => {
    if (!tid) return;
    const es = new EventSource(`/api/tournaments/${tid}/stream`);
    es.onmessage = async (event) => {
      try {
        JSON.parse(event.data); // malformed messages are skipped
        tournament = await API.getTournament(tid);
        seedOrder = seedOrderOf(tournament?.players);
      } catch (e) {
        console.error("解析实时事件失败", e);
      }
    };
    es.onerror = (e) => {
      console.warn("实时推送连接发生错误，正在尝试重连...", e);
    };
    return () => es.close();
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
      seedOrder = seedOrderOf(tournament?.players);
      // Registration: refresh the bracket preview.
      if (isAdmin && tournament.status === "registration") await refreshPreview();
    } catch (e) {
      toast.error("加载赛事详情失败: " + e.message);
    } finally {
      if (isInitial) loading = false;
    }
  }

  // Regenerates the bracket preview once there are enough players (admins;
  // the server rejects it for other users).
  async function refreshPreview() {
    if ((tournament?.players?.length || 0) < previewMinPlayers(tournament)) return;
    const matches = await API.generateBracket(tid);
    tournament = { ...tournament, matches };
  }

  async function changeStatus(status) {
    if (!ensureAdmin()) return;
    try {
      tournament = await API.updateStatus(tid, status);
      toast.success(`赛事状态已切换至: ${eventStatusLabel(status)}`);
      await load();
    } catch (e) {
      toast.error(e.message);
    }
  }

  // "结束投票并开启报名": preselect the most voted future time.
  function openEndVoting() {
    if (needsIdentity()) return;
    const future = voteOptions.filter((opt) => new Date(opt.proposed_time).getTime() >= Date.now());
    const top = [...future].sort((a, b) => b.count - a.count)[0];
    selectedFinalTime = top ? formatVoteTime(top.proposed_time) : "";
    showStatusTimeDialog = true;
  }

  async function confirmEndVoting() {
    if (!ensureAdmin()) return;
    if (!selectedFinalTime.trim()) return toast.error("请选择或输入确定的比赛时间");
    try {
      const res = await API.updateStatus(tid, "registration", selectedFinalTime.trim());
      tournament = res;
      const autoCount = res.auto_registered?.length || 0;
      toast.success(
        `赛事已开启报名，比赛时间已定为: ${selectedFinalTime}` + (autoCount > 0 ? `，已自动报名 ${autoCount} 名投票选手` : ""),
      );
      showStatusTimeDialog = false;
      await load();
    } catch (e) {
      toast.error(e.message);
    }
  }

  // Registration. targetId: another player (admins); "" registers the
  // visitor. Resolves to true once registered.
  async function doRegister(targetId = "") {
    targetId = String(targetId || "").trim();
    if (targetId && targetId !== userState.id && !ensureAdmin()) return;
    if (!targetId && needsIdentity()) return;
    const id = targetId || userState.id;
    if (!id) return toast.error("请输入选手 ID");
    try {
      const players = await API.register(tid, id);
      tournament = { ...tournament, players };
      toast.success(`选手 ${id} 报名成功`);
      await load();
      if (isAdmin) await refreshPreview();
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
    try {
      await refreshPreview();
    } catch (e) {
      console.warn("bracket regeneration failed:", e);
    }
    if (ok > 0) toast.success(`已批量报名 ${ok} 人`);
    if (errors.length > 0) toast.error(errors[0]);
  }

  async function doUnregister(pid) {
    if (pid !== userState.id) {
      if (!ensureAdmin()) return;
    } else if (needsIdentity()) return;
    try {
      await API.unregister(tid, pid);
      toast.success(`选手 ${pid} 已取消报名`);
      await load();
      if (isAdmin) await refreshPreview();
      else tournament = { ...tournament, matches: [] };
    } catch (e) {
      toast.error(e.message);
    }
  }

  // Seeds
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
      // Reload so the seed panel keeps the ladder MMR/tier fields and the
      // preview stays in sync with the server-side seed order.
      await load();
    } catch (e) {
      toast.error("保存种子排序失败: " + e.message);
    }
  }

  async function toggleActiveMatch(match) {
    const isActive = live?.active_match_id === match.id;
    try {
      await API.setActiveMatch(tid, isActive ? null : match.id, liveChannel);
      tournament = await API.getTournament(tid);
      toast.success(isActive ? "已取消直播该场次" : "已开启该场次直播！");
    } catch (err) {
      toast.error("更新直播状态失败: " + err.message);
    }
  }

  // Match report: clicking a card opens the score form; the card's BP
  // button opens Ban/Pick.
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

  function openMatchDetails(match) {
    if (match.status === "pending" && tournament.status !== "completed") openMatchReport(match);
    else if (isAdmin && canCorrectResult(match)) openMatchCorrection(match);
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

  // Before a result is (re)entered: a correction first resets this match
  // (and anything it fed into); a new result over played later matches
  // resets those. Returns false if cancelled or the reset failed.
  async function prepareResult(correctionLabel, overwriteWarning) {
    if (correctingMatch) {
      if (!ensureAdmin()) return false;
      if (!confirm(correctionWarning(selectedMatch, tournament.matches || [], correctionLabel))) return false;
      try {
        await API.rollbackResult(tid, selectedMatch.id);
      } catch (err) {
        toast.error("重置原结果失败: " + err.message);
        return false;
      }
    } else if (hasDependentMatchPlayed(selectedMatch, tournament?.matches || [])) {
      if (!confirm(overwriteWarning)) return false;
      try {
        await API.rollbackResult(tid, selectedMatch.id);
      } catch (err) {
        toast.error("重置后续比赛失败: " + err.message);
        return false;
      }
    }
    return true;
  }

  // After a result: the live match is over; close the dialog and reload.
  async function finishResult() {
    if (isAdmin && live && live.active_match_id === selectedMatch.id) {
      await API.setActiveMatch(tid, null, liveChannel);
      await handoff?.matchFinished();
    }
    showMatchDialog = false;
    selectedMatch = null;
    await load();
  }

  async function selectGameWinner(winnerId) {
    if (needsIdentity() || !selectedMatch) return;
    const ok = await prepareResult(
      "修正比分",
      "【警告】该场比赛的晋级选手已在后续轮次进行了比赛！\n修改此场比赛将导致后续所有相关比赛的比分与晋级状态都被清空重置。\n\n确定要继续修改并重置后续比赛吗？",
    );
    if (!ok) return;
    submittingResult = true;
    try {
      await API.submitResult(tid, selectedMatch.id, Number(score1Input) || 0, Number(score2Input) || 0);
      toast.success(resultMessage(tournament, selectedMatch, winnerId, playerName));
      await finishResult();
    } catch (e) {
      toast.error(e.message);
    } finally {
      submittingResult = false;
    }
  }

  async function recordWalkover(winnerId) {
    if (needsIdentity() || !selectedMatch) return;
    const ok = await prepareResult(
      "改判弃权",
      "【警告】该场比赛的晋级选手已在后续轮次进行了比赛！\n判定弃权将导致后续所有相关比赛的比分与晋级状态都被清空重置。\n\n确定要继续修改并重置后续比赛吗？",
    );
    if (!ok) return;
    submittingResult = true;
    try {
      await API.submitWalkover(tid, selectedMatch.id, winnerId);
      toast.success("已记录弃权并晋级胜者");
      await finishResult();
    } catch (e) {
      toast.error(e.message);
    } finally {
      submittingResult = false;
    }
  }

  async function doRollback() {
    if (!ensureAdmin() || !selectedMatch) return;
    const confirmMsg = hasDependentMatchPlayed(selectedMatch, tournament.matches || [])
      ? "【警告】该场比赛的晋级选手已在后续轮次进行了比赛！\n如果确认回滚，后续所有相关的比赛比分与晋级状态都将被清空重置。\n\n确定要继续回滚并重置后续比赛吗？"
      : "确定要回滚这场比赛的比分并将其重设为未开始状态吗？";
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

  // Admin: download the event as JSON.
  function triggerJsonDownload() {
    if (!tournament || !isAdmin) return;
    const blob = new Blob([JSON.stringify(tournament, null, 2)], { type: "application/json" });
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
  {#snippet rosterSidebar()}
    <RosterCard {tournament} {isAdmin} onedit={(p) => playerEditor?.edit(p)} onunregister={doUnregister} />
  {/snippet}

  {#snippet obsControl()}
    <ObsControlCard
      tournament={live}
      {tid}
      channel={liveChannel}
      {channelChoices}
      elsewhere={otherChannels}
      onchannel={changeChannel}
      {isAdmin}
      {streamMode}
      {matchOrder}
      roundLabel={matchRoundLabel}
      {playerName}
      {overlayMatches}
      {overlayStageList}
      {overlayShownStage}
      onstreamstart={() => handoff?.start()}
      onstreamend={() => handoff?.stop()}
      onclearhud={() => handoff?.clearHud()}
    />
  {/snippet}

  {#snippet bracketView()}
    <EventBracketCard
      tournament={live}
      {tid}
      liveElsewhere={otherChannels}
      {isAdmin}
      {bracketMatches}
      {isTwoStage}
      {inPlayoffs}
      {isSwiss}
      {isDoubleElim}
      {hasGroupBrackets}
      {groupFormatLabel}
      {banpickEnabled}
      {matchOrder}
      {playerName}
      {playoffBusy}
      {shownStage}
      bind:stageView
      onopen={openMatchDetails}
      onbanpick={openBanPick}
      ontoggleactive={toggleActiveMatch}
      oneditrounds={editSwissRounds}
      onstartplayoffs={startPlayoffs}
      onwithdrawplayoffs={withdrawPlayoffs}
    />
  {/snippet}

  <div class="space-y-6">
    <!-- Header: title, tags, time; admin stage controls -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/60 pb-5">
      <EventHeader
        bind:tournament
        {tid}
        {isAdmin}
        statusText={eventStatusLabel(tournament.status)}
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
          canStart={!startBlocked}
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
              onexportwiki={() => wikiDialog?.start()}
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
  recordedLabel={(m) => recordedResultLabel(m, playerName)}
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
<WikiExportDialog bind:this={wikiDialog} {tid} />

<!-- Participant Profile Edit Dialog -->
<PlayerEditDialog bind:this={playerEditor} {tid} {ensureAdmin} onsaved={load} />

<!-- Going live: next-match hand-off, HUD countdown, pre-flight checklist -->
<LiveHandoff
  bind:this={handoff}
  bind:streamMode
  tournament={live}
  {tid}
  channel={liveChannel}
  {isAdmin}
  candidates={nextMatchCandidates}
  {overlayMatches}
  {matchOrder}
  roundLabel={matchRoundLabel}
  {playerName}
  {ensureAdmin}
  onreload={load}
/>
