// Tournament metadata labels shared by the home page and the tournament page.

export const GAME_MODES = [
  { id: "ab", code: "AB", name: "街机模式", full: "Arcade" },
  { id: "rb", code: "RB", name: "历史模式", full: "Realistic" },
  { id: "sb", code: "SB", name: "全真模式", full: "Simulator" },
];

// Single and double elimination have engines; Swiss is listed as upcoming.
export const BRACKET_FORMATS = [
  { id: "single_elim", label: "单败淘汰", available: true },
  { id: "double_elim", label: "双败淘汰", available: true },
  { id: "swiss", label: "瑞士轮", available: false },
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
export const MIN_PLAYERS_BY_FORMAT = { single_elim: 2, double_elim: 4 };

export function minPlayersForFormat(format) {
  return MIN_PLAYERS_BY_FORMAT[format] ?? MIN_PLAYERS_BY_FORMAT.single_elim;
}
