<script>
  // Voting stage, main column: the time options grouped by day (click to
  // vote / unvote) and one card per custom vote topic.
  import { toast } from "svelte-sonner";
  import { API } from "$lib/api.js";
  import { userState } from "$lib/user.svelte.js";
  import { needsProfile } from "$lib/profile-prompt.js";
  import { customVoteTopics, groupVoteDates, pastVotes } from "$lib/votes.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import ClockIcon from "@lucide/svelte/icons/clock";

  let { tournament, tid, isAdmin = false, voteOptions = [], weekOffset = $bindable(0), playerName, onchanged } = $props();

  let days = $derived(groupVoteDates(voteOptions));
  let pastCount = $derived(pastVotes(tournament?.votes || []).length);
  let topics = $derived(customVoteTopics(tournament?.custom_votes || []));

  const votedTime = (time) =>
    (tournament.votes || []).some((v) => v.player_id === userState.id && v.proposed_time === time);
  const votedCustom = (topic, value) =>
    (tournament.custom_votes || []).some((cv) => cv.player_id === userState.id && cv.topic === topic && cv.value === value);

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

  async function toggleCustom(topic, value, voted) {
    if (needsProfile()) return;
    try {
      if (voted) {
        await API.removeCustomVote(tid, userState.id, topic, value);
        toast.success("已取消该选项的投票");
      } else {
        await API.submitCustomVote(tid, userState.id, topic, value);
        toast.success("已投赞成票");
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
      <ClockIcon class="w-5 h-5 text-purple-400" />
      时间偏好点选（可多选）
    </Card.Title>
    <Card.Description class="text-xs">
      点击对应的时间框来投出赞成票。我们会根据票数最高的时间来安排赛程。
      投票后，如果该时间最终当选，会自动为你报名；不想参赛可在报名阶段取消。
    </Card.Description>
    {#if isAdmin}
      <div class="flex flex-wrap items-center gap-2 mt-3">
        <Button variant="outline" size="sm" onclick={postponeWeek} class="h-7 text-[10px] px-2">顺延一周推荐</Button>
        {#if weekOffset > 0}
          <Button variant="ghost" size="sm" onclick={() => (weekOffset = 0)} class="h-7 text-[10px] px-2">回到本周</Button>
          <span class="text-[10px] text-amber-500 font-bold">已顺延 {weekOffset} 周</span>
        {/if}
        <span class="text-[10px] text-muted-foreground/60">顺延会作废已过期投票；未过期选项保留</span>
      </div>
    {/if}
  </Card.Header>
  <Card.Content class="p-6 pt-0 space-y-4">
    {#if pastCount > 0}
      <div class="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-600 dark:text-amber-400">
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
                    ? 'bg-purple-950/20 border-purple-500 shadow-md shadow-purple-500/5'
                    : 'bg-background/40 border-border/60 hover:border-purple-500/40 hover:bg-background/80'}"
                >
                  <div class="flex items-center justify-between w-full">
                    <span class="font-bold font-mono text-sm text-foreground group-hover/opt:text-purple-400 transition-colors">{opt.timeOnly}</span>
                    <div class="flex items-center gap-1.5">
                      {#if opt.suggested}
                        <Badge variant="outline" class="text-[8px] px-1 py-0 text-purple-400 border-purple-500/30">推荐</Badge>
                      {/if}
                      {#if voted}
                        <Badge class="bg-purple-500 text-white font-bold hover:bg-purple-500 text-[9px] px-1 py-0 shadow">已投</Badge>
                      {/if}
                      <span class="bg-primary text-primary-foreground text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center shadow">{opt.count}</span>
                    </div>
                  </div>
                  <div class="flex flex-wrap gap-1 mt-2.5 border-t border-border/40 pt-2 w-full">
                    {#each opt.voters as voter}
                      <span class="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/40 font-medium">{playerName(voter.player_id)}</span>
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

{#each topics as topicData (topicData.topic)}
  <Card.Root class="border-border bg-card/40">
    <Card.Header class="p-6">
      <Card.Title class="text-base font-bold flex items-center gap-2">
        <span class="w-2.5 h-2.5 rounded-full bg-purple-500 shadow shadow-purple-500/50"></span>
        {topicData.topic} 投票偏好
      </Card.Title>
      <Card.Description class="text-xs">点击对应选项投出赞成票。该投票是多选。</Card.Description>
    </Card.Header>
    <Card.Content class="p-6 pt-0 space-y-4">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {#each topicData.options as opt (opt.value)}
          {@const voted = votedCustom(topicData.topic, opt.value)}
          <button
            onclick={() => toggleCustom(topicData.topic, opt.value, voted)}
            class="flex flex-col text-left p-4 rounded-xl border transition-all text-xs cursor-pointer group/opt {voted
              ? 'bg-purple-950/20 border-purple-500 shadow-md shadow-purple-500/5'
              : 'bg-background/40 border-border hover:border-purple-500/40 hover:bg-background/80'}"
          >
            <div class="flex items-center justify-between w-full">
              <span class="font-bold text-foreground group-hover/opt:text-purple-400 transition-colors">{opt.value}</span>
              <div class="flex items-center gap-1.5">
                {#if voted}
                  <Badge class="bg-purple-500 text-white font-bold hover:bg-purple-500 text-[9px] px-1 py-0 shadow">已投票</Badge>
                {/if}
                <span class="bg-primary text-primary-foreground text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center shadow">{opt.count}</span>
              </div>
            </div>
            <div class="flex flex-wrap gap-1 mt-3 border-t border-border/50 pt-2 w-full">
              {#each opt.voters as voter}
                <span class="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/40 font-medium">{playerName(voter.player_id)}</span>
              {/each}
            </div>
          </button>
        {/each}
      </div>
    </Card.Content>
  </Card.Root>
{/each}
