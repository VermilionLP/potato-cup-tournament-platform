<script>
  // "Going live" mode of the event page for one live channel. Only this
  // browser is affected (remembered per event). It walks the overlay through
  // a match, one stage at a time; every timed stage is STAGE_SECONDS long,
  // shown in a banner with 立即切换 and 延后 +30s:
  //   1. versus  — the next match is picked: the VS card (players' intro);
  //   2. banpick — with Ban / Pick on (`banpick`) and no confirmed result:
  //                the Ban / Pick scene until the result is confirmed (by
  //                anyone, on the server; 跳过 BP moves on);
  //   3. prep    — time to start the game (the scene stays), then the
  //                in-game HUD; an admin undoing the Ban / Pick result goes
  //                back to 2;
  //   4. review  — after the result: the bracket scene, then the next-match
  //                dialog (blocking while the event is in progress and no
  //                match is live on the channel).
  // Picking a scene by hand in the OBS card (clearHud) stops the stages.
  // Methods: start() (asks the pre-flight checklist first), stop(),
  // clearHud(), matchFinished().
  import { untrack } from "svelte";
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

  const STAGE_SECONDS = 30;
  const EXTEND_SECONDS = 30;

  let checklistOpen = $state(false);
  let nextMatchOpen = $state(false);
  // { name: "versus" | "banpick" | "prep" | "review", matchId, withBp, seconds }
  let stage = $state(null);
  let timer = null;

  // The active match only counts as live while it is still pending.
  let liveMatch = $derived.by(() => {
    const id = tournament?.active_match_id;
    const m = id ? tournament?.matches?.find((x) => x.id === id) : null;
    return m && m.status === "pending" ? m : null;
  });
  let needsNextMatch = $derived(
    streamMode && tournament?.status === "in_progress" && !liveMatch && candidates.length > 0,
  );

  // The next-match dialog: when one is needed and the bracket review is over.
  $effect(() => {
    if (needsNextMatch && isAdmin && stage?.name !== "review") {
      untrack(() => {
        if (stage) stopStage();
      });
      nextMatchOpen = true;
    } else {
      nextMatchOpen = false;
    }
  });

  // The live match got a result (here or anywhere else): review the bracket.
  let lastLive = null;
  $effect(() => {
    const id = liveMatch?.id ?? null;
    untrack(() => {
      if (lastLive && !id && streamMode) {
        const m = tournament?.matches?.find((x) => x.id === lastLive);
        if (m && m.status !== "pending") startReview();
      }
      lastLive = id;
    });
  });

  // Ban / Pick: a confirmed result moves on to prep; an undo goes back.
  let bpDone = $derived(liveMatch?.banpick?.state?.phase === "done");
  $effect(() => {
    const done = bpDone;
    untrack(() => {
      if (!stage || liveMatch?.id !== stage.matchId) return;
      if (stage.name === "banpick" && done) {
        toast.success("Ban/Pick 结果已确认");
        startPrep(stage);
      } else if (stage.name === "prep" && stage.withBp && !done) {
        toast.info("Ban/Pick 结果被撤销，回到 Ban/Pick");
        startBanPick(stage);
      }
    });
  });
  // Another match went live: the stages of the old one stop.
  $effect(() => {
    const id = tournament?.active_match_id;
    untrack(() => {
      if (stage && stage.matchId && id && id !== stage.matchId) stopStage();
    });
  });

  // Stop timers when leaving the page.
  $effect(() => () => stopStage());

  function overlayRound() {
    return tournament?.overlay_round || Math.max(...(overlayMatches?.map((m) => m.round) || [1]));
  }

  async function setScene(scene) {
    if (!ensureAdmin()) return;
    try {
      await API.setOverlayState(tid, scene, overlayRound(), undefined, channel);
    } catch (e) {
      toast.error("切换大屏场景失败: " + e.message);
    }
  }

  function stopStage() {
    if (timer) clearInterval(timer);
    timer = null;
    stage = null;
  }

  /** A timed stage: counts down from STAGE_SECONDS, then `next()`. */
  function timed(next) {
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      if (!stage) return;
      stage.seconds -= 1;
      if (stage.seconds <= 0) {
        clearInterval(timer);
        timer = null;
        next();
      }
    }, 1000);
  }

  const NEXT = {
    versus: (s) => (s.withBp && !bpDone ? "进入 Ban/Pick" : "开始准备，然后切到游戏内 HUD"),
    prep: () => "切换到游戏内 HUD",
    review: () => "选择下一场比赛",
  };
  const TITLE = { versus: "VS 对位卡（介绍选手）", prep: "准备开始游戏", review: "对阵图（查看比赛进展）" };

  /** Moves the current timed stage on now. */
  function advance() {
    const s = stage;
    if (!s) return;
    if (timer) clearInterval(timer);
    timer = null;
    if (s.name === "versus") afterVersus(s);
    else if (s.name === "prep") switchToHud();
    else if (s.name === "review") stopStage();
  }
  function postpone() {
    if (!stage || stage.name === "banpick") return;
    stage.seconds += EXTEND_SECONDS;
    toast.info(`已延后 ${EXTEND_SECONDS} 秒`);
  }

  function afterVersus(s) {
    if (liveMatch?.id !== s.matchId) return stopStage();
    if (s.withBp && !bpDone) startBanPick(s);
    else startPrep(s);
  }

  async function startBanPick(s) {
    if (timer) clearInterval(timer);
    timer = null;
    stage = { ...s, name: "banpick", seconds: 0 };
    await setScene("banpick");
  }

  // The scene stays (the Ban / Pick result or the VS card) while the game starts.
  function startPrep(s) {
    stage = { ...s, name: "prep", seconds: STAGE_SECONDS };
    timed(switchToHud);
  }

  async function switchToHud() {
    stopStage();
    await setScene("ingame");
    toast.success("已切换大屏到游戏内 HUD");
  }

  async function startReview() {
    if (stage?.name === "review") return;
    stopStage();
    stage = { name: "review", matchId: null, withBp: false, seconds: STAGE_SECONDS };
    await setScene("hybrid");
    timed(stopStage);
  }

  /** Stops the stages (an admin picked a scene by hand). */
  export function clearHud() {
    stopStage();
  }

  /** After a live match's result (called by the result dialog): review the bracket. */
  export async function matchFinished() {
    if (streamMode) await startReview();
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
      stopStage();
      lastLive = matchId;
      // Reload first so the page already knows the new live match.
      await onreload?.();
      stage = { name: "versus", matchId, withBp, seconds: STAGE_SECONDS };
      timed(() => afterVersus(stage));
      toast.success(`已选择直播对局：先显示 VS 对位卡 ${STAGE_SECONDS} 秒`);
    } catch (e) {
      toast.error("选择直播对局失败: " + e.message);
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
    stopStage();
    nextMatchOpen = false;
    toast.info("已结束直播状态");
  }
</script>

{#if stage}
  <div
    class="fixed bottom-5 left-1/2 z-[60] flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-xl border border-primary/30 bg-card/95 px-4 py-3 shadow-lg backdrop-blur"
  >
    <ClockIcon class="h-4 w-4 shrink-0 text-primary {stage.name === 'banpick' ? 'animate-pulse' : ''}" />
    {#if stage.name === "banpick"}
      <span class="text-xs font-medium">大屏显示 Ban/Pick，等待结果确认…</span>
      <Button size="sm" variant="outline" class="h-7 cursor-pointer text-xs" onclick={() => startPrep(stage)}>跳过 BP</Button>
    {:else}
      <span class="text-xs font-bold">{TITLE[stage.name]}</span>
      <span class="text-xs font-medium tabular-nums">{stage.seconds}s 后{NEXT[stage.name](stage)}</span>
      <Button size="sm" class="h-7 cursor-pointer text-xs" onclick={advance}>立即切换</Button>
      <Button size="sm" variant="outline" class="h-7 cursor-pointer text-xs" onclick={postpone}>延后 +{EXTEND_SECONDS}s</Button>
    {/if}
  </div>
{/if}

<!-- Blocking while in progress with no live match -->
<NextMatchDialog bind:open={nextMatchOpen} {candidates} {matchOrder} {roundLabel} {playerName} onchoose={chooseNextMatch} />

<!-- Pre-flight checklist -->
<StreamChecklistDialog bind:open={checklistOpen} onconfirm={confirmStart} />
