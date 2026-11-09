<script>
  // Voting stage, main column: the time options grouped by day (click to
  // vote / unvote).
  import { toast } from "svelte-sonner";
  import { API } from "#lib/api.js";
  import { userState } from "#lib/user.svelte.js";
  import { needsProfile } from "#lib/profile-prompt.js";
  import { groupVoteDates, pastVotes } from "#lib/votes.js";
  import * as Card from "#lib/components/ui/card/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import ClockIcon from "@lucide/svelte/icons/clock";

  let { tournament, tid, isAdmin = false, voteOptions = [], weekOffset = $bindable(0), playerName, onchanged } = $props();

  let days = $derived(groupVoteDates(voteOptions));
  let pastCount = $derived(pastVotes(tournament?.votes || []).length);

  const votedTime = (time) =>
    (tournament.votes || []).some((v) => v.player_id === userState.id && v.proposed_time === time);

  async function postponeWeek() {
    if (!isAdmin) return toast.error("此操作需要管理员权限，请先点击右上角盾牌图标登录");
    try {
      const res = await API.deletePastVotes(tid);
      weekOffset += 1;
      toast.info(res.deleted > 0 ? `已作废 ${res.deleted} 条过期投票，推荐时间已顺延到下周` : `推荐时间已顺延 ${weekOffset} 周`);
      await onchanged?.();
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function toggleTime(time, voted) {
    if (needsProfile()) return;
    try {
      if (voted) {
        await API.removeVote(tid, userState.id, time);
        toast.success("已取消该时间的投票");
      } else {
        await API.submitVote(tid, userState.id, time);
        toast.success("已投票；若该时间最终当选，会自动为你报名");
      }
      await onchanged?.();
    } catch (e) {
      toast.error(e.message);
    }
  }
</script>

<Card.Root class="border-border bg-card/40">
  <Card.Header class="p-6">
    <Card.Title class="text-base font-bold flex items-center gap-2">
      <ClockIcon class="w-5 h-5 text-sky-600 dark:text-sky-400" />
      时间偏好点选（可多选）
    </Card.Title>
    <Card.Description class="text-xs">
      点击对应的时间框来投出赞成票。我们会根据票数最高的时间来安排赛程。
      投票后，如果该时间最终当选，会自动为你报名；不想参赛可在报名阶段取消。
    </Card.Description>
    {#if isAdmin}
      <div class="flex flex-wrap items-center gap-2 mt-3">
        <Button variant="outline" size="sm" onclick={postponeWeek} class="h-7 text-small px-2">顺延一周推荐</Button>
        {#if weekOffset > 0}
          <Button variant="ghost" size="sm" onclick={() => (weekOffset = 0)} class="h-7 text-small px-2">回到本周</Button>
          <span class="text-small text-amber-500 font-bold">已顺延 {weekOffset} 周</span>
        {/if}
        <span class="text-small text-muted-foreground/60">顺延会作废已过期投票；未过期选项保留</span>
      </div>
    {/if}
  </Card.Header>
  <Card.Content class="p-6 pt-0 space-y-4">
    {#if pastCount > 0}
      <div class="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-small text-amber-600 dark:text-amber-400">
        有 {pastCount} 条已过期时间投票。点「顺延一周推荐」会作废它们并切到下周。
      </div>
    {/if}
    {#if days.length > 0}
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {#each days as day (day.date)}
          <div class="border border-border/80 bg-background/25 rounded-2xl p-4 space-y-3 flex flex-col">
            <div class="flex items-center gap-2 pb-2.5 border-b border-border/40 justify-center">
              <span class="text-sm font-bold text-foreground">{day.formattedDate}</span>
            </div>
            <div class="space-y-2 flex-1">
              {#each day.options as opt (opt.proposed_time)}
                {@const voted = votedTime(opt.proposed_time)}
                <button
                  onclick={() => toggleTime(opt.proposed_time, voted)}
                  class="w-full flex flex-col text-left p-3.5 rounded-xl border transition-all text-xs cursor-pointer group/opt {voted
                    ? 'bg-sky-950/20 border-sky-500 shadow-md shadow-sky-500/5'
                    : 'bg-background/40 border-border/60 hover:border-sky-500/40 hover:bg-background/80'}"
                >
                  <div class="flex items-center justify-between w-full">
                    <span class="font-bold num text-sm text-foreground group-hover/opt:text-sky-400 transition-colors">{opt.timeOnly}</span>
                    <div class="flex items-center gap-1.5">
                      {#if opt.suggested}
                        <Badge variant="outline" class="text-small px-1 py-0 text-sky-600 dark:text-sky-400 border-sky-500/30">推荐</Badge>
                      {/if}
                      {#if voted}
                        <Badge class="bg-sky-500 text-white font-bold hover:bg-sky-500 text-small px-1 py-0 shadow">已投</Badge>
                      {/if}
                      <span class="bg-primary text-primary-foreground text-small font-bold rounded-full w-5 h-5 flex items-center justify-center shadow">{opt.count}</span>
                    </div>
                  </div>
                  <div class="flex flex-wrap gap-1 mt-2.5 border-t border-border/40 pt-2 w-full">
                    {#each opt.voters as voter}
                      <span class="text-small px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/40 font-medium">{playerName(voter.player_id)}</span>
                    {/each}
                  </div>
                </button>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <div class="text-center py-10 border border-dashed border-border rounded-xl bg-muted/10">
        <p class="text-xs text-muted-foreground/60 italic">目前还没有人发起时间选项，请在右侧时间框中添加第一个偏好。</p>
      </div>
    {/if}
  </Card.Content>
</Card.Root>

