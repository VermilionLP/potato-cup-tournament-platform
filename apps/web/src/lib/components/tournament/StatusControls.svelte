<script>
  // Admin stage controls: the main next step as the one prominent button,
  // the match-day console next to it, and the step back as a quiet link
  // under them (check-in moved to 设置, EventSettingsDialog).
  import { Button } from "#lib/components/ui/button/index.js";
  import { askConfirm } from "#lib/confirm.svelte.js";
  import MonitorIcon from "@lucide/svelte/icons/monitor";

  let { status, startBlocked = "", canStart = false, consoleHref = "", onendvoting, onstatus } = $props();

  async function backToVoting() {
    if (await askConfirm("返回时间投票会清空已生成的对阵，确定继续吗？", { danger: true })) onstatus("voting");
  }
  async function reopen() {
    if (await askConfirm("重新打开比赛后可以继续修改比分，确定吗？")) onstatus("in_progress");
  }

  // The step back from the current stage, if any.
  let back = $derived(
    status === "registration"
      ? { label: "改回时间投票", run: backToVoting }
      : status === "in_progress"
        ? { label: "返回选手报名", run: () => onstatus("registration") }
        : status === "completed"
          ? { label: "重新打开比赛", run: reopen }
          : null,
  );
</script>

<div class="flex flex-col items-stretch gap-1.5 sm:items-end">
  <div class="flex flex-wrap items-center gap-2 sm:justify-end">
    {#if consoleHref && (status === "registration" || status === "in_progress")}
      <a
        href={consoleHref}
        class="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-semibold text-foreground hover:border-primary/50 hover:text-brand-ink transition-colors"
        title="一屏查看可开打、待确认、有争议的比赛和签到情况"
      >
        <MonitorIcon class="h-3.5 w-3.5" />
        比赛日控制台
      </a>
    {/if}
    {#if status === "voting"}
      <Button size="sm" onclick={onendvoting} class="h-8 text-xs font-bold cursor-pointer">结束投票并开启报名</Button>
    {:else if status === "registration"}
      <Button size="sm" disabled={!canStart} onclick={() => onstatus("in_progress")} class="h-8 text-xs font-bold cursor-pointer">结束报名并开赛</Button>
    {:else if status === "in_progress"}
      <Button size="sm" onclick={() => onstatus("completed")} class="h-8 text-xs font-bold cursor-pointer">结束赛事</Button>
    {/if}
  </div>
  {#if startBlocked && status === "registration"}
    <span class="text-small text-muted-foreground sm:text-right">{startBlocked}</span>
  {/if}
  {#if back}
    <button type="button" onclick={back.run} class="self-start text-small text-muted-foreground hover:text-foreground hover:underline cursor-pointer sm:self-end">
      {back.label}
    </button>
  {/if}
</div>
