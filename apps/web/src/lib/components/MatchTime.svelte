<script>
  import ClockIcon from "@lucide/svelte/icons/clock";
  import {
    countdown,
    formatInZone,
    offsetLabel,
    SOURCE_LABEL,
    SOURCE_OFFSET_MINUTES,
    SOURCE_TIME_ZONE,
    toInstant,
    viewerTimeZone,
    zoneOffsetMinutes,
  } from "#lib/datetime.js";

  // value: stored match time (Beijing time); status: tournament status;
  // checkinAt: when check-in opens (ISO), shown in the viewer's time zone.
  let { value = "", status = "", checkinAt = "", actions = undefined } = $props();

  const instant = $derived(toInstant(value));
  const zone = viewerTimeZone();
  let now = $state(new Date());

  const viewerOffset = $derived(instant ? zoneOffsetMinutes(instant, zone) : SOURCE_OFFSET_MINUTES);
  const differs = $derived(viewerOffset !== SOURCE_OFFSET_MINUTES);
  const showCountdown = $derived(Boolean(instant) && status !== "completed");
  const clock = $derived(instant ? countdown(instant, now) : null);

  // While a countdown is shown: tick every second in the last hour,
  // otherwise every half minute (the text shows minutes at most).
  let soon = $derived(Boolean(clock?.soon));
  $effect(() => {
    if (!showCountdown) return;
    const timer = setInterval(() => (now = new Date()), soon ? 1000 : 30_000);
    return () => clearInterval(timer);
  });
  let checkinInstant = $derived(checkinAt ? new Date(checkinAt) : null);
</script>

<div
  class="mt-2.5 inline-flex max-w-full flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs shadow-md shadow-primary/5"
>
  <ClockIcon class="h-4 w-4 shrink-0 text-brand-ink" />
  {#if instant}
    <div class="min-w-0">
      <div class="flex flex-wrap items-baseline gap-x-2 font-bold text-brand-ink">
        <span class="tabular-nums">{formatInZone(instant, zone)}</span>
        <span class="text-small font-semibold text-brand-ink/70">
          {differs ? `你的时间 · ${offsetLabel(viewerOffset)}` : SOURCE_LABEL}
        </span>
      </div>
      {#if differs}
        <div class="text-small text-muted-foreground tabular-nums" title="赛事以北京时间（{SOURCE_TIME_ZONE}）安排">
          {SOURCE_LABEL} {formatInZone(instant, SOURCE_TIME_ZONE)}
        </div>
      {/if}
      {#if checkinInstant && !Number.isNaN(checkinInstant.getTime())}
        <div class="text-small font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
          签到 {formatInZone(checkinInstant, zone).split(" ").pop()} 开放（开赛前 30 分钟）
        </div>
      {/if}
    </div>
    {#if showCountdown && clock}
      {#if clock.phase === "before"}
        <div class="flex items-baseline gap-1 rounded-lg bg-background/60 px-2 py-1">
          <span class="text-small text-muted-foreground">距开赛</span>
          <span class="{soon ? 'num' : ''} text-sm font-black tabular-nums text-foreground">{clock.text}</span>
        </div>
      {:else if status === "in_progress"}
        <span class="rounded-lg bg-emerald-500/15 px-2 py-1 text-small font-bold text-emerald-600 dark:text-emerald-400">
          {clock.text}
        </span>
      {:else}
        <span class="text-small text-muted-foreground">已过开赛时间</span>
      {/if}
    {/if}
  {:else}
    <span class="font-bold text-brand-ink">比赛时间: {value}</span>
  {/if}
  {#if actions}
    <div class="flex items-center gap-1.5">{@render actions()}</div>
  {/if}
</div>
