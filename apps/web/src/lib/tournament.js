// Tournament metadata labels shared by the home page and the tournament page.

export const GAME_MODES = [
  { id: "ab", code: "AB", name: "街机模式", full: "Arcade" },
  { id: "rb", code: "RB", name: "历史模式", full: "Realistic" },
  { id: "sb", code: "SB", name: "全真模式", full: "Simulator" },
];

export const BRACKET_FORMATS = [
  { id: "single_elim", label: "单败淘汰", available: true },
  { id: "double_elim", label: "双败淘汰", available: true },
  { id: "swiss", label: "瑞士轮", available: true },
];

export function gameModeInfo(value) {
  return GAME_MODES.find((mode) => mode.id === value) || GAME_MODES[1];
}

export function gameModeLabel(value) {
  const mode = gameModeInfo(value);
  return `${mode.code} ${mode.name}`;
}

export function formatLabel(value) {
  return BRACKET_FORMATS.find((format) => format.id === value)?.label || "单败淘汰";
}

export function advancementLabel(loserAdvances) {
  return loserAdvances ? "败者晋级" : "胜者晋级";
}

// Mirrors MIN_PLAYERS_BY_FORMAT in apps/api/lib/tournament-config.js; the
// server enforces it, this copy only drives the UI.
export const MIN_PLAYERS_BY_FORMAT = { single_elim: 2, double_elim: 4, swiss: 2 };

export function minPlayersForFormat(format) {
  return MIN_PLAYERS_BY_FORMAT[format] ?? MIN_PLAYERS_BY_FORMAT.single_elim;
}

// An admin can correct a match that already has a result (score or walkover)
// as long as both slots hold a real player; byes and voided slots are skipped.
export function canCorrectResult(match) {
  return Boolean(
    match &&
      match.status !== "pending" &&
      match.player1_id &&
      match.player2_id,
  );
}

// Mirrors apps/api/lib/swiss.js.
export const MIN_SWISS_ROUNDS = 1;
export const MAX_SWISS_ROUNDS = 15;

export function suggestedSwissRounds(playerCount) {
  const n = Number(playerCount) || 0;
  return n < 2 ? 1 : Math.max(1, Math.ceil(Math.log2(n)));
}

export function isValidSwissRounds(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= MIN_SWISS_ROUNDS && n <= MAX_SWISS_ROUNDS;
}

/** Why the start button is disabled, or null when the tournament can start. */
export function startBlockedMessage(format, playerCount, swissRounds = null) {
  const min = minPlayersForFormat(format);
  const count = Number(playerCount) || 0;
  if (count < min) return `至少 ${min} 人才能开赛（当前 ${count} 人）`;
  if (format === "swiss") {
    if (!isValidSwissRounds(swissRounds)) return "请先设置瑞士轮轮数";
    if (swissRounds > count - 1) {
      return `${swissRounds} 轮瑞士轮至少需要 ${swissRounds + 1} 人（当前 ${count} 人）`;
    }
  }
  return null;
}
