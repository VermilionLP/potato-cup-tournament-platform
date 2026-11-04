<script>
  // The ladder limit: a tag in the header (「限 黄金及以下」), or (editable, in
  // EventSettingsDialog for admins) LadderLimitPicker that saves. Tag: "天梯分 ≤ 3300" / "黄金及以下" when one is set.
  import { toast } from "svelte-sonner";
  import { API } from "#lib/api.js";
  import { DEFAULT_LIMIT_MMR, ladderLimitLabel, limitChoice, limitFields, limitProblem } from "#lib/ladder-limit.js";
  import { gameModeInfo, vehiclePoolLabel } from "#lib/tournament.js";
  import LadderLimitPicker from "./LadderLimitPicker.svelte";

  let { tournament = $bindable(), tid, isAdmin = false, editable = false } = $props();

  let label = $derived(ladderLimitLabel(tournament));
  let division = $derived(`${gameModeInfo(tournament?.game_mode).code} · ${vehiclePoolLabel(tournament?.vehicle_pool) || "全部"}`);
  let title = $derived(`按本场比赛的天梯（${division}）计算；未定级或定级中（不足 10 场）的选手不能自行报名，管理员可以代报`);

  // Draft of the picker, reset from the event whenever it changes.
  let choice = $state("");
  let mmr = $state(DEFAULT_LIMIT_MMR);
  choice = limitChoice(tournament);
  let saving = $state(false);
  $effect.pre(() => {
    choice = limitChoice(tournament);
    mmr = tournament?.ladder_max_mmr ?? DEFAULT_LIMIT_MMR;
  });
  let dirty = $derived(choice === "mmr" && Number(mmr) !== tournament?.ladder_max_mmr);

  async function save() {
    const problem = limitProblem(choice, mmr);
    if (problem) return toast.error(problem);
    saving = true;
    try {
      const res = await API.updateTournament(tid, limitFields(choice, mmr));
      tournament = { ...tournament, ladder_max_mmr: res.ladder_max_mmr, ladder_max_tier: res.ladder_max_tier };
      toast.success(ladderLimitLabel(res) ? `报名限制：${ladderLimitLabel(res)}` : "已取消天梯限制");
    } catch (e) {
      toast.error(e.message);
    } finally {
      saving = false;
    }
  }
</script>

{#if editable && isAdmin}
  <span class="inline-flex flex-wrap items-center gap-1.5" {title}>
    <LadderLimitPicker
      bind:choice
      bind:mmr
      disabled={saving}
      onchoice={(c) => {
        if (c !== "mmr") save();
      }}
    />
    {#if dirty}
      <button type="button" onclick={save} disabled={saving} class="text-[11px] font-semibold text-primary hover:underline cursor-pointer disabled:opacity-60">保存</button>
    {/if}
  </span>
{:else if label}
  <span class="rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 font-semibold text-sky-700 dark:text-sky-300" {title}>限 {label}</span>
{/if}
