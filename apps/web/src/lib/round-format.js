// Games per match for each bracket round ("BO3" on a round header). The
// rules are shared with the server (@potato-cup/shared/round-format.js);
// EventBracketCard puts the event's settings in a context so every round
// header (RoundBestOf.svelte) can show them, and admins change them there.

import { getContext, setContext } from "svelte";

export {
  BEST_OF_CHOICES,
  bestOfFor,
  bestOfLabel,
  normalizeBestOf,
  normalizeRoundBestOf,
  roundKey,
  scoreProblem,
  winsNeeded,
} from "@potato-cup/shared/round-format.js";

const CONTEXT = Symbol("round-format");

/**
 * ctx: { map: { [roundKey]: n } (a getter), canEdit, save(key, n | null) }.
 */
export function setRoundFormat(ctx) {
  setContext(CONTEXT, ctx);
}

/** The bracket's round settings, or null outside a bracket. */
export function roundFormat() {
  return getContext(CONTEXT) || null;
}
