<script>
  // Season management on the points leaderboard (admins): the current
  // season (where new events count by default), ending a season (locks its
  // boards and Winter Finals list; unfinished events can be left out) and
  // reopening it. `data` is the shown season's leaderboard; onchanged(season)
  // reloads it.
  import { untrack } from "svelte";
  import { toast } from "svelte-sonner";
  import { API } from "#lib/api.js";

  let { data, onchanged } = $props();

  let currentDraft = $state("");
  let seasonBusy = $state(false);
  let confirmEnd = $state(false);
  let confirmReopen = $state(false);
  let endProblem = $state("");
  let isEnded = $derived(Boolean(data?.ended_at));

  // A newly loaded leaderboard: drop pending confirmations.
  $effect(() => {
    const loaded = data;
    untrack(() => {
      currentDraft = loaded?.current || currentDraft;
      confirmEnd = false;
      confirmReopen = false;
      endProblem = "";
    });
  });

  const validSeason = (value) => /^\d{4}$/.test(String(value ?? "").trim());

  async function saveCurrentSeason() {
    seasonBusy = true;
    try {
      const res = await API.setCurrentSeason(currentDraft.trim());
      toast.success(`当前赛季已设为 ${res.current}，新建赛事默认计入该赛季`);
      await onchanged?.(data?.season || "");
    } catch (e) {
      toast.error(e.message);
    } finally {
      seasonBusy = false;
    }
  }

  async function endSeason(force = false) {
    seasonBusy = true;
    try {
      await API.endSeason(data.season, force);
      toast.success(`${data.season} 赛季已结束，积分榜和冬季总决赛名单已锁定`);
      await onchanged?.(data.season);
    } catch (e) {
      // Unfinished events: show them and offer to end anyway.
      endProblem = e.message;
    } finally {
      seasonBusy = false;
    }
  }

  async function reopenSeason() {
    seasonBusy = true;
    try {
      await API.reopenSeason(data.season);
      toast.success(`${data.season} 赛季已重新开放`);
      await onchanged?.(data.season);
    } catch (e) {
      toast.error(e.message);
    } finally {
      seasonBusy = false;
    }
  }
</script>

<div class="space-y-2 rounded-xl border border-border bg-card/40 p-3 text-xs">
  <div class="text-label font-bold uppercase tracking-wider text-muted-foreground">赛季管理</div>
  <div class="flex flex-wrap items-center gap-2">
    <label class="flex items-center gap-1.5">
      当前赛季
      <input
        aria-label="当前赛季"
        class="h-7 w-16 rounded border border-border bg-background px-1.5 num text-xs text-foreground focus:border-primary focus:outline-none"
        inputmode="numeric"
        maxlength="4"
        bind:value={currentDraft}
      />
    </label>
    <button type="button" disabled={seasonBusy || !validSeason(currentDraft) || currentDraft.trim() === data.current} onclick={saveCurrentSeason}
      class="h-7 rounded-md border border-border px-2.5 font-semibold hover:bg-muted cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">设为当前赛季</button>
    <span class="text-small text-muted-foreground">新建赛事默认计入当前赛季{data.current ? `（现在是 ${data.current}）` : "（未设置时按当年年份）"}。</span>
  </div>
  <div class="flex flex-wrap items-center gap-2 border-t border-border/50 pt-2">
    {#if isEnded}
      {#if confirmReopen}
        <span>重新开放 {data.season} 赛季？积分榜会重新按当前数据计算，积分和直邀可以再修改。</span>
        <button type="button" disabled={seasonBusy} onclick={reopenSeason} class="h-7 rounded-md bg-primary px-2.5 font-semibold text-primary-foreground cursor-pointer disabled:opacity-50">确认重新开放</button>
        <button type="button" onclick={() => (confirmReopen = false)} class="h-7 rounded-md border border-border px-2.5 cursor-pointer">取消</button>
      {:else}
        <button type="button" onclick={() => (confirmReopen = true)} class="h-7 rounded-md border border-border px-2.5 font-semibold hover:bg-muted cursor-pointer">重新开放 {data.season} 赛季</button>
      {/if}
    {:else if confirmEnd}
      <span>结束 {data.season} 赛季？积分榜和冬季总决赛名单会固定下来，该赛季所有赛事的积分和直邀将被锁定。</span>
      <button type="button" disabled={seasonBusy} onclick={() => endSeason(false)} class="h-7 rounded-md bg-red-600 px-2.5 font-semibold text-white cursor-pointer disabled:opacity-50">确认结束</button>
      <button type="button" onclick={() => { confirmEnd = false; endProblem = ""; }} class="h-7 rounded-md border border-border px-2.5 cursor-pointer">取消</button>
      {#if endProblem}
        <div class="w-full space-y-1.5 rounded-md bg-amber-500/10 p-2 text-amber-700 dark:text-amber-300">
          <p>{endProblem}</p>
          {#if /没有结束/.test(endProblem)}
            <button type="button" disabled={seasonBusy} onclick={() => endSeason(true)} class="h-7 rounded-md border border-amber-500/50 px-2.5 font-semibold cursor-pointer disabled:opacity-50">仍然结束（这些赛事不计入）</button>
          {/if}
        </div>
      {/if}
    {:else}
      <button type="button" onclick={() => (confirmEnd = true)} class="h-7 rounded-md border border-red-500/40 px-2.5 font-semibold text-red-600 hover:bg-red-500/10 dark:text-red-400 cursor-pointer">结束 {data.season} 赛季</button>
      <span class="text-small text-muted-foreground">结束后积分榜和冬季总决赛名单固定，不再随修改变化；需要时可以重新开放。</span>
    {/if}
  </div>
</div>
