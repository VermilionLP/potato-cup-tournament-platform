<script>
  // One match card of the event page's brackets and lists (single and double
  // elimination, Swiss, the phone round list), so every format looks and
  // acts alike: a header (title + MatchCardActions), two player rows with
  // flag, name, crown for the winner and the score cell (#lib/match-card.js);
  // the header also shows the Ban / Pick result (or "BP 中").
  // The card opens the result dialog when the match can be played, or for
  // admins when its result can be corrected. The parent sets the size
  // (`class`, e.g. "h-full") and handles byes.
  import { canCorrectResult } from "#lib/tournament.js";
  import { bpResult, bpUnderWay, hasLiveScore, isMine, isPlayableIn, slotScore } from "#lib/match-card.js";
  import Flag from "#lib/components/Flag.svelte";
  import MatchCardActions from "#lib/components/tournament/MatchCardActions.svelte";
  import CrownIcon from "@lucide/svelte/icons/crown";

  let {
    match,
    title = "",
    status = "", // event status
    locked = false, // results can't be corrected (Swiss after the playoff started)
    nameOf = (match, slot) => (slot === 1 ? match.player1_id : match.player2_id) || "TBD",
    flagOf = () => null,
    activeMatchId = null,
    otherChannel = null, // channel this match is live on elsewhere
    isAdmin = false,
    userId = "",
    banpickEnabled = false,
    onopen = () => {},
    ontoggleactive = () => {},
    onbanpick = () => {},
    class: extra = "",
  } = $props();

  let playable = $derived(isPlayableIn(match, status));
  let editable = $derived(isAdmin && !locked && canCorrectResult(match));
  let clickable = $derived(playable || editable);
  let active = $derived(activeMatchId === match.id);

  function open() {
    if (clickable) onopen(match);
  }
</script>

<div
  role="button"
  tabindex="0"
  onclick={open}
  onkeydown={(e) => (e.key === "Enter" || e.key === " ") && open()}
  class="flex flex-col justify-between overflow-hidden rounded-md border bg-white text-xs shadow-sm transition-all dark:bg-[#1c1c1c]
    {clickable ? 'cursor-pointer hover:shadow-md' : 'cursor-default'}
    {playable ? 'border-primary/30 ring-2 ring-primary/40' : 'border-neutral-300 dark:border-neutral-800'}
    {active ? 'border-amber-500/40 ring-2 ring-amber-500/70' : ''}
    {extra}"
>
  <div
    class="flex h-[18px] shrink-0 items-center justify-between border-b border-neutral-200 bg-neutral-100 px-2 text-[8px] font-mono text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400"
  >
    <span class="flex min-w-0 items-center gap-1">
      <span class="truncate">{title}</span>
      {#if bpResult(match)}
        <span class="min-w-0 truncate rounded bg-amber-500/15 px-1 font-bold text-amber-700 dark:text-amber-300" title="本场载具（Ban/Pick 结果）">{bpResult(match)}</span>
      {:else if bpUnderWay(match)}
        <span class="shrink-0 rounded bg-primary/15 px-1 font-bold text-primary" title="Ban/Pick 进行中">BP 中</span>
      {/if}
      {#if hasLiveScore(match)}
        <span class="inline-flex shrink-0 items-center gap-0.5 rounded bg-red-500/15 px-1 font-bold text-red-600 dark:text-red-400" title="比赛进行中的实时比分，还没有出结果">
          <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500"></span>实时
        </span>
      {/if}
    </span>
    <MatchCardActions
      {match}
      {playable}
      {active}
      {otherChannel}
      {isAdmin}
      {banpickEnabled}
      mine={isMine(match, userId)}
      correctable={editable}
      {ontoggleactive}
      {onbanpick}
    />
  </div>
  {#each [1, 2] as slot (slot)}
    {@const id = slot === 1 ? match.player1_id : match.player2_id}
    {@const won = Boolean(id) && match.winner_id === id}
    <div class="flex h-[28px] items-center justify-between {slot === 1 ? 'border-b border-neutral-200/60 dark:border-neutral-900/50' : ''}">
      <div class="flex min-w-0 flex-1 items-center gap-1.5 pl-2">
        {#if id}<Flag code={flagOf(id)} size={14} />{/if}
        <span
          class="truncate text-[10.5px]
            {won ? 'font-black text-foreground' : id ? 'font-semibold text-neutral-700 dark:text-neutral-300' : 'italic text-muted-foreground/70'}"
        >
          {nameOf(match, slot)}
        </span>
        {#if won}<CrownIcon class="h-2.5 w-2.5 shrink-0 text-amber-500" />{/if}
      </div>
      {#if match.status !== "pending" || hasLiveScore(match)}
        <div
          class="flex h-full w-7 shrink-0 items-center justify-center border-l border-neutral-200 font-mono text-[11px] font-bold dark:border-neutral-900/60
            {won ? 'text-primary' : hasLiveScore(match) ? 'text-red-600 dark:text-red-400' : 'text-neutral-400 dark:text-neutral-500'}"
        >
          {slotScore(match, slot)}
        </div>
      {/if}
    </div>
  {/each}
</div>
