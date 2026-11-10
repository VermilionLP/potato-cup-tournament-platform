// In-page reminders and calendar links (pure; the live state is in
// reminders.svelte.js). Items come from GET /api/reminders/:playerId (the
// API's lib/attention.js); itemText() gives their words.

export const KINDS = ["confirm", "ban", "ready", "checkin", "soon"];

const clock = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Shanghai" });
};
const minutesLeft = (iso, now) => Math.max(1, Math.ceil((Date.parse(iso) - now) / 60000));

/** { title, body, action, url } of an item. */
export function itemText(item, now = Date.now()) {
  const url = `/tournament/${encodeURIComponent(item.tournament_id)}`;
  switch (item.kind) {
    case "confirm":
      return {
        title: "请确认比分",
        body: item.deadline && Date.parse(item.deadline) > now
          ? `${item.tournament}：对手提交了 ${item.score[0]} : ${item.score[1]}，${minutesLeft(item.deadline, now)} 分钟内不处理将自动生效`
          : `${item.tournament}：对手提交了 ${item.score[0]} : ${item.score[1]}`,
        action: "去确认",
        url,
      };
    case "ban":
      return { title: "轮到你禁用了", body: `${item.tournament}：对手 ${item.opponent} 在等你选择要禁用的大组`, action: "去 Ban / Pick", url };
    case "ready":
      return { title: "轮到你比赛了", body: `${item.tournament}：你的对手是 ${item.opponent}`, action: "查看对阵", url };
    case "checkin":
      return { title: "签到已开放", body: `${item.tournament}：开赛前请完成签到，未签到可能被移出比赛`, action: "去签到", url };
    case "soon":
      return { title: "即将开赛", body: item.start ? `${item.tournament} 将在 ${clock(item.start)} 开始，请提前进入游戏` : `${item.tournament} 即将开始`, action: "查看赛事", url };
    default:
      return { title: item.tournament || "", body: "", action: "查看", url };
  }
}

/** The calendar feed: the player's own, or every event's. */
export function calendarUrl(origin, playerId = "") {
  return `${origin}/api/calendar.ics${playerId ? `?player=${encodeURIComponent(playerId)}` : ""}`;
}

/** The same feed as a webcal:// link, which opens the calendar app's "subscribe". */
export function webcalUrl(url) {
  return url.replace(/^https?:\/\//i, "webcal://");
}

/** Items not shown before (by key), in order. */
export function freshItems(items, seen) {
  return items.filter((i) => !seen.has(i.key));
}
