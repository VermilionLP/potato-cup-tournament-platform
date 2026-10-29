<script>
  // The event's bracket card: Swiss table, group brackets, double or single
  // elimination, with the group / playoff switch of two-stage events and
  // the section controls of big single-elimination brackets (32 players per
  // section on desktop, 16 on phones).
  import { onMount } from "svelte";
  import { userState } from "$lib/user.svelte.js";
  import { maxRound } from "$lib/bracket.js";
  import { eventFormatLabel } from "$lib/tournament.js";
  import { bracketSections, eliminationRounds, groupStageMatchesOf } from "$lib/event-view.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import DoubleElimBracket from "$lib/components/DoubleElimBracket.svelte";
  import SwissView from "$lib/components/SwissView.svelte";
  import PlayoffPanel from "$lib/components/PlayoffPanel.svelte";
  import GroupBracketsView from "$lib/components/GroupBracketsView.svelte";
  import SingleElimBracket from "./SingleElimBracket.svelte";
  import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";

  let {
    tournament, // as the console's live channel sees it (withChannel)
    tid,
    isAdmin = false,
    liveElsewhere = new Map(), // match id -> another live channel
    bracketMatches = [],
    isTwoStage = false,
    inPlayoffs = false,
    isSwiss = false,
    isDoubleElim = false,
    hasGroupBrackets = false,
    groupFormatLabel = "",
    banpickEnabled = false,
    matchOrder,
    playerName,
    playoffBusy = false,
    shownStage = "group",
    stageView = $bindable(null),
    onopen,
    onbanpick,
    ontoggleactive,
    oneditrounds,
    onstartplayoffs,
    onwithdrawplayoffs,
  } = $props();

  let groupStageMatches = $derived(groupStageMatchesOf(tournament));
  let totalRounds = $derived(maxRound(bracketMatches));

  // Big brackets: one section at a time, or the final stage.
  let isMobileViewport = $state(false);
  onMount(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => (isMobileViewport = mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  });
  let viewMode = $state("auto"); // auto | sections | final
  let sectionIndex = $state(0);
  let sections = $derived(
    bracketSections(eliminationRounds(bracketMatches), { mobile: isMobileViewport, mode: viewMode, index: sectionIndex }),
  );
  $effect(() => {
    if (sectionIndex >= sections.sectionCount) sectionIndex = 0;
  });

  let swissShown = $derived(isSwiss && (!isTwoStage || shownStage === "group"));
  let groupBracketsShown = $derived(hasGroupBrackets && shownStage === "group");
</script>

<Card.Root class="border-border bg-card/40">
  <Card.Header class="p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/40 pb-4">
    <div>
      <Card.Title class="text-base font-bold flex items-center gap-2">
        <ShieldCheckIcon class="w-5 h-5 text-amber-500" />
        {#if tournament.status === "registration"}
          对阵图预览 (Bracket Preview)
        {:else}
          赛事对阵图 · {eventFormatLabel(tournament)}
        {/if}
      </Card.Title>
      <Card.Description class="text-xs">
        {#if tournament.status === "registration"}
          基于当前报名的选手和种子排名实时生成的对阵预览（调整上方种子排序会自动刷新）。
          {#if hasGroupBrackets}
            <span class="block mt-1 text-muted-foreground/80"
              >开赛时按种子蛇形分组，每组打{groupFormatLabel}淘汰，每组前 {tournament.advance_per_group} 名进入{tournament.playoff_format === "double_elim" ? "双败" : "单败"}淘汰赛。</span
            >
          {:else if isDoubleElim}
            <span class="block mt-1 text-muted-foreground/80">双败淘汰至少需要 4 名选手；种子会依次填入胜者组。</span>
          {:else if isSwiss}
            <span class="block mt-1 text-muted-foreground/80">瑞士轮第 1 轮按种子上半区对下半区配对；之后每轮按积分榜重新配对，不会重复交手。</span>
          {/if}
          <span class="sm:hidden block mt-1 text-muted-foreground/80">左右滑动查看本组对阵。</span>
        {:else if tournament.status === "in_progress"}
          点击包含两位选手的待赛卡片可以填报比分或进行弃权处理。
          {#if groupBracketsShown}
            <span class="block mt-1 text-muted-foreground/80">各组比赛独立进行；所有小组打完后，管理员在上方确认晋级名单进入淘汰赛。</span>
          {:else if isDoubleElim}
            <span class="block mt-1 text-muted-foreground/80">胜者组败者落入败者组；败者组再败即淘汰；总决赛按需加赛。</span>
          {:else if isSwiss}
            <span class="block mt-1 text-muted-foreground/80">一轮全部打完后自动生成下一轮对阵；最后一轮结束后积分榜第一即为冠军。</span>
          {/if}
        {:else}
          赛事已结束，此对阵图当前为只读。
        {/if}
      </Card.Description>
    </div>
  </Card.Header>

  {#if sections.sectionCount > 1 && !isDoubleElim && !swissShown && !groupBracketsShown}
    <div class="flex flex-wrap items-center gap-2 px-3 sm:px-6 pt-4">
      <Badge variant="outline" class="text-[10px] font-mono">
        第 {sectionIndex + 1} / {sections.sectionCount} 组 · {sections.sectionFirstMatches * 2} 人
      </Badge>
      <Button
        variant="outline"
        size="sm"
        disabled={sections.showFinalStage || sectionIndex === 0}
        onclick={() => {
          viewMode = "sections";
          sectionIndex = Math.max(0, sectionIndex - 1);
        }}
        class="h-7 text-[10px] px-2"
      >
        上一组
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={sections.showFinalStage || sectionIndex >= sections.sectionCount - 1}
        onclick={() => {
          viewMode = "sections";
          sectionIndex = Math.min(sections.sectionCount - 1, sectionIndex + 1);
        }}
        class="h-7 text-[10px] px-2"
      >
        下一组
      </Button>
      <Button variant={sections.showFinalStage ? "default" : "outline"} size="sm" onclick={() => (viewMode = "final")} class="h-7 text-[10px] px-2">
        决赛阶段
      </Button>
      <Button variant={sections.showFinalStage ? "outline" : "default"} size="sm" onclick={() => (viewMode = "sections")} class="h-7 text-[10px] px-2">
        分组
      </Button>
      <span class="text-[10px] text-muted-foreground/70">手机每 16 人一组，桌面每 32 人一组</span>
    </div>
  {/if}

  <Card.Content class="p-3 sm:p-6 overflow-x-auto relative min-h-100">
    {#if isTwoStage}
      <div class="mb-4 space-y-3">
        <div class="flex flex-wrap items-center gap-1.5">
          {#each [{ id: "group", label: "小组赛" }, { id: "playoff", label: "淘汰赛" }] as st (st.id)}
            <button
              type="button"
              disabled={st.id === "playoff" && !inPlayoffs}
              onclick={() => (stageView = st.id)}
              class="rounded-full border px-3 py-1 text-xs font-bold transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40
                {shownStage === st.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground/80 hover:border-foreground/40'}"
            >
              {st.label}
            </button>
          {/each}
        </div>
        {#if tournament.status !== "registration" && !tournament.source_url}
          <PlayoffPanel
            groupStage={tournament.group_stage}
            players={tournament.players || []}
            playoffFormat={tournament.playoff_format}
            {inPlayoffs}
            status={tournament.status}
            {isAdmin}
            busy={playoffBusy}
            onStart={onstartplayoffs}
            onWithdraw={onwithdrawplayoffs}
          />
        {/if}
      </div>
    {/if}
    {#if swissShown}
      <SwissView
        matches={tournament.matches || []}
        players={tournament.players || []}
        standings={tournament.standings || []}
        totalRounds={tournament.swiss_rounds_effective ?? tournament.swiss_rounds}
        status={tournament.status}
        activeMatchId={tournament.active_match_id}
        {liveElsewhere}
        {isAdmin}
        userId={userState.id}
        onOpenMatch={onopen}
        onToggleActive={ontoggleactive}
        onEditRounds={oneditrounds}
        {banpickEnabled}
        onBanPick={onbanpick}
        groups={isTwoStage ? tournament.group_stage?.groups || [] : []}
        perGroup={isTwoStage ? tournament.advance_per_group || 0 : 0}
        locked={inPlayoffs}
      />
    {:else if groupBracketsShown}
      <GroupBracketsView
        groups={tournament.group_stage?.groups || []}
        matches={groupStageMatches}
        players={tournament.players || []}
        format={tournament.format}
        perGroup={tournament.advance_per_group || 0}
        status={tournament.status}
        activeMatchId={tournament.active_match_id}
        {liveElsewhere}
        {isAdmin}
        userId={userState.id}
        onOpenMatch={onopen}
        onToggleActive={ontoggleactive}
        {banpickEnabled}
        onBanPick={onbanpick}
      />
    {:else if isDoubleElim}
      <DoubleElimBracket
        matches={bracketMatches}
        players={tournament.players || []}
        status={tournament.status}
        activeMatchId={tournament.active_match_id}
        {liveElsewhere}
        {isAdmin}
        userId={userState.id}
        grandFinalReset={tournament.grand_final_reset}
        onOpenMatch={onopen}
        onToggleActive={ontoggleactive}
        {banpickEnabled}
        onBanPick={onbanpick}
      />
    {:else if bracketMatches.length > 0}
      <SingleElimBracket
        {tournament}
        {tid}
        {liveElsewhere}
        {ontoggleactive}
        rounds={sections.displayRounds}
        matches={bracketMatches}
        {totalRounds}
        {isAdmin}
        {banpickEnabled}
        {matchOrder}
        {playerName}
        {onopen}
        {onbanpick}
      />
    {:else}
      <div class="text-center py-12 text-muted-foreground">
        {#if tournament.status === "registration"}
          <p class="text-xs italic">暂无对阵预览，调整上面种子顺序后，点击“生成对阵预览”。</p>
        {:else}
          <p class="text-xs italic">对阵图尚未生成。</p>
        {/if}
      </div>
    {/if}
  </Card.Content>
</Card.Root>
