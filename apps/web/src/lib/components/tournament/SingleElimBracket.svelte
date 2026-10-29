<script>
  import MatchCardActions from "./MatchCardActions.svelte";
  // Single-elimination bracket (Liquipedia style): one column per round,
  // cards placed between their two feeder matches, connector lines, and the
  // third-place match under the final. Card placement is treePositions
  // ($lib/bracket.js, shared with the overlay); card helpers in
  // $lib/match-card.js.
  import { userState } from "$lib/user.svelte.js";
  import { canCorrectResult } from "$lib/tournament.js";
  import { roundLabel, treePositions } from "$lib/bracket.js";
  import { isCompletedBye, isMine, isPlayableIn, slotScore } from "$lib/match-card.js";
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
    ontoggleactive = () => {},
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

  let matchPositions = $derived(treePositions(rounds, bracketSpecs));

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

{#snippet playerRows(m)}
  {#each [1, 2] as slot (slot)}
    {@const id = slot === 1 ? m.player1_id : m.player2_id}
    {@const won = m.winner_id === id}
    <div class="flex items-center justify-between w-full h-6 transition-colors
      {slot === 1 ? 'border-b border-neutral-200/50 dark:border-neutral-900/40' : ''}
      {getPlayerRowBgClass(id)}">
      <div class="flex items-center gap-1.5 pl-1.5  flex-1 min-w-0 h-full py-0">
        <span class=" font-semibold flex items-center gap-0.5 text-[10.5px]
          {won ? 'text-black dark:text-white font-black' : 'text-neutral-700 dark:text-neutral-300'}
          {!id ? 'text-neutral-400 dark:text-neutral-500/80' : ''}"
        >
          {#if won && m.winner_id}
            <CrownIcon class="w-2.5 h-2.5 text-amber-500 dark:text-amber-400 shrink-0" />
          {/if}
          <span class="">{playerName(id, m)}</span>
        </span>
      </div>
      {#if m.status !== "pending"}
        <div class="w-6 h-full flex items-center justify-center font-mono font-bold text-[11px] bg-neutral-100/60 dark:bg-black/40 text-center shrink-0 border-l border-neutral-200 dark:border-neutral-900/60
          {won ? 'text-primary font-black' : 'text-neutral-400 dark:text-neutral-500'}">
          {slotScore(m, slot)}
        </div>
      {/if}
    </div>
  {/each}
{/snippet}

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
          {@const isPlayable = isPlayableIn(m, tournament.status)}
          {@const isBye = isCompletedBye(m)}

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
                  <MatchCardActions
                    match={m}
                    playable={isPlayable}
                    active={tournament.active_match_id === m.id}
                    otherChannel={liveElsewhere.get(m.id)}
                    {isAdmin}
                    {banpickEnabled}
                    mine={isMine(m, userState.id)}
                    correctable={isCorrectable}
                    gap="gap-1.5"
                    ontoggleactive={ontoggleactive}
                    onbanpick={onbanpick}
                  />
                </div>

                {@render playerRows(m)}
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
                  {@const isMBye = isCompletedBye(m)}
                  {@const isSiblingBye = isCompletedBye(sibling)}

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
            {@const gfMatch = r.matches[0]}
            {@const tpPlayable = isPlayableIn(thirdPlaceMatch, tournament.status)}
            {@const tpClickable = tpPlayable || (isAdmin && canCorrectResult(thirdPlaceMatch))}
            {#if gfMatch}
              {@const gfPos = matchPositions.positions[gfMatch.id] || { top: 0, height: 64 }}
              {@const tpTop = gfPos.top + gfPos.height + 28}
              
              <!-- Third Place Match Header -->
              <div class="absolute left-0 w-full text-[9px] font-bold text-center text-neutral-500 uppercase tracking-wider h-4 flex items-center justify-center gap-1.5"
                   style="top: {tpTop - 18}px;">
                三四名决赛
                {#if banpickEnabled && tpPlayable}
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

                  {@render playerRows(thirdPlaceMatch)}
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
