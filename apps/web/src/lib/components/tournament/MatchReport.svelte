<script>
  // Reporting a match: Ban / Pick, a live score during play, the score or a
  // walkover, an admin's correction or rollback, in MatchResultDialog. Players' scores wait for
  // the opponent (PendingReportPanel: confirm, dispute, withdraw); admins'
  // take effect at once. Methods: report(match), openBanPick(match),
  // openDetails(match) (report when pending, correct when an admin can),
  // confirmReport(match), disputeReport(match), withdrawReport(match).
  import { toast } from "svelte-sonner";
  import { API } from "#lib/api.js";
  import { askConfirm } from "#lib/confirm.svelte.js";
  import { initialBanPick } from "#lib/banpick.js";
  import { canCorrectResult } from "#lib/tournament.js";
  import { correctionWarning, hasDependentMatchPlayed, recordedResultLabel, resultMessage } from "#lib/event-view.js";
  import MatchResultDialog from "./MatchResultDialog.svelte";
  import { userState } from "#lib/user.svelte.js";

  let {
    tournament,
    tid,
    isAdmin = false,
    banpickEnabled = false,
    bpTemplate = null,
    playerName,
    matchRoundLabel,
    live = null, // the event as this console's live channel sees it
    liveChannel = 1,
    handoff = null,
    ensureAdmin,
    needsIdentity,
    onreload,
  } = $props();

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
    // Continue from the live score saved during the match, if any.
    score1Input = Number(match.live_score1) || 0;
    score2Input = Number(match.live_score2) || 0;
    showMatchDialog = true;
  }

  export function openBanPick(match) {
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

  // Before a result is (re)entered: a correction first resets this match
  // (and anything it fed into); a new result over played later matches
  // resets those. Returns false if cancelled or the reset failed.
  async function prepareResult(correctionLabel, overwriteWarning) {
    if (correctingMatch) {
      if (!ensureAdmin()) return false;
      if (!(await askConfirm(correctionWarning(selectedMatch, tournament.matches || [], correctionLabel), { danger: true }))) return false;
      try {
        await API.rollbackResult(tid, selectedMatch.id);
      } catch (err) {
        toast.error("重置原结果失败: " + err.message);
        return false;
      }
    } else if (hasDependentMatchPlayed(selectedMatch, tournament?.matches || [])) {
      if (!(await askConfirm(overwriteWarning, { danger: true }))) return false;
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
    await onreload?.();
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
      const res = await API.submitResult(tid, selectedMatch.id, Number(score1Input) || 0, Number(score2Input) || 0);
      if (res?.report === "pending") toast.success("比分已提交，等待对手确认（10 分钟内对方不确认也不提出异议将自动生效）");
      else if (res?.report === "disputed") toast.warning("和对手提交的比分不一致，已交给管理员处理");
      else if (res?.report === "confirmed") toast.success("和对手提交的比分一致，结果已生效");
      else toast.success(resultMessage(tournament, selectedMatch, winnerId, playerName));
      await finishResult();
    } catch (e) {
      toast.error(e.message);
    } finally {
      submittingResult = false;
    }
  }

  // Live score during the match: no winner, no advancement; the dialog
  // stays open for the next change.
  let savingLive = $state(false);
  async function saveLiveScore(score1, score2) {
    if (needsIdentity() || !selectedMatch) return;
    savingLive = true;
    try {
      const res = await API.setLiveScore(tid, selectedMatch.id, score1, score2);
      if (res?.match) selectedMatch = res.match;
      toast.success(`已保存实时比分 ${score1} : ${score2}`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      savingLive = false;
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
      const res = await API.submitWalkover(tid, selectedMatch.id, winnerId);
      if (res?.report === "pending") toast.success("已申报对手弃权，等待管理员确认");
      else if (res?.report === "disputed") toast.warning("和对手提交的结果不一致，已交给管理员处理");
      else toast.success("已记录弃权并晋级胜者");
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
    if (!(await askConfirm(confirmMsg, { danger: true }))) return;
    submittingResult = true;
    try {
      await API.rollbackResult(tid, selectedMatch.id);
      toast.success("比赛已成功回滚并重设");
      showMatchDialog = false;
      selectedMatch = null;
      await onreload?.();
    } catch (e) {
      toast.error("回滚失败: " + e.message);
    } finally {
      submittingResult = false;
    }
  }

  // Pending reports: the opponent confirms or disputes, the reporter
  // withdraws; an admin applies one side (`which`) or rejects it.
  async function reportAction(match, run, done) {
    submittingResult = true;
    try {
      await run();
      toast.success(done);
      if (selectedMatch?.id === match.id) showMatchDialog = false;
      await onreload?.();
    } catch (e) {
      toast.error(e.message);
    } finally {
      submittingResult = false;
    }
  }
  export function confirmReport(match, which = "report") {
    if (needsIdentity()) return;
    return reportAction(match, () => API.confirmReport(tid, match.id, which), "结果已确认生效");
  }
  export async function disputeReport(match) {
    if (needsIdentity()) return;
    if (!(await askConfirm("确定对这个结果提出异议吗？比赛结果将交给管理员处理。", { confirmText: "提出异议" }))) return;
    return reportAction(match, () => API.disputeReport(tid, match.id), "已提出异议，请联系管理员处理");
  }
  export async function withdrawReport(match) {
    if (needsIdentity()) return;
    const ask = isAdmin ? "驳回这个申报？比赛会回到未提交状态。" : "撤回你提交的结果？";
    if (!(await askConfirm(ask))) return;
    return reportAction(match, () => API.withdrawReport(tid, match.id), isAdmin ? "已驳回" : "已撤回");
  }

  export function report(match) {
    openMatchReport(match);
  }
  export function openDetails(match) {
    openMatchDetails(match);
  }
</script>

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
  {isAdmin}
  viewerId={userState.id}
  onconfirmreport={(which) => confirmReport(selectedMatch, which)}
  ondisputereport={() => disputeReport(selectedMatch)}
  onwithdrawreport={() => withdrawReport(selectedMatch)}
  onwalkover={recordWalkover}
  onrollback={doRollback}
  onsubmit={selectGameWinner}
  onsavelive={saveLiveScore}
  {savingLive}
/>
