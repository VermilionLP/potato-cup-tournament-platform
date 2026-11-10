// The admin operation log in words (the /log page). Rows come from GET
// /admin/log: { action, actor, tournament_name, detail } where `detail` is
// the request's fields plus, for a match, its players and earlier result
// (apps/api/lib/admin-log.js). Pure.

const STATUS = { voting: "时间投票", registration: "报名中", in_progress: "比赛进行中", completed: "已结束" };

// PATCH /tournaments/:id fields, as settings names.
const FIELDS = {
  name: "名称",
  scheduled_time: "比赛时间",
  game_mode: "模式",
  vehicle_pool: "比赛类型",
  vehicle_template: "载具池模板",
  points_table: "积分表",
  points_season: "积分赛季",
  points_kind: "积分类型",
  points_invite: "邀请赛积分",
  tier: "等级",
  event_kind: "性质",
  checkin_enabled: "签到",
  ladder_max_mmr: "天梯限制",
  ladder_max_tier: "天梯限制",
  description: "补充说明",
  format: "赛制",
  grand_final_reset: "赛制",
  swiss_rounds: "赛制",
  playoff_format: "赛制",
  swiss_group_size: "赛制",
  advance_per_group: "赛制",
  hold_third_place: "赛制",
  loser_advances: "赛制",
};

/** A round setting's key ("main:1", "wb:3", "sw:2") in words. */
export function roundKeyLabel(key) {
  const [bracket, raw] = String(key || "").split(":");
  const n = Number(raw);
  if (bracket === "sw") return `瑞士轮第 ${n} 轮`;
  if (bracket === "gf") return "总决赛";
  // Elimination rounds count down to the final (round 1).
  if (bracket === "main") return n === 0 ? "三四名决赛" : n === 1 ? "决赛" : n === 2 ? "半决赛" : `倒数第 ${n} 轮`;
  if (bracket === "wb") return n === 1 ? "胜者组决赛" : `胜者组倒数第 ${n} 轮`;
  if (bracket === "lb") return n === 1 ? "败者组决赛" : `败者组倒数第 ${n} 轮`;
  if (bracket === "gse" || bracket === "gwb" || bracket === "glb") return `小组赛倒数第 ${n} 轮`;
  return String(key || "");
}

const vs = (m) => `${m?.player1 || "TBD"} vs ${m?.player2 || "TBD"}`;
// The score a match had before this change, or null.
const was = (m) => (m?.before && m.before.score1 != null ? m.before : null);
const p1 = (m) => m?.player1 || "TBD";
const p2 = (m) => m?.player2 || "TBD";

/** One log row in words. */
export function describeEntry(entry) {
  const d = entry?.detail || {};
  const m = d.match;
  const target = d.target || "";
  switch (entry?.action) {
    case "event.create": return "创建赛事";
    case "event.delete": return "删除赛事";
    case "event.settings": {
      const names = [...new Set(Object.keys(d).map((k) => FIELDS[k]).filter(Boolean))];
      if (d.name && names.length === 1) return `改名为「${d.name}」`;
      if (d.scheduled_time && names.length === 1) return `修改比赛时间为 ${String(d.scheduled_time).replace("T", " ")}`;
      return names.length ? `修改设置：${names.join("、")}` : "修改设置";
    }
    case "event.status": return `改为「${STATUS[d.status] || d.status}」`;
    case "event.start": {
      const removed = (d.remove || []).length;
      const forfeited = (d.forfeit || []).length;
      return removed || forfeited ? `开赛（移出 ${removed} 人，判弃权 ${forfeited} 人）` : "开赛";
    }
    case "event.swiss_rounds": return d.swiss_rounds === "auto" || d.swiss_rounds == null ? "瑞士轮轮数改为自动" : `瑞士轮轮数改为 ${d.swiss_rounds}`;
    case "event.playoffs_start": return "开始淘汰赛";
    case "event.playoffs_withdraw": return "撤回淘汰赛";
    case "event.best_of": return d.best_of ? `${roundKeyLabel(d.key)}设为 BO${d.best_of}` : `取消${roundKeyLabel(d.key)}的局数`;
    case "event.import": return "导入赛事数据";
    case "event.wiki": return "保存 Liquipedia 导出设置";
    case "seeds.manual": return "手动调整种子";
    case "seeds.auto": return "按天梯分重排种子";
    case "seeds.random": return "随机微调种子";
    case "player.register": return `为 ${d.player_id} 报名`;
    case "player.unregister": return `移出选手 ${d.player_id}`;
    case "player.checkin": return `为 ${d.player_id} 签到`;
    case "player.checkin_undo": return `取消 ${d.player_id} 的签到`;
    case "matches.clear": return "清空对阵";
    case "match.manual": return `手动添加对阵 ${d.player1_id || "TBD"} vs ${d.player2_id || "TBD"}`;
    case "match.result":
    case "match.score":
      return was(m)
        ? `更正比分 ${p1(m)} ${d.score1}:${d.score2} ${p2(m)}（原 ${was(m).score1}:${was(m).score2}）`
        : `录入比分 ${p1(m)} ${d.score1}:${d.score2} ${p2(m)}`;
    case "match.walkover": return `${vs(m)}：判 ${d.winner_id} 胜（弃权）`;
    case "match.rollback": return was(m) ? `撤销 ${vs(m)} 的结果（原 ${was(m).score1}:${was(m).score2}）` : `撤销 ${vs(m)} 的结果`;
    case "match.report_confirm": return `采纳 ${vs(m)} 的选手报分`;
    case "match.report_dispute": return `对 ${vs(m)} 的报分提出异议`;
    case "match.report_clear": return `撤回 ${vs(m)} 的待确认报分`;
    case "vote.cast": return "代为投票";
    case "vote.withdraw": return "撤回投票";
    case "vote.clear_past": return "清空过期的投票";
    case "player.save": return `保存选手资料 ${d.id || ""}`.trim();
    case "player.delete": return `删除选手 ${target}`;
    case "player.change_id": return `把选手 ${target} 改名为 ${d.newId}`;
    case "player.merge": return `把选手 ${target} 合并到 ${d.targetId}`;
    case "player.key_reset": return `重置 ${target} 的设备密钥`;
    case "player.qq_unbind": return `解除 ${target} 的 QQ 绑定`;
    case "player.not_duplicate": return `标记 ${d.a} 和 ${d.b} 不是同一人`;
    case "points.season_end": return `结束 ${d.season} 赛季积分`;
    case "points.season_reopen": return `重新开放 ${d.season} 赛季积分`;
    case "points.season_current": return "设置当前积分赛季";
    case "pool.create": return `新建载具池模板「${d.name || ""}」`;
    case "pool.update": return `修改载具池模板「${d.name || target}」`;
    case "pool.delete": return "删除载具池模板";
    case "admin.alert_players": return (d.players || []).length ? `设置提醒的管理员：${d.players.join("、")}` : "清空提醒的管理员";
    case "admin.backup": return "手动备份数据库";
    default: return String(entry?.action || "");
  }
}

/** Rows grouped by local day, newest first: [{ day, entries }]. */
export function groupByDay(entries = [], dayOf = (e) => String(e.at).slice(0, 10)) {
  const out = [];
  for (const e of entries) {
    const day = dayOf(e);
    if (out.at(-1)?.day !== day) out.push({ day, entries: [] });
    out.at(-1).entries.push(e);
  }
  return out;
}
