// Stage actions of the event page: status changes, playoffs (start /
// withdraw), Swiss round count, the console's live match and the JSON
// download. `ctx` gives the page's state: tid(), tournament(),
// setTournament(t), bracketMatches(), live(), liveChannel(),
// setStageView(v), setPlayoffBusy(b), isAdmin(), load(), ensureAdmin().
// The time dialogs (TimeEditDialog, FinalTimeDialog) carry their own flows.

import { toast } from "svelte-sonner";
import { API } from "$lib/api.js";
import { isValidSwissRounds, MAX_SWISS_ROUNDS, MIN_SWISS_ROUNDS } from "$lib/tournament.js";
import { eventStatusLabel } from "$lib/event-view.js";

export function stageActions(ctx) {
  async function changeStatus(status) {
    if (!ctx.ensureAdmin()) return;
    try {
      ctx.setTournament(await API.updateStatus(ctx.tid(), status));
      toast.success(`赛事状态已切换至: ${eventStatusLabel(status)}`);
      await ctx.load();
    } catch (e) {
      toast.error(e.message);
    }
  }

  // Puts a match live on this console's channel, or takes it off.
  async function toggleActiveMatch(match) {
    const isActive = ctx.live()?.active_match_id === match.id;
    try {
      await API.setActiveMatch(ctx.tid(), isActive ? null : match.id, ctx.liveChannel());
      ctx.setTournament(await API.getTournament(ctx.tid()));
      toast.success(isActive ? "已取消直播该场次" : "已开启该场次直播！");
    } catch (err) {
      toast.error("更新直播状态失败: " + err.message);
    }
  }

  async function playoffStep(question, call, done) {
    if (!confirm(question)) return;
    ctx.setPlayoffBusy(true);
    try {
      await call(ctx.tid());
      ctx.setStageView(null);
      toast.success(done);
      await ctx.load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      ctx.setPlayoffBusy(false);
    }
  }

  async function startPlayoffs() {
    if (!ctx.ensureAdmin()) return;
    const t = ctx.tournament();
    const q = t?.group_stage?.qualifiers?.length || 0;
    const warn = t?.group_stage?.warnings?.length
      ? "\n\n注意：晋级线上有同分，由报名种子决定（详见名单上方提示）。"
      : "";
    await playoffStep(
      `按当前名单生成淘汰赛（${q} 人）？生成后小组赛结果将被锁定。${warn}`,
      API.startPlayoffs,
      "淘汰赛已生成",
    );
  }

  async function withdrawPlayoffs() {
    if (!ctx.ensureAdmin()) return;
    const played = ctx.bracketMatches().some(
      (m) => (m.status === "completed" || m.status === "walkover") && m.player1_id && m.player2_id,
    );
    await playoffStep(
      played
        ? "【警告】淘汰赛已有比赛打完！撤回会删除整个淘汰赛对阵和比分，回到小组赛（可修改小组赛结果）。确定继续吗？"
        : "撤回淘汰赛并回到小组赛？淘汰赛对阵会被删除。",
      API.withdrawPlayoffs,
      "已撤回淘汰赛，回到小组赛",
    );
  }

  async function editSwissRounds() {
    if (!ctx.ensureAdmin()) return;
    const current = ctx.tournament()?.swiss_rounds ?? "";
    const input = prompt(
      `瑞士轮总轮数（${MIN_SWISS_ROUNDS}-${MAX_SWISS_ROUNDS}）。留空 = 自动（单循环，每人与同组所有人各打一场）。比赛进行中修改时，不能少于当前轮次。`,
      String(current),
    );
    if (input === null) return;
    const trimmed = input.trim();
    const rounds = trimmed === "" ? null : Number(trimmed);
    if (rounds !== null && !isValidSwissRounds(rounds)) {
      toast.error(`轮数必须是 ${MIN_SWISS_ROUNDS}-${MAX_SWISS_ROUNDS} 之间的整数，或留空表示自动`);
      return;
    }
    try {
      await API.setSwissRounds(ctx.tid(), rounds);
      toast.success(rounds === null ? "瑞士轮轮数已改为自动（单循环）" : `瑞士轮已设为 ${rounds} 轮`);
      await ctx.load();
    } catch (e) {
      toast.error(e.message);
    }
  }

  // Admin: download the event as JSON.
  function downloadJson() {
    const t = ctx.tournament();
    if (!t || !ctx.isAdmin()) return;
    const blob = new Blob([JSON.stringify(t, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `potato-cup-${t.id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("赛事 JSON 导出成功");
  }

  return { changeStatus, toggleActiveMatch, startPlayoffs, withdrawPlayoffs, editSwissRounds, downloadJson };
}
