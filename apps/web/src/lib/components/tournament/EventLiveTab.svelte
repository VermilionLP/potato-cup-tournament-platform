<script>
  // The 直播 tab: what is being played now (while the event runs) and the OBS
  // controls of this console's live channel (ObsControlCard).
  import LiveNow from "./LiveNow.svelte";
  import ObsControlCard from "./ObsControlCard.svelte";

  let {
    live, // the event as this console's channel sees it (withChannel)
    tid,
    channel = 1,
    channelChoices = [],
    elsewhere = new Map(),
    isAdmin = false,
    streamMode = false,
    matchOrder,
    roundLabel,
    playerName,
    overlayMatches = [],
    overlayStageList = [],
    overlayShownStage = null,
    onchannel,
    onopenmatch,
    onstreamstart,
    onstreamend,
    onclearhud,
  } = $props();
</script>

<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
  {#if live.status === "in_progress"}
    <LiveNow tournament={live} order={matchOrder} {roundLabel} {playerName} onopen={onopenmatch} />
  {/if}
  <ObsControlCard
    tournament={live}
    {tid}
    {channel}
    {channelChoices}
    {elsewhere}
    {onchannel}
    {isAdmin}
    {streamMode}
    {matchOrder}
    {roundLabel}
    {playerName}
    {overlayMatches}
    {overlayStageList}
    {overlayShownStage}
    {onstreamstart}
    {onstreamend}
    {onclearhud}
    {onopenmatch}
  />
</div>
