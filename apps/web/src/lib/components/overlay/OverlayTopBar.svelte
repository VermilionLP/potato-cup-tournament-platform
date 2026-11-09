<script>
  // The top bar every overlay scene shares (1920 wide, 112 high): logo and
  // event name on the left, the current segment as pills in the middle,
  // progress or time on the right (the `right` snippet). Steps:
  // [{ label, state: "done" | "active" | "todo" | "idle" }].
  let { tournament, steps = [], right } = $props();
  // The logo already says Potato Cup: "FamilyX Potato Cup Weekly #41" -> "Weekly #41".
  let name = $derived(String(tournament?.name || "").replace(/^.*?potato\s*cup\s*/i, "") || tournament?.name || "");
</script>

<div class="absolute inset-x-0 top-0 z-20 grid h-[112px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-8 border-b border-white/[0.08] px-16">
  <div class="flex min-w-0 items-center gap-6">
    <img src="/overlay/potato-cup-logo.webp" alt="Potato Cup" class="h-[52px] w-auto shrink-0" />
    <span class="h-11 w-px shrink-0 bg-white/15"></span>
    <span class="truncate font-display text-[32px] font-extrabold uppercase leading-none tracking-[0.04em]">{name}</span>
  </div>
  <div class="flex items-center gap-2.5">
    {#each steps as s, i (s.label + i)}
      {#if i > 0 && steps.some((x) => x.state === "done")}<span class="h-0.5 w-5 bg-white/15"></span>{/if}
      <span
        class="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-full px-5 font-num text-[17px] font-bold tracking-[0.1em] transition-colors duration-500
          {s.state === 'active'
          ? 'bg-cyan-400 text-[#03252E]'
          : s.state === 'done'
            ? 'bg-white/[0.06] text-[#AFC0D8]'
            : s.state === 'todo'
              ? 'border border-white/15 text-[#7184A3]'
              : 'bg-white/[0.06] text-[#AFC0D8]'}"
      >
        {#if s.state === "done"}<span class="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full bg-green-500 text-[15px] text-[#052E14]">✓</span>{/if}
        {s.label}
      </span>
    {/each}
  </div>
  <div class="flex min-w-0 items-center justify-end gap-3">
    {@render right?.()}
  </div>
</div>
