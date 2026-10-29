<script>
  // "Create event" wizard (admins): basics, format, one page per stage of a
  // two-stage event, then Ban / Pick, points and a summary. Form logic is in
  // $lib/create-event.js. Call start() to open it with a fresh form.
  import { toast } from "svelte-sonner";
  import { API } from "$lib/api.js";
  import { createEventBody, createSteps, newEventForm, stepError } from "$lib/create-event.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import CreateStepBasics from "./CreateStepBasics.svelte";
  import CreateStepFormat from "./CreateStepFormat.svelte";
  import CreateStepGroup from "./CreateStepGroup.svelte";
  import CreateStepPlayoff from "./CreateStepPlayoff.svelte";
  import CreateStepExtras from "./CreateStepExtras.svelte";

  let { defaultSeason = "", oncreated } = $props();

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

  export function start() {
    form = newEventForm(defaultSeason);
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

  async function create() {
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
  <!-- The form scrolls inside the dialog; title and buttons stay in view. -->
  <Dialog.Content class="sm:max-w-[640px] max-h-[90vh] flex flex-col gap-3 bg-card border border-border">
    <Dialog.Header class="shrink-0">
      <Dialog.Title class="text-lg font-bold tracking-tight text-foreground">创建新赛事</Dialog.Title>
      <Dialog.Description class="text-xs text-muted-foreground">填写比赛时间会跳过时间投票，直接开启报名。</Dialog.Description>
    </Dialog.Header>
    <div class="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain -mx-4 px-4 py-1">
      <ol class="flex flex-wrap items-center gap-1.5" aria-label="创建步骤">
        {#each steps as s, i (s.id)}
          <li>
            <button
              type="button"
              onclick={() => goToStep(i)}
              aria-current={i === stepIndex ? "step" : undefined}
              class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer
                {i === stepIndex
                ? 'border-primary bg-primary text-primary-foreground'
                : i < stepIndex
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground'}"
            >
              <span class="inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold {i === stepIndex ? 'bg-primary-foreground/20' : 'bg-muted'}"
                >{i + 1}</span
              >
              {s.label}
            </button>
          </li>
        {/each}
      </ol>

      {#if stepId === "basics"}
        <CreateStepBasics bind:form />
      {:else if stepId === "format"}
        <CreateStepFormat bind:form />
      {:else if stepId === "group"}
        <CreateStepGroup bind:form />
      {:else if stepId === "playoff"}
        <CreateStepPlayoff bind:form />
      {:else}
        <CreateStepExtras bind:form />
      {/if}
    </div>
    <Dialog.Footer class="shrink-0 flex flex-col sm:flex-row gap-2">
      {#if currentError && !isLastStep && triedStep === stepIndex}
        <span class="text-[11px] text-amber-600 dark:text-amber-400 sm:mr-auto self-center">{currentError}</span>
      {/if}
      <Button
        variant="outline"
        size="sm"
        onclick={() => (stepIndex === 0 ? (open = false) : (step = stepIndex - 1))}
        disabled={creating}
        class="w-full sm:w-auto text-xs"
      >
        {stepIndex === 0 ? "取消" : "上一步"}
      </Button>
      {#if isLastStep}
        <Button size="sm" onclick={create} disabled={creating} class="w-full sm:w-auto text-xs font-bold">
          {#if creating}创建中...{:else}创建赛事{/if}
        </Button>
      {:else}
        <Button size="sm" onclick={() => goToStep(stepIndex + 1)} class="w-full sm:w-auto text-xs font-bold">下一步</Button>
      {/if}
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
