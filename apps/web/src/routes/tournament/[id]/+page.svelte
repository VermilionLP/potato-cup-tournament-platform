<script>
  // Event page: wires the event's data ($lib/event-data.svelte.js: loading,
  // live updates, templates, players) to its sections and actions
  // ($lib/event-registration.js, $lib/event-stage.js; reporting is
  // MatchReport). What it shows is derived in $lib/event-view.js; the tabs
  // are EventOverviewTab / EventBracketCard / EventPoolTab / RosterCard /
  // EventLiveTab in $lib/components/tournament. Admin-only dialogs load only
  // for admins and the share dialog on first use ($lib/lazy.js).
  import { onMount, tick } from "svelte";
  import { lazy } from "$lib/lazy.js";
  import { toast } from "svelte-sonner";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { userState } from "$lib/user.svelte.js";
  import { EventData } from "$lib/event-data.svelte.js";
  import { buildMatchOrder } from "$lib/bracket.js";
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
    roundLabeler,
  } from "$lib/event-view.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import EventHeader from "$lib/components/tournament/EventHeader.svelte";
  import StatusControls from "$lib/components/tournament/StatusControls.svelte";
  import PhaseStepper from "$lib/components/tournament/PhaseStepper.svelte";
  import MyMatchCard from "$lib/components/tournament/MyMatchCard.svelte";
  import EventTabBar from "$lib/components/tournament/EventTabBar.svelte";
  import EventOverviewTab from "$lib/components/tournament/EventOverviewTab.svelte";
  import EventBracketCard from "$lib/components/tournament/EventBracketCard.svelte";
  import EventPoolTab from "$lib/components/tournament/EventPoolTab.svelte";
  import EventLiveTab from "$lib/components/tournament/EventLiveTab.svelte";
  import RosterCard from "$lib/components/tournament/RosterCard.svelte";
  import MatchReport from "$lib/components/tournament/MatchReport.svelte";
  import { registrationActions } from "$lib/event-registration.js";
  import { stageActions } from "$lib/event-stage.js";
  import { channelOptions, liveElsewhere, savedChannel, savedStreamMode, saveChannel, withChannel } from "$lib/live-channels.js";
  import TrophyIcon from "@lucide/svelte/icons/trophy";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";

  const loadAdminDialogs = lazy(async () => {
    const [wiki, time, finalTime, playerEdit, handoffPart, startCheckin] = await Promise.all([
      import("$lib/components/tournament/WikiExportDialog.svelte"),
      import("$lib/components/tournament/TimeEditDialog.svelte"),
      import("$lib/components/tournament/FinalTimeDialog.svelte"),
      import("$lib/components/tournament/PlayerEditDialog.svelte"),
      import("$lib/components/tournament/LiveHandoff.svelte"),
      import("$lib/components/tournament/StartCheckinDialog.svelte"),
    ]);
    return {
      WikiExportDialog: wiki.default,
      TimeEditDialog: time.default,
      FinalTimeDialog: finalTime.default,
      PlayerEditDialog: playerEdit.default,
      LiveHandoff: handoffPart.default,
      StartCheckinDialog: startCheckin.default,
    };
  });
  const loadShareDialog = lazy(() => import("$lib/components/tournament/ShareDialog.svelte"));

  let tid = $derived(page.params.id);
  let isAdmin = $derived(!!userState.adminToken);
  const data = new EventData(() => tid, () => isAdmin);
  let tournament = $derived(data.tournament);
  const load = () => data.load();

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

  let matchOrder = $derived(buildMatchOrder(tournament?.matches || []));
  let playerName = $derived(playerNamer(tournament, bracketMatches));
  let matchRoundLabel = $derived(roundLabeler(tournament, bracketMatches));
  let podium = $derived(podiumOf(tournament, bracketMatches));
  let standings = $derived(tournament ? eventStandings(tournament, bracketMatches) : []);
  let banpickEnabled = $derived(tournament?.banpick_enabled !== false);
  let isRegistered = $derived(tournament?.players?.some((p) => p.id === userState.id));

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

  // Time vote: suggested times (moved by "顺延一周") merged with the votes cast.
  let voteWeekOffset = $state(0);
  let voteOptions = $derived(voteOptionsFrom(tournament?.votes || [], suggestedVoteTimes(data.playTimes, voteWeekOffset)));

  // Dialogs
  let finalTimeDialog = $state(null);
  let timeEditDialog = $state(null);
  let startDialog = $state(null);
  let shareDialog = $state(null);
  let wikiDialog = $state(null);
  let matchReport = $state(null);
  let playerEditor = $state(null);
  // Podium for the results post: champion, runner-up, third place(s).
  let sharePodium = $derived.by(() => {
    if (!podium) return [];
    const thirds = standings.filter((r) => String(r.rank).startsWith("第 3")).map((r) => r.display_name || r.id);
    return [[playerName(podium.champion)], podium.runnerUp ? [playerName(podium.runnerUp)] : [], thirds];
  });

  // Live channel of this console (remembered per event in this browser):
  // the live match and overlay controls act on it; other channels' live
  // matches are shown but left alone. `live` is the event as the channel
  // sees it.
  let liveChannel = $state(1);
  let live = $derived(withChannel(tournament, liveChannel));
  let otherChannels = $derived(liveElsewhere(tournament, liveChannel));
  let channelChoices = $derived(channelOptions(tournament, liveChannel));
  // Overlay controls: round controls need a non-empty list even before a
  // playoff exists; stages as the overlay picks them.
  let overlayMatches = $derived(bracketMatches.length ? bracketMatches : tournament?.matches || []);
  let overlayStageList = $derived(overlayStages(overlayStageMatches(tournament)));
  let overlayShownStage = $derived(pickStage(overlayStageList, live?.overlay_stage || null));

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

  onMount(load);

  // Registration and seeds ($lib/event-registration.js).
  const { doRegister, doBatchRegister, doUnregister, autoSeed, randomizeSeed, moveSeed } = registrationActions({
    tid: () => tid,
    tournament: () => data.tournament,
    setTournament: (t) => (data.tournament = t),
    seedOrder: () => data.seedOrder,
    setSeedOrder: (ids) => (data.seedOrder = ids),
    isAdmin: () => isAdmin,
    load,
    refreshPreview: () => data.refreshPreview(),
    ensureAdmin,
    needsIdentity,
  });

  // Status, playoffs, Swiss rounds, live match, JSON ($lib/event-stage.js).
  const { changeStatus, setCheckin, checkInFor, toggleActiveMatch, startPlayoffs, withdrawPlayoffs, editSwissRounds, downloadJson } = stageActions({
    tid: () => tid,
    tournament: () => data.tournament,
    setTournament: (t) => (data.tournament = t),
    bracketMatches: () => bracketMatches,
    live: () => live,
    liveChannel: () => liveChannel,
    setStageView: (v) => (stageView = v),
    setPlayoffBusy: (b) => (playoffBusy = b),
    isAdmin: () => isAdmin,
    load,
    ensureAdmin,
  });

  // Tabs (remembered in the address as #overview / #bracket / #pool /
  // #players / #live). A running event opens on its bracket, the others on
  // the overview. The vehicle pool tab shows when the event has a template
  // (for admins also without one, to pick it).
  const TAB_IDS = ["overview", "bracket", "pool", "players", "live"];
  let chosenTab = $state("");
  let tabs = $derived([
    { id: "overview", label: "概览" },
    { id: "bracket", label: tournament?.status === "registration" ? "对阵预览" : "对阵" },
    ...(data.bpTemplate || (isAdmin && banpickEnabled) ? [{ id: "pool", label: "载具池" }] : []),
    { id: "players", label: "选手", count: tournament?.players?.length ?? 0 },
    { id: "live", label: "直播" },
  ]);
  let activeTab = $derived(chosenTab || (tournament?.status === "in_progress" ? "bracket" : "overview"));
  onMount(() => {
    const fromHash = window.location.hash.slice(1);
    if (TAB_IDS.includes(fromHash)) chosenTab = fromHash;
  });
  function selectTab(id) {
    chosenTab = id;
    history.replaceState(history.state, "", `#${id}`);
  }

  // Starting an event with check-in goes through the absentees dialog.
  function onStatus(status) {
    if (status === "in_progress" && tournament?.status === "registration" && tournament?.checkin?.enabled) {
      if (ensureAdmin()) startDialog?.start();
      return;
    }
    changeStatus(status);
  }

  // The share dialog loads on first use.
  let ShareDialog = $state(null);
  async function openShare() {
    try {
      ShareDialog ??= (await loadShareDialog()).default;
    } catch (e) {
      toast.error("加载失败: " + e.message);
      return;
    }
    await tick();
    shareDialog?.start();
  }

  // After a time dialog saved: show its result, then reload.
  async function savedEvent(t) {
    data.tournament = t;
    await load();
  }

  const openMatch = (m) => matchReport?.openDetails(m);
</script>

{#if data.loading}
  <div class="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
    <div class="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
    <p class="text-sm">正在加载赛事详情...</p>
  </div>
{:else if !tournament}
  <div class="text-center py-16 border border-border bg-card/30 rounded-2xl max-w-xl mx-auto space-y-4">
    <TrophyIcon class="w-12 h-12 text-muted-foreground mx-auto" />
    <div>
      <h2 class="text-lg font-bold text-foreground">赛事不存在</h2>
      <p class="text-xs text-muted-foreground mt-1">您访问的赛事 ID 在数据库中未找到。</p>
    </div>
    <Button size="sm" onclick={() => goto("/")} class="gap-1 text-xs">
      <ArrowLeftIcon class="w-3.5 h-3.5" /> 返回首页
    </Button>
  </div>
{:else}
  {#snippet roster()}
    <RosterCard {tournament} {isAdmin} onedit={(p) => playerEditor?.edit(p)} onunregister={doUnregister} oncheckin={checkInFor} />
  {/snippet}

  {#snippet bracket()}
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
      roundLabel={matchRoundLabel}
      {playoffBusy}
      {shownStage}
      bind:stageView
      onopen={openMatch}
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
        bind:tournament={data.tournament}
        {tid}
        {isAdmin}
        statusText={eventStatusLabel(tournament.status)}
        {isSwiss}
        {isTwoStage}
        {hasGroupBrackets}
        {swissRoundsLabel}
        {isRegistered}
        onregister={() => doRegister("")}
        onunregister={() => doUnregister(userState.id)}
        onreload={load}
        onedittime={() => timeEditDialog?.start()}
      />
      {#if isAdmin}
        <StatusControls
          status={tournament.status}
          {startBlocked}
          canStart={!startBlocked}
          checkinEnabled={Boolean(tournament.checkin?.enabled)}
          consoleHref="/tournament/{encodeURIComponent(tid)}/console"
          onendvoting={() => finalTimeDialog?.start()}
          onstatus={onStatus}
          oncheckinchange={setCheckin}
        />
      {/if}
    </div>

    <PhaseStepper {tournament} />

    <!-- The signed-in player's next step: check-in, next match, reports -->
    <MyMatchCard
      {tournament}
      {tid}
      playerId={userState.id}
      {matchOrder}
      roundLabel={matchRoundLabel}
      {playerName}
      {needsIdentity}
      onreport={(m) => matchReport?.report(m)}
      onconfirm={(m) => matchReport?.confirmReport(m)}
      ondispute={(m) => matchReport?.disputeReport(m)}
      onwithdraw={(m) => matchReport?.withdrawReport(m)}
      onreload={load}
    />

    <EventTabBar {tabs} active={activeTab} onselect={selectTab} onshare={openShare} />

    {#if activeTab === "overview"}
      <EventOverviewTab
        {tournament}
        {live}
        {tid}
        {isAdmin}
        {isRegistered}
        unregisteredPlayers={data.unregisteredPlayers}
        seedOrder={data.seedOrder}
        {voteOptions}
        bind:weekOffset={voteWeekOffset}
        {podium}
        {standings}
        {isSwiss}
        {isTwoStage}
        {isDoubleElim}
        {matchOrder}
        roundLabel={matchRoundLabel}
        {playerName}
        {bracket}
        {roster}
        onregister={doRegister}
        onunregister={doUnregister}
        onbatch={doBatchRegister}
        onautoseed={autoSeed}
        onrandomseed={randomizeSeed}
        onmoveseed={moveSeed}
        onreload={load}
        onexportjson={downloadJson}
        onexportwiki={() => wikiDialog?.start()}
        onopenmatch={openMatch}
      />
    {:else if activeTab === "bracket"}
      {#if tournament.status === "registration" && (tournament.players?.length || 0) < (isDoubleElim ? 4 : 2)}
        <p class="py-12 text-center text-xs italic text-muted-foreground">报名人数够了之后这里会显示对阵预览。</p>
      {:else}
        {@render bracket()}
      {/if}
    {:else if activeTab === "pool"}
      <EventPoolTab bind:tournament={data.tournament} {tid} {isAdmin} template={data.bpTemplate} templates={data.vehicleTemplates} {banpickEnabled} />
    {:else if activeTab === "players"}
      {@render roster()}
    {:else if activeTab === "live"}
      <EventLiveTab
        {live}
        {tid}
        channel={liveChannel}
        {channelChoices}
        elsewhere={otherChannels}
        {isAdmin}
        {streamMode}
        {matchOrder}
        roundLabel={matchRoundLabel}
        {playerName}
        {overlayMatches}
        {overlayStageList}
        {overlayShownStage}
        onchannel={changeChannel}
        onopenmatch={openMatch}
        onstreamstart={() => handoff?.start()}
        onstreamend={() => handoff?.stop()}
        onclearhud={() => handoff?.clearHud()}
      />
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
  bpTemplate={data.bpTemplate}
  {playerName}
  {matchRoundLabel}
  {live}
  {liveChannel}
  {handoff}
  {ensureAdmin}
  {needsIdentity}
  onreload={load}
/>

{#if isAdmin}
  {#await loadAdminDialogs() then A}
    <A.TimeEditDialog bind:this={timeEditDialog} {tid} current={tournament?.scheduled_time} {ensureAdmin} onsaved={savedEvent} />
    <A.FinalTimeDialog bind:this={finalTimeDialog} {tid} options={voteOptions} {ensureAdmin} {needsIdentity} onsaved={savedEvent} />
    <A.StartCheckinDialog bind:this={startDialog} {tid} {tournament} onstarted={load} />
    <A.WikiExportDialog bind:this={wikiDialog} {tid} />
    <A.PlayerEditDialog bind:this={playerEditor} {tid} {ensureAdmin} onsaved={load} />
    <!-- Going live: next-match hand-off, HUD countdown, pre-flight checklist -->
    <A.LiveHandoff
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
  {/await}
{/if}

<!-- Ready-to-paste Discord post (loaded on first use) -->
{#if tournament && ShareDialog}
  <ShareDialog bind:this={shareDialog} {tournament} podium={sharePodium} />
{/if}
