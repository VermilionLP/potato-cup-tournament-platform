<script>
  // Reporting a match: Ban / Pick, the score or a walkover, an admin's
  // correction or rollback, in MatchResultDialog. Methods: report(match),
  // openBanPick(match), openDetails(match) (report when pending, correct
  // when an admin can).
  import { toast } from "svelte-sonner";
  import { API } from "$lib/api.js";
  import { initialBanPick } from "$lib/banpick.js";
  import { canCorrectResult } from "$lib/tournament.js";
  import { correctionWarning, hasDependentMatchPlayed, recordedResultLabel, resultMessage } from "$lib/event-view.js";
  import MatchResultDialog from "./MatchResultDialog.svelte";

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
    score1Input = 0;
    score2Input = 0;
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
      await onreload?.();
    } catch (e) {
      toast.error("回滚失败: " + e.message);
    } finally {
      submittingResult = false;
    }
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
  onwalkover={recordWalkover}
  onrollback={doRollback}
  onsubmit={selectGameWinner}
/>
