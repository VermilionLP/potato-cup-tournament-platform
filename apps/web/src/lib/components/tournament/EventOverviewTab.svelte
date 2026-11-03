<script>
  // The 概览 tab: the stage's main panel. Registration (sign-up, seeding for
  // admins, prizes, roster, and the bracket preview for admins), voting (the
  // vote board and the time proposal), the results, or what is being played now.
  // The seeding card (admins) and the vote proposals (calendar) load on
  // first use. `bracket` and `roster` are the page's snippets.
  import { lazy } from "$lib/lazy.js";
  import RegistrationCard from "./RegistrationCard.svelte";
  import VoteBoard from "./VoteBoard.svelte";
  import ResultsPanel from "./ResultsPanel.svelte";
  import LiveNow from "./LiveNow.svelte";
  import PrizeCard from "./PrizeCard.svelte";

  const loadSeeding = lazy(() => import("./SeedingCard.svelte"));
  const loadProposals = lazy(() => import("./VoteProposals.svelte"));

  let {
    tournament,
    live, // the event as this console's channel sees it
    tid,
    isAdmin = false,
    isRegistered = false,
    unregisteredPlayers = [],
    seedOrder = [],
    voteOptions = [],
    weekOffset = $bindable(0),
    podium = null,
    standings = [],
    isSwiss = false,
    isTwoStage = false,
    isDoubleElim = false,
    matchOrder,
    roundLabel,
    playerName,
    bracket, // snippet: the bracket card
    roster, // snippet: the roster card
    onregister,
    onunregister,
    onbatch,
    onautoseed,
    onrandomseed,
    onmoveseed,
    onreload,
    onexportjson,
    onexportwiki,
    onopenmatch,
  } = $props();

  let playerCount = $derived(tournament.players?.length || 0);
</script>

{#if tournament.status === "registration"}
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <div class="lg:col-span-2 space-y-6">
      <RegistrationCard {tournament} {isAdmin} {isRegistered} {unregisteredPlayers} {onregister} {onunregister} {onbatch} />
      {#if isAdmin && playerCount >= 2}
        {#await loadSeeding() then m}
          <m.default {tournament} {seedOrder} {playerName} onauto={onautoseed} onrandom={onrandomseed} onmove={onmoveseed} />
        {/await}
      {/if}
    </div>
    <div class="space-y-6">
      <PrizeCard {tournament} />
      {@render roster()}
    </div>
  </div>
  <!-- Admins seeding: the preview follows the seeds, so it stays here too. -->
  {#if isAdmin && playerCount >= (isDoubleElim ? 4 : 2)}
    {@render bracket()}
  {/if}
{:else if tournament.status === "voting"}
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <div class="lg:col-span-2 space-y-6">
      <VoteBoard {tournament} {tid} {isAdmin} {voteOptions} bind:weekOffset {playerName} onchanged={onreload} />
    </div>
    <div class="space-y-6">
      {#await loadProposals() then m}
        <m.default {tid} onchanged={onreload} />
      {/await}
      <PrizeCard {tournament} />
    </div>
  </div>
{:else if tournament.status === "completed"}
  <ResultsPanel {tournament} {podium} {standings} swissTable={isSwiss && !isTwoStage} {isAdmin} {playerName} {onexportjson} {onexportwiki} />
{:else}
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <div class="lg:col-span-2">
      <LiveNow tournament={live} order={matchOrder} {roundLabel} {playerName} onopen={onopenmatch} />
    </div>
    <PrizeCard {tournament} />
  </div>
{/if}
