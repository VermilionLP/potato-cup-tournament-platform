<script>
  // Create-event wizard, two-stage events: the group stage.
  import { GROUP_FORMATS } from "$lib/tournament.js";
  import { groupPreview, groupProblem } from "$lib/create-event.js";
  import Segmented from "./Segmented.svelte";
  import SwissRoundsPicker from "./SwissRoundsPicker.svelte";

  let { form = $bindable() } = $props();
  let problem = $derived(groupProblem(form));
  let preview = $derived(groupPreview(form));
</script>

<section class="space-y-3 rounded-xl border border-border/60 bg-background/30 p-3">
  <div class="flex items-center justify-between gap-2">
    <div class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">第一阶段 · 小组赛</div>
    <span class="text-[10px] text-muted-foreground">开赛时按种子蛇形分组</span>
  </div>
  <div class="space-y-1.5">
    <span class="block text-xs text-foreground/80">小组赛赛制</span>
    <Segmented
      options={GROUP_FORMATS.map((f) => ({ id: f.id, label: f.label, title: f.hint }))}
      value={form.groupFormat}
      onpick={(id) => (form.groupFormat = id)}
    />
    <p class="text-[10px] text-muted-foreground">
      {GROUP_FORMATS.find((f) => f.id === form.groupFormat)?.hint}
      {#if form.groupFormat === "double_elim"}
        ；每组晋级 2 人 = 胜者组冠军 + 败者组冠军（可选 2、3、4、8 人）
      {:else if form.groupFormat === "single_elim"}
        ；晋级 3 人及以上时加打三四名决赛
      {/if}
    </p>
  </div>
  <div class="grid grid-cols-2 gap-3">
    <label class="space-y-1.5" for="new-group-size">
      <span class="block text-xs text-foreground/80">每组人数</span>
      <input
        id="new-group-size"
        type="number"
        min="2"
        max="64"
        placeholder={form.groupFormat === "swiss" ? "不分组" : "必填"}
        bind:value={form.groupSize}
        class="h-8 w-24 rounded-md border border-border bg-background px-2 text-center text-sm text-foreground"
      />
    </label>
    <label class="space-y-1.5" for="new-advance">
      <span class="block text-xs text-foreground/80">每组晋级</span>
      <input
        id="new-advance"
        type="number"
        min="1"
        max="64"
        bind:value={form.advancePerGroup}
        class="h-8 w-24 rounded-md border border-border bg-background px-2 text-center text-sm text-foreground"
      />
    </label>
  </div>
  {#if problem}
    <p class="text-[11px] font-semibold text-amber-600 dark:text-amber-400">⚠ {problem}</p>
  {:else if preview}
    <p class="rounded-lg bg-muted/40 px-2.5 py-1.5 text-[11px] text-foreground/80">
      若报满 {preview.players} 人：分 {preview.groups} 组（每组 {preview.smallest === preview.largest ? preview.smallest : `${preview.smallest}–${preview.largest}`} 人），共 <b>{preview.qualifiers}</b> 人进入淘汰赛。
    </p>
  {/if}
  {#if form.groupFormat === "swiss"}
    <SwissRoundsPicker bind:form />
  {:else}
    <p class="text-[10px] leading-relaxed text-muted-foreground">
      每组各打一个{form.groupFormat === "double_elim" ? "双败（组内不打总决赛）" : "单败"}对阵，各组独立进行。
    </p>
  {/if}
</section>
