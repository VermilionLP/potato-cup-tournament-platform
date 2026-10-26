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
  } from "$lib/datetime.js";

  // value: stored match time (Beijing time); status: tournament status.
  let { value = "", status = "", actions = undefined } = $props();

  const instant = $derived(toInstant(value));
  const zone = viewerTimeZone();
  let now = $state(new Date());

  const viewerOffset = $derived(instant ? zoneOffsetMinutes(instant, zone) : SOURCE_OFFSET_MINUTES);
  const differs = $derived(viewerOffset !== SOURCE_OFFSET_MINUTES);
  const showCountdown = $derived(Boolean(instant) && status !== "completed");
  const clock = $derived(instant ? countdown(instant, now) : null);

  // Tick once a second while a countdown is shown.
  $effect(() => {
    if (!showCountdown) return;
    const timer = setInterval(() => (now = new Date()), 1000);
    return () => clearInterval(timer);
  });
</script>

<div
  class="mt-2.5 inline-flex max-w-full flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs shadow-md shadow-primary/5"
>
  <ClockIcon class="h-4 w-4 shrink-0 text-primary" />
  {#if instant}
    <div class="min-w-0">
      <div class="flex flex-wrap items-baseline gap-x-2 font-bold text-primary">
        <span class="tabular-nums">{formatInZone(instant, zone)}</span>
        <span class="text-[10px] font-semibold text-primary/70">
          {differs ? `你的时间 · ${offsetLabel(viewerOffset)}` : SOURCE_LABEL}
        </span>
      </div>
      {#if differs}
        <div class="text-[10px] text-muted-foreground tabular-nums" title="赛事以北京时间（{SOURCE_TIME_ZONE}）安排">
          {SOURCE_LABEL} {formatInZone(instant, SOURCE_TIME_ZONE)}
        </div>
      {/if}
    </div>
    {#if showCountdown && clock}
      {#if clock.phase === "before"}
        <div class="flex items-baseline gap-1 rounded-lg bg-background/60 px-2 py-1">
          <span class="text-[10px] text-muted-foreground">距开赛</span>
          <span class="font-mono text-sm font-black tabular-nums text-foreground">{clock.text}</span>
        </div>
      {:else if status === "in_progress"}
        <span class="rounded-lg bg-emerald-500/15 px-2 py-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
          {clock.text}
        </span>
      {:else}
        <span class="text-[11px] text-muted-foreground">已过开赛时间</span>
      {/if}
    {/if}
  {:else}
    <span class="font-bold text-primary">比赛时间: {value}</span>
  {/if}
  {#if actions}
    <div class="flex items-center gap-1.5">{@render actions()}</div>
  {/if}
</div>
