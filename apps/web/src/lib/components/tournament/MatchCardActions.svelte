<script>
  // Right side of a match card's header bar, the same in Swiss, single and
  // double elimination views: the live-channel badge or the admin's "go
  // live" toggle, Ban / Pick, "my match" and the correction marker.
  let {
    match,
    playable = false, // both players known, not decided
    active = false, // live on this console's channel
    otherChannel = null, // live on another channel (its number)
    isAdmin = false,
    banpickEnabled = false,
    mine = false, // the viewer plays in it and it's pending
    correctable = false,
    gap = "gap-1",
    ontoggleactive = () => {},
    onbanpick = () => {},
  } = $props();
</script>

<div class="flex items-center {gap}">
  {#if otherChannel}
    <span class="rounded bg-sky-500/15 px-1 py-0.5 text-[7px] font-bold text-sky-600 dark:text-sky-300" title="该对局在其他直播频道直播中">频道 {otherChannel}</span>
  {:else if isAdmin && playable}
    <button
      type="button"
      onclick={(e) => {
        e.stopPropagation();
        ontoggleactive(match);
      }}
      class="rounded px-1 py-0.5 text-[7px] font-bold transition-all cursor-pointer
        {active ? 'bg-amber-500 text-black hover:bg-amber-400' : 'bg-primary text-primary-foreground hover:bg-primary/85'}"
    >
      {active ? "直播中" : "推流直播"}
    </button>
  {/if}
  {#if banpickEnabled && playable}
    <button
      type="button"
      onclick={(e) => {
        e.stopPropagation();
        onbanpick(match);
      }}
      class="rounded border border-primary/40 px-1 py-0.5 text-[7px] font-bold text-primary transition-all cursor-pointer hover:bg-primary hover:text-primary-foreground"
      title="打开 Ban / Pick"
    >
      BP
    </button>
  {/if}
  {#if mine}
    <span class="animate-pulse font-bold text-primary">我的比赛</span>
  {/if}
  {#if correctable}
    <span class="rounded bg-amber-500/15 px-1 py-0.5 text-[7px] font-bold text-amber-500">修正</span>
  {/if}
</div>
