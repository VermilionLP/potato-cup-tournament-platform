<script>
  // Create-event wizard: match rules — Ban / Pick, check-in, ladder limit.
  import { gameModeLabel, vehiclePoolLabel } from "#lib/tournament.js";
  import LadderLimitPicker from "#lib/components/tournament/LadderLimitPicker.svelte";
  import ToggleCard from "./ToggleCard.svelte";
  import SwordsIcon from "@lucide/svelte/icons/swords";
  import ClipboardCheckIcon from "@lucide/svelte/icons/clipboard-check";
  import TrendingUpIcon from "@lucide/svelte/icons/trending-up";

  let { form = $bindable() } = $props();
</script>

<div class="space-y-2.5">
  <ToggleCard
    bind:checked={form.banpickEnabled}
    icon={SwordsIcon}
    title="Ban / Pick"
    description={form.banpickEnabled
      ? `每场对阵可以禁用和抽取载具，使用${vehiclePoolLabel(form.eventPool)}的载具池。`
      : "不启用时，比赛仍按比赛类型分类统计。"}
  />
  <ToggleCard
    bind:checked={form.checkinEnabled}
    icon={ClipboardCheckIcon}
    title="赛前签到"
    description="开赛前 30 分钟开放签到；开赛时由管理员决定没签到的选手移出还是判弃权。"
  />
  <div class="rounded-xl border p-3 transition-colors {form.ladderLimit ? 'border-primary/40 bg-primary/5' : 'border-border bg-background/40'}">
    <div class="flex items-start gap-3">
      <span class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg {form.ladderLimit ? 'bg-primary/15 text-brand-ink' : 'bg-muted text-muted-foreground'}">
        <TrendingUpIcon class="h-4 w-4" />
      </span>
      <div class="min-w-0 flex-1 space-y-2">
        <div>
          <span class="block text-sm font-semibold text-foreground">天梯限制</span>
          <span class="mt-0.5 block text-small leading-relaxed text-muted-foreground">
            按本场比赛的天梯（{gameModeLabel(form.gameMode)} · {vehiclePoolLabel(form.eventPool)}）计算；超过上限、未定级或定级中（不足 10 场）的选手不能自行报名，管理员仍可代报。
          </span>
        </div>
        <LadderLimitPicker bind:choice={form.ladderLimit} bind:mmr={form.ladderMaxMmr} />
      </div>
    </div>
  </div>
</div>
