<script>
  // Event settings → 赛制: the format (单败 / 双败 / 瑞士轮 / 小组赛 + 淘汰赛)
  // and its options, with the create wizard's own controls. Changes are a
  // draft saved with 保存赛制 (the options depend on each other). Only before
  // the start: the bracket preview follows the new format, sign-ups stay.
  import { toast } from "svelte-sonner";
  import { API } from "#lib/api.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { bracketFields, bracketProblem, formFromEvent, isTwoStage, stepSummary } from "#lib/create-event.js";
  import CreateStepFormat from "#lib/components/lobby/CreateStepFormat.svelte";
  import CreateStepGroup from "#lib/components/lobby/CreateStepGroup.svelte";
  import CreateStepPlayoff from "#lib/components/lobby/CreateStepPlayoff.svelte";
  import LockIcon from "@lucide/svelte/icons/lock";

  let { tournament = $bindable(), tid, onreload } = $props();

  const started = $derived(tournament?.status === "in_progress" || tournament?.status === "completed");
  // The draft: the wizard's form, from the event as saved.
  let form = $state(formFromEvent(tournament || {}));
  let saving = $state(false);
  const saved = $derived(JSON.stringify(bracketFields(formFromEvent(tournament || {}))));
  const changed = $derived(JSON.stringify(bracketFields(form)) !== saved);
  const problem = $derived(bracketProblem(form));
  const summary = (f) => (isTwoStage(f) ? `${stepSummary(f, "group")} → ${stepSummary(f, "playoff")}` : stepSummary(f, "format"));

  /** Back to the saved settings (the dialog opens with them). */
  export function reset() {
    form = formFromEvent(tournament || {});
  }

  async function save() {
    if (problem) return toast.error(problem);
    saving = true;
    try {
      await API.updateTournament(tid, bracketFields(form));
      // Reload: the page's event (players, preview) comes with the detail.
      await onreload?.();
      reset();
      toast.success("赛制已保存，对阵预览已按新赛制更新");
    } catch (e) {
      toast.error(e.message);
    } finally {
      saving = false;
    }
  }
</script>

{#if started}
  <p class="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm">
    <LockIcon class="size-4 shrink-0 text-muted-foreground" />
    <span><span class="font-semibold">{summary(formFromEvent(tournament || {}))}</span><span class="text-muted-foreground"> · 赛事已开始，赛制不能再修改。</span></span>
  </p>
{:else}
  <div class="space-y-4">
    <CreateStepFormat bind:form inWizard={false} />
    {#if isTwoStage(form)}
      <div class="space-y-1.5">
        <p class="text-small font-semibold text-muted-foreground">小组赛</p>
        <CreateStepGroup bind:form />
      </div>
      <div class="space-y-1.5">
        <p class="text-small font-semibold text-muted-foreground">淘汰赛</p>
        <CreateStepPlayoff bind:form />
      </div>
    {/if}
    <div class="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
      <span class="mr-auto text-small {problem ? 'text-destructive' : 'text-muted-foreground'}">
        {problem || (changed ? `改为：${summary(form)}` : `当前：${summary(form)}`)}
      </span>
      {#if changed}
        <Button variant="outline" size="sm" onclick={reset} disabled={saving}>撤销</Button>
      {/if}
      <Button size="sm" onclick={save} disabled={!changed || saving || Boolean(problem)}>保存赛制</Button>
    </div>
  </div>
{/if}
