<script>
  // "Going live" mode of the event page. Only this browser is affected: while
  // it is on and the event is in progress with no live match, the operator
  // must pick the next match (blocking dialog); 60 s later the overlay
  // switches to the in-game HUD (countdown banner, can be pushed back).
  // Methods: start() (asks the pre-flight checklist first), stop(),
  // clearHud(), matchFinished() (back to the bracket scene).
  import { toast } from "svelte-sonner";
  import { API } from "$lib/api.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import NextMatchDialog from "./NextMatchDialog.svelte";
  import StreamChecklistDialog from "./StreamChecklistDialog.svelte";
  import ClockIcon from "@lucide/svelte/icons/clock";

  let {
    tournament,
    tid,
    isAdmin = false,
    streamMode = $bindable(false),
    candidates = [],
    overlayMatches = [],
    matchOrder,
    roundLabel,
    playerName,
    ensureAdmin,
    onreload,
  } = $props();

  const AUTO_HUD_DELAY = 60;
  const AUTO_HUD_EXTEND = 30;
  const STORAGE_KEY = "suck_stream_mode";

  let checklistOpen = $state(false);
  let nextMatchOpen = $state(false);
  let hudActive = $state(false);
  let hudSeconds = $state(AUTO_HUD_DELAY);
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

  // When a hand-off is required, force the dialog open and cancel any stale countdown.
  $effect(() => {
    if (needsNextMatch && isAdmin) {
      clearHud();
      nextMatchOpen = true;
    } else {
      nextMatchOpen = false;
    }
  });

  // Stop the countdown when leaving the page.
  $effect(() => () => clearHud());

  function overlayRound() {
    return tournament?.overlay_round || Math.max(...(overlayMatches?.map((m) => m.round) || [1]));
  }

  export function clearHud() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    hudActive = false;
  }

  async function switchToHud() {
    if (!ensureAdmin()) return;
    try {
      await API.setOverlayState(tid, "ingame", overlayRound());
      toast.success("已自动切换大屏到游戏内 HUD 场景");
    } catch (e) {
      toast.error("自动切换大屏场景失败: " + e.message);
    }
  }

  // Keep showing the bracket while waiting for the game to start.
  async function showBracketScene() {
    if (!ensureAdmin()) return;
    try {
      await API.setOverlayState(tid, "hybrid", overlayRound());
    } catch (e) {
      toast.error("切换大屏到场间场景失败: " + e.message);
    }
  }

  /** After a live match's result: back to the bracket scene while streaming. */
  export async function matchFinished() {
    if (streamMode) await showBracketScene();
  }

  function startCountdown() {
    clearHud();
    hudSeconds = AUTO_HUD_DELAY;
    hudActive = true;
    timer = setInterval(() => {
      hudSeconds -= 1;
      if (hudSeconds <= 0) {
        clearHud();
        switchToHud();
      }
    }, 1000);
  }

  function postpone() {
    if (!hudActive) return;
    hudSeconds += AUTO_HUD_EXTEND;
    toast.info(`已延后 ${AUTO_HUD_EXTEND} 秒切换到大屏 HUD`);
  }

  async function chooseNextMatch(matchId) {
    if (!ensureAdmin()) return;
    try {
      // Bracket first, then mark the match live, so the overlay never flashes the HUD.
      await showBracketScene();
      await API.setActiveMatch(tid, matchId);
      nextMatchOpen = false;
      toast.success("已选择当前直播对局，倒计时结束后切换到大屏游戏内 HUD");
      startCountdown();
      await onreload?.();
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
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // private mode: on for this page only
    }
    toast.success("已激活直播状态，将强制选择下一场直播对局");
  }

  export function stop() {
    streamMode = false;
    try {
      localStorage.setItem(STORAGE_KEY, "0");
    } catch {
      // ignore
    }
    clearHud();
    nextMatchOpen = false;
    toast.info("已结束直播状态");
  }
</script>

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
