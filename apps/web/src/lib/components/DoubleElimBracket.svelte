<script>
  // Double-elimination bracket (Challonge style): winners band with the
  // grand final as its last column, losers band below, SVG connectors.
  // Layout maths in #lib/bracket.js, card helpers in #lib/match-card.js.
  import { roundKey } from "#lib/round-format.js";
  import RoundBestOf from "#lib/components/tournament/RoundBestOf.svelte";
  import BracketMatchCard from "#lib/components/BracketMatchCard.svelte";
  import {
    bracketRoundLabel,
    bracketRoundTotal,
    columnConnectors,
    layoutBracketBand,
    numberMatches,
    roundLabel,
    withGrandFinalColumn,
  } from "#lib/bracket.js";
  import { isCompletedBye } from "#lib/match-card.js";

  let {
    matches = [],
    players = [],
    status = "",
    activeMatchId = null,
    liveElsewhere = new Map(), // match id -> another live channel
    isAdmin = false,
    userId = "",
    grandFinalReset = false,
    onOpenMatch = () => {},
    onToggleActive = () => {},
    banpickEnabled = false,
    onBanPick = () => {},
    // Group-stage brackets reuse this view: their matches use other codes
    // ('gwb' / 'glb' for a double-elimination group, 'gse' for a
    // single-elimination group, which has no losers band) and no grand final.
    wbCode = "wb",
    lbCode = "lb",
    variant = "playoff", // 'playoff' | 'group-double' | 'group-single'
    perGroup = 0,
  } = $props();

  const isGroup = $derived(variant !== "playoff");
  const isGroupSingle = $derived(variant === "group-single");
  // The third-place match (round 0) sits under the bracket, not in a column.
  const bandMatches = $derived((matches || []).filter((m) => m.round > 0));
  const thirdPlace = $derived(
    (matches || []).filter((m) => m.bracket === wbCode && m.round === 0),
  );

  const CARD_W = 220;
  const CARD_H = 76;
  const SLOT_H = 104;
  const GAP = 52;
  const HEADER_H = 38;
  const GF_GAP = 28;

  const playerById = $derived(new Map((players || []).map((p) => [p.id, p])));
  const wbTotal = $derived(bracketRoundTotal(bandMatches, wbCode));
  const lbTotal = $derived(bracketRoundTotal(bandMatches, lbCode));

  const bandSize = { cardHeight: CARD_H, slotHeight: SLOT_H, columnWidth: CARD_W, columnGap: GAP };
  const wbBand = $derived(layoutBracketBand(bandMatches, wbCode, bandSize));
  const lbBand = $derived(layoutBracketBand(bandMatches, lbCode, bandSize));

  const grandFinals = $derived(
    (matches || [])
      .filter((m) => m.bracket === "gf")
      .sort((a, b) => a.position - b.position),
  );

  // The grand final is shown as the last column of the winners band, the way
  // Challonge lays it out next to the winners final.
  const wbColumns = $derived(
    withGrandFinalColumn(wbBand.columns, grandFinals, {
      cardWidth: CARD_W,
      cardHeight: CARD_H,
      columnGap: GAP,
      stackGap: GF_GAP,
    }),
  );

  const wbWidth = $derived(
    wbColumns.length ? wbColumns[wbColumns.length - 1].x + CARD_W : 0,
  );
  const wbHeight = $derived(
    Math.max(
      CARD_H,
      ...wbColumns.flatMap((column) =>
        column.matches.map((item) => item.y + CARD_H / 2),
      ),
    ),
  );

  const wbPaths = $derived(columnConnectors(wbColumns, CARD_W, HEADER_H));
  const lbPaths = $derived(columnConnectors(lbBand.columns, CARD_W, HEADER_H));

  // Challonge-style global match numbers: winners bracket first, then losers
  // bracket, then the grand final (and its reset), then third place.
  const matchNumbers = $derived(numberMatches(wbBand.columns, lbBand.columns, grandFinals, thirdPlace));

  // Column headers. A group's last winners/losers round decides who qualifies.
  function columnLabel(side, round, total) {
    if (isGroupSingle) return roundLabel(round, total);
    if (isGroup && round === 1) return side === "lb" ? "败者组出线战" : "胜者组出线战";
    return bracketRoundLabel(side, round, total);
  }

  function playerOf(id) {
    return id ? playerById.get(id) : null;
  }

  function playerLabel(match, slot) {
    const id = slot === 1 ? match.player1_id : match.player2_id;
    if (id) return playerOf(id)?.display_name || id;
    if (match.bracket === "gf") {
      return slot === 1 ? "胜者组冠军" : "败者组冠军";
    }
    return "TBD";
  }

  function isVoid(match) {
    return (
      match.status === "completed" &&
      !match.winner_id &&
      !match.player1_id &&
      !match.player2_id
    );
  }

  function cardTitle(match) {
    const number = matchNumbers.get(match.id);
    // Only the number; the grand final reset says so.
    const reset = match.bracket === "gf" && match.position === 2;
    const label = number ? `#${number}` : `#${match.position}`;
    return reset ? `${label} · 重置赛` : label;
  }
</script>

{#snippet bandHeader(label, key = "")}
  <div
    class="flex h-7 items-center justify-center gap-1.5 rounded-full bg-secondary px-3 text-small font-bold text-secondary-foreground"
  >
    {label}
    <RoundBestOf {key} {label} />
  </div>
{/snippet}

{#snippet connectors(paths, width, height)}
  <svg
    class="pointer-events-none absolute left-0 top-0"
    {width}
    {height}
    aria-hidden="true"
  >
    {#each paths as path, index (index)}
      <path
        d={path.d}
        fill="none"
        stroke-width="1.5"
        stroke-linecap="round"
        class={path.active
          ? "stroke-primary/60"
          : "stroke-input"}
      />
    {/each}
  </svg>
{/snippet}

{#snippet placedCards(columns)}
  {#each columns as column (column.grandFinal ? "gf-cards" : column.round)}
    {#each column.matches as item (item.match.id)}
      <div
        class="absolute"
        style="left: {item.x}px; top: {item.y + HEADER_H - CARD_H / 2}px; width: {CARD_W}px; height: {CARD_H}px"
      >
        {@render matchCard(item.match)}
      </div>
    {/each}
  {/each}
{/snippet}

{#snippet matchCard(match)}
  {@const bye = isCompletedBye(match)}
  {@const voided = isVoid(match)}
  {#if !voided}
    {#if bye}
      <div
        class="flex h-full items-center justify-center rounded-lg border border-dashed border-input px-2 text-small text-muted-foreground"
      >
        轮空 · {playerLabel(
          match,
          match.winner_id === match.player1_id ? 1 : 2,
        )} 晋级
      </div>
    {:else}
      <BracketMatchCard
        {match}
        title={cardTitle(match)}
        {status}
        nameOf={playerLabel}
        flagOf={(id) => playerOf(id)?.flag}
        {activeMatchId}
        otherChannel={liveElsewhere.get(match.id)}
        {isAdmin}
        {userId}
        {banpickEnabled}
        onopen={onOpenMatch}
        ontoggleactive={onToggleActive}
        onbanpick={onBanPick}
        class="h-full"
      />
    {/if}
  {/if}
{/snippet}

{#if wbColumns.length || lbBand.columns.length}
  <div class="space-y-9 py-1">
    <section>
      <div class="mb-2 flex flex-wrap items-center gap-2">
        <span
          class="rounded-full border border-sky-500/30 bg-sky-500/5 px-2 py-0.5 text-small font-bold text-sky-500"
          >{isGroupSingle ? "单败淘汰" : "胜者组"}</span
        >
        <span class="text-small text-muted-foreground/70">
          {#if isGroupSingle}
            整组打完，按最终名次取前 {perGroup} 名出线{perGroup >= 3 ? "（含三四名决赛）" : ""}
          {:else if isGroup}
            首败进入败者组，再败淘汰；胜者组出线战胜者直接出线
          {:else}
            首败进入败者组，再败淘汰；总决赛由胜者组冠军与败者组冠军对决
          {/if}
        </span>
      </div>
      <div class="overflow-x-auto pb-2">
        <div
          class="relative"
          style="width: {wbWidth}px; height: {wbHeight + HEADER_H}px"
        >
          {#each wbColumns as column (column.grandFinal ? "gf" : column.round)}
            <div
              class="absolute"
              style="left: {column.x}px; top: 0; width: {CARD_W}px"
            >
              {@render bandHeader(
                column.grandFinal ? "总决赛" : columnLabel("wb", column.round, wbTotal),
                column.grandFinal ? roundKey(grandFinals[0] || { bracket: "gf", round: 1 }) : `${wbCode}:${column.round}`,
              )}
            </div>
          {/each}

          {@render connectors(wbPaths, wbWidth, wbHeight + HEADER_H)}

          {@render placedCards(wbColumns)}
        </div>
      </div>
      {#if thirdPlace.length}
        <div class="mt-3 space-y-1.5">
          <div
            class="flex h-7 items-center justify-center gap-1.5 rounded-full bg-secondary px-3 text-small font-bold text-secondary-foreground"
            style="width: {CARD_W}px"
          >
            三四名决赛
            <RoundBestOf key={roundKey(thirdPlace[0])} label="三四名决赛" />
          </div>
          {#each thirdPlace as match (match.id)}
            <div style="width: {CARD_W}px; height: {CARD_H}px">
              {@render matchCard(match)}
            </div>
          {/each}
        </div>
      {/if}
    </section>

    {#if lbBand.columns.length}
    <section>
      <div class="mb-2 flex flex-wrap items-center gap-2">
        <span
          class="rounded-full border border-sky-500/30 bg-sky-500/5 px-2 py-0.5 text-small font-bold text-sky-600 dark:text-sky-400"
          >败者组</span
        >
        <span class="text-small text-muted-foreground/70"
          >{isGroup
            ? "输一场仍可继续，再输即淘汰；败者组出线战胜者出线"
            : "输一场仍可继续，再输即淘汰；败者组决赛胜者进入总决赛"}</span
        >
      </div>
      <div class="overflow-x-auto pb-2">
        <div
          class="relative"
          style="width: {lbBand.width}px; height: {lbBand.height + HEADER_H}px"
        >
          {#each lbBand.columns as column (column.round)}
            <div
              class="absolute"
              style="left: {column.x}px; top: 0; width: {CARD_W}px"
            >
              {@render bandHeader(columnLabel("lb", column.round, lbTotal), `${lbCode}:${column.round}`)}
            </div>
          {/each}

          {@render connectors(lbPaths, lbBand.width, lbBand.height + HEADER_H)}

          {@render placedCards(lbBand.columns)}
        </div>
      </div>
    </section>
    {/if}

    {#if grandFinalReset}
      <p class="text-small text-muted-foreground/60">
        总决赛重置已开启：若败者组冠军赢下首场，会自动加赛一场决定冠军。
      </p>
    {/if}
  </div>
{:else}
  <div class="py-12 text-center text-muted-foreground">
    <p class="text-xs italic">对阵图尚未生成。</p>
  </div>
{/if}
