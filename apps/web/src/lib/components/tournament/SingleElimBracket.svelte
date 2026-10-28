<script>
  // Single-elimination bracket (Liquipedia style): one column per round,
  // cards placed between their two feeder matches, connector lines, and the
  // third-place match under the final.
  import { toast } from "svelte-sonner";
  import { API } from "$lib/api.js";
  import { userState } from "$lib/user.svelte.js";
  import { canCorrectResult } from "$lib/tournament.js";
  import { roundLabel } from "$lib/bracket.js";
  import CrownIcon from "@lucide/svelte/icons/crown";

  // rounds: the rounds shown (all, one section, or the final stage), first
  // round first; matches: every bracket match (for the third-place match).
  let {
    tournament,
    tid,
    rounds = [],
    matches = [],
    totalRounds = 1,
    isAdmin = false,
    liveElsewhere = new Map(), // match id -> another live channel
    banpickEnabled = false,
    matchOrder,
    playerName,
    onopen,
    onbanpick,
  } = $props();

  let displayFirstRoundCount = $derived(rounds[0]?.matches?.length || 0);

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
    const rs = rounds;
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
    if (tournament.hold_third_place && matches?.some(m => m.round === 0)) {
      return Math.max(base, 190);
    }
    return base;
  });

  // Alive player tracking for detailing connector states
  let alivePlayerIds = $derived.by(() => {
    if (!tournament?.players) return new Set();
    const alive = new Set(tournament.players.map((p) => p.id));
    (matches || []).forEach((m) => {
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

  function getPlayerRowBgClass(playerId) {
    if (!playerId) {
      return "bg-[#f8f9fa] dark:bg-neutral-900/30 text-neutral-400 dark:text-neutral-500";
    }
    return "bg-[#f8f9fa] dark:bg-neutral-900/60 hover:bg-neutral-200/50 dark:hover:bg-neutral-900/80 text-neutral-800 dark:text-neutral-200 border-l border-neutral-400 dark:border-l-neutral-500";
  }
</script>

<div class="flex justify-start items-stretch min-w-max py-4 {bracketSpecs.colGap}">
  {#each rounds as r, colIdx (r.round)}
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
                onclick={() => { if (isClickable) onopen(m); }}
                onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { if (isClickable) onopen(m); } }}
                class="w-full h-full text-left bg-white dark:bg-[#1c1c1c] border border-neutral-300 dark:border-neutral-800 rounded-md transition-all flex flex-col justify-between group/match shadow-md text-xs cursor-default overflow-hidden
                {isClickable ? 'hover:border-neutral-400 dark:hover:border-neutral-700 hover:shadow-lg cursor-pointer' : ''}
                {isPlayable ? 'ring-2 ring-primary/45 border-primary/20' : ''}"
              >
                <!-- Tiny Header Bar -->
                <div class="px-2 py-1 bg-neutral-100 dark:bg-neutral-900 text-[8px] font-mono text-neutral-500 dark:text-neutral-400 flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800/80 shrink-0">
                  <span>#{matchOrder.get(m.id)} · 场次 {m.position}</span>
                  <div class="flex items-center gap-1.5">
                    {#if liveElsewhere.get(m.id)}
                      <span class="px-1 py-0.5 rounded font-bold text-[7px] bg-sky-500/15 text-sky-600 dark:text-sky-300" title="该对局在其他直播频道直播中">频道 {liveElsewhere.get(m.id)}</span>
                    {:else if isAdmin && isPlayable}
                      {@const isActive = tournament.active_match_id === m.id}
                      <button
                        onclick={async (e) => {
                          e.stopPropagation();
                          try {
                            await API.setActiveMatch(tid, isActive ? null : m.id, tournament.live_channel ?? 1);
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
                        onclick={(e) => { e.stopPropagation(); onbanpick(m); }}
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
                  {getPlayerRowBgClass(m.player1_id)}">
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
                  {getPlayerRowBgClass(m.player2_id)}">
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
            {#if colIdx < rounds.length - 1}
              {@const nextRound = rounds[colIdx + 1]}
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

        {#if colIdx === rounds.length - 1}
          {@const thirdPlaceMatch = matches.find(m => m.round === 0)}
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
                    onclick={() => onbanpick(thirdPlaceMatch)}
                    class="px-1 rounded font-bold text-[7px] cursor-pointer border border-primary/40 text-primary hover:bg-primary hover:text-primary-foreground transition-all normal-case"
                    title="打开 Ban / Pick"
                  >BP</button>
                {/if}
              </div>
              
              <!-- Third Place Match Card -->
              <div class="absolute left-0 w-full" style="top: {tpTop}px; height: {gfPos.height}px;">
                <button
                  type="button"
                  onclick={() => { if (tpClickable) onopen(thirdPlaceMatch); }}
                  class="w-full h-full text-left bg-white dark:bg-[#1c1c1c] border border-neutral-300 dark:border-neutral-800 rounded-md transition-all flex flex-col justify-between group/match shadow-md text-xs cursor-default overflow-hidden
                  {tpClickable ? 'hover:border-neutral-400 dark:hover:border-neutral-700 hover:shadow-lg cursor-pointer' : ''}"
                >
                  <!-- Tiny Header Bar -->
                  <div class="px-2 py-0.5 bg-neutral-100 dark:bg-neutral-900 text-[8px] font-mono text-neutral-500 dark:text-neutral-400 flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800/80 shrink-0 h-4">
                    <span>场次 {thirdPlaceMatch.position}</span>
                  </div>

                  <!-- Player 1 Row -->
                  <div class="flex items-center justify-between w-full h-6 border-b border-neutral-200/50 dark:border-neutral-900/40 transition-colors
                    {getPlayerRowBgClass(thirdPlaceMatch.player1_id)}">
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
                    {getPlayerRowBgClass(thirdPlaceMatch.player2_id)}">
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
