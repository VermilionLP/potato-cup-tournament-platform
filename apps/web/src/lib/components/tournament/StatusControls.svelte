<script>
  // Admin buttons that move the event between its stages.
  import { Button } from "$lib/components/ui/button/index.js";

  let { status, startBlocked = "", canStart = false, onendvoting, onstatus } = $props();

  function backToVoting() {
    if (confirm("返回时间投票会清空已生成的对阵，确定继续吗？")) onstatus("voting");
  }
</script>

<div class="flex items-center gap-2 flex-wrap">
  {#if status === "voting"}
    <Button size="sm" onclick={onendvoting} class="text-xs font-semibold cursor-pointer">结束投票并开启报名</Button>
  {:else if status === "registration"}
    <Button
      variant="outline"
      size="sm"
      onclick={backToVoting}
      class="text-xs border-purple-500/30 text-purple-400 hover:bg-purple-500 hover:text-white cursor-pointer"
    >
      改为时间投票
    </Button>
    {#if startBlocked}
      <span class="text-xs text-muted-foreground self-center">{startBlocked}</span>
    {/if}
    <Button size="sm" disabled={!canStart} onclick={() => onstatus("in_progress")} class="text-xs font-semibold cursor-pointer">结束报名并开赛</Button>
  {:else if status === "in_progress"}
    <Button
      variant="outline"
      size="sm"
      onclick={() => onstatus("registration")}
      class="text-xs border-sky-500/30 text-sky-400 hover:bg-sky-500 hover:text-white cursor-pointer"
    >
      返回选手报名
    </Button>
    <Button size="sm" onclick={() => onstatus("completed")} class="text-xs font-bold cursor-pointer">结束赛事</Button>
  {:else if status === "completed"}
    <Button
      variant="outline"
      size="sm"
      onclick={() => onstatus("in_progress")}
      class="text-xs border-amber-500/30 text-amber-400 hover:bg-amber-500 hover:text-black cursor-pointer"
    >
      重新打开比赛
    </Button>
  {/if}
</div>
