<script>
  // OBS overlay for an event: five scenes (intro, intermission, ingame, the
  // bracket "hybrid" scene and "banpick"), 1920x1080 scaled to the window.
  // The scene comes from ?scene=, else the dashboard's choice, else the live
  // match (its Ban / Pick until the result is confirmed, then ingame).
  // A scene change plays a short stinger (SceneStinger; ?stinger=false
  // turns it off).
  // ?channel=N follows one live channel (its live match and scene), so
  // several streams of one event can each have their own overlay.
  // Scenes live in #lib/components/overlay, layout maths in
  // #lib/overlay-layout.js.
  import { onMount, untrack } from "svelte";
  import { page } from "$app/state";
  import { API } from "#lib/api.js";
  import { buildMatchOrder } from "#lib/bracket.js";
  import { GROUP_STAGE_BRACKETS, matchStageLabels, overlayStages, pickStage, playersStillIn } from "#lib/overlay.js";
  import { isBye, isDecided, isPlayable, playerLookup } from "#lib/overlay-layout.js";
  import { liveElsewhere, parseChannel, withChannel } from "#lib/live-channels.js";
  import IntroScene from "#lib/components/overlay/IntroScene.svelte";
  import IntermissionScene from "#lib/components/overlay/IntermissionScene.svelte";
  import IngameScene from "#lib/components/overlay/IngameScene.svelte";
  import HybridScene from "#lib/components/overlay/HybridScene.svelte";
  import BanPickScene from "#lib/components/overlay/BanPickScene.svelte";
  import SceneStinger, { STINGER_COVER_MS } from "#lib/components/overlay/SceneStinger.svelte";
  import { liveSync } from "#lib/live-sync.js";

  let tid = $derived(page.params.id);
  let sceneParam = $derived(page.url.searchParams.get("scene") || "auto"); // auto, intro, ingame, intermission, hybrid, banpick
  // Stage to show: "wb:2", "sw:3"... (a plain round number still works for
  // single elimination and Swiss).
  let stageParam = $derived(page.url.searchParams.get("stage") || page.url.searchParams.get("round"));
  let bgParam = $derived(page.url.searchParams.get("bg"));
  let transparentParam = $derived(page.url.searchParams.get("transparent") === "true");
  let channel = $derived(parseChannel(page.url.searchParams.get("channel")));

  // The event as this channel sees it (live match, scene, stage).
  let event = $state(null);
  let tournament = $derived(withChannel(event, channel));
  let otherChannels = $derived(liveElsewhere(event, channel));
  let loading = $state(true);
  let errorMsg = $state("");

  // Two-stage events: the group stage (Swiss rounds or group brackets) until
  // the playoff starts, then only the playoff.
  let inPlayoffs = $derived(Boolean(tournament?.playoff_format) && tournament?.current_stage === "playoff");
  let stageMatches = $derived(
    (tournament?.matches || []).filter((m) =>
      tournament?.playoff_format ? inPlayoffs === !GROUP_STAGE_BRACKETS.includes(m.bracket) : true,
    ),
  );
  let isSwiss = $derived(tournament?.format === "swiss" && !inPlayoffs);

  let who = $derived(playerLookup(tournament?.players || []));
  // Still in the event: one loss in single elimination, a losers-bracket
  // loss in double elimination; nobody is out in Swiss (null).
  let alivePlayerIds = $derived(playersStillIn(tournament?.players || [], stageMatches, { swiss: isSwiss }));
  function isAlive(playerId) {
    if (!playerId) return false;
    return alivePlayerIds ? alivePlayerIds.has(playerId) : true;
  }

  // Stage labels of a match: "胜者组第 2 轮" / "WB2", "瑞士轮 第 3 轮" / "R3"...
  function stageLabel(m) {
    return matchStageLabels(m, stageMatches).label;
  }
  function stageShort(m) {
    return matchStageLabels(m, tournament?.matches || []).short;
  }

  let matchOrder = $derived(buildMatchOrder(stageMatches));
  // Real matches exclude byes; used for progress and the side panel.
  let realMatches = $derived(stageMatches.filter((m) => !isBye(m)));
  // Playable matches in recommended bracket order, without those being
  // streamed on another channel.
  let playableMatches = $derived(
    stageMatches.filter((m) => isPlayable(m) && !otherChannels.has(m.id)).sort((a, b) => (matchOrder.get(a.id) ?? 0) - (matchOrder.get(b.id) ?? 0)),
  );
  let nextMatch = $derived(playableMatches[0] || null);
  let activeMatch = $derived(tournament?.matches?.find((m) => m.id === tournament.active_match_id) || null);

  // Stages: one round of one bracket each, in playing order.
  let stages = $derived(overlayStages(stageMatches));
  // Selected stage: URL stage/round param first, then the stage chosen in
  // the dashboard (overlay_stage), otherwise the first stage that still has
  // matches to play. overlay_round is not used: changing the scene in the
  // dashboard rewrites it, which used to pin the overlay to an old round.
  let explicitStage = $derived(stageParam || tournament?.overlay_stage || null);
  let selectedStage = $derived(pickStage(stages, explicitStage));

  // Completed matches by stage for the ticker, latest stage first.
  let tickerRounds = $derived(
    stages
      .map((s) => ({ key: s.key, short: s.short, matches: s.matches.filter((m) => isDecided(m) && m.player1_id && m.player2_id) }))
      .filter((s) => s.matches.length)
      .reverse(),
  );

  let currentScene = $derived.by(() => {
    if (sceneParam && sceneParam !== "auto") return sceneParam;
    if (tournament?.overlay_scene && tournament.overlay_scene !== "auto") return tournament.overlay_scene;
    if (activeMatch && bpPending(activeMatch)) return "banpick";
    return activeMatch ? "ingame" : "hybrid";
  });
  // The live match still needs its Ban / Pick: the event has one (and a
  // vehicle pool), the match is not played yet (no live score) and its
  // result is not confirmed.
  const bpPending = (m) =>
    Boolean(pool) && tournament?.banpick_enabled !== false && m.status === "pending" && m.live_score1 == null && m.banpick?.state?.phase !== "done";

  // The event's vehicle pool, for the Ban / Pick scene's groups and pictures
  // (and to know whether the event has Ban / Pick at all).
  let pool = $state(null);
  let poolLoaded = false;
  $effect(() => {
    const wanted = currentScene === "banpick" || (tournament && tournament.banpick_enabled !== false);
    if (!wanted || poolLoaded || !tid) return;
    poolLoaded = true;
    API.getEventVehiclePool(tid)
      .then((res) => (pool = res?.template || null))
      .catch(() => (poolLoaded = false));
  });
  // A stinger (the logo wipe) plays on every scene change after the first
  // one, and the new scene appears only once the stinger covers the frame
  // (?stinger=false: switch at once, no stinger).
  let stingerOn = $derived(page.url.searchParams.get("stinger") !== "false");
  let stingerKey = $state(0);
  let shownScene = $state(null);
  let swapTimer = null;
  $effect(() => {
    const next = loading ? null : currentScene;
    untrack(() => {
      if (!next || next === shownScene) return;
      clearTimeout(swapTimer);
      if (!shownScene || !stingerOn) {
        shownScene = next;
        return;
      }
      stingerKey += 1;
      swapTimer = setTimeout(() => (shownScene = currentScene), STINGER_COVER_MS);
    });
  });
  $effect(() => () => clearTimeout(swapTimer));
  let scene = $derived(shownScene || currentScene);

  // The ingame scene is transparent unless bg=true; the others have the
  // ambient background unless transparent=true.
  let isTransparent = $derived(transparentParam || (scene === "ingame" && bgParam !== "true"));

  // Live updates: a burst of event messages becomes one refresh.
  $effect(() => {
    if (!tid) return;
    load();
    // Short delays so the stream scene follows quickly (#lib/live-sync.js).
    return liveSync(tid, {
      current: () => untrack(() => event),
      apply: (next) => (event = next),
      delay: 150,
      maxWait: 600,
    });
  });

  async function load() {
    loading = true;
    errorMsg = "";
    try {
      event = await API.getTournament(tid);
    } catch (e) {
      errorMsg = e.message || "Failed to load tournament";
    } finally {
      loading = false;
    }
  }

  let scale = $state(1);
  function handleResize() {
    scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  }
  onMount(() => {
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  });
</script>

<svelte:head>
  <title>Potato Cup Overlay - {currentScene.toUpperCase()}</title>
  <link
    href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800;900&family=Orbitron:wght@600;800;900&family=Noto+Sans+SC:wght@505;700;900&display=swap"
    rel="stylesheet"
  />
</svelte:head>

<div class="w-screen h-screen overflow-hidden relative flex items-center justify-center {isTransparent ? 'bg-transparent' : 'bg-black'}">
  <div
    class="overlay-container font-outfit text-white overflow-hidden flex flex-col relative select-none shrink-0
      {isTransparent ? 'bg-transparent' : 'bg-radial-gradient'}"
    style="width: 1920px; height: 1080px; transform: scale({scale}); transform-origin: center center;"
  >
    {#if !isTransparent}
      <div class="glow-orb glow-cyan"></div>
      <div class="glow-orb glow-purple"></div>
      <div class="glow-orb glow-orange"></div>
    {/if}

    {#key stingerKey}
      {#if stingerKey}<SceneStinger />{/if}
    {/key}

    {#if loading}
      <div class="flex-1 flex flex-col items-center justify-center gap-3">
        <div class="w-16 h-16 rounded-full border-4 border-cyan-500 border-t-transparent animate-spin"></div>
        <p class="text-base font-mono tracking-widest text-cyan-400 uppercase animate-pulse">Loading Stream Overlay...</p>
      </div>
    {:else if errorMsg}
      <div class="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
        <div class="text-red-500 text-5xl">⚠️</div>
        <div class="text-2xl font-bold tracking-tight text-white">{errorMsg}</div>
        <p class="text-base text-slate-400 max-w-md">Verify the tournament ID or server connection in the dashboard panel.</p>
      </div>
    {:else if scene === "intro"}
      <IntroScene {tournament} stage={selectedStage} {matchOrder} {who} />
    {:else if scene === "intermission"}
      <IntermissionScene matches={playableMatches} {matchOrder} {stageShort} {who} />
    {:else if scene === "ingame"}
      <IngameScene {tournament} {tickerRounds} {activeMatch} {stageShort} {who} />
    {:else if scene === "banpick"}
      <BanPickScene {tournament} {activeMatch} {pool} {stageShort} {who} />
    {:else if scene === "hybrid"}
      <HybridScene
        {tournament}
        matches={stageMatches}
        {stages}
        {selectedStage}
        {explicitStage}
        {activeMatch}
        {nextMatch}
        {realMatches}
        {isSwiss}
        {inPlayoffs}
        {matchOrder}
        {stageLabel}
        {isAlive}
        {who}
      />
    {/if}
  </div>
</div>

<style>
  /* Base CSS Styles & Animations */
  :global(body, html) {
    margin: 0;
    padding: 0;
    background-color: transparent;
    overflow: hidden;
    width: 100vw;
    height: 100vh;
  }

  .bg-radial-gradient {
    background: radial-gradient(circle at 50% 50%, #04070d 0%, #000000 100%);
  }

  /* Animated Neon Ambient Orbs */
  .glow-orb {
    position: absolute;
    border-radius: 50%;
    filter: blur(140px);
    opacity: 0.16;
    z-index: 0;
    pointer-events: none;
    animation: float 25s infinite ease-in-out alternate;
  }

  .glow-cyan {
    background: #06b6d4;
    width: 700px;
    height: 700px;
    top: -250px;
    left: -200px;
  }

  .glow-purple {
    background: #a855f7;
    width: 600px;
    height: 600px;
    bottom: -200px;
    right: -150px;
    animation-delay: -5s;
  }

  .glow-orange {
    background: #f97316;
    width: 500px;
    height: 500px;
    top: 30%;
    left: 60%;
    animation-delay: -10s;
  }

  @keyframes float {
    0% {
      transform: translate(0, 0) scale(1);
    }
    100% {
      transform: translate(70px, 60px) scale(1.15);
    }
  }
</style>
