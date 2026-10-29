<script>
  // Event page: loads the event, keeps it live (SSE) and wires the actions
  // ($lib/event-registration.js, $lib/event-stage.js; reporting is
  // MatchReport, the time dialogs carry their own flows). What it shows is
  // derived in $lib/event-view.js; sections and dialogs live in
  // $lib/components/tournament.
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import { API } from "$lib/api.js";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { userState } from "$lib/user.svelte.js";
  import { buildMatchOrder } from "$lib/bracket.js";
  import { resolveTemplate } from "$lib/vehicle-pools.js";
  import { overlayStages, pickStage } from "$lib/overlay.js";
  import { suggestedVoteTimes, voteOptionsFrom } from "$lib/votes.js";
  import { GROUP_FORMATS, startBlockedMessage } from "$lib/tournament.js";
  import {
    bracketMatchesOf,
    eventStandings,
    eventStatusLabel,
    inPlayoffStage,
    isDoubleElimEvent,
    isTwoStageEvent,
    overlayStageMatches,
    playableInOrder,
    playerNamer,
    podiumOf,
    previewMinPlayers,
    roundLabeler,
    seedOrderOf,
  } from "$lib/event-view.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import VoteBoard from "$lib/components/tournament/VoteBoard.svelte";
  import VoteProposals from "$lib/components/tournament/VoteProposals.svelte";
  import RegistrationCard from "$lib/components/tournament/RegistrationCard.svelte";
  import SeedingCard from "$lib/components/tournament/SeedingCard.svelte";
  import EventHeader from "$lib/components/tournament/EventHeader.svelte";
  import StatusControls from "$lib/components/tournament/StatusControls.svelte";
  import PhaseStepper from "$lib/components/tournament/PhaseStepper.svelte";
  import MatchReport from "$lib/components/tournament/MatchReport.svelte";
  import ResultsPanel from "$lib/components/tournament/ResultsPanel.svelte";
  import RosterCard from "$lib/components/tournament/RosterCard.svelte";
  import ObsControlCard from "$lib/components/tournament/ObsControlCard.svelte";
  import WikiExportDialog from "$lib/components/tournament/WikiExportDialog.svelte";
  import TimeEditDialog from "$lib/components/tournament/TimeEditDialog.svelte";
  import FinalTimeDialog from "$lib/components/tournament/FinalTimeDialog.svelte";
  import PlayerEditDialog from "$lib/components/tournament/PlayerEditDialog.svelte";
  import EventBracketCard from "$lib/components/tournament/EventBracketCard.svelte";
  import LiveHandoff from "$lib/components/tournament/LiveHandoff.svelte";
  import { registrationActions } from "$lib/event-registration.js";
  import { stageActions } from "$lib/event-stage.js";
  import { channelOptions, liveElsewhere, savedChannel, savedStreamMode, saveChannel, withChannel } from "$lib/live-channels.js";
  import { coalescedRefresh } from "$lib/coalesced-refresh.js";
  import TrophyIcon from "@lucide/svelte/icons/trophy";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";

  let tid = $derived(page.params.id);
  let tournament = $state(null);
  let loading = $state(true);
  let isAdmin = $derived(!!userState.adminToken);

  // Two-stage events: a group stage (Swiss, or single-/double-elimination
  // brackets per group; `format` says which), then an elimination playoff
  // (`playoff_format`). The elimination views and placements only ever see
  // playoff matches.
  let isTwoStage = $derived(isTwoStageEvent(tournament));
  let inPlayoffs = $derived(inPlayoffStage(tournament));
  let bracketMatches = $derived(bracketMatchesOf(tournament));
  // Group stage played as brackets (not Swiss).
  let hasGroupBrackets = $derived(isTwoStage && tournament?.format !== "swiss");
  let groupFormatLabel = $derived(GROUP_FORMATS.find((f) => f.id === tournament?.format)?.label || "瑞士轮");
  let isDoubleElim = $derived(isDoubleElimEvent(tournament));
  let isSwiss = $derived(tournament?.format === "swiss");
  let stageView = $state(null); // "group" | "playoff"; null follows the current stage
  // Before the playoff exists only the group stage can be shown.
  let shownStage = $derived(inPlayoffs ? stageView || "playoff" : "group");
  let playoffBusy = $state(false);

  // Overlay controls: round controls need a non-empty list even before a
  // playoff exists; stages as the overlay picks them.
  let overlayMatches = $derived(bracketMatches.length ? bracketMatches : tournament?.matches || []);
  let overlayStageList = $derived(overlayStages(overlayStageMatches(tournament)));
  let overlayShownStage = $derived(pickStage(overlayStageList, live?.overlay_stage || null));

  let matchOrder = $derived(buildMatchOrder(tournament?.matches || []));
  let playerName = $derived(playerNamer(tournament, bracketMatches));
  let matchRoundLabel = $derived(roundLabeler(tournament, bracketMatches));
  let podium = $derived(podiumOf(tournament, bracketMatches));
  let standings = $derived(tournament ? eventStandings(tournament, bracketMatches) : []);

  let banpickEnabled = $derived(tournament?.banpick_enabled !== false);
  // Vehicle pool templates (loaded on mount); Ban / Pick uses the one picked
  // for the event, else the best match for its type and game mode.
  let vehicleTemplates = $state([]);
  let bpTemplate = $derived(resolveTemplate(vehicleTemplates, tournament || {}));

  let swissRoundsLabel = $derived(
    tournament?.swiss_rounds_auto
      ? `${tournament?.swiss_rounds_effective ?? "?"} 轮（自动单循环）`
      : `${tournament?.swiss_rounds ?? "?"} 轮`,
  );
  let startBlocked = $derived(
    startBlockedMessage(
      tournament?.format,
      tournament?.players?.length || 0,
      tournament?.swiss_rounds,
      isTwoStage
        ? { groupSize: tournament?.swiss_group_size, perGroup: tournament?.advance_per_group, playoffFormat: tournament?.playoff_format }
        : null,
    ),
  );

  let allPlayers = $state([]);
  let unregisteredPlayers = $derived(allPlayers.filter((ap) => !(tournament?.players || []).some((tp) => tp.id === ap.id)));
  let isRegistered = $derived(tournament?.players?.some((p) => p.id === userState.id));
  let seedOrder = $state([]);

  // Time vote: suggested times (moved by "顺延一周") merged with the votes cast.
  let playTimes = $state(null);
  let voteWeekOffset = $state(0);
  let voteOptions = $derived(voteOptionsFrom(tournament?.votes || [], suggestedVoteTimes(playTimes, voteWeekOffset)));


  // Dialogs
  let finalTimeDialog = $state(null);
  let timeEditDialog = $state(null);
  let wikiDialog = $state(null);
  let matchReport = $state(null);
  let playerEditor = $state(null);

  // Live channel of this console (remembered per event in this browser):
  // the live match and overlay controls act on it; other channels' live
  // matches are shown but left alone. `live` is the event as the channel
  // sees it.
  let liveChannel = $state(1);
  let live = $derived(withChannel(tournament, liveChannel));
  let otherChannels = $derived(liveElsewhere(tournament, liveChannel));
  let channelChoices = $derived(channelOptions(tournament, liveChannel));

  // "Going live" mode: only this browser forces the next-match flow.
  let handoff = $state(null);
  let streamMode = $state(false);
  $effect(() => {
    liveChannel = savedChannel(tid);
    streamMode = isAdmin && savedStreamMode(tid);
  });
  // Next match to stream: not one already live on another channel.
  let nextMatchCandidates = $derived(
    playableInOrder(tournament?.matches || [], matchOrder).filter((m) => !otherChannels.has(m.id)),
  );

  function changeChannel(channel) {
    handoff?.clearHud();
    liveChannel = channel;
    saveChannel(tid, channel);
  }

  function ensureAdmin() {
    if (isAdmin) return true;
    toast.error("此操作需要管理员权限，请先点击右上角盾牌图标登录");
    return false;
  }

  // Actions that need a player identity first open the profile dialog.
  function needsIdentity() {
    if (userState.qqGroup && userState.id) return false;
    toast.error("此操作需要先填写 QQ / Discord 联系方式与选手 ID。已为您打开配置面板！");
    document.getElementById("header-profile-button")?.click();
    return true;
  }

  onMount(() => {
    load();
    API.getVehiclePools()
      .then((res) => (vehicleTemplates = res.templates || []))
      .catch((e) => console.warn("vehicle pools failed to load:", e));
  });

  // Live updates: a burst of event messages becomes one reload.
  $effect(() => {
    if (!tid) return;
    const id = tid;
    const refresh = coalescedRefresh(async () => {
      const next = await API.getTournament(id);
      if (id !== tid) return; // route moved to another event meanwhile
      tournament = next;
      seedOrder = seedOrderOf(tournament?.players);
    });
    const es = new EventSource(`/api/tournaments/${id}/stream`);
    es.onmessage = (event) => {
      try {
        JSON.parse(event.data); // malformed messages are skipped
      } catch (e) {
        console.error("解析实时事件失败", e);
        return;
      }
      refresh();
    };
    es.onerror = (e) => {
      console.warn("实时推送连接发生错误，正在尝试重连...", e);
    };
    return () => {
      es.close();
      refresh.stop();
    };
  });

  let loadedTournamentId = null;

  async function load() {
    // Only show the full-page loading state on the first load (or when the
    // route switches to another tournament). Refreshes after a vote,
    // registration or SSE event must keep the page mounted.
    const isInitial = !tournament || loadedTournamentId !== tid;
    if (isInitial) loading = true;
    try {
      tournament = await API.getTournament(tid);
      loadedTournamentId = tid;
      if (isInitial && !playTimes) {
        API.getPlayTimes()
          .then((times) => (playTimes = times))
          .catch((e) => console.warn("load play times failed:", e));
      }
      allPlayers = await API.listPlayers();
      seedOrder = seedOrderOf(tournament?.players);
      // Registration: refresh the bracket preview.
      if (isAdmin && tournament.status === "registration") await refreshPreview();
    } catch (e) {
      toast.error("加载赛事详情失败: " + e.message);
    } finally {
      if (isInitial) loading = false;
    }
  }

  // Regenerates the bracket preview once there are enough players (admins;
  // the server rejects it for other users).
  async function refreshPreview() {
    if ((tournament?.players?.length || 0) < previewMinPlayers(tournament)) return;
    const matches = await API.generateBracket(tid);
    tournament = { ...tournament, matches };
  }

  // Registration and seeds ($lib/event-registration.js).
  const { doRegister, doBatchRegister, doUnregister, autoSeed, randomizeSeed, moveSeed } = registrationActions({
    tid: () => tid,
    tournament: () => tournament,
    setTournament: (t) => (tournament = t),
    seedOrder: () => seedOrder,
    setSeedOrder: (ids) => (seedOrder = ids),
    isAdmin: () => isAdmin,
    load: () => load(),
    refreshPreview: () => refreshPreview(),
    ensureAdmin: () => ensureAdmin(),
    needsIdentity: () => needsIdentity(),
  });

  // Status, playoffs, Swiss rounds, live match, JSON ($lib/event-stage.js).
  const { changeStatus, toggleActiveMatch, startPlayoffs, withdrawPlayoffs, editSwissRounds, downloadJson } = stageActions({
    tid: () => tid,
    tournament: () => tournament,
    setTournament: (t) => (tournament = t),
    bracketMatches: () => bracketMatches,
    live: () => live,
    liveChannel: () => liveChannel,
    setStageView: (v) => (stageView = v),
    setPlayoffBusy: (b) => (playoffBusy = b),
    isAdmin: () => isAdmin,
    load: () => load(),
    ensureAdmin: () => ensureAdmin(),
  });

  // After a time dialog saved: show its result, then reload.
  async function savedEvent(t) {
    tournament = t;
    await load();
  }
</script>

{#if loading}
  <div
    class="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground"
  >
    <div
      class="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin"
    ></div>
    <p class="text-sm">正在加载赛事详情...</p>
  </div>
{:else if !tournament}
  <div
    class="text-center py-16 border border-border bg-card/30 rounded-2xl max-w-xl mx-auto space-y-4"
  >
    <TrophyIcon class="w-12 h-12 text-muted-foreground mx-auto" />
    <div>
      <h2 class="text-lg font-bold text-foreground">赛事不存在</h2>
      <p class="text-xs text-muted-foreground mt-1">
        您访问的赛事 ID 在数据库中未找到。
      </p>
    </div>
    <Button size="sm" onclick={() => goto("/")} class="gap-1 text-xs">
      <ArrowLeftIcon class="w-3.5 h-3.5" /> 返回首页
    </Button>
  </div>
{:else}
  {#snippet rosterSidebar()}
    <RosterCard {tournament} {isAdmin} onedit={(p) => playerEditor?.edit(p)} onunregister={doUnregister} />
  {/snippet}

  {#snippet obsControl()}
    <ObsControlCard
      tournament={live}
      {tid}
      channel={liveChannel}
      {channelChoices}
      elsewhere={otherChannels}
      onchannel={changeChannel}
      {isAdmin}
      {streamMode}
      {matchOrder}
      roundLabel={matchRoundLabel}
      {playerName}
      {overlayMatches}
      {overlayStageList}
      {overlayShownStage}
      onstreamstart={() => handoff?.start()}
      onstreamend={() => handoff?.stop()}
      onclearhud={() => handoff?.clearHud()}
    />
  {/snippet}

  {#snippet bracketView()}
    <EventBracketCard
      tournament={live}
      {tid}
      liveElsewhere={otherChannels}
      {isAdmin}
      {bracketMatches}
      {isTwoStage}
      {inPlayoffs}
      {isSwiss}
      {isDoubleElim}
      {hasGroupBrackets}
      {groupFormatLabel}
      {banpickEnabled}
      {matchOrder}
      {playerName}
      {playoffBusy}
      {shownStage}
      bind:stageView
      onopen={(m) => matchReport?.openDetails(m)}
      onbanpick={(m) => matchReport?.openBanPick(m)}
      ontoggleactive={toggleActiveMatch}
      oneditrounds={editSwissRounds}
      onstartplayoffs={startPlayoffs}
      onwithdrawplayoffs={withdrawPlayoffs}
    />
  {/snippet}

  <div class="space-y-6">
    <!-- Header: title, tags, time; admin stage controls -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/60 pb-5">
      <EventHeader
        bind:tournament
        {tid}
        {isAdmin}
        statusText={eventStatusLabel(tournament.status)}
        {isSwiss}
        {isTwoStage}
        {hasGroupBrackets}
        {swissRoundsLabel}
        {vehicleTemplates}
        {bpTemplate}
        onreload={load}
        onedittime={() => timeEditDialog?.start()}
      />
      {#if isAdmin}
        <StatusControls
          status={tournament.status}
          {startBlocked}
          canStart={!startBlocked}
          onendvoting={() => finalTimeDialog?.start()}
          onstatus={changeStatus}
        />
      {/if}
    </div>

    <PhaseStepper {tournament} />

    <!-- Active Panel based on current stage -->
    {#if tournament.status === "registration"}
      <!-- STAGE 1: REGISTRATION -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Join / Seeding Panel -->
        <div class="lg:col-span-2 space-y-6">
          <RegistrationCard
            {tournament}
            {isAdmin}
            {isRegistered}
            {unregisteredPlayers}
            onregister={doRegister}
            onunregister={doUnregister}
            onbatch={doBatchRegister}
          />
          {#if isAdmin && (tournament.players?.length || 0) >= 2}
            <SeedingCard {tournament} {seedOrder} {playerName} onauto={autoSeed} onrandom={randomizeSeed} onmove={moveSeed} />
          {/if}
        </div>

        <!-- Sidebar Player List -->
        <div class="space-y-6">
          {@render obsControl()}
          {@render rosterSidebar()}
        </div>
      </div>

      <!-- Bracket Preview in Registration stage -->
      {#if (tournament.players?.length || 0) >= (isDoubleElim ? 4 : 2)}
        <div class="mt-6">
          {@render bracketView()}
        </div>
      {/if}
    {:else if tournament.status === "voting"}
      <!-- STAGE 2: VOTING -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-2 space-y-6">
          <VoteBoard {tournament} {tid} {isAdmin} {voteOptions} bind:weekOffset={voteWeekOffset} {playerName} onchanged={load} />
        </div>
        <div class="space-y-6">
          <VoteProposals {tid} onchanged={load} />
          {@render obsControl()}
          {@render rosterSidebar()}
        </div>
      </div>
    {:else if ["in_progress", "completed"].includes(tournament.status)}
      <!-- STAGE 3 & 4: BRACKET & RESULT -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-2 space-y-6">
          {#if tournament.status === "completed"}
            <ResultsPanel
              {tournament}
              {podium}
              {standings}
              swissTable={isSwiss && !isTwoStage}
              {isAdmin}
              {playerName}
              onexportjson={downloadJson}
              onexportwiki={() => wikiDialog?.start()}
            />
          {/if}

          {@render bracketView()}
        </div>
        <div class="space-y-6">
          {@render obsControl()}
          {@render rosterSidebar()}
        </div>
      </div>
    {/if}
  </div>
{/if}

<!-- Reporting a match: Ban / Pick, score, walkover, correction -->
<MatchReport
  bind:this={matchReport}
  {tournament}
  {tid}
  {isAdmin}
  {banpickEnabled}
  {bpTemplate}
  {playerName}
  {matchRoundLabel}
  {live}
  {liveChannel}
  {handoff}
  {ensureAdmin}
  {needsIdentity}
  onreload={load}
/>

<!-- Admin: adjust the match time -->
<TimeEditDialog bind:this={timeEditDialog} {tid} current={tournament?.scheduled_time} {ensureAdmin} onsaved={savedEvent} />

<!-- Ending the vote: pick the final time -->
<FinalTimeDialog bind:this={finalTimeDialog} {tid} options={voteOptions} {ensureAdmin} {needsIdentity} onsaved={savedEvent} />

<!-- Liquipedia Wiki Export Dialog -->
<WikiExportDialog bind:this={wikiDialog} {tid} />

<!-- Participant Profile Edit Dialog -->
<PlayerEditDialog bind:this={playerEditor} {tid} {ensureAdmin} onsaved={load} />

<!-- Going live: next-match hand-off, HUD countdown, pre-flight checklist -->
<LiveHandoff
  bind:this={handoff}
  bind:streamMode
  tournament={live}
  {tid}
  channel={liveChannel}
  {isAdmin}
  candidates={nextMatchCandidates}
  {overlayMatches}
  {matchOrder}
  roundLabel={matchRoundLabel}
  {playerName}
  {ensureAdmin}
  onreload={load}
/>
