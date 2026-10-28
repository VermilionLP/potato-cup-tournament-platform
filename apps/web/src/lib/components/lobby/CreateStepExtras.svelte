<script>
  // Create-event wizard, last step: Ban / Pick, points and a summary.
  import { GROUP_FORMATS, gameModeLabel, vehiclePoolLabel } from "$lib/tournament.js";
  import { cleanTable } from "$lib/points.js";
  import { isTwoStage } from "$lib/create-event.js";
  import PointsEditor from "$lib/components/PointsEditor.svelte";

  let { form = $bindable() } = $props();

  let pointsSummary = $derived(
    form.pointsEnabled
      ? `${form.pointsSeason} 赛季 · ${form.pointsKind === "monthly" ? "月赛" : "周赛"}${form.pointsInvite ? " · 冠军直邀" : ""} · ${cleanTable(form.pointsTable)
          .map((r) => `${r.from === r.to ? r.from : `${r.from}-${r.to}`}:${r.points}`)
          .join(" ")}`
      : "不计入",
  );
  let roundsText = $derived(form.swissRoundsMode === "auto" ? "单循环" : `${form.swissRounds} 轮`);
</script>

<section class="space-y-2 rounded-xl border border-border/60 bg-background/30 p-3">
  <div class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Ban / Pick</div>
  <label class="flex items-center gap-2 text-xs text-foreground/80 cursor-pointer">
    <input type="checkbox" bind:checked={form.banpickEnabled} class="accent-primary" />
    启用 Ban / Pick
  </label>
  <p class="text-[10px] text-muted-foreground">
    {form.banpickEnabled
      ? `每张对阵卡片上显示 BP 按钮，使用${vehiclePoolLabel(form.eventPool)}载具池禁用和抽取。`
      : "不启用时比赛仍按上一步选的比赛类型分类统计。"}
  </p>
</section>

<section class="space-y-2 rounded-xl border border-border/60 bg-background/30 p-3">
  <div class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">年度积分榜</div>
  <label class="flex items-center gap-2 text-xs text-foreground/80 cursor-pointer">
    <input type="checkbox" bind:checked={form.pointsEnabled} class="accent-primary" />
    计入土豆杯积分榜
  </label>
  {#if form.pointsEnabled}
    <PointsEditor bind:table={form.pointsTable} bind:season={form.pointsSeason} bind:kind={form.pointsKind} bind:invite={form.pointsInvite} />
  {/if}
</section>

<section class="space-y-1.5 rounded-xl border border-border/60 bg-background/30 p-3 text-xs">
  <div class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">确认</div>
  <dl class="grid grid-cols-[5.5rem_1fr] gap-x-2 gap-y-1">
    <dt class="text-muted-foreground">名称</dt>
    <dd class="font-semibold text-foreground break-all">{form.name.trim() || "—"}</dd>
    <dt class="text-muted-foreground">人数 / 模式</dt>
    <dd class="text-foreground">{form.capacity} 人 · {gameModeLabel(form.gameMode)}</dd>
    <dt class="text-muted-foreground">比赛时间</dt>
    <dd class="text-foreground">{form.scheduledTime || "先进行时间投票"}</dd>
    {#if isTwoStage(form)}
      <dt class="text-muted-foreground">第一阶段</dt>
      <dd class="text-foreground">
        {GROUP_FORMATS.find((f) => f.id === form.groupFormat)?.label}小组 · {form.groupSize ? `每组 ${form.groupSize} 人` : "不分组"} · 每组前 {form.advancePerGroup} 名晋级{form.groupFormat === "swiss" ? ` · ${roundsText}` : ""}
      </dd>
      <dt class="text-muted-foreground">第二阶段</dt>
      <dd class="text-foreground">{form.playoffFormat === "double_elim" ? `双败淘汰${form.grandFinalReset ? " · 总决赛重置" : ""}` : "单败淘汰"}</dd>
    {:else}
      <dt class="text-muted-foreground">赛制</dt>
      <dd class="text-foreground">
        {#if form.format === "single_elim"}单败淘汰 · {form.loserAdvances ? "败者晋级" : "胜者晋级"}
        {:else if form.format === "double_elim"}双败淘汰{form.grandFinalReset ? " · 总决赛重置" : ""}
        {:else}瑞士轮 · {roundsText}{/if}
      </dd>
    {/if}
    <dt class="text-muted-foreground">比赛类型</dt>
    <dd class="text-foreground">{vehiclePoolLabel(form.eventPool)}</dd>
    <dt class="text-muted-foreground">年度积分榜</dt>
    <dd class="text-foreground">{pointsSummary}</dd>
    <dt class="text-muted-foreground">Ban / Pick</dt>
    <dd class="text-foreground">{form.banpickEnabled ? "启用" : "不启用"}</dd>
  </dl>
</section>
