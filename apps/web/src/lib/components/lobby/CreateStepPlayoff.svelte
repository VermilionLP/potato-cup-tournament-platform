<script>
  // Create-event wizard, two-stage events: the playoff.
  import { PLAYOFF_FORMATS } from "$lib/tournament.js";
  import { groupPreview } from "$lib/create-event.js";
  import Segmented from "./Segmented.svelte";

  let { form = $bindable() } = $props();
  let preview = $derived(groupPreview(form));
</script>

<section class="space-y-3 rounded-xl border border-border/60 bg-background/30 p-3">
  <div class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">第二阶段 · 淘汰赛</div>
  <div class="space-y-1.5">
    <span class="block text-xs text-foreground/80">淘汰赛赛制</span>
    <Segmented
      options={PLAYOFF_FORMATS.map((f) => ({ id: f.id, label: f.label }))}
      value={form.playoffFormat}
      onpick={(id) => (form.playoffFormat = id)}
      cols="grid-cols-2"
    />
  </div>
  {#if form.playoffFormat === "double_elim"}
    <label class="flex items-start gap-2 text-xs text-foreground/80 cursor-pointer">
      <input type="checkbox" bind:checked={form.grandFinalReset} class="accent-primary mt-0.5" />
      <span>总决赛重置 <span class="text-muted-foreground">· 败者组冠军赢下首场后加赛一场</span></span>
    </label>
  {/if}
  {#if preview}
    <p class="rounded-lg bg-muted/40 px-2.5 py-1.5 text-[11px] text-foreground/80">
      若报满 {preview.players} 人：{preview.qualifiers} 人进入{form.playoffFormat === "double_elim" ? "双败" : "单败"}淘汰赛{preview.byes ? `，前 ${preview.byes} 号种子首轮轮空` : ""}{form.playoffFormat === "double_elim" && preview.qualifiers < 4 ? "（双败至少需要 4 人，请增加每组晋级人数）" : ""}。
    </p>
  {/if}
  <p class="text-[10px] leading-relaxed text-muted-foreground">
    所有小组打完后由管理员确认晋级名单进入淘汰赛：种子先按小组名次排（各组第一，再各组第二……），同组选手首轮尽量分开。
  </p>
</section>
