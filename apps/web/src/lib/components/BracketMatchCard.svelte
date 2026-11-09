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
  data-match-card
  role="button"
  tabindex="0"
  onclick={open}
  onkeydown={(e) => (e.key === "Enter" || e.key === " ") && open()}
  class="flex flex-col justify-between overflow-hidden rounded-lg border bg-muted text-xs transition-all
    {clickable ? 'cursor-pointer hover:shadow-md' : 'cursor-default'}
    {playable ? 'border-primary ring-1 ring-primary' : 'border-border'}
    {active ? 'border-live ring-2 ring-live/60' : ''}
    {extra}"
>
  <div
    class="flex h-[18px] shrink-0 items-center justify-between border-b border-border bg-black/[0.025] px-2 text-small text-muted-foreground dark:bg-white/[0.03]"
  >
    <span class="flex min-w-0 items-center gap-1">
      <span class="truncate">{title}</span>
      {#if bpResult(match)}
        <span class="min-w-0 truncate rounded-full bg-brand-soft px-1.5 font-bold text-brand-soft-foreground" title="本场载具（Ban/Pick 结果）">{bpResult(match)}</span>
      {:else if bpUnderWay(match)}
        <span class="shrink-0 rounded-full border border-dashed border-brand-300 px-1.5 font-bold text-brand-ink" title="Ban/Pick 进行中">BP 中</span>
      {/if}
      {#if hasLiveScore(match)}
        <span class="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-100 px-1.5 font-bold text-red-700 dark:bg-red-950 dark:text-red-300" title="比赛进行中的实时比分，还没有出结果">
          <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-live"></span>实时
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
    <div class="flex h-[28px] items-center justify-between {slot === 1 ? 'border-b border-border' : ''}">
      <div class="flex min-w-0 flex-1 items-center gap-1.5 pl-2">
        {#if id}<Flag code={flagOf(id)} size={14} />{/if}
        <span
          class="truncate text-small
            {won ? 'font-black text-foreground' : id ? 'font-medium text-muted-foreground' : 'italic text-muted-foreground/70'}"
        >
          {nameOf(match, slot)}
        </span>
        {#if won}<CrownIcon class="h-2.5 w-2.5 shrink-0 text-amber-500 dark:text-prize" />{/if}
      </div>
      {#if match.status !== "pending" || hasLiveScore(match)}
        <div
          class="num flex h-full w-7 shrink-0 items-center justify-center border-l border-border text-body font-bold
            {won ? 'text-brand-ink' : hasLiveScore(match) ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground/70'}"
        >
          {slotScore(match, slot)}
        </div>
      {/if}
    </div>
  {/each}
</div>
