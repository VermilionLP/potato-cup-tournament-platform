<script>
  import CrownIcon from "@lucide/svelte/icons/crown";
  import Flag from "$lib/components/Flag.svelte";
  import {
    bracketConnectorPath,
    bracketRoundLabel,
    bracketRoundTotal,
    layoutBracketBand,
  } from "$lib/bracket.js";
  import { canCorrectResult } from "$lib/tournament.js";

  let {
    matches = [],
    players = [],
    status = "",
    activeMatchId = null,
    isAdmin = false,
    userId = "",
    grandFinalReset = false,
    onOpenMatch = () => {},
    onToggleActive = () => {},
    banpickEnabled = false,
    onBanPick = () => {},
  } = $props();

  const CARD_W = 220;
  const CARD_H = 76;
  const SLOT_H = 104;
  const GAP = 52;
  const HEADER_H = 38;
  const GF_GAP = 28;

  const playerById = $derived(new Map((players || []).map((p) => [p.id, p])));
  const wbTotal = $derived(bracketRoundTotal(matches, "wb"));
  const lbTotal = $derived(bracketRoundTotal(matches, "lb"));

  const wbBand = $derived(
    layoutBracketBand(matches, "wb", {
      cardHeight: CARD_H,
      slotHeight: SLOT_H,
      columnWidth: CARD_W,
      columnGap: GAP,
    }),
  );
  const lbBand = $derived(
    layoutBracketBand(matches, "lb", {
      cardHeight: CARD_H,
      slotHeight: SLOT_H,
      columnWidth: CARD_W,
      columnGap: GAP,
    }),
  );

  const grandFinals = $derived(
    (matches || [])
      .filter((m) => m.bracket === "gf")
      .sort((a, b) => a.position - b.position),
  );

  // The grand final is shown as the last column of the winners band, the way
  // Challonge lays it out next to the winners final.
  const wbColumns = $derived.by(() => {
    const columns = wbBand.columns.map((column) => ({
      ...column,
      grandFinal: false,
    }));
    if (!grandFinals.length) return columns;
    const last = columns[columns.length - 1];
    const x = last ? last.x + CARD_W + GAP : 0;
    const anchorY = last?.matches?.[0]?.y ?? CARD_H / 2;
    return [
      ...columns,
      {
        round: 1,
        x,
        grandFinal: true,
        matches: grandFinals.map((match, index) => ({
          match,
          x,
          y: anchorY + index * (CARD_H + GF_GAP),
        })),
      },
    ];
  });

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

  function connectorPaths(columns) {
    const paths = [];
    for (let index = 0; index < columns.length - 1; index += 1) {
      const nextById = new Map(
        columns[index + 1].matches.map((item) => [item.match.id, item]),
      );
      for (const source of columns[index].matches) {
        const target = nextById.get(source.match.next_match_id);
        if (!target) continue;
        paths.push({
          d: bracketConnectorPath(source, target, CARD_W, HEADER_H),
          active: Boolean(source.match.winner_id),
        });
      }
    }
    return paths;
  }

  const wbPaths = $derived(connectorPaths(wbColumns));
  const lbPaths = $derived(connectorPaths(lbBand.columns));

  // Challonge-style global match numbers: winners bracket first, then losers
  // bracket, then the grand final (and its reset).
  const matchNumbers = $derived.by(() => {
    const ids = [];
    for (const column of wbBand.columns) {
      for (const item of column.matches) ids.push(item.match.id);
    }
    for (const column of lbBand.columns) {
      for (const item of column.matches) ids.push(item.match.id);
    }
    for (const match of grandFinals) ids.push(match.id);
    return new Map(ids.map((id, index) => [id, index + 1]));
  });

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

  function isBye(match) {
    return (
      match.status === "completed" &&
      Boolean(match.winner_id) &&
      (!match.player1_id || !match.player2_id)
    );
  }

  function isVoid(match) {
    return (
      match.status === "completed" &&
      !match.winner_id &&
      !match.player1_id &&
      !match.player2_id
    );
  }

  function isPlayable(match) {
    return (
      status === "in_progress" &&
      match.status === "pending" &&
      Boolean(match.player1_id && match.player2_id)
    );
  }

  function canEditResult(match) {
    return isAdmin && canCorrectResult(match);
  }

  function scoreLabel(match, slot) {
    if (match.status === "pending") return "";
    if (match.status === "walkover") {
      const won =
        slot === 1
          ? match.winner_id === match.player1_id
          : match.winner_id === match.player2_id;
      return won ? "W" : "FF";
    }
    return slot === 1 ? match.score1 : match.score2;
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

{#snippet matchCard(match)}
  {@const bye = isBye(match)}
  {@const voided = isVoid(match)}
  {@const playable = isPlayable(match)}
  {@const editable = canEditResult(match)}
  {@const clickable = playable || editable}
  {@const active = activeMatchId === match.id}
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
          <div class="flex items-center gap-1">
            {#if isAdmin && playable}
              <button
                type="button"
                onclick={(e) => {
                  e.stopPropagation();
                  onToggleActive(match);
                }}
                class="rounded px-1 py-0.5 text-[7px] font-bold transition-all
                  {active
                  ? 'bg-amber-500 text-black hover:bg-amber-400'
                  : 'bg-primary text-primary-foreground hover:bg-primary/85'}"
              >
                {active ? "直播中" : "推流直播"}
              </button>
            {/if}
            {#if banpickEnabled && playable}
              <button
                type="button"
                onclick={(e) => {
                  e.stopPropagation();
                  onBanPick(match);
                }}
                class="rounded border border-primary/40 px-1 py-0.5 text-[7px] font-bold text-primary transition-all hover:bg-primary hover:text-primary-foreground"
                title="打开 Ban / Pick"
              >
                BP
              </button>
            {/if}
            {#if userId && match.status === "pending" && (match.player1_id === userId || match.player2_id === userId)}
              <span class="animate-pulse font-bold text-primary">我的比赛</span>
            {/if}
            {#if editable}
              <span class="rounded bg-amber-500/15 px-1 py-0.5 text-[7px] font-bold text-amber-500">修正</span>
            {/if}
          </div>
        </div>

        <div
          class="flex h-[28px] items-center justify-between border-b border-neutral-200/60 dark:border-neutral-900/50"
        >
          <div class="flex min-w-0 flex-1 items-center gap-1.5 pl-2">
            <Flag code={playerOf(match.player1_id)?.flag} size={14} />
            <span
              class="truncate text-[10.5px]
                {match.winner_id === match.player1_id
                ? 'font-black text-foreground'
                : 'font-semibold text-neutral-700 dark:text-neutral-300'}
                {!match.player1_id ? 'italic text-muted-foreground/70' : ''}"
            >
              {playerLabel(match, 1)}
            </span>
            {#if match.winner_id === match.player1_id && match.winner_id}
              <CrownIcon class="h-2.5 w-2.5 shrink-0 text-amber-500" />
            {/if}
          </div>
          {#if match.status !== "pending"}
            <div
              class="flex h-full w-7 shrink-0 items-center justify-center border-l border-neutral-200 font-mono text-[11px] font-bold dark:border-neutral-900/60
                {match.winner_id === match.player1_id
                ? 'text-primary'
                : 'text-neutral-400 dark:text-neutral-500'}"
            >
              {scoreLabel(match, 1)}
            </div>
          {/if}
        </div>

        <div class="flex h-[28px] items-center justify-between">
          <div class="flex min-w-0 flex-1 items-center gap-1.5 pl-2">
            <Flag code={playerOf(match.player2_id)?.flag} size={14} />
            <span
              class="truncate text-[10.5px]
                {match.winner_id === match.player2_id
                ? 'font-black text-foreground'
                : 'font-semibold text-neutral-700 dark:text-neutral-300'}
                {!match.player2_id ? 'italic text-muted-foreground/70' : ''}"
            >
              {playerLabel(match, 2)}
            </span>
            {#if match.winner_id === match.player2_id && match.winner_id}
              <CrownIcon class="h-2.5 w-2.5 shrink-0 text-amber-500" />
            {/if}
          </div>
          {#if match.status !== "pending"}
            <div
              class="flex h-full w-7 shrink-0 items-center justify-center border-l border-neutral-200 font-mono text-[11px] font-bold dark:border-neutral-900/60
                {match.winner_id === match.player2_id
                ? 'text-primary'
                : 'text-neutral-400 dark:text-neutral-500'}"
            >
              {scoreLabel(match, 2)}
            </div>
          {/if}
        </div>
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
          >胜者组</span
        >
        <span class="text-[10px] text-muted-foreground/70"
          >首败进入败者组，再败淘汰；总决赛由胜者组冠军与败者组冠军对决</span
        >
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
              <div
                class="flex h-7 items-center justify-center rounded-md border border-neutral-700/50 bg-neutral-800/85 px-2 text-[11px] font-bold tracking-wide text-neutral-100 shadow-sm"
              >
                {#if column.grandFinal}
                  总决赛
                {:else}
                  {bracketRoundLabel("wb", column.round, wbTotal)}
                {/if}
              </div>
            </div>
          {/each}

          <svg
            class="pointer-events-none absolute left-0 top-0"
            width={wbWidth}
            height={wbHeight + HEADER_H}
            aria-hidden="true"
          >
            {#each wbPaths as path, index (index)}
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

          {#each wbColumns as column (column.grandFinal ? "gf-cards" : column.round)}
            {#each column.matches as item (item.match.id)}
              <div
                class="absolute"
                style="left: {item.x}px; top: {item.y + HEADER_H - CARD_H / 2}px; width: {CARD_W}px; height: {CARD_H}px"
              >
                {@render matchCard(item.match)}
              </div>
            {/each}
          {/each}
        </div>
      </div>
    </section>

    <section>
      <div class="mb-2 flex flex-wrap items-center gap-2">
        <span
          class="rounded-full border border-purple-500/30 bg-purple-500/5 px-2 py-0.5 text-[10px] font-bold text-purple-400"
          >败者组</span
        >
        <span class="text-[10px] text-muted-foreground/70"
          >输一场仍可继续，再输即淘汰；败者组决赛胜者进入总决赛</span
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
              <div
                class="flex h-7 items-center justify-center rounded-md border border-neutral-700/50 bg-neutral-800/85 px-2 text-[11px] font-bold tracking-wide text-neutral-100 shadow-sm"
              >
                {bracketRoundLabel("lb", column.round, lbTotal)}
              </div>
            </div>
          {/each}

          <svg
            class="pointer-events-none absolute left-0 top-0"
            width={lbBand.width}
            height={lbBand.height + HEADER_H}
            aria-hidden="true"
          >
            {#each lbPaths as path, index (index)}
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

          {#each lbBand.columns as column (column.round)}
            {#each column.matches as item (item.match.id)}
              <div
                class="absolute"
                style="left: {item.x}px; top: {item.y + HEADER_H - CARD_H / 2}px; width: {CARD_W}px; height: {CARD_H}px"
              >
                {@render matchCard(item.match)}
              </div>
            {/each}
          {/each}
        </div>
      </div>
    </section>

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
