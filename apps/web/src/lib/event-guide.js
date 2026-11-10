// The event page's 说明 tab: what a player has to do and how the event runs,
// written from the event's own settings (format and options, check-in,
// ladder limit, Ban / Pick rules, mode). Pure: EventGuideTab renders it.
// The rules quoted here are the site's (match reports: apps/api/lib/
// match-reports.js; Swiss: apps/api/lib/swiss.js; check-in: lib/checkin.js).

import { normalizeRules } from "./banpick.js";
import { gameModeInfo, vehiclePoolLabel } from "./tournament.js";
import { ladderLimitLabel } from "./ladder-limit.js";
import { eventTimeText } from "./bracket-share.js";
import { formFromEvent, isTwoStage, stepSummary } from "./create-event.js";
import { DISCORD_INVITE } from "./discord-invite.js";
import { ladderWeight } from "@potato-cup/shared/ladder-weight.js";

const STARTED = new Set(["in_progress", "completed"]);

/** The event's format in a few words ("双败淘汰 · 总决赛重置", "瑞士轮 · 5 轮"). */
export function formatText(t) {
  const form = formFromEvent(t || {});
  return isTwoStage(form) ? `${stepSummary(form, "group")} → ${stepSummary(form, "playoff")}` : stepSummary(form, "format");
}

/** Key facts: [label, value]. */
function facts(t, { banpick }) {
  const mode = gameModeInfo(t.game_mode);
  return [
    ["开赛时间", t.status === "voting" ? "投票决定" : eventTimeText(t.scheduled_time) || "待定"],
    ["赛制", formatText(t)],
    ["模式", `${mode.code} · ${mode.name}`],
    ["比赛类型", vehiclePoolLabel(t.vehicle_pool)],
    ["人数上限", `${Number(t.player_capacity) || 128} 人`],
    ["报名条件", ladderLimitLabel(t) || "不限天梯"],
    ["赛前签到", t.checkin_enabled ? "需要（开赛前 30 分钟开放）" : "不需要"],
    ["Ban / Pick", banpick ? "开启" : "不使用"],
  ];
}

/**
 * The steps from signing up to the end, each { id, title, lines, actions? }
 * (actions: [{ label, kind: "tab" | "link" | "bot", to }]) and `now`: the
 * step the event is at.
 */
function steps(t, { banpick }) {
  const out = [
    {
      id: "profile",
      title: "设置选手 ID 和联系方式",
      lines: [
        "点网站右上角，填写你的游戏昵称作为选手 ID，并填写 QQ 号或 Discord 用户名（至少一个，报名必填）。",
        "联系方式用于约战和赛务联系：登录的选手和管理员能看到，游客看不到。",
      ],
    },
    {
      id: "register",
      title: "报名",
      lines: [
        "在「概览」里点「一键快速报名」，也可以在 QQ 群里 @土豆杯机器人 发送「报名」。",
        ladderLimitLabel(t) ? `本场有天梯限制：${ladderLimitLabel(t)}（定级中的选手暂时不能报名）。` : "",
        "报名截止前可以随时退出；截止后需要退出请联系管理员。",
      ].filter(Boolean),
    },
    {
      id: "discord",
      title: "加入 Discord 服务器",
      lines: ["赛事通知、和对手约战、找管理员都在服务器里，比赛前请先加入。"],
      actions: [{ label: "加入 Discord", kind: "link", to: DISCORD_INVITE }],
    },
  ];
  if (t.checkin_enabled) {
    out.push({
      id: "checkin",
      title: "开赛前签到",
      lines: [
        "开赛前 30 分钟开放签到：在页面顶部「我的比赛」里点「立即签到」，或在 QQ 群里 @土豆杯机器人 发送「签到」。",
        "没有签到的选手，开赛时由管理员决定移出还是判弃权。",
      ],
    });
  }
  out.push({
    id: "start",
    title: "开赛，找到你的对手",
    lines: [
      "开赛后对阵生成，页面顶部「我的比赛」会显示你的下一场：轮次、对手和对手的联系方式。",
      "主动联系对手，约好时间进入游戏开打；对阵和进度在「对阵」里随时可以看。",
    ],
    actions: [{ label: "查看对阵", kind: "tab", to: "bracket" }],
  });
  if (banpick) {
    out.push({
      id: "banpick",
      title: "Ban / Pick 选定载具",
      lines: [
        "开打前双方在网站上完成 Ban / Pick，决定本场使用的载具，具体步骤见下方「Ban / Pick 规则」。",
        "结果锁定后，双方都按抽到的载具比赛。",
      ],
      actions: [{ label: "查看载具池", kind: "tab", to: "pool" }],
    });
  }
  out.push(
    {
      id: "play",
      title: "比赛并填报比分",
      lines: [
        Object.keys(t.round_best_of || {}).length
          ? "每场打几局看「对阵」里每一轮标题上的标记：BO3 即先赢 2 局，BO5 先赢 3 局，BO1 一局定胜负。"
          : "",
        "打完后任意一方在「我的比赛」或对阵里点「填报比分」，填写双方的小局比分。",
        "对手确认后比分生效；对手 10 分钟内没有提出异议，也会自动生效。",
        "比分不对就点「提出异议」，由管理员裁决。",
      ].filter(Boolean),
    },
    {
      id: "next",
      title: "晋级与下一场",
      lines: [nextRoundLine(t), "有新的比赛轮到你时，页面顶部会提醒你（也可以开启比赛提醒，见下方）。"],
    },
  );
  return out;
}

function nextRoundLine(t) {
  if (t.playoff_format) return "小组赛打完后，管理员确认晋级名单，进入淘汰赛。";
  if (t.format === "swiss") return "每一轮全部打完后，系统按积分排出下一轮对阵。";
  if (t.format === "double_elim") return "赢了在胜者组继续；输一场掉入败者组，再输一场被淘汰。";
  return Number(t.loser_advances) ? "本场为特殊玩法：每场的败者晋级下一轮。" : "赢家晋级下一轮，输一场即被淘汰。";
}

/** How the format works, as short points. */
function formatPoints(t) {
  const single = (loserAdvances = false) => [
    loserAdvances ? "单败淘汰（特殊玩法）：每场比赛的败者晋级下一轮，胜者出局。" : "单败淘汰：输一场即被淘汰，胜者晋级下一轮，直到决出冠军。",
    "人数不是 2、4、8、16… 时，种子靠前的选手首轮轮空，直接晋级。",
    "种子按天梯分自动排列（管理员可以手动调整），强的选手尽量晚相遇。",
  ];
  const double = (reset) => [
    "双败淘汰：输两场才被淘汰。所有人从胜者组开始，输一场掉入败者组，在败者组再输一场出局。",
    "胜者组冠军和败者组冠军在总决赛相遇。",
    reset ? "总决赛重置：败者组冠军赢下首场时，双方各输过一场，加赛一场决定冠军。" : "总决赛只打一场，赢家即为冠军。",
  ];
  const swiss = (rounds) => [
    rounds ? `瑞士轮：所有人都打满 ${rounds} 轮，不会中途淘汰。` : "瑞士轮：所有人都打满全部轮次，不会中途淘汰。",
    "赢一场得 1 分，输得 0 分，没有平局。",
    "第 1 轮按种子上半区对下半区；之后每轮按排名配对，尽量不和打过的对手重复交手。",
    "人数为奇数时，每轮有一人轮空，记为赢一场。",
    "排名依次比较：积分、小分净胜、对手分（交手过的对手的积分之和）。",
  ];
  if (t.playoff_format) {
    const groupSize = Number(t.swiss_group_size) || 0;
    const k = Number(t.advance_per_group) || 0;
    const group = t.format === "swiss" ? "瑞士轮" : t.format === "double_elim" ? "双败淘汰" : "单败淘汰";
    return {
      title: "小组赛 + 淘汰赛",
      points: [
        groupSize
          ? `第一阶段小组赛：按种子蛇形分组，每组 ${groupSize} 人，组内打${group}，每组前 ${k} 名晋级。`
          : `第一阶段小组赛：所有人在一个组，打${group}，前 ${k} 名晋级。`,
        "小组打完后，管理员确认晋级名单，进入第二阶段淘汰赛。",
        `第二阶段淘汰赛打${t.playoff_format === "double_elim" ? "双败淘汰" : "单败淘汰"}；种子先按小组名次排（各组第一，再各组第二……），同组选手首轮尽量分开。`,
        ...(t.format === "swiss" ? swiss(null).slice(1, 3) : []),
      ],
    };
  }
  if (t.format === "swiss") return { title: "瑞士轮", points: swiss(Number(t.swiss_rounds_effective ?? t.swiss_rounds) || null) };
  if (t.format === "double_elim") return { title: "双败淘汰", points: double(t.grand_final_reset !== false) };
  return { title: "单败淘汰", points: single(Boolean(Number(t.loser_advances))) };
}

/** Ban / Pick, step by step, from the template's rules. */
function banpickPoints(rules) {
  const r = normalizeRules(rules);
  // Spelled out per kind so each sentence translates whole.
  const groupRemovals = (n) =>
    n === null ? "不满意可以移出大组重新抽，次数不限。" : n === 0 ? "抽到的大组不能移出。" : `不满意可以移出大组重新抽，最多 ${n} 次。`;
  const vehicleRemovals = (n) =>
    n === null ? "不满意可以移出载具重新抽，次数不限。" : n === 0 ? "抽到的载具不能移出。" : `不满意可以移出载具重新抽，最多 ${n} 次。`;
  return [
    "对阵的上方选手为 A 方，下方为 B 方；双方都打开这场比赛的 Ban / Pick，按页面顶部的提示一步步操作。",
    r.bansPerPlayer
      ? `禁用：A、B 轮流各禁 ${r.bansPerPlayer} 个大组，A 方先禁；不想禁用可以空过。`
      : "本场不禁用，直接抽取。",
    `抽大组：从剩下的大组里随机抽一个。${groupRemovals(r.groupRerolls)}`,
    r.drawVehicle
      ? `抽载具：在抽到的大组里随机抽一辆。${vehicleRemovals(r.vehicleRerolls)}`
      : "抽到大组即结束：本场在该组内任选载具。",
    "最后点「确认抽取结果」锁定，直播画面会同步显示。锁定后不能再改，有问题请找管理员。",
  ];
}

/** Score reports, disputes and walkovers. */
const REPORT_POINTS = [
  "任意一方都可以填报比分，填双方的小局比分，必须分出胜负。",
  "对手点「确认比分」或填报了相同的比分，结果立即生效；对手 10 分钟内没有提出异议，也会自动生效。",
  "比分填错了：对手确认之前可以撤回重填；对手填错了就点「提出异议」，由管理员裁决。",
  "对手一直联系不上或不来：在比赛里申报对手弃权，由管理员确认后判你晋级。",
  "管理员可以直接录入或更正任何比分。",
];

/** Ways to be reminded and other tools. */
function toolPoints(t) {
  return [
    "比赛提醒：点网站右上角的铃铛，可以订阅日历（开赛前响铃）、开启浏览器通知，开着网站时轮到你还会在页面顶部提醒。",
    "QQ 机器人：在群里 @土豆杯机器人，可以「报名」「签到」「赛程」「战绩」；社区机器人会在群里通知开赛、轮到你比赛和确认比分。",
    `天梯：本场打出比分的比赛都计入 ${gameModeInfo(t.game_mode).code} 天梯（弃权不计）。`,
    ...(ladderWeight(t.event_kind) > 1
      ? [t.event_kind === "qualifier"
          ? `本场是预选赛，天梯加减分是周赛的 ${ladderWeight(t.event_kind)} 倍。`
          : `本场是大型赛事，天梯加减分是周赛的 ${ladderWeight(t.event_kind)} 倍。`]
      : []),
  ];
}

const FAQ = [
  ["报名后来不了了怎么办？", "报名截止前在「概览」里退出报名；已经截止就尽快联系管理员。"],
  ["对手联系不上？", "先通过「我的比赛」里显示的联系方式和 Discord 联系；实在联系不上，申报对手弃权并告知管理员。"],
  ["比分填错了？", "对手确认前可以撤回；已经生效的结果请联系管理员更正。"],
  ["比赛中掉线或出现意外？", "和对手协商重赛或按约定处理，有争议时找管理员裁决。"],
];

/**
 * Everything the 说明 tab shows. `rules`: the Ban / Pick template's rules
 * (or null); `banpickEnabled`: whether this event uses Ban / Pick.
 */
export function eventGuide(t, { rules = null, banpickEnabled = false } = {}) {
  if (!t) return null;
  const banpick = Boolean(banpickEnabled);
  const list = steps(t, { banpick });
  // Where the event is now.
  const now = t.status === "completed"
    ? null
    : STARTED.has(t.status)
      ? "play"
      : t.checkin_enabled && t.checkin?.open
        ? "checkin"
        : t.status === "registration"
          ? "register"
          : "profile";
  return {
    notes: String(t.description || "").trim(),
    facts: facts(t, { banpick }),
    steps: list.map((s) => ({ ...s, now: s.id === now })),
    format: formatPoints(t),
    banpick: banpick ? banpickPoints(rules) : null,
    report: REPORT_POINTS,
    tools: toolPoints(t),
    faq: FAQ,
    finished: t.status === "completed",
  };
}
