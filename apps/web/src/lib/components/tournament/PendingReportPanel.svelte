<script>
  // A result a player reported, waiting for the opponent or an admin
  // (migration 034), with what the viewer can do about it: the opponent
  // confirms or disputes, the reporter withdraws, an admin applies the
  // report or the counter-report.
  import { Button } from "#lib/components/ui/button/index.js";
  import { formatReport } from "#lib/match-card.js";

  let { match, viewerId = "", isAdmin = false, playerName, busy = false, onconfirm, ondispute, onwithdraw } = $props();

  let r = $derived(match?.pending_report);
  let opponentOfReporter = $derived(r ? (match.player1_id === r.by ? match.player2_id : match.player1_id) : null);
  let isOpponent = $derived(Boolean(viewerId) && viewerId === opponentOfReporter);
  let isReporter = $derived(Boolean(viewerId) && viewerId === r?.by);
</script>

{#if r}
  <div class="rounded-lg border px-3 py-2 text-xs space-y-2 {r.disputed ? 'border-destructive/40 bg-destructive/10' : 'border-sky-500/30 bg-sky-500/10'}">
    <div class="font-bold {r.disputed ? 'text-destructive' : 'text-sky-500'}">
      {r.disputed ? "结果有争议，等待管理员处理" : r.kind === "walkover" ? "弃权申报，等待管理员确认" : "比分待确认"}
    </div>
    <div>
      <span class="text-muted-foreground">{playerName(r.by)} 提交：</span>
      <span class="num font-semibold">{formatReport(match, r, playerName)}</span>
    </div>
    {#if r.counter}
      <div>
        <span class="text-muted-foreground">{playerName(r.counter.by)} 提交：</span>
        <span class="num font-semibold">{formatReport(match, r.counter, playerName)}</span>
      </div>
    {/if}
    {#if !r.disputed && r.kind === "score"}
      <div class="text-muted-foreground">对手 10 分钟内不确认也不提出异议，将自动生效。</div>
    {/if}
    <div class="flex flex-wrap gap-2">
      {#if isAdmin}
        <Button size="sm" disabled={busy} onclick={() => onconfirm("report")} class="h-7 text-xs">
          {r.counter ? `采用 ${playerName(r.by)} 的结果` : "确认生效"}
        </Button>
        {#if r.counter}
          <Button size="sm" variant="outline" disabled={busy} onclick={() => onconfirm("counter")} class="h-7 text-xs">
            采用 {playerName(r.counter.by)} 的结果
          </Button>
        {/if}
        <Button size="sm" variant="ghost" disabled={busy} onclick={onwithdraw} class="h-7 text-xs text-muted-foreground">驳回</Button>
      {:else if isOpponent && !r.disputed}
        {#if r.kind === "score"}
          <Button size="sm" disabled={busy} onclick={() => onconfirm("report")} class="h-7 text-xs">确认比分</Button>
        {/if}
        <Button size="sm" variant="outline" disabled={busy} onclick={ondispute} class="h-7 text-xs border-destructive/40 text-destructive hover:bg-destructive hover:text-white">
          有异议
        </Button>
      {:else if isReporter && !r.disputed}
        <Button size="sm" variant="ghost" disabled={busy} onclick={onwithdraw} class="h-7 text-xs text-muted-foreground">撤回</Button>
      {/if}
    </div>
  </div>
{/if}
