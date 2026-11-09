<script>
  // Voting stage, side column: propose a new time (calendar + slot); it
  // votes for what it adds.
  import { toast } from "svelte-sonner";
  import { CalendarDate } from "@internationalized/date";
  import { API } from "#lib/api.js";
  import { userState } from "#lib/user.svelte.js";
  import { needsProfile, openProfile } from "#lib/profile-prompt.js";
  import { VOTE_TIME_SLOTS } from "#lib/votes.js";
  import * as Card from "#lib/components/ui/card/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Calendar } from "#lib/components/ui/calendar/index.js";
  import CalendarIcon from "@lucide/svelte/icons/calendar";

  let { tid, onchanged } = $props();

  const today = new Date();
  let voteDate = $state(new CalendarDate(today.getFullYear(), today.getMonth() + 1, today.getDate()));
  let voteTime = $state("20:00");

  async function proposeTime() {
    if (needsProfile()) return;
    if (!voteDate) return toast.error("请选择日期");
    const iso = `${voteDate.toString()}T${voteTime || "20:00"}:00`;
    try {
      await API.submitVote(tid, userState.id, iso);
      toast.success("已投票；若该时间最终当选，会自动为你报名");
      voteDate = undefined;
      voteTime = "20:00";
      await onchanged?.();
    } catch (e) {
      toast.error(e.message);
    }
  }
</script>

{#snippet needId(what)}
  <div class="p-4 rounded-xl border border-dashed border-border bg-muted/20 text-center space-y-2.5">
    <p class="text-xs text-muted-foreground leading-normal">
      您需要先在右上角配置您的 <strong>Gamer ID</strong> 才能{what}。
    </p>
    <Button variant="outline" size="sm" onclick={openProfile} class="text-small h-7 cursor-pointer">立即配置游戏ID</Button>
  </div>
{/snippet}

<Card.Root class="border-border bg-card/40">
  <Card.Header class="p-5 pb-3">
    <Card.Title class="text-sm font-bold flex items-center gap-2">
      <CalendarIcon class="w-4 h-4 text-sky-600 dark:text-sky-400" />
      提案一个新的时间
    </Card.Title>
  </Card.Header>
  <Card.Content class="p-4 pt-0 space-y-4">
    {#if userState.id}
      <div class="space-y-3">
        <div class="border border-border bg-background/30 rounded-xl overflow-hidden flex flex-col">
          <div class="p-3 border-b border-border/40 bg-muted/5 flex items-center justify-between text-small font-bold text-muted-foreground">
            <span>当前身份: {userState.id}</span>
            <span class="text-brand-ink">不可代投票</span>
          </div>
          <div class="p-3">
            <Calendar type="single" bind:value={voteDate} class="bg-transparent p-0 mx-auto" weekdayFormat="short" />
          </div>
          <div class="border-t border-border/60 p-3 max-h-40 overflow-y-auto">
            <span class="text-label text-muted-foreground font-bold uppercase tracking-wider block mb-2">选择具体时段</span>
            <div class="grid grid-cols-3 gap-1.5">
              {#each VOTE_TIME_SLOTS as time (time)}
                <Button
                  variant={voteTime === time ? "default" : "outline"}
                  onclick={() => (voteTime = time)}
                  class="shadow-none text-small h-7 py-1 px-1.5 cursor-pointer"
                >
                  {time}
                </Button>
              {/each}
            </div>
          </div>
        </div>

        <div class="p-3 bg-muted/20 border border-border rounded-xl text-xs space-y-2">
          <div class="text-small text-muted-foreground leading-normal font-medium">
            {#if voteDate && voteTime}
              你选择的提案时间为:
              <span class="font-bold text-foreground block mt-0.5">{voteDate.toString()} {voteTime}</span>
            {:else}
              请在上方日历和时段中选择时间
            {/if}
          </div>
          <Button disabled={!voteDate || !voteTime} onclick={proposeTime} class="w-full text-xs font-bold h-8 cursor-pointer mt-1">
            添加此选项并投票
          </Button>
        </div>
      </div>
    {:else}
      {@render needId("发起时间偏好提案")}
    {/if}
  </Card.Content>
</Card.Root>

