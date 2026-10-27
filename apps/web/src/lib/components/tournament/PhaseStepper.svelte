<script>
  // The four stages of an event, the current one highlighted.
  let { tournament } = $props();

  const STEPS = [
    { status: "voting", label: "时间投票", text: "text-purple-400", dot: "bg-purple-500 text-white border-purple-500" },
    { status: "registration", label: "选手报名", text: "text-primary", dot: "bg-primary text-black border-primary" },
    { status: "in_progress", label: "淘汰赛中", text: "text-amber-500", dot: "bg-amber-500 text-black border-amber-500" },
    { status: "completed", label: "赛事结束", text: "text-emerald-400", dot: "bg-emerald-500 text-black border-emerald-500" },
  ];
</script>

<div class="grid grid-cols-4 gap-3 border border-border bg-card/25 p-3 rounded-2xl text-center text-xs">
  {#each STEPS as step, i (step.status)}
    {@const current = tournament.status === step.status}
    <div class="space-y-1.5 {current ? `${step.text} font-bold` : 'text-muted-foreground'}">
      <div class="w-6 h-6 rounded-full mx-auto flex items-center justify-center text-[10px] border {current ? step.dot : 'bg-muted/40 border-border'}">
        {i + 1}
      </div>
      <div>{step.label}</div>
      {#if step.status === "voting" && tournament.scheduled_time && tournament.status !== "voting"}
        <div class="text-[9px] text-emerald-500 font-semibold">已跳过</div>
      {/if}
    </div>
  {/each}
</div>
