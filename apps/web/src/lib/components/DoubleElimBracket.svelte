<script>
  // Double-elimination bracket (Challonge style): winners band with the
  // grand final as its last column, losers band below, SVG connectors.
  // Layout maths in $lib/bracket.js, card helpers in $lib/match-card.js.
  import MatchCardActions from "$lib/components/tournament/MatchCardActions.svelte";
  import CrownIcon from "@lucide/svelte/icons/crown";
  import Flag from "$lib/components/Flag.svelte";
  import {
    bracketRoundLabel,
    bracketRoundTotal,
    columnConnectors,
    layoutBracketBand,
    numberMatches,
    roundLabel,
    withGrandFinalColumn,
  } from "$lib/bracket.js";
  import { isCompletedBye, isMine, isPlayableIn, slotScore } from "$lib/match-card.js";
  import { canCorrectResult } from "$lib/tournament.js";

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
    const label =
      match.bracket === "gf" && match.position === 2
        ? "重置赛"
        : `场次 ${match.position}`;
    return number ? `#${number} · ${label}` : label;
  }
</script>

{#snippet playerRow(match, slot)}
  {@const id = slot === 1 ? match.player1_id : match.player2_id}
  {@const won = match.winner_id === id}
  <div
    class="flex h-[28px] items-center justify-between {slot === 1 ? 'border-b border-neutral-200/60 dark:border-neutral-900/50' : ''}"
  >
    <div class="flex min-w-0 flex-1 items-center gap-1.5 pl-2">
      <Flag code={playerOf(id)?.flag} size={14} />
      <span
        class="truncate text-[10.5px]
          {won
          ? 'font-black text-foreground'
          : 'font-semibold text-neutral-700 dark:text-neutral-300'}
          {!id ? 'italic text-muted-foreground/70' : ''}"
      >
        {playerLabel(match, slot)}
      </span>
      {#if won && match.winner_id}
        <CrownIcon class="h-2.5 w-2.5 shrink-0 text-amber-500" />
      {/if}
    </div>
    {#if match.status !== "pending"}
      <div
        class="flex h-full w-7 shrink-0 items-center justify-center border-l border-neutral-200 font-mono text-[11px] font-bold dark:border-neutral-900/60
          {won
          ? 'text-primary'
          : 'text-neutral-400 dark:text-neutral-500'}"
      >
        {slotScore(match, slot)}
      </div>
    {/if}
  </div>
{/snippet}

{#snippet bandHeader(label)}
  <div
    class="flex h-7 items-center justify-center rounded-md border border-neutral-700/50 bg-neutral-800/85 px-2 text-[11px] font-bold tracking-wide text-neutral-100 shadow-sm"
  >
    {label}
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
          : "stroke-neutral-400/45 dark:stroke-neutral-600/50"}
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
  {@const playable = isPlayableIn(match, status)}
  {@const editable = isAdmin && canCorrectResult(match)}
  {@const clickable = playable || editable}
  {@const active = activeMatchId === match.id}
  {@const other = liveElsewhere.get(match.id)}
  {#if !voided}
    {#if bye}
      <div
        class="flex h-full items-center justify-center rounded-md border border-dashed border-neutral-300 bg-neutral-100/70 px-2 text-[10px] text-muted-foreground dark:border-neutral-700 dark:bg-neutral-900/40"
      >
        轮空 · {playerLabel(
          match,
          match.winner_id === match.player1_id ? 1 : 2,
        )} 晋级
      </div>
    {:else}
      <div
        role="button"
        tabindex="0"
        onclick={() => {
          if (clickable) onOpenMatch(match);
        }}
        onkeydown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && clickable) {
            onOpenMatch(match);
          }
        }}
        class="flex h-full flex-col justify-between overflow-hidden rounded-md border bg-white text-xs shadow-sm transition-all dark:bg-[#1c1c1c]
          {clickable
          ? 'cursor-pointer hover:shadow-md'
          : 'cursor-default'}
          {playable
          ? 'border-primary/30 ring-2 ring-primary/40'
          : 'border-neutral-300 dark:border-neutral-800'}
          {active ? 'border-amber-500/40 ring-2 ring-amber-500/70' : ''}"
      >
        <div
          class="flex h-[18px] shrink-0 items-center justify-between border-b border-neutral-200 bg-neutral-100 px-2 text-[8px] font-mono text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400"
        >
          <span>{cardTitle(match)}</span>
          <MatchCardActions
            {match}
            {playable}
            {active}
            otherChannel={other}
            {isAdmin}
            {banpickEnabled}
            mine={isMine(match, userId)}
            correctable={editable}
            ontoggleactive={onToggleActive}
            onbanpick={onBanPick}
          />
        </div>

        {@render playerRow(match, 1)}
        {@render playerRow(match, 2)}
      </div>
    {/if}
  {/if}
{/snippet}

{#if wbColumns.length || lbBand.columns.length}
  <div class="space-y-9 py-1">
    <section>
      <div class="mb-2 flex flex-wrap items-center gap-2">
        <span
          class="rounded-full border border-sky-500/30 bg-sky-500/5 px-2 py-0.5 text-[10px] font-bold text-sky-500"
          >{isGroupSingle ? "单败淘汰" : "胜者组"}</span
        >
        <span class="text-[10px] text-muted-foreground/70">
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
              {@render bandHeader(column.grandFinal ? "总决赛" : columnLabel("wb", column.round, wbTotal))}
            </div>
          {/each}

          {@render connectors(wbPaths, wbWidth, wbHeight + HEADER_H)}

          {@render placedCards(wbColumns)}
        </div>
      </div>
      {#if thirdPlace.length}
        <div class="mt-3 space-y-1.5">
          <div
            class="flex h-7 items-center justify-center rounded-md border border-neutral-700/50 bg-neutral-800/85 px-2 text-[11px] font-bold tracking-wide text-neutral-100 shadow-sm"
            style="width: {CARD_W}px"
          >
            三四名决赛
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
          class="rounded-full border border-purple-500/30 bg-purple-500/5 px-2 py-0.5 text-[10px] font-bold text-purple-400"
          >败者组</span
        >
        <span class="text-[10px] text-muted-foreground/70"
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
              {@render bandHeader(columnLabel("lb", column.round, lbTotal))}
            </div>
          {/each}

          {@render connectors(lbPaths, lbBand.width, lbBand.height + HEADER_H)}

          {@render placedCards(lbBand.columns)}
        </div>
      </div>
    </section>
    {/if}

    {#if grandFinalReset}
      <p class="text-[10px] text-muted-foreground/60">
        总决赛重置已开启：若败者组冠军赢下首场，会自动加赛一场决定冠军。
      </p>
    {/if}
  </div>
{:else}
  <div class="py-12 text-center text-muted-foreground">
    <p class="text-xs italic">对阵图尚未生成。</p>
  </div>
{/if}
