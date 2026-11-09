// Tags: one pill shape for the whole site, coloured only when the colour
// means something (status, tier, prize, live). Descriptive tags (mode, type,
// format) stay neutral grey. Used by <Tag> (#lib/components/ui/tag) and by
// the class maps in #lib/tournament.js and #lib/lobby.js.

/** Shape shared by every tag. */
export const TAG_BASE =
  "inline-flex w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-small font-bold leading-normal";

/** Colour per meaning (light / dark). */
export const TAG_TONE = {
  neutral: "bg-secondary text-secondary-foreground",
  brand: "bg-brand-soft text-brand-soft-foreground",
  info: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  live: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  success: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
  prize: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  special: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-200",
};

/** Tone for an event tier (S-D). */
export const TIER_TONE = { S: "special", A: "brand", B: "success", C: "info", D: "neutral" };

/** Tone for an event status. */
export const STATUS_TONE = { registration: "brand", voting: "info", in_progress: "live", completed: "neutral" };

/** Full class string for a tag of this tone. */
export const tagClass = (tone = "neutral") => `${TAG_BASE} ${TAG_TONE[tone] || TAG_TONE.neutral}`;
