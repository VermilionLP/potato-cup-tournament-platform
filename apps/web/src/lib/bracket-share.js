// The bracket share image's small parts the event page needs up front:
// what to draw for the current view (bracketShareInput) and the event time
// in words. The image itself (#lib/bracket-image.js, -draw.js and
// BracketShareDialog) loads when someone shares.

import { groupStageMatchesOf } from "./event-view.js";

/** "2026/11/14 周六 20:00" from the stored Beijing time, or "". */
export function eventTimeText(scheduled) {
  const m = String(scheduled || "").match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2}))?/);
  if (!m) return "";
  const week = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()];
  return `${m[1]}/${m[2]}/${m[3]} ${week}${m[4] ? ` ${m[4].padStart(2, "0")}:${m[5]}` : ""}`;
}

/**
 * What the share picture shows for the event page's state: the same choice
 * as the bracket card (Swiss standings and rounds, the group stage, or the
 * elimination bracket). Props for BracketShareDialog, or null when there is
 * nothing to draw yet.
 */
export function bracketShareInput(t, { isSwiss = false, isTwoStage = false, hasGroupBrackets = false, shownStage = "group", bracketMatches = [], isDoubleElim = false } = {}) {
  if (!t) return null;
  if (isSwiss && (!isTwoStage || shownStage === "group")) {
    const matches = (t.matches || []).filter((m) => m.bracket === "sw");
    const groups = isTwoStage ? t.group_stage?.groups || [] : [];
    if (!matches.length && !(t.standings || []).length && !groups.length) return null;
    return {
      view: "swiss",
      matches,
      standings: t.standings || [],
      totalRounds: t.swiss_rounds_effective ?? t.swiss_rounds,
      groups,
      perGroup: isTwoStage ? t.advance_per_group || 0 : 0,
    };
  }
  if (hasGroupBrackets && shownStage === "group") {
    const groups = t.group_stage?.groups || [];
    if (!groups.length) return null;
    return {
      view: "groups",
      matches: groupStageMatchesOf(t),
      groups,
      groupFormat: t.format,
      perGroup: t.advance_per_group || 0,
    };
  }
  if (!bracketMatches.length) return null;
  return { view: "elimination", matches: bracketMatches, doubleElim: isDoubleElim };
}
