<script>
  // Single-elimination bracket (Liquipedia style): one column per round,
  // cards placed between their two feeder matches, connector lines, and the
  // third-place match under the final. Card placement is treePositions
  // (#lib/bracket.js, shared with the overlay); card helpers in
  // #lib/match-card.js.
  import { userState } from "#lib/user.svelte.js";
  import BracketMatchCard from "#lib/components/BracketMatchCard.svelte";
  import { roundLabel, treePositions } from "#lib/bracket.js";
  import { isCompletedBye } from "#lib/match-card.js";

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

  let flagOf = $derived((id) => tournament?.players?.find((p) => p.id === id)?.flag);
  let displayFirstRoundCount = $derived(rounds[0]?.matches?.length || 0);

  let bracketSpecs = $derived.by(() => {
    const count = displayFirstRoundCount;
    if (count >= 8) {
      // 16 players or more
      return {
        H: 76,
        g: 12,
        G: 24,
        cardWidth: "w-48",
        colGap: "gap-6",
        slotOffset: 16,
        connMid: 12,
        connWidth: 12,
        connGap: 24,
      };
    } else {
      // 8 players or fewer
      return {
        H: 76,
        g: 20,
        G: 40,
        cardWidth: "w-48",
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
      // Room for the third-place match under the final (28px gap + card).
      const final = rounds[rounds.length - 1]?.matches?.[0];
      const pos = final && matchPositions.positions[final.id];
      const bottom = pos ? pos.top + pos.height : 0;
      return Math.max(base, bottom + 28 + bracketSpecs.H + 8);
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

</script>

<div class="flex justify-start items-stretch min-w-max py-4 {bracketSpecs.colGap}">
  {#each rounds as r, colIdx (r.round)}
    <div class="shrink-0 flex flex-col justify-start h-full {bracketSpecs.cardWidth}">
      <!-- Round Header -->
      <div class="text-small text-secondary-foreground bg-secondary py-1.5 px-3 font-bold text-center mb-4 shrink-0 rounded-full">
        {roundLabel(r.round, totalRounds)}
      </div>


      <!-- Match cards in round (Absolutely positioned for perfect alignment) -->
      <div class="relative w-full" style="height: {adjustedTotalHeight}px">
        {#each r.matches as m, idx (m.id)}
          {@const pos = matchPositions.positions[m.id] || { top: 0, height: 76 }}
          {@const isBye = isCompletedBye(m)}

          <div class="absolute left-0 w-full" style="top: {pos.top}px; height: {pos.height}px;">
            {#if isBye}
              <!-- Bye Card (Hidden from view but occupies layout space) -->
              <div class="w-full h-full border border-transparent bg-transparent select-none pointer-events-none opacity-0"></div>
            {:else}
              <BracketMatchCard
                match={m}
                title="#{matchOrder.get(m.id)} · 场次 {m.position}"
                status={tournament.status}
                nameOf={(mm, slot) => playerName(slot === 1 ? mm.player1_id : mm.player2_id, mm)}
                {flagOf}
                activeMatchId={tournament.active_match_id}
                otherChannel={liveElsewhere.get(m.id)}
                {isAdmin}
                userId={userState.id}
                {banpickEnabled}
                {onopen}
                {ontoggleactive}
                {onbanpick}
                class="h-full"
              />
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
            {#if gfMatch}
              {@const gfPos = matchPositions.positions[gfMatch.id] || { top: 0, height: 76 }}
              {@const tpTop = gfPos.top + gfPos.height + 28}
              
              <!-- Third Place Match -->
              <div class="absolute left-0 w-full text-label font-bold text-center text-muted-foreground uppercase tracking-wider h-4 flex items-center justify-center"
                   style="top: {tpTop - 18}px;">
                三四名决赛
              </div>
              <div class="absolute left-0 w-full" style="top: {tpTop}px; height: {gfPos.height}px;">
                <BracketMatchCard
                  match={thirdPlaceMatch}
                  title="#{matchOrder.get(thirdPlaceMatch.id) ?? "?"} · 场次 {thirdPlaceMatch.position}"
                  status={tournament.status}
                  nameOf={(mm, slot) => playerName(slot === 1 ? mm.player1_id : mm.player2_id, mm)}
                  {flagOf}
                  activeMatchId={tournament.active_match_id}
                  otherChannel={liveElsewhere.get(thirdPlaceMatch.id)}
                  {isAdmin}
                  userId={userState.id}
                  {banpickEnabled}
                  {onopen}
                  {ontoggleactive}
                  {onbanpick}
                  class="h-full"
                />
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
