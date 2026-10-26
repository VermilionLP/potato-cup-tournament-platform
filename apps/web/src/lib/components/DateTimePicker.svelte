<script>
  import CalendarIcon from "@lucide/svelte/icons/calendar";
  import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import XIcon from "@lucide/svelte/icons/x";
  import {
    formatScheduled,
    isPastDay,
    monthGrid,
    parseLocal,
    sameDay,
    shiftMonth,
    TIME_SLOTS,
    timeOf,
    toValue,
    WEEKDAY_HEADERS,
  } from "$lib/datetime.js";

  // value: "YYYY-MM-DDTHH:mm" or "" (not set).
  let {
    value = $bindable(""),
    placeholder = "选择日期和时间",
    clearable = true,
    startOpen = false,
    id = undefined,
  } = $props();

  const DEFAULT_TIME = "20:00";

  const selected = $derived(parseLocal(value));
  const selectedTime = $derived(timeOf(selected));
  let open = $state(startOpen);
  const now = new Date();
  let view = $state({ y: now.getFullYear(), m: now.getMonth() + 1 });
  let customTime = $state("");

  const weeks = $derived(monthGrid(view.y, view.m));
  const today = { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
  const canGoBack = $derived(view.y > today.y || (view.y === today.y && view.m > today.m));

  function toggle() {
    if (!open && selected) view = { y: selected.y, m: selected.m };
    open = !open;
  }

  function pickDay(day) {
    value = toValue(day.y, day.m, day.d, selectedTime || DEFAULT_TIME);
    if (!day.inMonth) view = { y: day.y, m: day.m };
  }

  function pickTime(time) {
    if (!/^\d{2}:\d{2}$/.test(time)) return;
    const day = selected || today;
    value = toValue(day.y, day.m, day.d, time);
  }

  function clear() {
    value = "";
  }
</script>

<div class="space-y-2">
  <div class="flex items-center gap-2">
    <button
      type="button"
      {id}
      onclick={toggle}
      aria-expanded={open}
      class="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border px-3 text-left text-sm transition-colors cursor-pointer
        {open ? 'border-primary ring-1 ring-primary/40' : 'border-border hover:border-foreground/40'}
        bg-background"
    >
      <CalendarIcon class="h-4 w-4 shrink-0 {selected ? 'text-primary' : 'text-muted-foreground'}" />
      <span class="truncate {selected ? 'font-semibold text-foreground' : 'text-muted-foreground'}">
        {selected ? formatScheduled(value) : value || placeholder}
      </span>
    </button>
    {#if clearable && value}
      <button
        type="button"
        onclick={clear}
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
        aria-label="清除比赛时间"
        title="清除比赛时间"
      >
        <XIcon class="h-4 w-4" />
      </button>
    {/if}
  </div>

  {#if open}
    <div class="grid gap-3 rounded-lg border border-border bg-background/60 p-3 sm:grid-cols-[1fr_11rem]">
      <!-- Month calendar -->
      <div>
        <div class="mb-1.5 flex items-center justify-between">
          <button
            type="button"
            disabled={!canGoBack}
            onclick={() => (view = shiftMonth(view.y, view.m, -1))}
            class="flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted disabled:opacity-30 cursor-pointer"
            aria-label="上个月"
          >
            <ChevronLeftIcon class="h-4 w-4" />
          </button>
          <span class="text-sm font-bold text-foreground">{view.y} 年 {view.m} 月</span>
          <button
            type="button"
            onclick={() => (view = shiftMonth(view.y, view.m, 1))}
            class="flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted cursor-pointer"
            aria-label="下个月"
          >
            <ChevronRightIcon class="h-4 w-4" />
          </button>
        </div>
        <div class="grid grid-cols-7 gap-0.5 text-center">
          {#each WEEKDAY_HEADERS as w, i (w)}
            <div class="py-1 text-[10px] font-semibold {i >= 5 ? 'text-primary/80' : 'text-muted-foreground'}">{w}</div>
          {/each}
          {#each weeks.flat() as day (`${day.y}-${day.m}-${day.d}`)}
            {@const past = isPastDay(day)}
            {@const isSelected = sameDay(day, selected)}
            {@const isToday = sameDay(day, today)}
            <button
              type="button"
              disabled={past}
              onclick={() => pickDay(day)}
              class="h-8 rounded-md text-xs tabular-nums transition-colors
                {isSelected
                ? 'bg-primary font-bold text-primary-foreground'
                : past
                  ? 'text-muted-foreground/30 cursor-not-allowed'
                  : day.inMonth
                    ? `cursor-pointer hover:bg-muted ${day.weekend ? 'font-semibold text-primary' : 'text-foreground'}`
                    : 'cursor-pointer text-muted-foreground/50 hover:bg-muted'}
                {isToday && !isSelected ? 'ring-1 ring-primary/50' : ''}"
            >
              {day.d}
            </button>
          {/each}
        </div>
      </div>

      <!-- Time -->
      <div class="flex flex-col gap-2 sm:border-l sm:border-border/60 sm:pl-3">
        <div class="text-[11px] font-semibold text-muted-foreground">开赛时间</div>
        <div class="grid grid-cols-3 gap-1 sm:grid-cols-2">
          {#each TIME_SLOTS as slot (slot)}
            <button
              type="button"
              onclick={() => pickTime(slot)}
              class="rounded-md border py-1 font-mono text-xs transition-colors cursor-pointer
                {selectedTime === slot
                ? 'border-primary bg-primary font-bold text-primary-foreground'
                : 'border-border text-foreground/80 hover:border-foreground/40'}"
            >
              {slot}
            </button>
          {/each}
        </div>
        <label class="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          其他
          <input
            type="time"
            bind:value={customTime}
            onchange={() => pickTime(customTime)}
            class="min-w-0 flex-1 rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-xs text-foreground"
          />
        </label>
        <button
          type="button"
          onclick={() => (open = false)}
          class="mt-auto rounded-md bg-primary py-1 text-xs font-bold text-primary-foreground hover:bg-primary/85 cursor-pointer"
        >
          完成
        </button>
      </div>
    </div>
  {/if}
</div>
