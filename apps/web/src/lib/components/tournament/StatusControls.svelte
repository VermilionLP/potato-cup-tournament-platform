<script>
  // Admin buttons that move the event between its stages, the check-in
  // switch while registration is open, and the match-day console link.
  import { Button } from "$lib/components/ui/button/index.js";

  let { status, startBlocked = "", canStart = false, checkinEnabled = false, consoleHref = "", onendvoting, onstatus, oncheckinchange } = $props();

  function backToVoting() {
    if (confirm("返回时间投票会清空已生成的对阵，确定继续吗？")) onstatus("voting");
  }
</script>

<div class="flex items-center gap-2 flex-wrap">
  {#if consoleHref && (status === "registration" || status === "in_progress")}
    <a
      href={consoleHref}
      class="inline-flex h-8 items-center rounded-md border border-primary/40 px-3 text-xs font-semibold text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
      title="一屏查看可开打、待确认、有争议的比赛和签到情况"
    >
      比赛日控制台
    </a>
  {/if}
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
    <label class="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none" title="开赛前 30 分钟开放签到；开赛时由管理员处理没签到的选手">
      <input type="checkbox" checked={checkinEnabled} onchange={(e) => oncheckinchange?.(e.currentTarget.checked)} class="accent-primary" />
      需要签到
    </label>
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
