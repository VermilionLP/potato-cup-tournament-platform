<script>
  // The event page's 说明 tab (#lib/event-guide.js): the organisers' own
  // notes, key facts, the steps from signing up to the end (the current one
  // marked), then the rules: format, Ban / Pick, score reports, reminders
  // and tools, and common questions.
  import { eventGuide } from "#lib/event-guide.js";
  import * as Card from "#lib/components/ui/card/index.js";
  import MegaphoneIcon from "@lucide/svelte/icons/megaphone";
  import ListChecksIcon from "@lucide/svelte/icons/list-checks";
  import TrophyIcon from "@lucide/svelte/icons/trophy";
  import DicesIcon from "@lucide/svelte/icons/dices";
  import ClipboardCheckIcon from "@lucide/svelte/icons/clipboard-check";
  import BellRingIcon from "@lucide/svelte/icons/bell-ring";
  import CircleHelpIcon from "@lucide/svelte/icons/circle-question-mark";
  import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
  import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";

  let { tournament, rules = null, banpickEnabled = false, onselect = null } = $props();

  const guide = $derived(eventGuide(tournament, { rules, banpickEnabled }));
</script>

{#snippet section(icon, title, points)}
  {@const Icon = icon}
  <Card.Root class="gap-0 py-0">
    <div class="flex items-center gap-2 border-b border-border px-4 py-3">
      <span class="flex size-7 items-center justify-center rounded-lg bg-primary/12 text-brand-ink"><Icon class="size-4" /></span>
      <h3 class="text-sm font-bold">{title}</h3>
    </div>
    <ul class="space-y-2 px-4 py-3.5 text-sm leading-relaxed">
      {#each points as p, i (i)}
        <li class="flex gap-2"><span class="mt-[0.6em] size-1.5 shrink-0 rounded-full bg-primary/60"></span><span>{p}</span></li>
      {/each}
    </ul>
  </Card.Root>
{/snippet}

{#if guide}
  <div class="space-y-5">
    {#if guide.notes}
      <!-- The organisers' own notes (赛事设置 → 补充说明). -->
      <Card.Root class="gap-2 border-primary/30 bg-primary/5 px-4 py-3.5">
        <p class="flex items-center gap-2 text-sm font-bold text-brand-ink"><MegaphoneIcon class="size-4" />管理员说明</p>
        <p class="whitespace-pre-line text-sm leading-relaxed">{guide.notes}</p>
      </Card.Root>
    {/if}

    <!-- Key facts -->
    <dl class="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
      {#each guide.facts as [label, value] (label)}
        <div class="bg-card px-3.5 py-2.5">
          <dt class="text-small font-semibold text-muted-foreground">{label}</dt>
          <dd class="mt-0.5 text-sm font-bold">{value}</dd>
        </div>
      {/each}
    </dl>

    <!-- Steps -->
    <Card.Root class="gap-0 py-0">
      <div class="flex items-center gap-2 border-b border-border px-4 py-3">
        <span class="flex size-7 items-center justify-center rounded-lg bg-primary/12 text-brand-ink"><ListChecksIcon class="size-4" /></span>
        <h3 class="text-sm font-bold">参赛流程</h3>
        {#if guide.finished}<span class="ml-auto text-small text-muted-foreground">赛事已结束</span>{/if}
      </div>
      <ol class="px-4 py-4">
        {#each guide.steps as step, i (step.id)}
          <li class="relative flex gap-3 pb-5 last:pb-0">
            {#if i < guide.steps.length - 1}
              <span aria-hidden="true" class="absolute left-[13px] top-8 bottom-0 w-px bg-border"></span>
            {/if}
            <span
              class="relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full text-small font-black num
                {step.now ? 'bg-primary text-primary-foreground ring-4 ring-primary/20' : 'bg-muted text-muted-foreground'}"
            >{i + 1}</span>
            <div class="min-w-0 flex-1 pt-0.5">
              <p class="flex flex-wrap items-center gap-2 text-sm font-bold">
                {step.title}
                {#if step.now}<span class="rounded-md bg-primary/15 px-1.5 py-0.5 text-label font-bold text-brand-ink">现在</span>{/if}
              </p>
              <ul class="mt-1 space-y-1 text-sm leading-relaxed text-muted-foreground">
                {#each step.lines as line, j (j)}<li>{line}</li>{/each}
              </ul>
              {#if step.actions?.length}
                <div class="mt-2 flex flex-wrap gap-2">
                  {#each step.actions as a (a.label)}
                    {#if a.kind === "link"}
                      <a href={a.to} target="_blank" rel="noopener noreferrer" class="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-semibold hover:bg-muted">
                        {a.label}<ExternalLinkIcon class="size-3.5" />
                      </a>
                    {:else if onselect}
                      <button type="button" onclick={() => onselect(a.to)} class="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-semibold hover:bg-muted cursor-pointer">
                        {a.label}<ArrowRightIcon class="size-3.5" />
                      </button>
                    {/if}
                  {/each}
                </div>
              {/if}
            </div>
          </li>
        {/each}
      </ol>
    </Card.Root>

    <div class="grid gap-5 lg:grid-cols-2">
      {@render section(TrophyIcon, `赛制：${guide.format.title}`, guide.format.points)}
      {#if guide.banpick}{@render section(DicesIcon, "Ban / Pick 规则", guide.banpick)}{/if}
      {@render section(ClipboardCheckIcon, "报分、异议和弃权", guide.report)}
      {@render section(BellRingIcon, "提醒和工具", guide.tools)}
    </div>

    <!-- Common questions -->
    <Card.Root class="gap-0 py-0">
      <div class="flex items-center gap-2 border-b border-border px-4 py-3">
        <span class="flex size-7 items-center justify-center rounded-lg bg-primary/12 text-brand-ink"><CircleHelpIcon class="size-4" /></span>
        <h3 class="text-sm font-bold">常见问题</h3>
      </div>
      <div class="divide-y divide-border">
        {#each guide.faq as [q, a] (q)}
          <details class="group px-4 py-3">
            <summary class="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
              {q}<ChevronDownIcon class="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <p class="mt-1.5 text-sm leading-relaxed text-muted-foreground">{a}</p>
          </details>
        {/each}
      </div>
    </Card.Root>
  </div>
{/if}
