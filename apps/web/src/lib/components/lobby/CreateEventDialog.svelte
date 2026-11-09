<script>
  // "Create event" wizard (admins): basics, format, one page per stage of a
  // two-stage event, rules (Ban / Pick, check-in, ladder limit) and points.
  // The step list (a sidebar on wide screens) shows what each step is set
  // to, and 创建赛事 works from any step (a problem jumps to its step), so a
  // copied event only needs its name and time checked. Form logic is in
  // #lib/create-event.js. Call start() to open it with a fresh form; the
  // quick picks / "更多" fill it from an earlier event (next number, next
  // week's time).
  import { toast } from "svelte-sonner";
  import { API } from "#lib/api.js";
  import { copyableEvents, createEventBody, createSteps, firstProblem, formFromEvent, newEventForm, stepError, stepSummary } from "#lib/create-event.js";
  import { formatScheduled } from "#lib/datetime.js";
  import * as Dialog from "#lib/components/ui/dialog/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import CreateStepBasics from "./CreateStepBasics.svelte";
  import CreateStepFormat from "./CreateStepFormat.svelte";
  import CreateStepGroup from "./CreateStepGroup.svelte";
  import CreateStepPlayoff from "./CreateStepPlayoff.svelte";
  import CreateStepRules from "./CreateStepRules.svelte";
  import CreateStepPoints from "./CreateStepPoints.svelte";
  import SparklesIcon from "@lucide/svelte/icons/sparkles";
  import CopyIcon from "@lucide/svelte/icons/copy";
  import CheckIcon from "@lucide/svelte/icons/check";

  // Heading and hint of each step.
  const STEP_INFO = {
    basics: { title: "基本信息", hint: "填写比赛时间会跳过时间投票，直接开启报名。" },
    format: { title: "赛制", hint: "选择对阵方式；小组赛 + 淘汰赛会分两步设置。" },
    group: { title: "第一阶段 · 小组赛", hint: "开赛时按种子蛇形分组，各组独立进行。" },
    playoff: { title: "第二阶段 · 淘汰赛", hint: "各组晋级的选手进入淘汰赛。" },
    rules: { title: "规则", hint: "Ban / Pick、赛前签到和报名的天梯限制。" },
    points: { title: "奖金与积分", hint: "名次积分计入土豆杯积分榜，奖金以金鹰币发放。" },
  };

  let { defaultSeason = "", events = [], oncreated } = $props();

  let copyChoices = $derived(copyableEvents(events));
  let copySource = $state("");

  function copyFrom(id) {
    copySource = id;
    const src = copyChoices.find((t) => t.id === id);
    if (!src) {
      form = newEventForm(defaultSeason);
      step = 0;
      triedStep = -1;
      return;
    }
    form = formFromEvent(src, defaultSeason);
    step = 0;
    triedStep = -1;
    toast.success(form.name ? `已复制「${src.name}」的设置` : `已复制「${src.name}」的设置，请填写赛事名称`);
  }

  let open = $state(false);
  let form = $state(newEventForm());
  let creating = $state(false);
  let step = $state(0);
  // A step's hint shows once "下一步" has been tried there.
  let triedStep = $state(-1);

  let steps = $derived(createSteps(form));
  let stepIndex = $derived(Math.min(step, steps.length - 1));
  let stepId = $derived(steps[stepIndex].id);
  let isLastStep = $derived(stepIndex === steps.length - 1);
  let currentError = $derived(stepError(form, stepId));

  export function start(fromId = "") {
    copySource = "";
    form = newEventForm(defaultSeason);
    if (fromId) copyFrom(fromId);
    step = 0;
    triedStep = -1;
    open = true;
  }

  function goToStep(index) {
    // Moving forward checks every step on the way.
    for (let i = stepIndex; i < index; i += 1) {
      const err = stepError(form, steps[i].id);
      if (err) {
        step = i;
        triedStep = i;
        toast.error(err);
        return;
      }
    }
    step = index;
  }

  // Recent events to copy with one click; the rest are under "更多".
  let quickCopies = $derived(copyChoices.slice(0, 3));
  let problem = $derived(firstProblem(form));

  async function create() {
    // From any step: the first problem opens its step.
    if (problem) {
      step = steps.findIndex((s) => s.id === problem.step);
      triedStep = step;
      return toast.error(problem.error);
    }
    const { id, body, error } = createEventBody(form);
    if (error) return toast.error(error);
    creating = true;
    try {
      await API.createTournament(body);
      toast.success(
        form.scheduledTime ? `赛事创建成功！已直接开启报名 (生成 ID: ${id})` : `赛事创建成功！(生成 ID: ${id})`,
      );
      open = false;
      await oncreated?.();
    } catch (e) {
      toast.error(e.message);
    } finally {
      creating = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <!-- The form scrolls inside the dialog; title, steps and buttons stay in view. -->
  <Dialog.Content class="sm:max-w-3xl max-h-[92vh] flex flex-col gap-0 overflow-hidden bg-card border border-border p-0">
    <!-- Header: title and quick copies -->
    <div class="shrink-0 space-y-3 border-b border-border bg-muted/20 px-5 pb-4 pt-5">
      <Dialog.Header class="space-y-1 text-left">
        <Dialog.Title class="flex items-center gap-2 text-lg font-bold tracking-tight text-foreground">
          <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-brand-ink"><SparklesIcon class="h-4 w-4" /></span>
          创建新赛事
        </Dialog.Title>
        <Dialog.Description class="text-xs text-muted-foreground">
          {copySource ? "已沿用原赛事的设置，确认名称和时间后就可以直接创建。" : "从上一场复制最快；也可以从头填写。"}
        </Dialog.Description>
      </Dialog.Header>
      {#if copyChoices.length}
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="inline-flex items-center gap-1 text-small font-semibold text-muted-foreground"><CopyIcon class="h-3.5 w-3.5" />复制</span>
          {#each quickCopies as t (t.id)}
            <button
              type="button"
              onclick={() => copyFrom(t.id)}
              aria-pressed={copySource === t.id}
              title={t.scheduled_time ? formatScheduled(t.scheduled_time) : ""}
              class="max-w-[13rem] truncate rounded-full border px-2.5 py-1 text-small font-semibold transition-colors cursor-pointer
                {copySource === t.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:border-primary/50 hover:text-brand-ink'}"
            >
              {t.name}
            </button>
          {/each}
          {#if copyChoices.length > quickCopies.length}
            <select
              id="create-copy-from"
              aria-label="复制已有赛事"
              value={quickCopies.some((t) => t.id === copySource) ? "" : copySource}
              onchange={(e) => e.currentTarget.value && copyFrom(e.currentTarget.value)}
              class="h-7 max-w-[11rem] rounded-full border border-border bg-background px-2 text-small text-muted-foreground cursor-pointer"
            >
              <option value="">更多…</option>
              {#each copyChoices.slice(quickCopies.length) as t (t.id)}
                <option value={t.id}>{t.name}{t.scheduled_time ? ` · ${formatScheduled(t.scheduled_time)}` : ""}</option>
              {/each}
            </select>
          {/if}
          {#if copySource}
            <button type="button" onclick={() => copyFrom("")} class="text-small text-muted-foreground hover:text-foreground hover:underline cursor-pointer">从头填写</button>
          {/if}
        </div>
      {/if}
    </div>

    <div class="flex min-h-0 flex-1 flex-col sm:flex-row">
      <!-- Steps: a sidebar with what each step is set to (a scrolling row on phones) -->
      <nav aria-label="创建步骤" class="shrink-0 border-b border-border sm:w-52 sm:border-b-0 sm:border-r sm:bg-muted/10">
        <ol class="flex gap-1 overflow-x-auto p-2 sm:flex-col sm:overflow-visible sm:p-3">
          {#each steps as s, i (s.id)}
            {@const error = stepError(form, s.id)}
            {@const done = i < stepIndex && !error}
            <li class="shrink-0">
              <button
                type="button"
                onclick={() => goToStep(i)}
                aria-current={i === stepIndex ? "step" : undefined}
                class="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors cursor-pointer sm:py-2
                  {i === stepIndex ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-muted/50'}"
              >
                <span
                  class="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-small font-bold
                    {i === stepIndex ? 'bg-primary text-primary-foreground' : done ? 'bg-primary/20 text-brand-ink' : error && triedStep >= i ? 'bg-destructive/15 text-destructive' : 'bg-muted text-muted-foreground'}"
                >
                  {#if done}<CheckIcon class="h-3 w-3" />{:else}{i + 1}{/if}
                </span>
                <span class="min-w-0">
                  <span class="block whitespace-nowrap text-xs font-semibold {i === stepIndex ? 'text-foreground' : 'text-foreground/80'}">{s.label}</span>
                  <span class="hidden max-w-[9.5rem] truncate text-small text-muted-foreground sm:block" title={stepSummary(form, s.id)}>{stepSummary(form, s.id)}</span>
                </span>
              </button>
            </li>
          {/each}
        </ol>
      </nav>

      <!-- The current step -->
      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
        <div class="mb-4">
          <h3 class="text-base font-bold text-foreground">{STEP_INFO[stepId]?.title}</h3>
          <p class="mt-0.5 text-small text-muted-foreground">{STEP_INFO[stepId]?.hint}</p>
        </div>
        {#if stepId === "basics"}
          <CreateStepBasics bind:form />
        {:else if stepId === "format"}
          <CreateStepFormat bind:form />
        {:else if stepId === "group"}
          <CreateStepGroup bind:form />
        {:else if stepId === "playoff"}
          <CreateStepPlayoff bind:form />
        {:else if stepId === "rules"}
          <CreateStepRules bind:form />
        {:else}
          <CreateStepPoints bind:form />
        {/if}
      </div>
    </div>

    <!-- Footer: problem hint, back / next, and 创建赛事 from any step -->
    <div class="shrink-0 flex flex-col gap-2 border-t border-border bg-muted/20 px-5 py-3 sm:flex-row sm:items-center">
      {#if currentError && triedStep === stepIndex}
        <span class="text-small text-amber-600 dark:text-amber-400 sm:mr-auto">{currentError}</span>
      {:else}
        <span class="hidden text-small text-muted-foreground sm:mr-auto sm:block">
          {problem ? `还需要：${problem.error}` : "设置已完整，可以直接创建。"}
        </span>
      {/if}
      <div class="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onclick={() => (stepIndex === 0 ? (open = false) : (step = stepIndex - 1))}
          disabled={creating}
          class="flex-1 sm:flex-none text-xs"
        >
          {stepIndex === 0 ? "取消" : "上一步"}
        </Button>
        {#if !isLastStep}
          <Button variant="outline" size="sm" onclick={() => goToStep(stepIndex + 1)} class="flex-1 sm:flex-none text-xs">下一步</Button>
        {/if}
        <Button size="sm" onclick={create} disabled={creating} class="flex-1 sm:flex-none text-xs font-bold">
          {#if creating}创建中...{:else}创建赛事{/if}
        </Button>
      </div>
    </div>
  </Dialog.Content>
</Dialog.Root>
