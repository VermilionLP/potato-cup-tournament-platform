<script>
  // Right side of a match card's header bar, the same in Swiss, single and
  // double elimination views: the live-channel badge or the admin's "go
  // live" toggle, Ban / Pick, a pending report ("待确认" / "有争议"), "my
  // match" and the correction marker.
  import { reportBadge } from "#lib/match-card.js";

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

  let badge = $derived(reportBadge(match));
</script>

<div class="flex shrink-0 items-center {gap}">
  {#if otherChannel}
    <span class="rounded bg-sky-500/15 chip px-1 text-small font-bold text-sky-600 dark:text-sky-300" title="该对局在其他直播频道直播中">频道 {otherChannel}</span>
  {:else if isAdmin && playable}
    <button
      type="button"
      onclick={(e) => {
        e.stopPropagation();
        ontoggleactive(match);
      }}
      class="rounded chip px-1 text-small font-bold transition-all cursor-pointer
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
      class="rounded border border-primary/40 chip px-1 text-small font-bold text-brand-ink transition-all cursor-pointer hover:bg-primary hover:text-primary-foreground"
      title="打开 Ban / Pick"
    >
      BP
    </button>
  {/if}
  {#if badge}
    <span
      class="rounded chip px-1 text-small font-bold {badge.tone === 'danger' ? 'bg-destructive/15 text-destructive' : 'bg-sky-500/15 text-sky-600 dark:text-sky-300'}"
      title="选手提交的结果{badge.tone === 'danger' ? '有争议，等待管理员处理' : '等待确认'}">{badge.label}</span
    >
  {/if}
  {#if mine}
    <span class="animate-pulse whitespace-nowrap font-bold text-brand-ink">我的比赛</span>
  {/if}
  {#if correctable}
    <span class="rounded bg-amber-500/15 chip px-1 text-small font-bold text-amber-500">修正</span>
  {/if}
</div>

<style>
  /* The match card's header bar is 18px high: chips sit inside it on one line. */
  .chip {
    display: inline-flex;
    height: 15px;
    align-items: center;
    white-space: nowrap;
    line-height: 1;
  }
</style>
