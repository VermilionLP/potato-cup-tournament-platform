<script>
  // Overlay bracket scene ("hybrid", the default between matches): the
  // bracket of the current stage next to a side panel. Single elimination
  // gets the tree (16-player sections for big fields), double elimination
  // its two-band tree, grouped Swiss one group at a time, other Swiss and
  // group stages the stage board.
  import { fade } from "svelte/transition";
  import {
    boardBands,
    isDecided,
    isPlayable,
    layoutDoubleTree,
    pickFocusGroup,
    swissGroupViews,
    treeRounds,
    treeSections,
  } from "#lib/overlay-layout.js";
  import SingleElimTree from "./SingleElimTree.svelte";
  import DoubleElimTree from "./DoubleElimTree.svelte";
  import GroupedSwissBoard from "./GroupedSwissBoard.svelte";
  import StageBoard from "./StageBoard.svelte";
  import OverlaySidePanel from "./OverlaySidePanel.svelte";
  import OverlayTopBar from "./OverlayTopBar.svelte";

  let {
    tournament,
    matches = [],
    stages = [],
    selectedStage = null,
    explicitStage = null,
    activeMatch = null,
    nextMatch = null,
    realMatches = [],
    isSwiss = false,
    inPlayoffs = false,
    matchOrder,
    stageLabel,
    isAlive,
    who,
  } = $props();

  // Format shown in the header.
  let formatTag = $derived.by(() => {
    if (tournament?.playoff_format && !inPlayoffs) return isSwiss ? "GROUP STAGE · SWISS" : "GROUP STAGE";
    const format = inPlayoffs ? tournament?.playoff_format : tournament?.format;
    return format === "double_elim" ? "DOUBLE ELIMINATION" : format === "swiss" ? "SWISS" : "SINGLE ELIMINATION";
  });

  // Single elimination tree, in 16-player sections for big fields.
  let isTree = $derived(matches.length > 0 && matches.every((m) => (m.bracket || "main") === "main"));
  let sectionIndex = $state(0);
  let tree = $derived(
    treeSections(isTree ? treeRounds(matches) : [], {
      sectionIndex,
      activeRound: activeMatch?.round ?? null,
      selectedRound: selectedStage?.round ?? null,
    }),
  );
  $effect(() => {
    if (sectionIndex >= tree.sectionCount) sectionIndex = 0;
  });
  $effect(() => {
    if (!tree.isLarge || tree.showFinal || tree.sectionCount <= 1) return;
    const timer = setInterval(() => {
      sectionIndex = (sectionIndex + 1) % tree.sectionCount;
    }, 10000);
    return () => clearInterval(timer);
  });

  let deTree = $derived(isTree ? null : layoutDoubleTree(matches, stageLabel));

  // Grouped Swiss: one group at a time; groups take turns every 8 s.
  let swissGroups = $derived(isSwiss ? swissGroupViews(stages, tournament?.group_stage, explicitStage) : []);
  let groupTick = $state(0);
  let lastGroupLabel = $state(null);
  $effect(() => {
    if (swissGroups.length < 2) return;
    const timer = setInterval(() => (groupTick += 1), 8000);
    return () => clearInterval(timer);
  });
  let focusGroup = $derived(
    pickFocusGroup(swissGroups, {
      liveMatch: matches.find((m) => m.id === tournament?.active_match_id),
      nextMatch,
      lastLabel: lastGroupLabel,
      tick: groupTick,
    }),
  );
  $effect(() => {
    if (focusGroup) lastGroupLabel = focusGroup.label;
  });
  // Stage shown in labels: the shown group's round in grouped Swiss.
  let shownStage = $derived(focusGroup?.current || selectedStage);
  let panelNextMatch = $derived(focusGroup?.rounds.flatMap((r) => r.matches).find(isPlayable) || nextMatch);

  let bands = $derived(isTree || deTree ? [] : boardBands(stages, selectedStage?.key));

  // Swiss standings for a single pool (grouped Swiss uses focusGroup).
  let standings = $derived.by(() => {
    if (!isSwiss || swissGroups.length) return [];
    if (tournament?.standings?.length) return tournament.standings.slice(0, 16);
    const groups = tournament?.group_stage?.groups || [];
    if (groups.length === 1) return groups[0].rows.slice(0, 16);
    return groups.flatMap((g) => g.rows.slice(0, 3).map((r) => ({ ...r, group_label: g.label })));
  });

  let doneCount = $derived(realMatches.filter(isDecided).length);
  let percent = $derived(realMatches.length ? Math.round((doneCount / realMatches.length) * 100) : 0);
  let sectionText = $derived(tree.showFinal ? "FINAL STAGE" : `SECTION ${sectionIndex + 1} / ${tree.sectionCount}`);
  let progress = $derived({
    title: !tree.isLarge ? "MATCHES" : tree.showFinal ? "FINAL STAGE" : "SECTION",
    value: !tree.isLarge ? `${doneCount} / ${realMatches.length}` : tree.showFinal ? "FINAL" : `${sectionIndex + 1} / ${tree.sectionCount}`,
    done: doneCount,
    total: realMatches.length,
    percent,
  });
  let nextTag = $derived(
    tree.isLarge ? (tree.showFinal ? "FINAL STAGE" : `SECTION ${sectionIndex + 1}`) : isTree ? "BRACKET" : shownStage?.short || "",
  );

  // Top bar: the shown stage and its neighbours, in English.
  let steps = $derived.by(() => {
    const key = shownStage?.key;
    const i = Math.max(0, stages.findIndex((st) => st.key === key));
    return stages.slice(Math.max(0, i - 1), i + 3).map((st) => ({ label: st.tag, state: st.key === key ? "active" : stages.indexOf(st) < i ? "done" : "todo" }));
  });
</script>

<div class="absolute inset-0 z-10" transition:fade={{ duration: 400 }}>
  <OverlayTopBar {tournament} {steps}>
    {#snippet right()}
      <div class="flex w-[260px] flex-col gap-1.5">
        <div class="flex items-baseline justify-between">
          <span class="font-num text-base font-bold tracking-[0.16em] text-[#AFC0D8]">{progress.title}</span>
          <span class="font-display text-[32px] font-extrabold leading-none">{progress.value}</span>
        </div>
        <div class="h-1.5 overflow-hidden rounded-full bg-white/10"><div class="h-full rounded-full bg-cyan-400" style="width: {percent}%"></div></div>
      </div>
    {/snippet}
  </OverlayTopBar>

  <!-- Title line: format and stage -->
  <div class="absolute inset-x-16 top-[132px] flex h-10 items-center gap-4">
    <span class="font-num text-lg font-bold tracking-[0.16em] text-cyan-200">{formatTag}</span>
    <span class="text-white/25">·</span>
    <span class="font-num text-lg font-bold tracking-[0.16em] text-[#AFC0D8]">{tournament.players?.length || 0} PLAYERS</span>
    {#if tree.isLarge}
      <span class="text-white/25">·</span>
      <span class="font-num text-lg font-bold tracking-[0.16em] text-cyan-400">{sectionText}</span>
      {#if !tree.showFinal}
        <span class="ml-2 flex items-center gap-1.5">
          {#each Array(tree.sectionCount) as _, i (i)}
            <button type="button" onclick={() => (sectionIndex = i)} aria-label={`Show section ${i + 1}`} class="h-1.5 rounded-full transition-all {i === sectionIndex ? 'w-8 bg-cyan-400' : 'w-3 bg-white/20'}"></button>
          {/each}
        </span>
      {/if}
    {/if}
  </div>

  <div class="absolute inset-x-16 bottom-12 top-[188px] flex items-stretch gap-8">
    {#if isTree}
      <SingleElimTree {tournament} rounds={tree.rounds} {stageLabel} {isAlive} {who} />
    {:else if deTree}
      <DoubleElimTree {tournament} tree={deTree} selectedKey={selectedStage?.key} {who} />
    {:else if focusGroup}
      <GroupedSwissBoard
        {tournament}
        group={focusGroup}
        groupCount={swissGroups.length}
        groupIndex={swissGroups.indexOf(focusGroup)}
        shownKey={shownStage?.key}
        {who}
      />
    {:else}
      <StageBoard {tournament} {bands} selectedKey={selectedStage?.key} {isAlive} {who} />
    {/if}

    <OverlaySidePanel
      {tournament}
      nextMatch={panelNextMatch}
      {activeMatch}
      {nextTag}
      {focusGroup}
      {standings}
      {matches}
      {stageLabel}
      {matchOrder}
      {who}
    />
  </div>
</div>
