<script>
  // Create-event wizard, step 2: format and its options.
  import Segmented from "./Segmented.svelte";
  import SwissRoundsPicker from "./SwissRoundsPicker.svelte";
  import SwordsIcon from "@lucide/svelte/icons/swords";
  import ShieldIcon from "@lucide/svelte/icons/shield-half";
  import ShuffleIcon from "@lucide/svelte/icons/shuffle";
  import LayersIcon from "@lucide/svelte/icons/layers";

  let { form = $bindable() } = $props();

  const FORMATS = [
    { id: "single_elim", label: "单败淘汰", hint: "输一场即出局", icon: SwordsIcon },
    { id: "double_elim", label: "双败淘汰", hint: "输两场才出局，含总决赛", icon: ShieldIcon },
    { id: "swiss", label: "瑞士轮", hint: "积分制，积分榜第一夺冠", icon: ShuffleIcon },
    { id: "two_stage", label: "小组赛 + 淘汰赛", hint: "分两个阶段，分别设置", icon: LayersIcon },
  ];
</script>

<section class="space-y-4">
  <div class="grid grid-cols-2 gap-2">
    {#each FORMATS as opt (opt.id)}
      {@const Icon = opt.icon}
      <button
        type="button"
        onclick={() => (form.format = opt.id)}
        aria-pressed={form.format === opt.id}
        class="flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors cursor-pointer
          {form.format === opt.id ? 'border-primary bg-primary/10 ring-1 ring-primary/30' : 'border-border hover:border-foreground/40 hover:bg-muted/30'}"
      >
        <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg {form.format === opt.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}">
          <Icon class="h-4 w-4" />
        </span>
        <span class="min-w-0">
          <span class="block text-sm font-bold text-foreground">{opt.label}</span>
          <span class="block text-[11px] leading-snug text-muted-foreground">{opt.hint}</span>
        </span>
      </button>
    {/each}
  </div>

  {#if form.format === "single_elim"}
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-xs text-foreground/80">晋级规则</span>
      <div class="w-44">
        <Segmented
          options={[{ id: "winner", label: "胜者晋级" }, { id: "loser", label: "败者晋级" }]}
          value={form.loserAdvances ? "loser" : "winner"}
          onpick={(id) => (form.loserAdvances = id === "loser")}
          cols="grid-cols-2"
        />
      </div>
      {#if form.loserAdvances}
        <span class="text-[10px] text-amber-600 dark:text-amber-400">特殊玩法：每场的败者晋级</span>
      {/if}
    </div>
  {:else if form.format === "double_elim"}
    <label class="flex items-start gap-2 text-xs text-foreground/80 cursor-pointer">
      <input type="checkbox" bind:checked={form.grandFinalReset} class="accent-primary mt-0.5" />
      <span>总决赛重置 <span class="text-muted-foreground">· 败者组冠军赢下首场后加赛一场；至少 4 人</span></span>
    </label>
  {:else if form.format === "swiss"}
    <SwissRoundsPicker bind:form />
  {:else}
    <p class="text-[11px] leading-relaxed text-muted-foreground">
      第一阶段分组比赛，各组前几名进入第二阶段淘汰赛。点「下一步」分别设置两个阶段。
    </p>
  {/if}
</section>
