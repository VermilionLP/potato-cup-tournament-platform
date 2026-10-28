<script>
  // Swiss round count of the create-event form: automatic (round robin) or
  // a set number.
  import { MAX_SWISS_ROUNDS, MIN_SWISS_ROUNDS, autoSwissRounds } from "$lib/tournament.js";
  import { autoRoundsBasis, isTwoStage } from "$lib/create-event.js";
  import Segmented from "./Segmented.svelte";

  let { form = $bindable() } = $props();
  let basis = $derived(autoRoundsBasis(form));

  function pickMode(id) {
    if (id === "manual" && form.swissRoundsMode === "auto") form.swissRounds = autoSwissRounds(basis ?? 8);
    form.swissRoundsMode = id;
  }
</script>

<div class="space-y-1.5">
  <span class="block text-xs text-foreground/80">轮数</span>
  <div class="flex flex-wrap items-center gap-2">
    <div class="w-40">
      <Segmented
        options={[{ id: "auto", label: "自动" }, { id: "manual", label: "手动" }]}
        value={form.swissRoundsMode}
        onpick={pickMode}
        cols="grid-cols-2"
      />
    </div>
    {#if form.swissRoundsMode === "manual"}
      <input
        id="new-swiss-rounds"
        type="number"
        min={MIN_SWISS_ROUNDS}
        max={MAX_SWISS_ROUNDS}
        bind:value={form.swissRounds}
        aria-label="瑞士轮轮数"
        class="h-8 w-16 rounded-md border border-border bg-background px-2 text-center text-sm text-foreground"
      />
      <span class="text-xs text-muted-foreground">轮</span>
    {:else if basis}
      <span class="text-xs font-semibold text-primary">每组 {basis} 人 → {autoSwissRounds(basis)} 轮</span>
    {:else}
      <span class="text-xs font-semibold text-primary">按开赛人数自动计算</span>
    {/if}
  </div>
  <p class="text-[10px] leading-relaxed text-muted-foreground">
    {#if form.swissRoundsMode === "auto"}
      自动 = 单循环：每位选手和{basis ? "同组" : ""}其他所有人各打一场（偶数人打 人数−1 轮，奇数人每人轮空一次、打 人数 轮{basis ? "" : "；最多 15 轮"}）。
    {:else}
      轮数少于单循环时按积分配对、不重复交手；开赛后也可以在比赛页修改。
    {/if}
    胜 1 分，同分依次比小分净胜、对手分。
    {#if isTwoStage(form)}
      开赛时按报名人数蛇形分组，各组打完后由管理员确认进入淘汰赛。
    {/if}
  </p>
</div>
