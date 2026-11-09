<script>
  // The four stages of an event as one slim line: finished stages ticked,
  // the current one in its colour; a time vote that was skipped says so.
  // On phones only the current stage keeps its name.
  import CheckIcon from "@lucide/svelte/icons/check";

  let { tournament } = $props();

  const STEPS = [
    { status: "voting", label: "时间投票", text: "text-sky-600 dark:text-sky-400", dot: "bg-sky-500 text-white" },
    { status: "registration", label: "选手报名", text: "text-brand-ink", dot: "bg-primary text-primary-foreground" },
    { status: "in_progress", label: "比赛进行中", text: "text-amber-600 dark:text-amber-400", dot: "bg-amber-500 text-black" },
    { status: "completed", label: "赛事结束", text: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500 text-black" },
  ];
  let currentIndex = $derived(STEPS.findIndex((s) => s.status === tournament.status));
  let skippedVote = $derived(Boolean(tournament.scheduled_time) && tournament.status !== "voting");
</script>

<ol class="flex items-center gap-2 rounded-xl border border-border bg-card/25 px-3 py-2 text-small" aria-label="赛事阶段">
  {#each STEPS as step, i (step.status)}
    {@const current = i === currentIndex}
    {@const done = i < currentIndex}
    {#if i > 0}<li aria-hidden="true" class="h-px min-w-3 flex-1 {done || current ? 'bg-primary/40' : 'bg-border'}"></li>{/if}
    <li class="flex shrink-0 items-center gap-1.5 {current ? `${step.text} font-bold` : 'text-muted-foreground'}" aria-current={current ? "step" : undefined}>
      <span class="inline-flex size-5 items-center justify-center rounded-full text-label font-bold {current ? step.dot : done ? 'bg-primary/15 text-brand-ink' : 'bg-muted text-muted-foreground'}">
        {#if done}<CheckIcon class="size-3" />{:else}{i + 1}{/if}
      </span>
      <span class={current ? "" : "hidden sm:inline"}>{step.label}</span>
      {#if step.status === "voting" && skippedVote}<span class="hidden sm:inline text-muted-foreground/70 font-normal">（已跳过）</span>{/if}
    </li>
  {/each}
</ol>
