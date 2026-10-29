<script>
  // Templates grouped by event type, in the order events choose them; the
  // dot marks unsaved edits. Admins can start a new template.
  import { POOL_TAG } from "$lib/tournament.js";
  import { modesLabel } from "$lib/vehicle-pools.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import PlusIcon from "@lucide/svelte/icons/plus";

  let { byType = [], activeId = "", drafts = {}, isAdmin = false, newId, isNew = false, onpick, onnew } = $props();
</script>

<div class="space-y-2">
  {#each byType as type (type.id)}
    <div class="flex flex-wrap items-center gap-1.5">
      <span class="w-28 shrink-0 rounded-md border px-2 py-0.5 text-center text-xs font-semibold {POOL_TAG[type.id] || 'border-border'}">{type.name}</span>
      {#each type.templates as t (t.id)}
        <button
          type="button"
          onclick={() => onpick(t.id)}
          aria-pressed={activeId === t.id}
          class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors cursor-pointer
            {activeId === t.id
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground'}"
        >
          {t.name}
          <span class="text-[10px] font-normal opacity-75">{modesLabel(t.game_modes)} · {(drafts[t.id] ?? t).vehicles.length}</span>
          {#if drafts[t.id]}
            <span class="h-1.5 w-1.5 rounded-full bg-amber-400" title="有未保存的修改"></span>
          {/if}
        </button>
      {:else}
        <span class="text-xs text-muted-foreground">没有模板，这类比赛无法 Ban / Pick</span>
      {/each}
    </div>
  {/each}
  {#if isAdmin}
    <div class="flex flex-wrap items-center gap-1.5 pt-1">
      {#if drafts[newId]}
        <button
          type="button"
          onclick={() => onpick(newId)}
          aria-pressed={isNew}
          class="inline-flex items-center gap-1.5 rounded-full border border-dashed px-3 py-1 text-xs font-semibold cursor-pointer {isNew ? 'border-primary text-primary' : 'border-border text-muted-foreground'}"
        >
          {drafts[newId].name || "新模板"}（未保存）
        </button>
      {:else}
        <Button variant="outline" size="sm" class="h-7 gap-1.5 text-xs cursor-pointer" onclick={() => onnew()}>
          <PlusIcon class="h-3.5 w-3.5" /> 新建模板
        </Button>
      {/if}
    </div>
  {/if}
</div>
