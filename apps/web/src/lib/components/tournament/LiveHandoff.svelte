<script>
  // "Going live" mode of the event page for one live channel. Only this
  // browser is affected (remembered per event): while it is on and the
  // event is in progress with no live match on the channel, the operator
  // must pick the next match (blocking dialog). The overlay shows the VS card
  // (both players) for 15 s first. With Ban / Pick on (`banpick`)
  // and the match's result not confirmed yet, the overlay shows the Ban /
  // Pick scene first and waits; once the result is confirmed (on the server,
  // by anyone) the countdown starts. Without it the bracket scene shows.
  // 60 s after that the overlay switches to the in-game HUD (countdown
  // banner, can be pushed back).
  // Methods: start() (asks the pre-flight checklist first), stop(),
  // clearHud(), matchFinished() (back to the bracket scene).
  import { toast } from "svelte-sonner";
  import { API } from "#lib/api.js";
  import { saveStreamMode } from "#lib/live-channels.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import NextMatchDialog from "./NextMatchDialog.svelte";
  import StreamChecklistDialog from "./StreamChecklistDialog.svelte";
  import ClockIcon from "@lucide/svelte/icons/clock";

  let {
    tournament,
    tid,
    channel = 1,
    isAdmin = false,
    streamMode = $bindable(false),
    candidates = [],
    overlayMatches = [],
    matchOrder,
    roundLabel,
    playerName,
    ensureAdmin,
    onreload,
    banpick = false, // the event has Ban / Pick with a vehicle pool
  } = $props();

  const AUTO_HUD_DELAY = 60;
  const AUTO_HUD_EXTEND = 30;

  let checklistOpen = $state(false);
  let nextMatchOpen = $state(false);
  let hudActive = $state(false);
  let hudSeconds = $state(AUTO_HUD_DELAY);
  let timer = null;
  // The live match whose Ban / Pick we wait for (its id), or null.
  let waitingBp = $state(null);

  // The active match only counts as live while it is still pending.
  let liveMatch = $derived.by(() => {
    const id = tournament?.active_match_id;
    const m = id ? tournament?.matches?.find((x) => x.id === id) : null;
    return m && m.status === "pending" ? m : null;
  });
  let needsNextMatch = $derived(
    streamMode && tournament?.status === "in_progress" && !liveMatch && candidates.length > 0,
  );

  // When a hand-off is required, force the dialog open and cancel any stale countdown.
  $effect(() => {
    if (needsNextMatch && isAdmin) {
      clearHud();
      nextMatchOpen = true;
    } else {
      nextMatchOpen = false;
    }
  });

  // Waiting for Ban / Pick: the confirmed result starts the countdown; an
  // admin undoing it stops the countdown and waits again.
  let bpDone = $derived(liveMatch?.banpick?.state?.phase === "done");
  $effect(() => {
    if (!waitingBp || liveMatch?.id !== waitingBp) return;
    if (bpDone && !hudActive) {
      toast.success("Ban/Pick 结果已确认，倒计时后切换到游戏内 HUD");
      startCountdown();
    } else if (!bpDone && hudActive) {
      stopTimer();
      showBanPickScene();
    }
  });
  // The match ended or another one went live: stop waiting.
  $effect(() => {
    if (!waitingBp) return;
    const m = tournament?.matches?.find((x) => x.id === waitingBp);
    const other = tournament?.active_match_id && tournament.active_match_id !== waitingBp;
    if (!m || m.status !== "pending" || other) waitingBp = null;
  });

  // Stop the countdown when leaving the page.
  $effect(() => () => clearHud());

  function overlayRound() {
    return tournament?.overlay_round || Math.max(...(overlayMatches?.map((m) => m.round) || [1]));
  }

  /** Stops the countdown and any wait for Ban / Pick (e.g. an admin picked a scene by hand). */
  export function clearHud() {
    waitingBp = null;
    stopVersus();
    stopTimer();
  }

  function stopTimer() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    hudActive = false;
  }

  async function switchToHud() {
    if (!ensureAdmin()) return;
    clearHud();
    waitingBp = null;
    try {
      await API.setOverlayState(tid, "ingame", overlayRound(), undefined, channel);
      toast.success("已自动切换大屏到游戏内 HUD 场景");
    } catch (e) {
      toast.error("自动切换大屏场景失败: " + e.message);
    }
  }

  // Keep showing the bracket while waiting for the game to start.
  async function showBracketScene() {
    if (!ensureAdmin()) return;
    try {
      await API.setOverlayState(tid, "hybrid", overlayRound(), undefined, channel);
    } catch (e) {
      toast.error("切换大屏到场间场景失败: " + e.message);
    }
  }

  async function showBanPickScene() {
    if (!ensureAdmin()) return;
    try {
      await API.setOverlayState(tid, "banpick", overlayRound(), undefined, channel);
    } catch (e) {
      toast.error("切换大屏到 Ban/Pick 场景失败: " + e.message);
    }
  }

  /** Skips waiting for Ban / Pick and starts the countdown now. */
  function skipBanPick() {
    waitingBp = null;
    startCountdown();
  }

  /** After a live match's result: back to the bracket scene while streaming. */
  export async function matchFinished() {
    if (streamMode) await showBracketScene();
  }

  function startCountdown() {
    stopTimer();
    hudSeconds = AUTO_HUD_DELAY;
    hudActive = true;
    timer = setInterval(() => {
      hudSeconds -= 1;
      if (hudSeconds <= 0) {
        stopTimer();
        switchToHud();
      }
    }, 1000);
  }

  function postpone() {
    if (!hudActive) return;
    hudSeconds += AUTO_HUD_EXTEND;
    toast.info(`已延后 ${AUTO_HUD_EXTEND} 秒切换到大屏 HUD`);
  }

  // The VS card shows first, for VERSUS_SECONDS (or until 跳过).
  const VERSUS_SECONDS = 15;
  let versus = $state(null); // { matchId, withBp, seconds }
  let versusTimer = null;
  function stopVersus() {
    if (versusTimer) clearInterval(versusTimer);
    versusTimer = null;
    versus = null;
  }
  async function afterVersus() {
    const v = versus;
    stopVersus();
    if (!v || liveMatch?.id !== v.matchId) return;
    if (v.withBp) {
      await showBanPickScene();
      waitingBp = v.matchId;
      toast.success("大屏切到 Ban/Pick；结果确认后倒计时切换到游戏内 HUD");
    } else {
      await showBracketScene();
      startCountdown();
    }
  }

  async function chooseNextMatch(matchId) {
    if (!ensureAdmin()) return;
    try {
      const match = tournament?.matches?.find((m) => m.id === matchId);
      const withBp = banpick && match?.banpick?.state?.phase !== "done";
      // Scene first, then mark the match live, so the overlay never flashes the HUD.
      await setScene("versus");
      await API.setActiveMatch(tid, matchId, channel);
      nextMatchOpen = false;
      stopTimer();
      // Reload first so the page already knows the new live match.
      await onreload?.();
      toast.success(
        withBp
          ? `已选择当前直播对局：先显示 VS 对位卡 ${VERSUS_SECONDS} 秒，再进入 Ban/Pick`
          : `已选择当前直播对局：先显示 VS 对位卡 ${VERSUS_SECONDS} 秒，再倒计时切换到游戏内 HUD`,
      );
      stopVersus();
      versus = { matchId, withBp, seconds: VERSUS_SECONDS };
      versusTimer = setInterval(() => {
        if (!versus) return;
        versus.seconds -= 1;
        if (versus.seconds <= 0) afterVersus();
      }, 1000);
    } catch (e) {
      toast.error("选择直播对局失败: " + e.message);
    }
  }

  async function setScene(scene) {
    try {
      await API.setOverlayState(tid, scene, overlayRound(), undefined, channel);
    } catch (e) {
      toast.error("切换大屏场景失败: " + e.message);
    }
  }

  export function start() {
    checklistOpen = true;
  }

  // Called by the checklist once every item is ticked.
  function confirmStart() {
    streamMode = true;
    saveStreamMode(tid, true);
    toast.success("已激活直播状态，将强制选择下一场直播对局");
  }

  export function stop() {
    streamMode = false;
    saveStreamMode(tid, false);
    clearHud();
    waitingBp = null;
    nextMatchOpen = false;
    toast.info("已结束直播状态");
  }
</script>

{#if versus}
  <div
    class="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 rounded-xl border border-primary/30 bg-card/95 px-4 py-3 shadow-lg backdrop-blur"
  >
    <ClockIcon class="w-4 h-4 text-primary shrink-0 animate-pulse" />
    <span class="text-xs font-medium whitespace-nowrap">大屏显示 VS 对位卡 · {versus.seconds}s 后</span>
    <span class="text-xs font-medium whitespace-nowrap">{versus.withBp ? "进入 Ban/Pick" : "切到对阵图并开始倒计时"}</span>
    <Button size="sm" class="h-7 text-xs cursor-pointer" onclick={afterVersus}>跳过</Button>
  </div>
{/if}
{#if waitingBp && !hudActive}
  <div
    class="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 rounded-xl border border-primary/30 bg-card/95 px-4 py-3 shadow-lg backdrop-blur"
  >
    <ClockIcon class="w-4 h-4 text-primary shrink-0 animate-pulse" />
    <span class="text-xs font-medium whitespace-nowrap">大屏显示 Ban/Pick，等待结果确认…</span>
    <Button size="sm" variant="outline" class="h-7 text-xs cursor-pointer" onclick={skipBanPick}>跳过，开始倒计时</Button>
  </div>
{/if}
{#if hudActive}
  <div
    class="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 rounded-xl border border-primary/30 bg-card/95 px-4 py-3 shadow-lg backdrop-blur"
  >
    <ClockIcon class="w-4 h-4 text-primary shrink-0" />
    <span class="text-xs font-medium whitespace-nowrap">{hudSeconds}s 后自动切换大屏到游戏内 HUD</span>
    <Button size="sm" class="h-7 text-xs cursor-pointer" onclick={switchToHud}>立即切换</Button>
    <Button size="sm" variant="outline" class="h-7 text-xs cursor-pointer" onclick={postpone}>延后 +30s</Button>
  </div>
{/if}

<!-- Blocking while in progress with no live match -->
<NextMatchDialog bind:open={nextMatchOpen} {candidates} {matchOrder} {roundLabel} {playerName} onchoose={chooseNextMatch} />

<!-- Pre-flight checklist -->
<StreamChecklistDialog bind:open={checklistOpen} onconfirm={confirmStart} />
