// Normalize both a vote option ("2026-10-25T20:00:00") and the admin's
// selected final time ("2026-10-25 (周日) 20:00") to the same key.
export function normalizeVoteTime(value) {
  const match = String(value || "").match(
    /(\d{4})-(\d{2})-(\d{2})[^\d]*(\d{1,2}):(\d{2})/,
  );
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]} ${String(match[4]).padStart(2, "0")}:${match[5]}`;
}

export function isSameVoteTime(a, b) {
  const left = normalizeVoteTime(a);
  return left !== null && left === normalizeVoteTime(b);
}
