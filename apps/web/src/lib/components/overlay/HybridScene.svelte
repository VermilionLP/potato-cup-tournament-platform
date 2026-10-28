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
  } from "$lib/overlay-layout.js";
  import SingleElimTree from "./SingleElimTree.svelte";
  import DoubleElimTree from "./DoubleElimTree.svelte";
  import GroupedSwissBoard from "./GroupedSwissBoard.svelte";
  import StageBoard from "./StageBoard.svelte";
  import OverlaySidePanel from "./OverlaySidePanel.svelte";

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
    title: !tree.isLarge ? "BRACKET PROGRESS" : tree.showFinal ? "FINAL STAGE" : "SECTION PROGRESS",
    value: !tree.isLarge ? `${doneCount} / ${realMatches.length}` : tree.showFinal ? "FINAL" : `${sectionIndex + 1} / ${tree.sectionCount}`,
    done: doneCount,
    total: realMatches.length,
    percent,
  });
  let nextTag = $derived(
    tree.isLarge ? (tree.showFinal ? "FINAL STAGE" : `SECTION ${sectionIndex + 1}`) : isTree ? "BRACKET" : shownStage?.short || "",
  );

  const STATUS = {
    in_progress: "IN PROGRESS (进行中)",
    completed: "COMPLETED (已结束)",
    registration: "BRACKET PREVIEW (预览)",
    voting: "VOTING (投票中)",
  };
</script>

<div class="absolute inset-0 w-full h-full flex flex-col p-6 md:p-8 justify-between z-10" transition:fade={{ duration: 400 }}>
  <header class="flex justify-between items-start gap-6 border-b border-cyan-500/10 pb-3 mb-2 shrink-0">
    <div class="min-w-0">
      <div class="flex items-center gap-2 text-[10px] font-mono font-bold tracking-[0.25em] text-cyan-400/80 uppercase">
        <span class="w-2 h-2 rounded-full bg-cyan-400"></span>
        WARTHUNDER • {formatTag}
      </div>
      <h1 class="text-3xl md:text-5xl font-black text-white uppercase font-orbitron leading-none tracking-wider mt-1">
        {tournament.name}
      </h1>
      <div class="flex items-center gap-3 mt-2 text-[10px] font-mono tracking-wider text-slate-500 uppercase">
        <span>{tournament.players?.length || 0} PLAYERS</span>
        <span class="text-slate-700">/</span>
        <span>{isTree ? stageLabel(tree.rounds[0]?.matches?.[0] || {}) : shownStage?.label || ""}</span>
        {#if tree.isLarge}
          <span class="text-slate-700">/</span>
          <span class="text-amber-400 font-bold">{sectionText}</span>
        {/if}
      </div>
      {#if tree.isLarge && !tree.showFinal}
        <div class="flex items-center gap-1.5 mt-3">
          {#each Array(tree.sectionCount) as _, i (i)}
            <button
              type="button"
              onclick={() => (sectionIndex = i)}
              aria-label={`Show section ${i + 1}`}
              class="h-1.5 rounded-full transition-all {i === sectionIndex ? 'w-8 bg-cyan-400' : 'w-3 bg-slate-700 hover:bg-slate-500'}"
            ></button>
          {/each}
        </div>
      {/if}
    </div>
    <div class="text-right font-orbitron shrink-0">
      <span class="text-xs text-slate-400 tracking-wider block font-sans font-bold leading-none mb-1">STATUS</span>
      <span class="text-lg md:text-xl font-black text-cyan-400 tracking-wider uppercase">
        {STATUS[tournament.status] || String(tournament.status || "").toUpperCase()}
      </span>
      <div class="mt-3 w-44 ml-auto">
        <div class="flex justify-between text-[9px] font-mono tracking-wider text-slate-500">
          <span>BRACKET</span><span>{percent}%</span>
        </div>
        <div class="h-1 bg-slate-800 rounded-full mt-1 overflow-hidden">
          <div class="h-full bg-linear-to-r from-cyan-500 to-amber-400" style="width: {percent}%"></div>
        </div>
      </div>
    </div>
  </header>

  <div class="flex-1 flex items-stretch gap-6 min-h-0 w-full">
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
      nextMatch={panelNextMatch}
      {activeMatch}
      {nextTag}
      {progress}
      {focusGroup}
      {standings}
      {stageLabel}
      {matchOrder}
      {who}
    />
  </div>

  <footer class="flex justify-between items-center text-xs text-slate-550 border-t border-slate-900 pt-3 shrink-0">
    <div class="flex items-center gap-2">
      <span class="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping"></span>
      <span>Real-time OBS Bracket Feed Sync Active</span>
    </div>
    <div>WarThunder · Potato Cup Tournaments</div>
  </footer>
</div>
