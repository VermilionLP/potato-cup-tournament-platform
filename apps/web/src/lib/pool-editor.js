// Editing vehicle pool templates on /pools: drafts (unsaved copies of a
// template), new and copied templates, the problem that blocks saving, the
// body sent to the API, and templates grouped by event type. Pure; the page
// keeps the drafts in its state.

import { DEFAULT_BP_RULES, normalizeRules } from "./banpick.js";
import { vehicleListProblem } from "./vehicle-pools.js";

export const NEW_ID = "__new";

/** An empty vehicle row. */
export const emptyVehicle = () => ({ name: "", nation: "", br: "", type: "", group: "" });

/** An editable copy of a template (its fields only, rows copied). */
export function draftOf(t) {
  return {
    name: t.name,
    event_type: t.event_type,
    game_modes: [...(t.game_modes || [])],
    rules: { ...normalizeRules(t.rules) },
    sort_order: t.sort_order ?? 100,
    vehicles: (t.vehicles || []).map((v) => ({ ...v })),
  };
}

/** A new template: a copy of `source` ("… 副本"), or empty for `eventType`. */
export function newDraft(source, eventType) {
  if (source) return { ...draftOf(source), name: `${source.name} 副本`.slice(0, 40) };
  return { name: "", event_type: eventType, game_modes: [], rules: { ...DEFAULT_BP_RULES }, sort_order: 100, vehicles: [emptyVehicle()] };
}

/** Game modes with `mode` switched on or off. */
export const toggleMode = (modes = [], mode) => (modes.includes(mode) ? modes.filter((m) => m !== mode) : [...modes, mode]);

/** Why a draft can't be saved, or "". */
export function draftProblem(draft) {
  if (!draft) return "";
  if (!String(draft.name || "").trim()) return "请填写模板名称";
  return vehicleListProblem(draft.vehicles || []);
}

/** The body for create / update: trimmed name, numeric sort order and BR. */
export function saveBody(draft) {
  return {
    ...draft,
    name: draft.name.trim(),
    sort_order: Number(draft.sort_order) || 0,
    vehicles: (draft.vehicles || []).map((v) => ({
      ...v,
      br: v.br === "" || v.br === null || v.br === undefined ? null : Number(v.br),
    })),
  };
}

/** Templates by event type ([{ ...type, templates }]), in the order events choose them. */
export function templatesByType(templates = [], types = []) {
  return types.map((type) => ({
    ...type,
    templates: templates
      .filter((t) => t.event_type === type.id)
      .sort((a, b) => (a.sort_order ?? 100) - (b.sort_order ?? 100) || String(a.id).localeCompare(String(b.id))),
  }));
}
