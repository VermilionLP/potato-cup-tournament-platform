<script>
  // Admins: the event's settings in one dialog, so the header only shows
  // tags. Classification (tier, kind, mode, type), sign-ups (ladder limit,
  // check-in) and points / prizes. Each part saves on its own. Open with
  // open(section?) — "points" scrolls to the points part.
  import { tick } from "svelte";
  import { toast } from "svelte-sonner";
  import { API } from "#lib/api.js";
  import { POINTS_PRESETS, cleanTable, copyTable, currentSeason, pointsTableProblem } from "#lib/points.js";
  import * as Dialog from "#lib/components/ui/dialog/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import PointsEditor from "#lib/components/PointsEditor.svelte";
  import EventTagControls from "./EventTagControls.svelte";
  import LadderLimitTag from "./LadderLimitTag.svelte";
  import SettingsIcon from "@lucide/svelte/icons/settings";

  let { tournament = $bindable(), tid, oncheckinchange, onreload } = $props();

  let shown = $state(false);
  let started = $derived(tournament?.status === "in_progress" || tournament?.status === "completed");

  // Points (积分榜): a draft of the table, saved with 保存积分.
  let pointsDraft = $state([]);
  let pointsSeasonDraft = $state("");
  let pointsKindDraft = $state("weekly");
  let pointsInviteDraft = $state(false);
  let savingPoints = $state(false);
  let hasPoints = $derived(Boolean(tournament?.points_table?.length));

  export async function open(section = "") {
    pointsDraft = copyTable(tournament?.points_table?.length ? tournament.points_table : POINTS_PRESETS[0].table);
    pointsSeasonDraft = tournament?.points_season || currentSeason();
    pointsKindDraft = tournament?.points_kind === "monthly" ? "monthly" : "weekly";
    pointsInviteDraft = Boolean(tournament?.points_invite);
    shown = true;
    if (!tournament?.points_season) {
      // Not on the leaderboard yet: default to the admins' current season.
      API.getPointsSeasons()
        .then((res) => res.current && (pointsSeasonDraft = res.current))
        .catch(() => {});
    }
    if (section) {
      await tick();
      document.getElementById(`event-settings-${section}`)?.scrollIntoView({ block: "start" });
    }
  }

  async function savePoints(clear = false) {
    if (!clear) {
      const problem = pointsTableProblem(pointsDraft, pointsSeasonDraft);
      if (problem) return toast.error(problem);
    }
    savingPoints = true;
    try {
      await API.updateTournament(
        tid,
        clear
          ? { points_table: null }
          : { points_table: cleanTable(pointsDraft), points_season: pointsSeasonDraft.trim(), points_kind: pointsKindDraft, points_invite: pointsInviteDraft },
      );
      // Reload: awarded points are computed with the event.
      await onreload?.();
      toast.success(clear ? "已设为不计入积分榜" : "积分已保存");
    } catch (e) {
      toast.error(e.message);
    } finally {
      savingPoints = false;
    }
  }
</script>

{#snippet heading(title, hint = "")}
  <div class="mb-2.5">
    <h3 class="text-sm font-bold text-foreground">{title}</h3>
    {#if hint}<p class="text-small text-muted-foreground">{hint}</p>{/if}
  </div>
{/snippet}

<Dialog.Root bind:open={shown}>
  <Dialog.Content class="sm:max-w-2xl max-h-[92vh] flex flex-col gap-0 overflow-hidden p-0 bg-card border border-border">
    <Dialog.Header class="shrink-0 space-y-1 border-b border-border bg-muted/20 px-5 pb-3 pt-5 text-left">
      <Dialog.Title class="flex items-center gap-2 text-lg font-bold text-foreground">
        <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-brand-ink"><SettingsIcon class="h-4 w-4" /></span>
        赛事设置
      </Dialog.Title>
      <Dialog.Description class="text-small text-muted-foreground">
        <span class="num">ID: {tournament?.id}</span>
        {#if tournament?.created_at}<span> · 创建于 {new Date(tournament.created_at).toLocaleDateString("zh-CN")}</span>{/if}
        <span> · 每一项修改后立即保存（积分表点「保存积分」）。</span>
      </Dialog.Description>
    </Dialog.Header>

    <div class="min-h-0 flex-1 divide-y divide-border overflow-y-auto overscroll-contain">
      <section class="px-5 py-4">
        {@render heading("分类", "等级和性质用于统计和 Wiki 导出；模式和类型决定天梯分榜和载具池。")}
        <EventTagControls bind:tournament {tid} isAdmin editable />
      </section>

      <section class="space-y-4 px-5 py-4">
        {@render heading("报名")}
        <div class="space-y-1.5">
          <span class="block text-small font-semibold text-muted-foreground">天梯限制</span>
          <LadderLimitTag bind:tournament {tid} isAdmin editable />
        </div>
        <label class="flex items-start gap-2.5 {started ? 'opacity-60' : 'cursor-pointer'}">
          <input
            type="checkbox"
            checked={Boolean(tournament?.checkin?.enabled)}
            disabled={started}
            onchange={(e) => oncheckinchange?.(e.currentTarget.checked)}
            class="mt-0.5 accent-primary"
          />
          <span class="text-xs">
            <span class="font-semibold text-foreground">需要赛前签到</span>
            <span class="block text-small text-muted-foreground">
              {started ? "赛事已开始，不能再修改签到设置。" : "开赛前 30 分钟开放签到；开赛时由管理员决定没签到的选手移出还是判弃权。"}
            </span>
          </span>
        </label>
      </section>

      <section id="event-settings-points" class="space-y-3 px-5 py-4">
        {@render heading("奖金与积分", hasPoints ? "随时可以修改，赛事结束后的积分会重新计算。" : "这场赛事还不计入积分榜；保存后计入。")}
        <PointsEditor bind:table={pointsDraft} bind:season={pointsSeasonDraft} bind:kind={pointsKindDraft} bind:invite={pointsInviteDraft} compact />
        <div class="flex flex-wrap items-center gap-2">
          <Button size="sm" class="h-8 text-xs cursor-pointer" disabled={savingPoints} onclick={() => savePoints(false)}>保存积分</Button>
          {#if hasPoints}
            <Button variant="outline" size="sm" class="h-8 text-xs cursor-pointer" disabled={savingPoints} onclick={() => savePoints(true)}>不计入积分榜</Button>
          {/if}
        </div>
      </section>
    </div>
  </Dialog.Content>
</Dialog.Root>
