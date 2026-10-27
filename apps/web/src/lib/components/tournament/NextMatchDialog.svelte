<script>
  // Blocking hand-off while streaming: an event in progress with no live
  // match must pick the next one.
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import PlayIcon from "@lucide/svelte/icons/play";

  let { open = $bindable(false), candidates = [], matchOrder, roundLabel, playerName, onchoose } = $props();
</script>

<Dialog.Root bind:open>
  <Dialog.Content
    showCloseButton={false}
    escapeKeydownBehavior="ignore"
    interactOutsideBehavior="ignore"
    class="max-w-2xl bg-card border border-primary/30"
  >
    <Dialog.Header>
      <Dialog.Title class="text-base font-bold text-primary flex items-center gap-2">
        <PlayIcon class="w-4 h-4" /> 请选择下一场直播对局
      </Dialog.Title>
      <Dialog.Description class="text-xs text-muted-foreground">
        赛事进行中，但当前没有正在直播的对局。请从下方候选对局中选择一场；选定后将开始
        60 秒倒计时，超时自动把大屏切换到游戏内 HUD。
      </Dialog.Description>
    </Dialog.Header>

    <div class="max-h-[60vh] overflow-y-auto space-y-2 py-2">
      {#each candidates as m (m.id)}
        <button
          onclick={() => onchoose(m.id)}
          class="w-full text-left p-3 rounded-lg border border-border bg-background/40 hover:border-primary/50 hover:bg-primary/5 transition-colors cursor-pointer"
        >
          <div class="flex items-center justify-between gap-3">
            <span class="text-xs font-semibold text-foreground">
              #{matchOrder.get(m.id)} · {roundLabel(m)} · 场次 {m.position}
            </span>
            <Badge variant="outline" class="text-[10px]">待赛</Badge>
          </div>
          <div class="mt-1 text-xs text-foreground/90">
            {playerName(m.player1_id)}
            <span class="text-muted-foreground"> vs </span>
            {playerName(m.player2_id)}
          </div>
        </button>
      {/each}
    </div>
  </Dialog.Content>
</Dialog.Root>
