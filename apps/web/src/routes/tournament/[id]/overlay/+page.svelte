<script>
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { API } from "$lib/api.js";
  import { bracketConnectorPath, buildMatchOrder, layoutBracketBand } from "$lib/bracket.js";
  import { matchStageLabels, overlayStages, pickStage, playersStillIn } from "$lib/overlay.js";
  import { fade, fly } from "svelte/transition";

  // URL Params & Derived States
  let tid = $derived(page.params.id);
  let sceneParam = $derived(page.url.searchParams.get("scene") || "auto"); // auto, intro, ingame, intermission
  // Stage to show in the intro scene: "wb:2", "sw:3"... (a plain round number
  // still works for single elimination and Swiss).
  let stageParam = $derived(page.url.searchParams.get("stage") || page.url.searchParams.get("round"));
  let bgParam = $derived(page.url.searchParams.get("bg"));
  let transparentParam = $derived(
    page.url.searchParams.get("transparent") === "true",
  );

  let tournament = $state(null);
  // Two-stage events: the group stage (Swiss rounds or group brackets) until
  // the playoff starts, then only the playoff.
  const GROUP_STAGE = ["sw", "gse", "gwb", "glb"];
  let stageMatches = $derived(
    (tournament?.matches || []).filter((m) =>
      tournament?.playoff_format
        ? (tournament?.current_stage === "playoff") === !GROUP_STAGE.includes(m.bracket)
        : true,
    ),
  );
  let loading = $state(true);
  let errorMsg = $state("");

  // Derived player list lookup for display names
  let playerMap = $derived(
    new Map((tournament?.players || []).map((p) => [p.id, p])),
  );

  // Helpers to get player details
  function getPlayerName(id) {
    if (!id) return "TBD";
    const p = playerMap.get(id);
    return p ? p.display_name : id;
  }

  // Ticker completed matches
  let completedMatches = $derived(
    (stageMatches || []).filter(
      (m) =>
        (m.status === "completed" || m.status === "walkover") &&
        m.player1_id &&
        m.player2_id,
    ),
  );

  function getPlayerSeed(id) {
    return playerMap.get(id)?.seed ?? null;
  }

  // Real matches exclude byes; used for progress and the side panel.
  let realMatches = $derived(
    (stageMatches || []).filter((m) => {
      const completed = m.status === "completed" || m.status === "walkover";
      const bye = completed && m.winner_id && (!m.player1_id || !m.player2_id);
      return !bye;
    }),
  );
  let completedRealMatches = $derived(
    realMatches.filter(
      (m) => m.status === "completed" || m.status === "walkover",
    ),
  );
  let bracketProgress = $derived(
    realMatches.length
      ? Math.round((completedRealMatches.length / realMatches.length) * 100)
      : 0,
  );

  // Playable matches for intermission scene, in recommended bracket order
  let playableMatches = $derived.by(() => {
    const matches = stageMatches || [];
    const order = buildMatchOrder(matches);
    return matches
      .filter(
        (m) => m.status === "pending" && m.player1_id && m.player2_id,
      )
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  });
  let nextMatch = $derived(playableMatches[0] || null);

  // Stages: one round of one bracket each (winners / losers bracket rounds
  // share round numbers), in playing order.
  let stages = $derived(overlayStages(stageMatches || []));

  // Completed matches by stage for the ticker, latest stage first.
  let tickerRounds = $derived(
    stages
      .map((s) => ({
        key: s.key,
        short: s.short,
        matches: s.matches.filter(
          (m) => (m.status === "completed" || m.status === "walkover") && m.player1_id && m.player2_id,
        ),
      }))
      .filter((s) => s.matches.length)
      .reverse(),
  );

  // Active match for in-game HUD
  let activeMatch = $derived(
    tournament?.matches?.find((m) => m.id === tournament.active_match_id) ||
      null,
  );

  // Scene calculation: URL scene param takes highest precedence, then tournament.overlay_scene, then auto logic
  let currentScene = $derived.by(() => {
    if (sceneParam && sceneParam !== "auto") return sceneParam;
    if (tournament?.overlay_scene && tournament.overlay_scene !== "auto")
      return tournament.overlay_scene;
    return activeMatch ? "ingame" : "hybrid";
  });

  // Background transparency logic:
  // Ingame scene defaults to transparent (unless bg=true is passed)
  // All other scenes default to a solid ambient space background (unless transparent=true is passed)
  let isTransparent = $derived(
    transparentParam || (currentScene === "ingame" && bgParam !== "true"),
  );

  // The tree view is for single elimination only; double elimination, Swiss
  // and group stages use the stage board instead.
  let isTree = $derived(
    (stageMatches || []).length > 0 &&
      (stageMatches || []).every((m) => (m.bracket || "main") === "main"),
  );

  // Computed rounds structure for bracket display (single elimination)
  let overlayRounds = $derived.by(() => {
    if (!isTree || !stageMatches?.length) return [];
    const map = {};
    stageMatches.forEach((m) => {
      if (!map[m.round]) map[m.round] = [];
      map[m.round].push(m);
    });
    return Object.entries(map)
      .map(([round, ms]) => ({
        round: parseInt(round),
        matches: ms.sort((a, b) => a.position - b.position),
      }))
      .sort((a, b) => b.round - a.round); // highest round number (first round) first
  });

  // Swiss rounds count up from 1 and have no finals; elimination rounds count
  // down to the final.
  // Two-stage events show the group stage (Swiss) until the playoff starts,
  // then only the playoff bracket.
  let inPlayoffs = $derived(
    Boolean(tournament?.playoff_format) && tournament?.current_stage === "playoff",
  );
  let isSwiss = $derived(tournament?.format === "swiss" && !inPlayoffs);
  // Format shown in the hybrid header.
  let formatTag = $derived.by(() => {
    if (tournament?.playoff_format && !inPlayoffs) return isSwiss ? "GROUP STAGE · SWISS" : "GROUP STAGE";
    const format = inPlayoffs ? tournament?.playoff_format : tournament?.format;
    return format === "double_elim" ? "DOUBLE ELIMINATION" : format === "swiss" ? "SWISS" : "SINGLE ELIMINATION";
  });
  // Stage labels of a match: "胜者组第 2 轮" / "WB2", "瑞士轮 第 3 轮" / "R3"...
  function stageLabel(m) {
    return matchStageLabels(m, stageMatches || []).label;
  }
  function stageShort(m) {
    return matchStageLabels(m, tournament?.matches || []).short;
  }

  let maxRound = $derived(
    overlayRounds.length ? Math.max(...overlayRounds.map((r) => r.round)) : 1,
  );
  let matchOrder = $derived(buildMatchOrder(stageMatches || []));

  // Selected stage: URL stage/round param first, then the stage chosen in
  // the dashboard (overlay_stage, or the older overlay_round), otherwise the
  // first stage that still has matches to play.
  let selectedStage = $derived(
    pickStage(stages, stageParam || tournament?.overlay_stage || tournament?.overlay_round || null),
  );
  let selectedRound = $derived(selectedStage?.round ?? maxRound);

  let introMatches = $derived(selectedStage?.matches || []);

  // The intro match list is paged in groups of 8 (16 players) for 128-player fields.
  let introPage = $state(0);
  let introPageCount = $derived(Math.max(1, Math.ceil(introMatches.length / 8)));
  let visibleIntroMatches = $derived(
    introMatches.slice(introPage * 8, introPage * 8 + 8),
  );

  $effect(() => {
    if (introPage >= introPageCount) introPage = 0;
  });

  $effect(() => {
    if (introPageCount <= 1) return;
    const timer = setInterval(() => {
      introPage = (introPage + 1) % introPageCount;
    }, 10000);
    return () => clearInterval(timer);
  });

  // Calculate match counts and dynamic sizes
  let maxRoundNum = $derived(
    overlayRounds.length ? Math.max(...overlayRounds.map((r) => r.round)) : 1,
  );
  let firstRound = $derived(overlayRounds.find((r) => r.round === maxRoundNum));
  let firstRoundMatchCount = $derived(firstRound?.matches?.length || 0);

  // Large brackets: show 16-player sections (8 first-round matches) in a carousel.
  // The final stage is the last four rounds (16 players for a 128 bracket).
  let isLargeBracket = $derived(firstRoundMatchCount >= 16);
  let sectionCount = $derived(Math.max(1, Math.ceil(firstRoundMatchCount / 8)));
  let finalStartRound = $derived(Math.max(1, maxRoundNum - 3));
  let sectionIndex = $state(0);

  let finalStageStarted = $derived.by(() => {
    if (!isLargeBracket) return true;
    const finalRound = overlayRounds.find((r) => r.round === finalStartRound);
    if (!finalRound) return true;
    return finalRound.matches.some(
      (m) =>
        m.player1_id ||
        m.player2_id ||
        m.status === "completed" ||
        m.status === "walkover",
    );
  });

  let showFinalStage = $derived(
    !isLargeBracket ||
      finalStageStarted ||
      (activeMatch && activeMatch.round <= finalStartRound) ||
      selectedRound <= finalStartRound,
  );

  let displayRounds = $derived.by(() => {
    if (!overlayRounds.length) return [];
    if (!isLargeBracket) return overlayRounds;
    if (showFinalStage) {
      return overlayRounds.filter((r) => r.round <= finalStartRound);
    }
    const sectionRounds = overlayRounds.filter(
      (r) => r.round >= finalStartRound && r.round <= maxRoundNum,
    );
    return sectionRounds.map((r) => {
      const size = 8 >> (maxRoundNum - r.round);
      const start = sectionIndex * size;
      return { ...r, matches: r.matches.slice(start, start + size) };
    });
  });

  let displayFirstRoundCount = $derived(displayRounds[0]?.matches.length || 0);

  $effect(() => {
    if (sectionIndex >= sectionCount) sectionIndex = 0;
  });

  $effect(() => {
    if (!isLargeBracket || showFinalStage || sectionCount <= 1) return;
    const timer = setInterval(() => {
      sectionIndex = (sectionIndex + 1) % sectionCount;
    }, 10000);
    return () => clearInterval(timer);
  });

  // Dynamic layout variables based on bracket size
  let bracketSpecs = $derived.by(() => {
    const count = displayFirstRoundCount;
    if (count >= 8) {
      // 16 players or more
      return {
        H: 76,
        g: 14,
        G: 24,
        cardWidth: "w-72",
        textClass: "text-lg md:text-xl font-bold",
        scoreClass: "text-lg md:text-xl px-2.5 py-0.5 min-w-[2.2rem]",
        gapClass: "gap-1.5",
        paddingClass: "py-1.5 px-6",
        dividerClass: "w-full h-px bg-slate-800 shrink-0",
        colGap: "gap-6",
        slotOffset: 19,
        connMid: 12,
        connWidth: 12,
        connGap: 24,
      };
    } else {
      // 8 players or fewer
      return {
        H: 144,
        g: 32,
        G: 96,
        cardWidth: "w-96",
        textClass: "text-2xl md:text-3xl lg:text-[2.1rem] font-black",
        scoreClass:
          "text-2xl md:text-3xl lg:text-[2.1rem] px-3 py-1 min-w-[3.5rem]",
        gapClass: "gap-2.5",
        paddingClass: "p-4 px-5",
        dividerClass: "w-full h-px bg-slate-800 shrink-0",
        colGap: "gap-8",
        slotOffset: 40,
        connMid: 16,
        connWidth: 16,
        connGap: 32,
      };
    }
  });

  // Calculate match positions dynamically for perfect vertical alignment
  // Still in the event: one loss in single elimination, a losers-bracket
  // loss in double elimination; nobody is out in Swiss (null).
  let alivePlayerIds = $derived(
    playersStillIn(tournament?.players || [], stageMatches || [], { swiss: isSwiss }),
  );

  function isAlive(playerId) {
    if (!playerId) return false;
    return alivePlayerIds ? alivePlayerIds.has(playerId) : true;
  }

  // Double elimination: a Challonge-style tree like the single-elimination
  // one — winners bracket on top, losers bracket below, grand final on the
  // right — with connectors between a match and the one its winner goes to.
  let isDoubleTree = $derived(
    (stageMatches || []).length > 0 &&
      (stageMatches || []).every((m) => ["wb", "lb", "gf"].includes(m.bracket)),
  );
  const DT = { cardHeight: 66, slotHeight: 82, columnWidth: 250, columnGap: 56 };
  const DT_HEADER = 40;
  const DT_BAND_GAP = 36;
  let deTree = $derived.by(() => {
    if (!isDoubleTree) return null;
    const matches = stageMatches || [];
    const wb = layoutBracketBand(matches, "wb", DT);
    const lb = layoutBracketBand(matches, "lb", DT);
    const items = [];
    const headers = [];
    const place = (band, top) => {
      for (const col of band.columns) {
        const first = col.matches[0]?.match;
        if (first) headers.push({ key: stageKeyOf(first), x: col.x, y: top - DT_HEADER, label: stageLabel(first) });
        for (const it of col.matches) items.push({ match: it.match, x: it.x, y: top + it.y });
      }
    };
    const wbTop = DT_HEADER;
    const lbTop = wbTop + wb.height + DT_BAND_GAP + DT_HEADER;
    place(wb, wbTop);
    place(lb, lbTop);
    // Grand final (and its reset once it has players) right of both bands.
    const gfX = Math.max(wb.width, lb.width) + DT.columnGap;
    const wbFinal = items.find((i) => i.match.bracket === "wb" && i.match.round === 1);
    const lbFinal = items.find((i) => i.match.bracket === "lb" && i.match.round === 1);
    const gfY = wbFinal && lbFinal ? (wbFinal.y + lbFinal.y) / 2 : wbFinal?.y ?? DT.cardHeight;
    const gfs = matches
      .filter((m) => m.bracket === "gf" && (m.position === 1 || m.player1_id || m.player2_id))
      .sort((a, b) => a.position - b.position);
    gfs.forEach((m, i) => items.push({ match: m, x: gfX + i * (DT.columnWidth + DT.columnGap), y: gfY }));
    if (gfs.length) headers.push({ key: "gf:1", x: gfX, y: gfY - DT.cardHeight / 2 - DT_HEADER, label: stageLabel(gfs[0]) });
    // Connectors: winner of a match -> the match it feeds.
    const byId = new Map(items.map((i) => [i.match.id, i]));
    const paths = [];
    for (const it of items) {
      const target = byId.get(it.match.next_match_id);
      if (target) paths.push(bracketConnectorPath(it, target, DT.columnWidth));
    }
    const width = gfX + gfs.length * (DT.columnWidth + DT.columnGap) - DT.columnGap;
    const height = lbTop + lb.height;
    return { items, headers, paths, width, height };
  });
  let deScale = $derived(deTree ? Math.min(1.3, 1440 / deTree.width, 820 / deTree.height) : 1);
  function stageKeyOf(m) {
    return `${m.bracket || "main"}:${m.round}`;
  }

  // Stage board (Swiss and group stages): bands of columns,
  // one band per bracket, scaled to fit next to the side panel.
  const BAND_ORDER = ["sw", "gse", "gwb", "glb", "wb", "lb", "gf"];
  const BAND_NAMES = { sw: "SWISS", gse: "GROUPS", gwb: "GROUPS · UPPER", glb: "GROUPS · LOWER", wb: "UPPER BRACKET", lb: "LOWER BRACKET", gf: "GRAND FINAL" };
  let boardBands = $derived.by(() => {
    if (isTree || isDoubleTree) return [];
    const bands = new Map();
    for (const s of stages) {
      if (!bands.has(s.bracket)) bands.set(s.bracket, []);
      bands.get(s.bracket).push(s);
    }
    // Swiss: the current round and the one before (whole rounds get long).
    if (bands.has("sw")) {
      const sw = bands.get("sw");
      const at = Math.max(0, sw.findIndex((s) => s.key === selectedStage?.key));
      bands.set("sw", sw.slice(Math.max(0, at - 1), at + 1));
    }
    return [...bands.entries()]
      .sort((a, b) => BAND_ORDER.indexOf(a[0]) - BAND_ORDER.indexOf(b[0]))
      .map(([bracket, columns]) => ({ bracket, name: BAND_NAMES[bracket] || bracket.toUpperCase(), columns }));
  });
  const BOARD_CARD_H = 58;
  const BOARD_GAP = 8;
  let boardScale = $derived.by(() => {
    if (!boardBands.length) return 1;
    const height = boardBands.reduce(
      (sum, band) => sum + 44 + Math.max(...band.columns.map((c) => c.matches.length)) * (BOARD_CARD_H + BOARD_GAP),
      0,
    );
    const width = Math.max(...boardBands.map((band) => band.columns.length)) * (232 + 16);
    return Math.min(1, 840 / height, 1440 / width);
  });

  // Swiss standings for the side of the stage board.
  let swissTable = $derived.by(() => {
    if (!isSwiss) return [];
    if (tournament?.standings?.length) return tournament.standings.slice(0, 12);
    const groups = tournament?.group_stage?.groups || [];
    return groups.flatMap((g) => g.rows.slice(0, 3).map((r) => ({ ...r, group_label: g.label })));
  });

  let matchPositions = $derived.by(() => {
    if (!displayRounds?.length)
      return { positions: {}, centers: {}, totalHeight: 600 };

    const H = bracketSpecs.H; // Card height
    const g = bracketSpecs.g; // Intra-pair gap
    const G = bracketSpecs.G; // Inter-pair gap

    const positions = {}; // map of matchId -> { top, height }
    const centers = {}; // map of matchId -> center px

    const localMaxRound = Math.max(...displayRounds.map((r) => r.round));
    const firstRound = displayRounds.find((r) => r.round === localMaxRound);
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
      const roundData = displayRounds.find((r) => r.round === rNum);
      const prevRoundData = displayRounds.find((r) => r.round === rNum + 1);
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

  // Very tall 17..31 fields have no sections; scale the whole tree to fit.
  let bracketScale = $derived(
    matchPositions.totalHeight > 860 ? 860 / matchPositions.totalHeight : 1,
  );

  // Dynamic vertical spacing class builder based on match count in the round
  function getRoundGapClass(matchCount) {
    if (matchCount >= 8) return "gap-4";
    if (matchCount === 4) return "gap-14";
    if (matchCount === 2) return "gap-36";
    return "gap-8";
  }

  // Real-time EventSource listener
  let eventSource = null;
  $effect(() => {
    if (!tid) return;
    load();

    const es = new EventSource(`/api/tournaments/${tid}/stream`);
    eventSource = es;

    es.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        console.log("Overlay received update message:", msg);
        await refreshData();
      } catch (e) {
        console.error("Overlay failed to parse event message", e);
      }
    };

    es.onerror = (e) => {
      console.warn("Overlay SSE lost connection. Retrying...", e);
    };

    return () => {
      es.close();
    };
  });

  async function load() {
    loading = true;
    errorMsg = "";
    try {
      tournament = await API.getTournament(tid);
    } catch (e) {
      errorMsg = e.message || "Failed to load tournament";
    } finally {
      loading = false;
    }
  }

  async function refreshData() {
    try {
      tournament = await API.getTournament(tid);
    } catch (e) {
      console.error("Refresh failed:", e);
    }
  }

  let scale = $state(1);
  let tickerWidth = $state(0);
  let tickerDuration = $derived.by(() => {
    if (!tickerWidth) return 50;
    if (tickerRounds.length === 0) return 50;
    return tickerWidth / 3 / 50; // Constant speed: 35 pixels per second
  });

  function handleResize() {
    if (typeof window === "undefined") return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const scaleX = w / 1920;
    const scaleY = h / 1080;
    scale = Math.min(scaleX, scaleY);
  }

  onMount(() => {
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  });
</script>

<svelte:head>
  <title>SUCK Tournament Overlay - {currentScene.toUpperCase()}</title>
  <link
    href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800;900&family=Orbitron:wght@600;800;900&family=Noto+Sans+SC:wght@505;700;900&display=swap"
    rel="stylesheet"
  />
</svelte:head>

<div
  class="w-screen h-screen overflow-hidden relative flex items-center justify-center {isTransparent
    ? 'bg-transparent'
    : 'bg-black'}"
>
  <div
    class="overlay-container font-outfit text-white overflow-hidden flex flex-col relative select-none shrink-0
      {isTransparent ? 'bg-transparent' : 'bg-radial-gradient'}"
    style="width: 1920px; height: 1080px; transform: scale({scale}); transform-origin: center center;"
  >
    <!-- Beautiful ambient neon background glow nodes (only when background is enabled) -->
    {#if !isTransparent}
      <div class="glow-orb glow-cyan"></div>
      <div class="glow-orb glow-purple"></div>
      <div class="glow-orb glow-orange"></div>
    {/if}

    {#if loading}
      <div class="flex-1 flex flex-col items-center justify-center gap-3">
        <div
          class="w-16 h-16 rounded-full border-4 border-cyan-500 border-t-transparent animate-spin"
        ></div>
        <p
          class="text-base font-mono tracking-widest text-cyan-400 uppercase animate-pulse"
        >
          Loading Stream Overlay...
        </p>
      </div>
    {:else if errorMsg}
      <div
        class="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8"
      >
        <div class="text-red-500 text-5xl">⚠️</div>
        <div class="text-2xl font-bold tracking-tight text-white">
          {errorMsg}
        </div>
        <p class="text-base text-slate-400 max-w-md">
          Verify the tournament ID or server connection in the dashboard panel.
        </p>
      </div>
    {:else}
      <!-- SCENE 1: INTRO / MATCH LIST -->
      {#if currentScene === "intro"}
        <div
          class="absolute inset-0 w-full h-full flex flex-col p-6 md:p-8 justify-between z-10"
          transition:fade={{ duration: 400 }}
        >
          <!-- Header -->
          <header
            class="flex justify-between items-end border-b-2 border-cyan-500/20 pb-2 mb-2"
          >
            <div>
              <span
                class="text-cyan-400 text-xs font-mono font-bold tracking-widest uppercase block mb-1"
              >
                WarThunder Ultra Chicken King • MATCHES OVERVIEW
              </span>
              <h1
                class="text-4xl md:text-5xl font-extrabold tracking-tight leading-none bg-linear-to-r from-white via-slate-100 to-cyan-400 bg-clip-text text-transparent uppercase font-orbitron"
              >
                {tournament.name}
              </h1>
            </div>
            <div class="text-right font-orbitron">
              <span
                class="text-slate-400 text-xs tracking-wider block font-sans"
                >CURRENT STAGE</span
              >
              <span class="text-2xl font-black text-cyan-400 tracking-wider">
                {(selectedStage?.label || "").toUpperCase()}
              </span>
              {#if introPageCount > 1}
                <div
                  class="text-[10px] font-mono tracking-wider text-slate-500 mt-1"
                >
                  SECTION {introPage + 1} / {introPageCount}
                </div>
                <div class="flex justify-end gap-1 mt-2">
                  {#each Array(introPageCount) as _, i}
                    <button
                      type="button"
                      onclick={() => (introPage = i)}
                      aria-label={`Show intro page ${i + 1}`}
                      class="h-1.5 rounded-full transition-all {i === introPage
                        ? 'w-7 bg-cyan-400'
                        : 'w-2.5 bg-slate-700 hover:bg-slate-500'}"
                    ></button>
                  {/each}
                </div>
              {/if}
            </div>
          </header>

          <!-- Main matches grid layout -->
          <div class="flex-1 flex items-center justify-center py-3">
            {#if introMatches.length === 0}
              <div
                class="text-center py-12 px-6 rounded-2xl bg-slate-900/60 border border-slate-800"
              >
                <p class="text-slate-400 text-base italic">
                  No matches scheduled in this round.
                </p>
              </div>
            {:else}
              <div
                class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 w-full max-w-7xl"
              >
                {#each visibleIntroMatches as m}
                  {@const isCurrentActive = m.id === tournament.active_match_id}
                  <div
                    class="match-card relative rounded-2xl border-2 transition-all flex flex-col justify-between overflow-hidden shadow-lg p-4 min-h-32.5
                    {isCurrentActive
                      ? 'border-amber-500 bg-linear-to-b from-amber-950/20 to-slate-900/90 shadow-amber-500/20 scale-102 ring-1 ring-amber-500/30'
                      : m.status === 'completed'
                        ? 'border-slate-800 bg-slate-950/60 opacity-75'
                        : 'border-slate-700/50 bg-slate-900/50 hover:border-cyan-500/50'}"
                  >
                    <!-- Active status marker -->
                    {#if isCurrentActive}
                      <div
                        class="absolute top-0 right-0 bg-amber-500 text-black text-[9px] font-bold px-3 py-0.5 uppercase tracking-wider rounded-bl-lg animate-pulse font-orbitron"
                      >
                        LIVE
                      </div>
                    {:else if m.status === "completed" || m.status === "walkover"}
                      <div
                        class="absolute top-0 right-0 bg-emerald-500 text-black text-[9px] font-bold px-3 py-0.5 uppercase tracking-wider rounded-bl-lg font-orbitron"
                      >
                        {m.status === "walkover" ? "WALKOVER" : "COMPLETED"}
                      </div>
                    {/if}

                    <!-- Match Index -->
                    <div
                      class="text-[9px] font-mono text-slate-500 uppercase tracking-widest mb-2"
                    >
                      #{matchOrder.get(m.id)} · MATCH {m.position}
                    </div>

                    <!-- Players -->
                    <div class="space-y-2 my-1">
                      <!-- Player 1 -->
                      <div class="flex items-center justify-between gap-3">
                        <div class="flex items-center gap-2 overflow-hidden">
                          <span
                            class="font-extrabold text-lg sm:text-xl tracking-tight leading-tight text-white font-sans"
                          >
                            {getPlayerName(m.player1_id)}
                          </span>
                        </div>
                        <div
                          class="font-orbitron font-extrabold text-xl sm:text-2xl px-2 py-0.5 rounded bg-slate-950/80 border-2 border-slate-800/80 min-w-10 text-center
                        {(m.status === 'completed' ||
                            m.status === 'walkover') &&
                          m.winner_id === m.player1_id
                            ? 'text-amber-400 border-amber-500/20'
                            : 'text-slate-300'}"
                        >
                          {m.status === "walkover"
                            ? m.winner_id === m.player1_id
                              ? "W"
                              : "FF"
                            : m.score1}
                        </div>
                      </div>

                      <!-- Divider -->
                      <div
                        class="h-px bg-slate-800/40 relative flex justify-center items-center"
                      >
                        <span
                          class="absolute bg-slate-900 px-2 text-[9px] text-slate-500 font-mono tracking-widest"
                          >VS</span
                        >
                      </div>

                      <!-- Player 2 -->
                      <div class="flex items-center justify-between gap-3">
                        <div class="flex items-center gap-2 overflow-hidden">
                          <span
                            class="font-extrabold text-lg sm:text-xl tracking-tight leading-tight text-white font-sans"
                          >
                            {getPlayerName(m.player2_id)}
                          </span>
                        </div>
                        <div
                          class="font-orbitron font-extrabold text-xl sm:text-2xl px-2 py-0.5 rounded bg-slate-950/80 border-2 border-slate-800/80 min-w-10 text-center
                        {(m.status === 'completed' ||
                            m.status === 'walkover') &&
                          m.winner_id === m.player2_id
                            ? 'text-amber-400 border-amber-500/20'
                            : 'text-slate-300'}"
                        >
                          {m.status === "walkover"
                            ? m.winner_id === m.player2_id
                              ? "W"
                              : "FF"
                            : m.score2}
                        </div>
                      </div>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </div>

        <!-- SCENE 2: INTERMISSION / COMING UP -->
      {:else if currentScene === "intermission"}
        <div
          class="absolute inset-0 w-full h-full flex flex-col p-6 md:p-8 justify-between z-10"
          transition:fade={{ duration: 400 }}
        >
          <!-- Header -->
          <header
            class="flex justify-between items-end border-b-2 border-cyan-500/20 pb-2 mb-2 font-orbitron"
          >
            <div>
              <span
                class="text-cyan-400 text-xs font-mono font-bold tracking-widest uppercase block mb-1"
              >
                WarThunder Ultra Chicken King • INTERMISSION
              </span>
              <h1
                class="text-4xl md:text-5xl font-extrabold tracking-wider leading-none bg-linear-to-r from-white via-slate-200 to-cyan-400 bg-clip-text text-transparent uppercase"
              >
                COMING UP NEXT
              </h1>
            </div>
            <div class="text-right">
              <span
                class="text-slate-400 text-xs tracking-wider block font-sans"
                >STATUS</span
              >
              <span class="text-2xl font-black text-cyan-400 tracking-wider">
                {playableMatches.length} PLAYABLE MATCHES
              </span>
            </div>
          </header>

          <!-- Main upcoming list -->
          <div class="flex-1 flex items-center justify-center py-3">
            {#if playableMatches.length === 0}
              <div
                class="text-center py-12 px-8 rounded-2xl bg-slate-900/60 border border-slate-800/80 max-w-lg"
              >
                <h2 class="text-lg font-bold text-white mb-2">
                  No Playable Matches
                </h2>
              </div>
            {:else}
              <div
                class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full max-w-6xl"
              >
                {#each playableMatches.slice(0, 6) as m}
                  <div
                    class="relative rounded-2xl border-2 border-slate-800 bg-slate-900/60 p-4 flex flex-col justify-between overflow-hidden shadow-lg group hover:border-cyan-500/30 transition-all duration-300 min-h-27.5"
                  >
                    <div
                      class="flex justify-between items-center text-[9px] font-mono text-slate-500 tracking-wider mb-2"
                    >
                      <span>#{matchOrder.get(m.id)} · MATCH {m.position}</span>
                      <span
                        class="text-cyan-400 font-bold px-2 py-0.5 rounded bg-cyan-950/20 border border-cyan-800/20 uppercase"
                      >
                        {stageShort(m)}
                      </span>
                    </div>

                    <div class="flex items-center justify-between gap-4 py-1">
                      <div
                        class="flex-1 flex flex-col items-center text-center overflow-hidden"
                      >
                        <span
                          class="font-extrabold text-lg sm:text-xl text-white tracking-tight leading-tight truncate w-full font-sans"
                        >
                          {getPlayerName(m.player1_id)}
                        </span>
                      </div>

                      <div
                        class="flex flex-col items-center justify-center shrink-0"
                      >
                        <div
                          class="w-8 h-8 rounded-full border-2 border-cyan-500/20 bg-slate-950 flex items-center justify-center text-[10px] font-bold text-cyan-400 font-orbitron"
                        >
                          VS
                        </div>
                      </div>

                      <div
                        class="flex-1 flex flex-col items-center text-center overflow-hidden"
                      >
                        <span
                          class="font-extrabold text-lg sm:text-xl text-white tracking-tight leading-tight truncate w-full font-sans"
                        >
                          {getPlayerName(m.player2_id)}
                        </span>
                      </div>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      {:else if currentScene === "ingame"}
        <div
          class="absolute inset-0 w-full h-full flex flex-col justify-between p-4 z-10"
          transition:fade={{ duration: 400 }}
        >
          <!-- Center-Top Shortened Results Ticker (Centered at top-middle, enlarged text) -->
          <div
            class="absolute top-13 left-1/2 -translate-x-1/2 z-20 w-full max-w-[45%]"
            transition:fly={{ y: -120, duration: 800, delay: 300 }}
          >
            <div
              class="ticker-wrap flex items-center bg-slate-950/95 border-2 border-cyan-500/30 rounded-lg py-1.5 px-3 shadow-2xl backdrop-blur-md overflow-hidden"
            >
              <!-- Label Indicator Badge -->
              <div
                class="shrink-0 font-orbitron font-extrabold text-[13px] bg-cyan-500 text-black px-2.5 py-0.5 rounded uppercase tracking-wider mr-3 shadow flex items-center gap-1"
              >
                <span class="w-1.5 h-1.5 rounded-full bg-black animate-pulse"
                ></span>
                <span>RESULTS</span>
              </div>

              <!-- Scrolling Content Wrapper -->
              <div class="relative flex-1 overflow-hidden h-6">
                <div
                  class="ticker animate-marquee"
                  bind:clientWidth={tickerWidth}
                  style="animation-duration: {tickerDuration}s"
                >
                  {#if tickerRounds.length === 0}
                    <div class="ticker-item text-xs text-slate-400 italic">
                      No matches concluded yet.
                    </div>
                  {:else}
                    <!-- Repeat items for fluid marquee wrapping -->
                    {#each Array(3) as _}
                      {#each tickerRounds as tr}
                        <span
                          class="ticker-item text-sm sm:text-base font-extrabold tracking-wide font-sans inline-flex items-center gap-2 mr-6"
                        >
                          <!-- Round Badge -->
                          <span
                            class="font-orbitron font-black text-[11px] bg-cyan-950/80 border border-cyan-500/30 text-cyan-400 px-2 py-0.5 rounded uppercase tracking-wider"
                          >
                            {tr.short}
                          </span>

                          <!-- List of matches in this round -->
                          <span class="inline-flex items-center gap-3">
                            {#each tr.matches as m, mIdx}
                              <span class="inline-flex items-center">
                                <span class="text-white"
                                  >{getPlayerName(m.player1_id)}</span
                                >
                                <span
                                  class="font-orbitron font-black text-cyan-400 bg-slate-900 border border-slate-800 rounded px-1.5 mx-1.5 py-0.2 text-xs sm:text-sm"
                                >
                                  {m.status === "walkover"
                                    ? m.winner_id === m.player1_id
                                      ? "W : FF"
                                      : "FF : W"
                                    : `${m.score1} : ${m.score2}`}
                                </span>
                                <span class="text-white"
                                  >{getPlayerName(m.player2_id)}</span
                                >
                                {#if mIdx < tr.matches.length - 1}
                                  <span class="text-cyan-500/25 px-2 font-bold"
                                    >/</span
                                  >
                                {/if}
                              </span>
                            {/each}
                          </span>
                          <span class="text-slate-600 pl-4 font-light font-mono"
                            >|</span
                          >
                        </span>
                      {/each}
                    {/each}
                  {/if}
                </div>
              </div>
            </div>
          </div>

          <!-- Top-Right Scoreboard Panel (BO1-Friendly Stacked Rows with Massive Text) -->
          <div
            class="absolute top-22.5 right-4 z-10 flex flex-col items-end gap-2"
            transition:fly={{ x: 400, duration: 800 }}
          >
            {#if !activeMatch}
              <div
                class="bg-slate-950/80 border border-slate-800 rounded-lg p-3.5 backdrop-blur-md text-right shadow-lg"
              >
                <span
                  class="text-[9px] font-mono text-cyan-400 font-bold uppercase tracking-widest block mb-1"
                  >SUCK LIVE OVERLAY</span
                >
                <p class="text-slate-400 text-xs italic">
                  No active match selected.
                </p>
              </div>
            {:else}
              <!-- Premium Stacked HUD Widget (Names size bumped to text-3xl/4xl) -->
              <div
                class="bg-slate-950/98 border-2 border-cyan-500/50 rounded-xl overflow-hidden shadow-[0_0_30px_rgba(6,182,212,0.35)] flex flex-col min-w-80 max-w-sm backdrop-blur-md"
              >
                <!-- Header / Category -->
                <div
                  class="bg-cyan-950/60 px-4 py-1 border-b border-cyan-500/25 flex justify-between items-center text-xs sm:text-sm font-mono text-cyan-400 font-bold tracking-widest uppercase"
                >
                  <span>{tournament.name}</span>
                  <span class="text-amber-400"
                    >{stageShort(activeMatch)}</span
                  >
                </div>

                <!-- Stacked Match Details for BO1 Full Display (Enlarged to 3xl / 4xl) -->
                <div class="py-1.5 px-5 flex flex-col gap-0 font-sans">
                  <!-- P1 Info -->
                  <div class="flex items-center justify-center py-0.5">
                    <span
                      class="text-slate-100 font-black text-center text-xl sm:text-2xl leading-tight tracking-tight truncate w-full"
                      title={getPlayerName(activeMatch.player1_id)}
                    >
                      {getPlayerName(activeMatch.player1_id)}
                    </span>
                  </div>

                  <!-- Divider with tiny neon VS -->
                  <div
                    class="h-px bg-cyan-500/20 flex items-center justify-center relative my-0.5"
                  >
                    <span
                      class="absolute bg-slate-950 px-2 text-[9px] text-cyan-400 font-black font-mono tracking-widest"
                      >VS</span
                    >
                  </div>

                  <!-- P2 Info -->
                  <div class="flex items-center justify-center py-0.5">
                    <span
                      class="text-slate-100 font-black text-center text-xl sm:text-2xl leading-tight tracking-tight truncate w-full"
                      title={getPlayerName(activeMatch.player2_id)}
                    >
                      {getPlayerName(activeMatch.player2_id)}
                    </span>
                  </div>
                </div>
              </div>
            {/if}
          </div>
        </div>

        <!-- SCENE 4: AUTO HYBRID SCENE (INTERMISSION VISUAL BRACKET VIEW) -->
      {:else if currentScene === "hybrid"}
        <div
          class="absolute inset-0 w-full h-full flex flex-col p-6 md:p-8 justify-between z-10"
          transition:fade={{ duration: 400 }}
        >
          <!-- Header -->
          <header
            class="flex justify-between items-start gap-6 border-b border-cyan-500/10 pb-3 mb-2 shrink-0"
          >
            <div class="min-w-0">
              <div
                class="flex items-center gap-2 text-[10px] font-mono font-bold tracking-[0.25em] text-cyan-400/80 uppercase"
              >
                <span class="w-2 h-2 rounded-full bg-cyan-400"></span>
                SUCK • {formatTag}
              </div>
              <h1
                class="text-3xl md:text-5xl font-black bg-linear-to-r from-white to-cyan-400 bg-clip-text text-transparent uppercase font-orbitron leading-none tracking-wider mt-1"
              >
                {tournament.name}
              </h1>
              <div
                class="flex items-center gap-3 mt-2 text-[10px] font-mono tracking-wider text-slate-500 uppercase"
              >
                <span>{tournament.players?.length || 0} PLAYERS</span>
                <span class="text-slate-700">/</span>
                <span>{isTree ? stageLabel(displayRounds[0]?.matches?.[0] || {}) : selectedStage?.label || ""}</span>
                {#if isLargeBracket}
                  <span class="text-slate-700">/</span>
                  <span class="text-amber-400 font-bold">
                    {showFinalStage ? "FINAL STAGE" : `SECTION ${sectionIndex + 1} / ${sectionCount}`}
                  </span>
                {/if}
              </div>
              {#if isLargeBracket && !showFinalStage}
                <div class="flex items-center gap-1.5 mt-3">
                  {#each Array(sectionCount) as _, i}
                    <button
                      type="button"
                      onclick={() => (sectionIndex = i)}
                      aria-label={`Show section ${i + 1}`}
                      class="h-1.5 rounded-full transition-all {i === sectionIndex
                        ? 'w-8 bg-cyan-400'
                        : 'w-3 bg-slate-700 hover:bg-slate-500'}"
                    ></button>
                  {/each}
                </div>
              {/if}
            </div>
            <div class="text-right font-orbitron shrink-0">
              <span
                class="text-xs text-slate-400 tracking-wider block font-sans font-bold leading-none mb-1"
                >STATUS</span
              >
              <span
                class="text-lg md:text-xl font-black text-cyan-400 tracking-wider uppercase"
              >
                {#if tournament.status === "in_progress"}
                  IN PROGRESS (进行中)
                {:else if tournament.status === "completed"}
                  COMPLETED (已结束)
                {:else if tournament.status === "registration"}
                  BRACKET PREVIEW (预览)
                {:else if tournament.status === "voting"}
                  VOTING (投票中)
                {:else}
                  {tournament.status.toUpperCase()}
                {/if}
              </span>
              <div class="mt-3 w-44 ml-auto">
                <div
                  class="flex justify-between text-[9px] font-mono tracking-wider text-slate-500"
                >
                  <span>BRACKET</span><span>{bracketProgress}%</span>
                </div>
                <div class="h-1 bg-slate-800 rounded-full mt-1 overflow-hidden">
                  <div
                    class="h-full bg-linear-to-r from-cyan-500 to-amber-400"
                    style="width: {bracketProgress}%"
                  ></div>
                </div>
              </div>
            </div>
          </header>

          <!-- Bracket + side panel -->
          <div class="flex-1 flex items-stretch gap-6 min-h-0 w-full">
          {#if isTree}
          <!-- Horizontal visual bracket view -->
          <div
            class="flex-1 flex items-center justify-start overflow-x-auto py-4 px-2 min-h-0 select-none scroll-container"
          >
            <div
              class="flex justify-center items-stretch min-w-max mx-auto h-full py-1 {bracketSpecs.colGap}"
              style="transform: scale({bracketScale}); transform-origin: top center;"
            >
              {#each displayRounds as r, colIdx (r.round)}
                <div
                  class="shrink-0 flex flex-col justify-center h-full {bracketSpecs.cardWidth}"
                >
                  <!-- Round Header (Large bold neon label) -->
                  <div
                    class="text-base md:text-lg text-cyan-400 font-extrabold text-center border-b-2 border-cyan-500/20 pb-2 mb-4 font-orbitron tracking-widest shrink-0 uppercase"
                  >
                    {stageLabel(r.matches[0] || { bracket: "main", round: r.round }).toUpperCase()}
                  </div>

                  <!-- Match cards in round (Absolutely positioned for perfect alignment) -->
                  <div
                    class="relative w-full"
                    style="height: {matchPositions.totalHeight}px"
                  >
                    {#each r.matches as m, idx (m.id)}
                      {@const pos = matchPositions.positions[m.id] || {
                        top: 0,
                        height: 144,
                      }}
                      {@const isCurrentActive =
                        m.id === tournament.active_match_id}
                      {@const isCompleted =
                        m.status === "completed" || m.status === "walkover"}
                      {@const isBye =
                        isCompleted &&
                        m.winner_id &&
                        (!m.player1_id || !m.player2_id)}

                      <div
                        class="absolute left-0 w-full"
                        style="top: {pos.top}px; height: {pos.height}px;"
                      >
                        {#if isBye}
                          <!-- Bye Card (Hidden from view but occupies layout space) -->
                          <div
                            class="w-full h-full border-2 border-transparent bg-transparent select-none pointer-events-none opacity-0"
                          ></div>
                        {:else}
                          <!-- Normal Match Card -->
                          <div
                            class="w-full h-full rounded-xl border-2 flex flex-col relative shadow-2xl transition-all duration-300
                          {bracketSpecs.paddingClass}
                          {isCurrentActive
                              ? 'border-amber-500 bg-slate-950 shadow-[0_0_25px_rgba(245,158,11,0.35)] ring-2 ring-amber-500/35 scale-102'
                              : isCompleted
                                ? 'border-slate-800 bg-slate-950'
                                : m.player1_id && m.player2_id
                                  ? 'border-cyan-500/50 bg-slate-950 shadow-[0_0_20px_rgba(6,182,212,0.2)] hover:border-cyan-400'
                                  : 'border-slate-800/60 bg-slate-950'}"
                          >
                            <!-- Player 1 Row -->
                            <div
                              class="flex-1 flex items-center justify-between gap-4 min-h-0"
                            >
                              <span
                                class="text-[9px] font-mono text-slate-600 shrink-0 w-5 text-right"
                                >{getPlayerSeed(m.player1_id) ?? "-"}</span
                              >
                              <span
                                class="truncate flex-1 font-sans
                              {bracketSpecs.textClass}
                              {isAlive(m.player1_id)
                                  ? 'text-slate-100 font-black'
                                  : 'text-slate-500 font-normal opacity-50'}"
                              >
                                {getPlayerName(m.player1_id)}
                              </span>
                              {#if isCompleted}
                                <span
                                  class="font-orbitron rounded bg-slate-900/90 shrink-0 text-center
                                {bracketSpecs.scoreClass}
                                {isAlive(m.player1_id)
                                    ? 'text-cyan-400 font-black'
                                    : 'text-slate-600 font-normal opacity-40'}"
                                >
                                  {m.status === "walkover"
                                    ? m.winner_id === m.player1_id
                                      ? "W"
                                      : "FF"
                                    : m.score1}
                                </span>
                              {/if}
                            </div>

                            <!-- Divider -->
                            <div class="w-full flex items-center gap-2 shrink-0">
                              <div class="h-px flex-1 bg-slate-800"></div>
                              <span
                                class="text-[8px] font-black tracking-[0.2em] text-slate-600 font-orbitron"
                                >VS</span
                              >
                              <div class="h-px flex-1 bg-slate-800"></div>
                            </div>

                            <!-- Player 2 Row -->
                            <div
                              class="flex-1 flex items-center justify-between gap-4 min-h-0"
                            >
                              <span
                                class="text-[9px] font-mono text-slate-600 shrink-0 w-5 text-right"
                                >{getPlayerSeed(m.player2_id) ?? "-"}</span
                              >
                              <span
                                class="truncate flex-1 font-sans
                              {bracketSpecs.textClass}
                              {isAlive(m.player2_id)
                                  ? 'text-slate-100 font-black'
                                  : 'text-slate-500 font-normal opacity-50'}"
                              >
                                {getPlayerName(m.player2_id)}
                              </span>
                              {#if isCompleted}
                                <span
                                  class="font-orbitron rounded bg-slate-900/90 shrink-0 text-center
                                {bracketSpecs.scoreClass}
                                {isAlive(m.player2_id)
                                    ? 'text-cyan-400 font-black'
                                    : 'text-slate-600 font-normal opacity-40'}"
                                >
                                  {m.status === "walkover"
                                    ? m.winner_id === m.player2_id
                                      ? "W"
                                      : "FF"
                                    : m.score2}
                                </span>
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
                              {@const center2 =
                                matchPositions.centers[sibling.id]}
                              {@const vHeight = center2 - center1}
                              {@const isWinner1Alive =
                                m.winner_id && isAlive(m.winner_id)}
                              {@const isWinner2Alive =
                                sibling.winner_id && isAlive(sibling.winner_id)}
                              {@const isMBye =
                                (m.status === "completed" ||
                                  m.status === "walkover") &&
                                m.winner_id &&
                                (!m.player1_id || !m.player2_id)}
                              {@const isSiblingBye =
                                (sibling.status === "completed" ||
                                  sibling.status === "walkover") &&
                                sibling.winner_id &&
                                (!sibling.player1_id || !sibling.player2_id)}

                              <!-- Top card horizontal right line -->
                              {#if !isMBye}
                                <div
                                  class="absolute -translate-y-1/2 z-0
                                {isWinner1Alive
                                    ? 'line-horizontal-active'
                                    : 'line-horizontal-inactive'}"
                                  style="right: -{bracketSpecs.connMid}px; width: {bracketSpecs.connWidth}px; top: {bracketSpecs.H /
                                    2}px;"
                                ></div>
                              {/if}

                              <!-- Bottom card horizontal right line -->
                              {#if !isSiblingBye}
                                <div
                                  class="absolute z-0
                                {isWinner2Alive
                                    ? 'line-horizontal-active'
                                    : 'line-horizontal-inactive'}"
                                  style="right: -{bracketSpecs.connMid}px; width: {bracketSpecs.connWidth}px; top: {bracketSpecs.H /
                                    2}px; transform: translateY(calc(-50% + {vHeight}px));"
                                ></div>
                              {/if}

                              <!-- Vertical segment 1 (top half, connects Card 1 center to Branch 1) -->
                              {#if !isMBye}
                                <div
                                  class="absolute w-0.5 z-0
                                {isWinner1Alive
                                    ? 'line-vertical-active'
                                    : 'line-vertical-inactive'}"
                                  style="right: -{bracketSpecs.connMid}px; top: {bracketSpecs.H /
                                    2}px; height: {vHeight / 2 -
                                    bracketSpecs.slotOffset}px;"
                                ></div>
                              {/if}

                              <!-- Vertical segment 3 (bottom half, connects Card 2 center to Branch 2) -->
                              {#if !isSiblingBye}
                                <div
                                  class="absolute w-0.5 z-0
                                {isWinner2Alive
                                    ? 'line-vertical-active'
                                    : 'line-vertical-inactive'}"
                                  style="right: -{bracketSpecs.connMid}px; top: calc({bracketSpecs.H /
                                    2}px + {vHeight / 2 +
                                    bracketSpecs.slotOffset}px); height: {vHeight /
                                    2 -
                                    bracketSpecs.slotOffset}px;"
                                ></div>
                              {/if}

                              <!-- Outgoing Branch 1 to next round (top player slot) -->
                              {#if !isMBye}
                                <div
                                  class="absolute z-0
                                {isWinner1Alive
                                    ? 'line-horizontal-active'
                                    : 'line-horizontal-inactive'}"
                                  style="right: -{bracketSpecs.connGap}px; width: {bracketSpecs.connWidth}px; top: calc({bracketSpecs.H /
                                    2}px + {vHeight / 2 -
                                    bracketSpecs.slotOffset}px); transform: translateY(-50%);"
                                ></div>
                              {/if}

                              <!-- Outgoing Branch 2 to next round (bottom player slot) -->
                              {#if !isSiblingBye}
                                <div
                                  class="absolute z-0
                                {isWinner2Alive
                                    ? 'line-horizontal-active'
                                    : 'line-horizontal-inactive'}"
                                  style="right: -{bracketSpecs.connGap}px; width: {bracketSpecs.connWidth}px; top: calc({bracketSpecs.H /
                                    2}px + {vHeight / 2 +
                                    bracketSpecs.slotOffset}px); transform: translateY(-50%);"
                                ></div>
                              {/if}
                            {/if}
                          {/if}
                        {/if}
                      </div>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          </div>

          {:else if deTree}
          <!-- Double-elimination tree -->
          <div class="flex-1 min-h-0 flex items-center justify-center overflow-hidden py-2">
            <div
              class="relative shrink-0"
              style="width: {deTree.width}px; height: {deTree.height}px; transform: scale({deScale}); transform-origin: center center;"
            >
              <svg class="absolute inset-0 overflow-visible pointer-events-none" width={deTree.width} height={deTree.height}>
                {#each deTree.paths as d, i (i)}
                  <path {d} fill="none" stroke="rgba(34, 211, 238, 0.35)" stroke-width="2" />
                {/each}
              </svg>
              {#each deTree.headers as h (h.key)}
                <div
                  class="absolute text-center text-sm font-extrabold font-orbitron tracking-wider uppercase border-b-2 pb-1
                    {h.key === selectedStage?.key ? 'text-amber-400 border-amber-500/40' : 'text-cyan-400 border-cyan-500/20'}"
                  style="left: {h.x}px; top: {h.y}px; width: {DT.columnWidth}px;"
                >{h.label}</div>
              {/each}
              {#each deTree.items as it (it.match.id)}
                {@const m = it.match}
                {@const done = m.status === "completed" || m.status === "walkover"}
                {@const live = m.id === tournament.active_match_id}
                {@const bye = done && (!m.player1_id || !m.player2_id)}
                <div
                  class="absolute rounded-xl border-2 px-3.5 flex flex-col justify-center gap-0.5 shadow-xl
                    {bye ? 'opacity-35 border-slate-800 bg-slate-950/50' : live ? 'border-amber-500 bg-amber-950/40' : done ? 'border-slate-800 bg-slate-950/80' : 'border-slate-700/60 bg-slate-900/80'}"
                  style="left: {it.x}px; top: {it.y - DT.cardHeight / 2}px; width: {DT.columnWidth}px; height: {DT.cardHeight}px;"
                >
                  {#each [[m.player1_id, m.score1], [m.player2_id, m.score2]] as [pid, score], slot (slot)}
                    {@const won = done && m.winner_id && m.winner_id === pid}
                    <div class="flex items-center justify-between gap-2 text-base leading-tight">
                      <span
                        class="truncate font-bold
                          {!pid ? 'text-slate-600 italic' : won ? 'text-amber-300' : !isAlive(pid) ? 'text-slate-500' : 'text-white'}"
                      >{pid ? getPlayerName(pid) : bye ? "—" : "TBD"}</span>
                      <span class="font-orbitron font-black text-sm shrink-0 {won ? 'text-amber-400' : 'text-slate-400'}">
                        {#if bye}{:else if m.status === "walkover"}{won ? "W" : "FF"}{:else if done || live}{score ?? 0}{/if}
                      </span>
                    </div>
                  {/each}
                </div>
              {/each}
            </div>
          </div>
          {:else}
          <!-- Stage board: Swiss and group stages. One band per bracket, one
               column per round, the shown stage highlighted. -->
          <div class="flex-1 min-h-0 flex items-start justify-center overflow-hidden py-2">
            <div class="flex flex-col gap-4" style="transform: scale({boardScale}); transform-origin: top center;">
              {#each boardBands as band (band.bracket)}
                <div>
                  <div class="text-[11px] font-mono font-bold tracking-[0.3em] text-cyan-400/80 uppercase mb-2">{band.name}</div>
                  <div class="flex gap-4 items-start">
                    {#each band.columns as col (col.key)}
                      <div class="w-58 shrink-0">
                        <div
                          class="text-sm font-extrabold text-center pb-1 mb-2 border-b-2 font-orbitron tracking-wider uppercase
                            {col.key === selectedStage?.key ? 'text-amber-400 border-amber-500/40' : 'text-cyan-400 border-cyan-500/20'}"
                        >
                          {col.label}
                        </div>
                        <div class="flex flex-col" style="gap: {BOARD_GAP}px">
                          {#each col.matches as m (m.id)}
                            {@const done = m.status === "completed" || m.status === "walkover"}
                            {@const live = m.id === tournament.active_match_id}
                            <div
                              class="rounded-lg border-2 px-3 flex flex-col justify-center gap-0.5
                                {live ? 'border-amber-500 bg-amber-950/30' : done ? 'border-slate-800 bg-slate-950/70' : 'border-slate-700/60 bg-slate-900/70'}"
                              style="height: {BOARD_CARD_H}px"
                            >
                              {#each [[m.player1_id, m.score1], [m.player2_id, m.score2]] as [pid, score], slot (slot)}
                                {@const won = done && m.winner_id && m.winner_id === pid}
                                <div class="flex items-center justify-between gap-2 text-sm">
                                  <span
                                    class="truncate font-bold
                                      {!pid ? 'text-slate-600 italic' : won ? 'text-amber-300' : done || !isAlive(pid) ? 'text-slate-500' : 'text-white'}"
                                  >{getPlayerName(pid)}</span>
                                  <span class="font-orbitron font-black text-xs shrink-0 {won ? 'text-amber-400' : 'text-slate-400'}">
                                    {#if m.status === "walkover"}{won ? "W" : "FF"}{:else if done || live}{score ?? 0}{/if}
                                  </span>
                                </div>
                              {/each}
                            </div>
                          {/each}
                        </div>
                      </div>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          </div>
          {/if}

          <aside class="w-80 shrink-0 flex flex-col justify-center gap-4 py-4">
            <div
              class="rounded-2xl border border-cyan-500/25 bg-slate-950/80 p-5 shadow-2xl backdrop-blur"
            >
              <div class="flex items-center justify-between mb-3">
                <span
                  class="text-[10px] font-mono font-bold tracking-[0.2em] text-cyan-400 uppercase"
                  >NEXT MATCH</span
                >
                <span class="text-[9px] font-mono text-slate-500">
                  {isLargeBracket
                    ? showFinalStage
                      ? "FINAL STAGE"
                      : `SECTION ${sectionIndex + 1}`
                    : isTree ? "BRACKET" : (selectedStage?.short || "")}
                </span>
              </div>
              {#if nextMatch}
                <div class="space-y-2">
                  <div class="flex items-center justify-between gap-2">
                    <div class="flex items-center gap-2 min-w-0">
                      <span class="text-[9px] font-mono text-slate-500 shrink-0"
                        >#{getPlayerSeed(nextMatch.player1_id) ?? "-"}</span
                      >
                      <span class="text-sm font-black text-white truncate"
                        >{getPlayerName(nextMatch.player1_id)}</span
                      >
                    </div>
                  </div>
                  <div class="flex items-center gap-2">
                    <div class="h-px flex-1 bg-slate-800"></div>
                    <span
                      class="text-[8px] font-black tracking-[0.2em] text-slate-600 font-orbitron"
                      >VS</span
                    >
                    <div class="h-px flex-1 bg-slate-800"></div>
                  </div>
                  <div class="flex items-center justify-between gap-2">
                    <div class="flex items-center gap-2 min-w-0">
                      <span class="text-[9px] font-mono text-slate-500 shrink-0"
                        >#{getPlayerSeed(nextMatch.player2_id) ?? "-"}</span
                      >
                      <span class="text-sm font-black text-white truncate"
                        >{getPlayerName(nextMatch.player2_id)}</span
                      >
                    </div>
                  </div>
                </div>
                <div
                  class="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[9px] font-mono text-slate-500 uppercase"
                >
                  <span>{stageLabel(nextMatch)}</span>
                  <span>#{matchOrder.get(nextMatch.id)}</span>
                </div>
              {:else if activeMatch}
                <div class="text-sm font-black text-amber-400">LIVE</div>
                <div class="text-xs text-slate-400 mt-1">
                  {getPlayerName(activeMatch.player1_id)} vs
                  {getPlayerName(activeMatch.player2_id)}
                </div>
              {:else}
                <div class="text-sm text-slate-500 italic">
                  No playable match right now.
                </div>
              {/if}
            </div>

            <div
              class="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-5"
            >
              <div
                class="text-[10px] font-mono font-bold tracking-[0.2em] text-slate-500 uppercase"
              >
                {!isLargeBracket
                  ? "BRACKET PROGRESS"
                  : showFinalStage
                    ? "FINAL STAGE"
                    : "SECTION PROGRESS"}
              </div>
              <div class="text-3xl font-black text-white font-orbitron mt-1">
                {!isLargeBracket
                  ? `${completedRealMatches.length} / ${realMatches.length}`
                  : showFinalStage
                    ? "FINAL"
                    : `${sectionIndex + 1} / ${sectionCount}`}
              </div>
              <div class="text-[10px] font-mono text-slate-500 mt-2">
                {completedRealMatches.length} / {realMatches.length} MATCHES
              </div>
              <div class="h-1 bg-slate-800 rounded-full mt-2 overflow-hidden">
                <div
                  class="h-full bg-cyan-400"
                  style="width: {bracketProgress}%"
                ></div>
              </div>
            </div>
            {#if swissTable.length}
              <div class="rounded-2xl border border-cyan-500/25 bg-slate-950/80 p-4 shadow-2xl backdrop-blur">
                <div class="text-[10px] font-mono font-bold tracking-[0.2em] text-cyan-400 uppercase mb-2">STANDINGS</div>
                <div class="space-y-1">
                  {#each swissTable as row, i (row.player_id + (row.group_label || ""))}
                    <div class="flex items-center gap-2 text-xs">
                      <span class="w-6 text-right font-mono text-slate-500">{row.group_label ? `${row.group_label}${row.rank}` : row.rank ?? i + 1}</span>
                      <span class="flex-1 truncate font-bold text-white">{getPlayerName(row.player_id)}</span>
                      <span class="font-orbitron text-cyan-400 shrink-0">{row.wins ?? 0}-{row.losses ?? 0}</span>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          </aside>
          </div>

          <!-- Footer -->
          <footer
            class="flex justify-between items-center text-xs text-slate-550 border-t border-slate-900 pt-3 shrink-0"
          >
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping"
              ></span>
              <span>Real-time OBS Bracket Feed Sync Active</span>
            </div>
            <div>SUCK Ultra Chicken King SC2 Tournaments</div>
          </footer>
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  /* Bracket Connectors */
  .line-horizontal-active {
    background: rgba(6, 182, 212, 0.95);
    box-shadow: 0 0 8px rgba(6, 182, 212, 0.8);
    height: 3px !important;
  }

  .line-horizontal-inactive {
    background: #475569;
    height: 1.5px !important;
  }

  .line-vertical-active {
    background: rgba(6, 182, 212, 0.95);
    box-shadow: 0 0 8px rgba(6, 182, 212, 0.8);
    width: 3px !important;
  }

  .line-vertical-inactive {
    background: #475569;
    width: 1.5px !important;
  }

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

  /* Marquee/Ticker Styling & Smooth Scrolling Animation */
  .ticker-wrap {
    box-shadow:
      0 10px 25px -5px rgba(0, 0, 0, 0.6),
      inset 0 1px 0 0 rgba(255, 255, 255, 0.05);
  }

  .ticker {
    display: inline-flex;
    align-items: center;
    white-space: nowrap;
    position: absolute;
    width: max-content;
    will-change: transform;
  }

  .animate-marquee {
    animation: marquee 35s linear infinite;
  }

  .ticker-item {
    display: inline-flex;
    align-items: center;
    padding-right: 2rem;
    color: #cbd5e1;
  }

  @keyframes marquee {
    0% {
      transform: translate3d(0, 0, 0);
    }
    100% {
      /* Scroll by exactly one set of matches (1/3 of repeated content) */
      transform: translate3d(-33.3333%, 0, 0);
    }
  }

  /* Card scale on active matches */
  .scale-102 {
    transform: scale(1.025);
    box-shadow:
      0 20px 25px -5px rgba(245, 158, 11, 0.15),
      0 10px 10px -5px rgba(245, 158, 11, 0.04);
  }

  /* Smooth custom scrollbars inside lists */
  .scroll-container::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }
  .scroll-container::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.4);
  }
  .scroll-container::-webkit-scrollbar-thumb {
    background: rgba(6, 182, 212, 0.3);
    border-radius: 4px;
  }
  .scroll-container::-webkit-scrollbar-thumb:hover {
    background: rgba(6, 182, 212, 0.5);
  }
</style>
